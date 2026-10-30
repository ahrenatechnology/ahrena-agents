import type { ReviewStateT } from "../state";
import { runArgos } from "../agent";
import { parseVerdict } from "../verdict";
import { parseFindings } from "../findings";
import { countChecks, renderChecksForPrompt } from "../checks";

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
    const text = await runArgos({ cwd: state.repoPath, prompt, model: state.model });
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
