import type { ReviewStateT } from "../state";
import { routeReview } from "../router";

/**
 * Ponto de entrada: roteia a mudança com o route-review.py do framework e
 * guarda as skills que ela seleciona. Falha de roteamento degrada (o Argos
 * roteia internamente) em vez de derrubar a run.
 */
export function intake(state: ReviewStateT): Partial<ReviewStateT> {
  if (!state.changed) {
    return { summary: `PR #${state.pr}: sem range (--changed), roteamento pulado`, skills: [] };
  }
  try {
    const { skills } = routeReview({ changed: state.changed, cwd: state.repoPath });
    return { summary: `PR #${state.pr}: ${skills.length} skill(s) roteada(s)`, skills };
  } catch (error) {
    const reason = (error instanceof Error ? error.message : String(error)).split("\n")[0];
    return {
      summary: `PR #${state.pr}: roteamento prévio falhou (${reason}); o Argos roteia internamente`,
      skills: [],
    };
  }
}
