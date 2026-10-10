import type { ReviewStateT } from "./state";

/** Ponto de entrada: por enquanto só registra o PR recebido. */
export function intake(state: ReviewStateT): Partial<ReviewStateT> {
  return { summary: `PR #${state.pr} recebido` };
}

/**
 * Nó do Argos. Stub por enquanto — ainda NÃO invoca o agente real.
 * TODO: invocar o agente `argos` do ahrena-framework (Claude Agent SDK),
 * roteando e sintetizando o verdict.
 */
export async function argos(state: ReviewStateT): Promise<Partial<ReviewStateT>> {
  return {
    verdict: "comment",
    summary: `Argos (stub) ainda não revisa o PR #${state.pr}`,
  };
}
