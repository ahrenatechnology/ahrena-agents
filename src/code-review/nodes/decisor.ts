import type { ReviewStateT } from "../state";

/**
 * Nó do Decisor: avalia o merge. Com land=off (default), apenas reporta;
 * o gate determinístico (checks do pipeline) e o probabilístico (score de
 * risco) entram quando houver PR real e modo de land ligado.
 */
export function decisor(state: ReviewStateT): Partial<ReviewStateT> {
  return {
    decision: `approve: Decisor avaliaria o merge (land=off, nada mergeado). PR #${state.pr}.`,
  };
}
