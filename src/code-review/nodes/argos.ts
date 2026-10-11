import type { ReviewStateT } from "../state";
import { runArgos } from "../agent";
import { parseVerdict } from "../verdict";

/**
 * Nó do Argos: invoca o orquestrador do framework (que roteia, roda as lenses e
 * sintetiza) e extrai o verdict do texto. Em falha (credencial/agente/tempo),
 * degrada para "comment" com o motivo.
 */
export async function argos(state: ReviewStateT): Promise<Partial<ReviewStateT>> {
  try {
    const prompt = [
      `Conduza a review do PR #${state.pr} (mudança: ${state.changed ?? "não informada"}).`,
      "Narre o parecer como preferir, mas ENCERRE a resposta com uma linha final, sozinha,",
      "exatamente neste formato — token em inglês, minúsculo (é o contrato de máquina do pipeline):",
      "`Verdict: approve` (nada bloqueia o merge), `Verdict: request_changes` (há bloqueio) ou",
      "`Verdict: comment` (só observação, sem decisão). Ressalvas não-bloqueantes ainda são `approve`.",
    ].join("\n");
    const text = await runArgos({ cwd: state.repoPath, prompt });
    return { verdict: parseVerdict(text), summary: text || "(Argos não devolveu texto)" };
  } catch (error) {
    const reason = (error instanceof Error ? error.message : String(error)).split("\n")[0];
    return { verdict: "comment", summary: `Argos não rodou: ${reason}` };
  }
}
