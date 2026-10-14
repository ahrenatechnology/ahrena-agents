import { execFileSync } from "node:child_process";
import type { ReviewStateT } from "../state";
import { runClef, type ClefAnswers, type ClefQuestion } from "../clef";
import { runBedrockDecision } from "../bedrock";
import { countFindings } from "../findings";

/**
 * Perguntas tipadas que o Clef responde sobre o PR — o contrato do decisor.
 * Instruções em inglês (modelo foi avaliado assim); o dossiê pode ser PT.
 */
const QUESTIONS: Record<string, ClefQuestion> = {
  merge: {
    type: "choice",
    instructions: "Given the review dossier, what action should this pull request get?",
    criteria: {
      auto_merge: "Low risk; safe to merge without a human",
      hold_for_human: "Needs a human to look before merging",
      block: "Should not be merged as-is",
    },
  },
  regression: {
    type: "noul",
    instructions: "Is there a relevant risk of a production regression from this change?",
  },
  risk: {
    type: "score",
    instructions: "Overall risk level of merging this pull request now",
    criteria: ["low", "medium", "high", "critical"],
  },
};

/**
 * Defaults da PLATAFORMA para os limiares do gate probabilístico — os valores
 * que a gente já testou. O cliente sobrescreve por parâmetro (--auto-merge-min
 * / --regression-max, ou env DECISOR_*). Primeiro corte; calibrar no uso real.
 */
const DEFAULT_AUTO_MERGE_MIN = 0.85; // prob. mínima de auto_merge
const DEFAULT_REGRESSION_MAX = 0.15; // prob. máxima de regressão tolerada

/** Prende uma probabilidade em [0,1]; fora disso (ou vazio) cai no default. */
function clampProb(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

/** Estatísticas do diff, um sinal forte de risco. Null se não der para medir. */
function diffStats(repoPath: string, changed?: string) {
  if (!changed) return null;
  try {
    const out = execFileSync("git", ["diff", "--numstat", changed], { cwd: repoPath, encoding: "utf8" });
    let files = 0;
    let additions = 0;
    let deletions = 0;
    for (const line of out.trim().split("\n").filter(Boolean)) {
      const [add, del] = line.split("\t");
      files += 1;
      additions += Number(add) || 0;
      deletions += Number(del) || 0;
    }
    return { files, additions, deletions };
  } catch {
    return null;
  }
}

/** Monta o dossiê (o `state` do Clef) com o que o grafo já apurou. */
function buildDossier(state: ReviewStateT) {
  const findings = state.findings ?? [];
  return {
    verdict: state.verdict,
    findings, // achados estruturados: sinal mais objetivo que a prosa
    counts: countFindings(findings),
    review: (state.summary ?? "").slice(0, 8000),
    diff: diffStats(state.repoPath, state.changed),
    changed: state.changed ?? null,
  };
}

/** Aplica os limiares (parametrizáveis) sobre as probabilidades e resume a decisão. */
function decide(answers: ClefAnswers, autoMergeMin: number, regressionMax: number): string {
  const merge = answers.merge;
  const regression = answers.regression;
  const risk = answers.risk;

  let pAuto = 0;
  if (merge && merge.type === "choice") pAuto = merge.probabilities.auto_merge ?? 0;
  let pReg = 1;
  if (regression && regression.type === "noul") pReg = regression.noul;
  let riskLabel = "?";
  if (risk && risk.type === "score") riskLabel = risk.legend[String(Math.round(risk.score))] ?? "?";

  const head = pAuto >= autoMergeMin && pReg <= regressionMax ? "auto_merge" : "hold_for_human";
  return `${head}: risco=${riskLabel}, auto_merge=${pAuto.toFixed(2)}, regressão=${pReg.toFixed(2)}`;
}

/**
 * Higieniza o motivo de falha antes de expô-lo em `state.decision` (que o
 * workflow imprime no comentário do PR): remove URLs — a rota do SDK carrega o
 * account id — e limita o tamanho a uma linha curta.
 */
function sanitizeReason(raw: string): string {
  const MAX = 200;
  const oneLine = raw
    .split("\n")[0]
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\/accounts\/[0-9a-f]{32}/gi, "/accounts/[id]")
    .trim();
  return oneLine.length > MAX ? `${oneLine.slice(0, MAX - 1)}…` : oneLine;
}

/**
 * Nó do Decisor: pergunta ao Clef (modelo de decisão, Workers AI) e aplica os
 * limiares — o lado probabilístico do merge gate. É report-only: escreve a
 * decisão em `state.decision`; quem mergeia é o workflow (gate determinístico).
 * Em falha (sem credencial / indisponível), degrada para "hold_for_human".
 */
export async function decisor(state: ReviewStateT): Promise<Partial<ReviewStateT>> {
  try {
    const autoMergeMin = clampProb(state.autoMergeMin, DEFAULT_AUTO_MERGE_MIN);
    const regressionMax = clampProb(state.regressionMax, DEFAULT_REGRESSION_MAX);
    const dossier = buildDossier(state);
    // Provider pluggável: Cloudflare (Clef nativo) é o default; bedrock usa um
    // LLM on-demand na AWS e devolve a MESMA forma de respostas.
    const provider = (state.provider || "cloudflare").toLowerCase();
    const answers =
      provider === "bedrock"
        ? await runBedrockDecision({ state: dossier, questions: QUESTIONS, model: state.bedrockModel })
        : await runClef({ state: dossier, questions: QUESTIONS, model: state.clefModel });
    return { decision: decide(answers, autoMergeMin, regressionMax) };
  } catch (error) {
    const reason = sanitizeReason(error instanceof Error ? error.message : String(error));
    return { decision: `hold_for_human: Decisor indisponível (${reason})` };
  }
}
