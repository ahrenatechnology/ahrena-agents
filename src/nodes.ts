import type { ReviewStateT } from "./state";
import { routeReview } from "./router";
import { runArgos } from "./agent";

/**
 * Ponto de entrada: roteia a mudança com o route-review.py do framework e
 * guarda as skills que ela seleciona. Sem range, pula o roteamento.
 */
export function intake(state: ReviewStateT): Partial<ReviewStateT> {
  if (!state.changed) {
    return { summary: `PR #${state.pr}: sem range (--changed), roteamento pulado`, skills: [] };
  }
  process.stderr.write("▶ roteando a mudança (route-review.py)…\n");
  const { skills } = routeReview({ changed: state.changed, cwd: process.cwd() });
  process.stderr.write(`  ${skills.length} skill(s): ${skills.join(", ")}\n`);
  return { summary: `PR #${state.pr}: ${skills.length} skill(s) roteada(s)`, skills };
}

/**
 * Nó do Argos: tenta invocar o agente real do framework. Se a credencial ou o
 * agente não estiverem disponíveis, devolve o motivo numa linha — sem quebrar.
 * TODO: extrair o verdict do output/plataforma em vez de fixar "comment".
 */
export async function argos(state: ReviewStateT): Promise<Partial<ReviewStateT>> {
  const skills = state.skills ?? [];
  try {
    const prompt = `Revise o PR #${state.pr} (mudança: ${state.changed ?? "não informada"}).`;
    const text = await runArgos({ cwd: process.cwd(), prompt });
    return { verdict: "comment", summary: text || "(Argos não devolveu texto)" };
  } catch (error) {
    const reason = (error instanceof Error ? error.message : String(error)).split("\n")[0];
    return {
      verdict: "comment",
      summary: `Argos não rodou: ${reason}. Skills roteadas: ${skills.join(", ") || "nenhuma"}`,
    };
  }
}
