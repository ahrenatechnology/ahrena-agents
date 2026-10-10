import type { ReviewStateT } from "./state";
import { routeReview } from "./router";
import { hasClaudeAuth, runArgos } from "./agent";

/**
 * Ponto de entrada: roteia a mudança com o route-review.py do framework e
 * guarda as skills que ela seleciona. Sem range, pula o roteamento.
 */
export function intake(state: ReviewStateT): Partial<ReviewStateT> {
  if (!state.changed) {
    return { summary: `PR #${state.pr}: sem range (--changed), roteamento pulado`, skills: [] };
  }
  const { skills } = routeReview({ changed: state.changed, cwd: process.cwd() });
  return { summary: `PR #${state.pr}: ${skills.length} skill(s) roteada(s)`, skills };
}

/**
 * Nó do Argos: invoca o agente real do framework quando há credencial;
 * sem token, degrada para um resumo do que seria revisado.
 * TODO: extrair o verdict do output/plataforma em vez de fixar "comment".
 */
export async function argos(state: ReviewStateT): Promise<Partial<ReviewStateT>> {
  const skills = state.skills ?? [];

  if (!hasClaudeAuth()) {
    return {
      verdict: "comment",
      summary: skills.length
        ? `Argos (stub, sem token) revisaria com: ${skills.join(", ")}`
        : `Argos (stub) — nada roteado para o PR #${state.pr}`,
    };
  }

  const prompt = `Revise o PR #${state.pr} (mudança: ${state.changed ?? "não informada"}).`;
  const text = await runArgos({ cwd: process.cwd(), prompt });
  return { verdict: "comment", summary: text };
}
