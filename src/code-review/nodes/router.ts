import type { ReviewStateT } from "../state";
import { detect, route } from "../routing";

/**
 * Nó do router: o passo 1 do orquestrador, por script. Roda o `route-review.py` do
 * framework e os detectores das rotas que dispararam, antes de o Argos ler uma linha.
 * Em falha, o Argos segue sem a seleção e o parecer diz que o roteamento não rodou.
 */
export function router(state: ReviewStateT): Partial<ReviewStateT> {
  const routing = route(state.repoPath, state.changed);
  if (!routing.ok || !state.changed) return { routing, detectorRuns: [], detections: [] };
  const { runs, detections } = detect(state.repoPath, state.changed, routing);
  return { routing, detectorRuns: runs, detections };
}
