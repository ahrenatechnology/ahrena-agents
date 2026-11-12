import type { ReviewStateT } from "../state";
import { runArgos } from "../agent";
import { parseVerdict } from "../verdict";
import { parseFindings } from "../findings";
import { countChecks, renderChecksForPrompt } from "../checks";
import { bashRules } from "../execution";

/**
 * Nó do Argos: invoca o orquestrador do framework (que roteia, roda as lenses e
 * sintetiza) e extrai do texto DUAS saídas de máquina: o verdict e a LISTA de
 * achados estruturados (alicerce do pré-gate e dos follow-ups). Em falha
 * (credencial/agente/tempo), degrada para "comment" sem achados.
 */
export async function argos(state: ReviewStateT): Promise<Partial<ReviewStateT>> {
  try {
    const checks = state.checks ?? [];
    const { red } = countChecks(checks);
    // As checagens determinísticas rodaram antes: são fatos, não opiniões. O Argos não
    // decide de novo o que um script já decidiu (o mesmo motivo de deixar as condições
    // que um hook decide para o hook); ele lê o PR sabendo disso e agrega.
    const deterministic = checks.length
      ? [
          "",
          "Antes de você, o pipeline rodou as checagens determinísticas (CI, lint, testes). O resultado:",
          renderChecksForPrompt(checks),
          "",
          "Use-as como fatos:",
          "- não repita como achado o que uma checagem já decidiu, nem a contradiga;",
          red.length
            ? `- cada checagem VERMELHA (${red.join(", ")}) é um achado "blocking" na sua lista, com o nome dela no "rule"; diga, se a mudança mostrar, a causa provável;`
            : "- nenhuma ficou vermelha;",
          "- ao julgar os testes, considere o que as checagens provaram e o que nenhuma delas cobre.",
        ]
      : [];
    const prompt = [
      `Conduza a review do PR #${state.pr} (mudança: ${state.changed ?? "não informada"}).`,
      ...deterministic,
      ...routingSection(state),
      ...detectionsSection(state),
      ...executionSection(state),
      "",
      "Narre o parecer como preferir, mas ENCERRE com DOIS artefatos de máquina, nesta ordem:",
      "",
      "1) Uma linha de verdict, sozinha, token em inglês minúsculo:",
      "   `Verdict: approve` (nada bloqueia), `Verdict: request_changes` (há bloqueio) ou",
      "   `Verdict: comment` (só observação). Ressalvas não-bloqueantes ainda são `approve`.",
      "",
      "2) A LISTA de achados, num bloco cercado começando com ```findings e terminando com ```,",
      "   contendo um array JSON (pode ser `[]`). Um objeto por achado, campos:",
      '   - "severity": "blocking" (impede o merge) ou "warning" (não impede);',
      '   - "title": frase curta do problema;',
      '   - "file", "line": onde (quando aplicável);',
      '   - "kind": "como" (forma — comportamento IGUAL, dá pra auto-corrigir) ou',
      '     "oque" (intenção — regra de negócio/escopo/contrato; precisa de humano);',
      '   - "rule": a regra do framework, se houver.',
      "   Liste TODOS os achados não-triviais, inclusive os não-bloqueantes (warnings).",
      "   Exemplo de uma linha: " +
        '{"severity":"warning","title":"nome pouco claro","file":"src/x.ts","line":12,"kind":"como"}',
    ].join("\n");
    const execution = state.execution;
    const allow = execution?.permitted ? bashRules(execution.commands) : [];
    const text = await runArgos({ cwd: state.repoPath, prompt, model: state.model, allow });
    return {
      verdict: parseVerdict(text),
      findings: parseFindings(text),
      summary: text || "(Argos não devolveu texto)",
    };
  } catch (error) {
    const reason = (error instanceof Error ? error.message : String(error)).split("\n")[0];
    return { verdict: "comment", findings: [], summary: `Argos não rodou: ${reason}` };
  }
}

/**
 * O roteamento já foi decidido por script, no nó anterior: o Argos carrega as lentes
 * que ele selecionou e nenhuma outra, e diz quais não foram selecionadas.
 */
function routingSection(state: ReviewStateT): string[] {
  const routing = state.routing;
  if (!routing) return [];
  if (!routing.ok) {
    return [
      "",
      `O router do framework (route-review.py) não rodou: ${routing.error ?? "motivo desconhecido"}.`,
      "Roteie você, como manda o reviewing-diffs, e diga no parecer que a seleção não foi feita por script.",
    ];
  }
  return [
    "",
    "O passo 1 já rodou, por script: o route-review.py do framework selecionou as lentes. Não roteie de novo.",
    `- Rotas que dispararam: ${routing.routes.map((r) => r.id).join(", ") || "nenhuma"}.`,
    `- Lentes a rodar, e só elas: ${routing.skills.join(", ") || "nenhuma"}.`,
    `- Lentes não selecionadas (diga no parecer; não selecionada não é limpa): ${routing.notSelected.join(", ") || "nenhuma"}.`,
    ...(routing.unrouted.length
      ? [`- Caminhos que só a varredura de base alcançou (diga que não foram cobertos): ${routing.unrouted.join(", ")}.`]
      : []),
  ];
}

/**
 * Os detectores do framework já rodaram, report-only. O que levantaram são candidatos:
 * o Argos passa cada um pelo "Where this stops" da regra e lista como achado o que fica.
 */
function detectionsSection(state: ReviewStateT): string[] {
  const runs = state.detectorRuns ?? [];
  if (!runs.length) return [];
  const detections = state.detections ?? [];
  const undecided = runs.filter((r) => !r.ok);
  return [
    "",
    `Os detectores do framework rodaram sobre os arquivos que dispararam as rotas deles: ${runs.map((r) => r.detector).join(", ")}.`,
    detections.length
      ? "Candidatos que eles levantaram (passe cada um pelo limite da regra, o passo 6, e liste os que ficam, com o detector no \"rule\"):"
      : "Nenhum candidato levantado: não repita o que eles já decidiram.",
    ...detections.slice(0, 80).map((d) => `- ${d.file}${d.line ? `:${d.line}` : ""} [${d.rule}] ${d.message}`),
    ...(detections.length > 80 ? [`- … e mais ${detections.length - 80}.`] : []),
    ...undecided.map((r) => `- ${r.detector} não decidiu (${r.error ?? "erro"}): as condições dele são um achado unchecked.`),
  ];
}

/** O passo 5 das lentes: o que pode ser executado, ou por que nada pode. */
function executionSection(state: ReviewStateT): string[] {
  const execution = state.execution;
  if (!execution) return [];
  if (!execution.permitted) {
    return [
      "",
      `Execução não permitida neste review: ${execution.reason ?? "sem motivo informado"}.`,
      "Cada condição que precisa rodar algo (o passo 5) é um achado unchecked, com o nome da condição e esse motivo.",
    ];
  }
  return [
    "",
    "Execução permitida, e só com os comandos que o projeto declarou:",
    ...execution.commands.map((c) => `- \`${c}\``),
    "Use-os para as condições que precisam rodar algo (o passo 5). O que nenhum deles cobre é unchecked.",
  ];
}
