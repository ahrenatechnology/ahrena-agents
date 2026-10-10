import type { ReviewStateT } from "../state";
import { runArgos } from "../agent";
import { parseVerdict } from "../verdict";

/**
 * Nó do Argos: invoca o agente real do framework e extrai o verdict do texto.
 * Em falha (credencial/agente/tempo), degrada para "comment" com o motivo.
 * TODO: Argos orquestra os subagentes quality/security/reliability/observability
 * (no framework); aqui seguimos invocando `argos` e consumindo a síntese.
 */
export async function argos(state: ReviewStateT): Promise<Partial<ReviewStateT>> {
  const skills = state.skills ?? [];
  try {
    const prompt = `Revise o PR #${state.pr} (mudança: ${state.changed ?? "não informada"}).`;
    const text = await runArgos({ cwd: process.cwd(), prompt });
    return { verdict: parseVerdict(text), summary: text || "(Argos não devolveu texto)" };
  } catch (error) {
    const reason = (error instanceof Error ? error.message : String(error)).split("\n")[0];
    return {
      verdict: "comment",
      summary: `Argos não rodou: ${reason}. Skills roteadas: ${skills.join(", ") || "nenhuma"}`,
    };
  }
}
