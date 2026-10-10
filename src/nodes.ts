import type { ReviewStateT } from "./state";
import { routeReview } from "./router";

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
 * Nó do Argos. Stub por enquanto — ainda NÃO invoca o agente real.
 * TODO: invocar o agente `argos` do ahrena-framework (Claude Agent SDK),
 * revisando com as skills roteadas e sintetizando o verdict.
 */
export async function argos(state: ReviewStateT): Promise<Partial<ReviewStateT>> {
  const skills = state.skills ?? [];
  return {
    verdict: "comment",
    summary: skills.length
      ? `Argos (stub) revisaria com: ${skills.join(", ")}`
      : `Argos (stub) — nada roteado para o PR #${state.pr}`,
  };
}
