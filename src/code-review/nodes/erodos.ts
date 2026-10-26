import { execFileSync } from "node:child_process";
import type { ReviewStateT } from "../state";
import { countFindings, type Finding } from "../findings";
import { countChecks } from "../checks";
import { FIXER, runAgent } from "../agent";
import { bashRules } from "../execution";

/** Limite default do loop correção → nova revisão: depois disso, uma pessoa decide. */
const DEFAULT_MAX_ROUNDS = 2;

/** O trailer que marca um commit do Erodos e conta as rodadas do loop no próprio histórico do PR. */
const ROUND_TRAILER = "Ahrena-Fix-Round";

function git(repoPath: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repoPath, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Quantas rodadas do Erodos o PR já tem: os commits de base..head com o trailer. */
export function countRounds(messages: string): number {
  return messages.split("\n").filter((l) => l.startsWith(`${ROUND_TRAILER}:`)).length;
}

/** Por que o pré-gate mandou para cá, em uma frase. */
function reasonFor(state: ReviewStateT): string {
  const { blocking, warning } = countFindings(state.findings ?? []);
  const { red } = countChecks(state.checks ?? []);
  if (red.length > 0) return `checagem vermelha: ${red.join(", ")}`;
  if (blocking > 0) return `${blocking} bloqueante(s)`;
  if (state.verdict === "request_changes") return "mudanças solicitadas";
  return `${warning} warnings (acima do corte)`;
}

/**
 * Nó do Erodos: o passo de correção do loop do orquestrador. Aplica os achados
 * mecânicos (kind `como`) no head do PR, num commit com o trailer da rodada, e o
 * empurra para a branch do PR. A nova revisão é a do CI desse commit: as checagens
 * dele rodam de novo, e o Argos, por último, revisa o que o Erodos escreveu — nunca
 * a própria review lendo a própria edição. O trailer conta as rodadas; no limite, ou
 * quando não há o que aplicar com segurança, a delegação cai para uma pessoa.
 *
 * Só escreve com `fix` ligado, num head do mesmo repositório, e só empurra o que ele
 * mudou sobre o commit revisado: se o head andou, para.
 */
export async function erodos(state: ReviewStateT): Promise<Partial<ReviewStateT>> {
  const reason = reasonFor(state);
  const max = Math.max(0, Math.floor(Number.isFinite(state.maxRounds) ? (state.maxRounds as number) : DEFAULT_MAX_ROUNDS));
  const hold = (why: string, round = state.round ?? 0): Partial<ReviewStateT> => ({
    round,
    decision: `hold_for_human: ${reason} — ${why}.`,
  });

  if (!state.fix) return hold("o Erodos está desligado (fix), a correção fica com uma pessoa");
  const applicable: Finding[] = (state.findings ?? []).filter((f) => f.kind === "como");
  if (!applicable.length) return hold("nenhum achado mecânico (kind como) para aplicar");
  const execution = state.execution;
  if (!execution?.sameRepository) return hold("o head não é deste repositório: o Erodos não escreve em fork");
  if (!execution.headRef) return hold("a branch do head não é conhecida");
  const [base, head] = (state.changed ?? "").split("...").map((s) => s.trim());
  if (!base || !head) return hold("a mudança (base...head) não foi informada");

  const repo = state.repoPath;
  let round: number;
  try {
    round = countRounds(git(repo, ["log", "--format=%B", `${base}..${head}`]));
  } catch {
    return hold("não deu para ler o histórico do PR");
  }
  if (round >= max) return hold(`limite de ${max} rodada(s) do Erodos atingido`, round);

  const token = process.env.ARGOS_PUSH_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) return hold("sem credencial ou repositório para empurrar o commit", round);
  const server = (process.env.GITHUB_SERVER_URL ?? "https://github.com").replace(/^https?:\/\//, "");
  const remote = `https://x-access-token:${token}@${server}/${repository}.git`;

  try {
    const tip = git(repo, ["ls-remote", remote, `refs/heads/${execution.headRef}`]).split(/\s+/)[0];
    if (tip !== head) return hold("o head andou desde a revisão; a próxima revisão vem primeiro", round);
    if (git(repo, ["status", "--porcelain"])) return hold("o checkout tem mudanças que não são do PR", round);
    git(repo, ["checkout", "--quiet", "--detach", head]);
  } catch {
    return hold("não deu para preparar o head do PR", round);
  }

  const prompt = [
    `Aplique, no head ${head} do PR #${state.pr}, os achados mecânicos que o Argos publicou, seguindo o applying-fixes.`,
    "Só estes, um de cada vez, a menor mudança que cada um nomeia:",
    "```json",
    JSON.stringify(applicable, null, 2),
    "```",
    execution.permitted
      ? `Confirme cada correção com os comandos que o projeto declarou: ${execution.commands.join(", ")}.`
      : "Nenhum comando de teste foi declarado: diga, para cada correção, que ela não foi confirmada por execução.",
    "Não faça commit nem push: o runtime grava o commit com o trailer da rodada e o empurra.",
    "Termine listando os achados aplicados e os que não aplicou, com o motivo.",
  ].join("\n");

  let report: string;
  try {
    report = await runAgent({
      cwd: repo,
      prompt,
      model: state.model,
      agent: FIXER,
      tools: ["Read", "Edit", "Write", "Grep", "Glob", "Bash(git diff:*)", "Bash(git status:*)", ...bashRules(execution.permitted ? execution.commands : [])],
      label: "Erodos aplicando os achados…",
    });
  } catch (error) {
    return hold(`o Erodos não rodou (${(error instanceof Error ? error.message : String(error)).split("\n")[0]})`, round);
  }

  try {
    if (!git(repo, ["status", "--porcelain"])) return hold("o Erodos não mudou nenhum arquivo", round);
    const next = round + 1;
    const message = [
      `fix(review): aplica ${applicable.length} achado(s) mecânico(s) do Argos`,
      "",
      ...applicable.map((f) => `- ${f.title}${f.file ? ` (${f.file}${f.line ? `:${f.line}` : ""})` : ""}`),
      "",
      `${ROUND_TRAILER}: ${next}`,
    ].join("\n");
    git(repo, ["add", "--all"]);
    git(repo, ["-c", "user.name=ahrena-erodos", "-c", "user.email=erodos@users.noreply.github.com", "commit", "--quiet", "-m", message]);
    const commit = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["push", "--quiet", remote, `HEAD:refs/heads/${execution.headRef}`]);
    return {
      round: next,
      fixCommit: commit,
      summary: [state.summary, "", "### Erodos", "", report.trim()].filter(Boolean).join("\n"),
      decision: `fixed: rodada ${next} de ${max} — ${commit.slice(0, 7)} em ${execution.headRef}; a nova revisão é a do CI desse commit`,
    };
  } catch {
    // A mensagem do git pode trazer a URL com o token: não vai para o parecer.
    return hold("não deu para gravar ou empurrar o commit do Erodos", round);
  }
}
