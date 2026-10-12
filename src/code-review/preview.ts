import type { ReviewStateT } from "./state";
import { countFindings } from "./findings";

/**
 * Uma linha de prévia por etapa concluída, mostrada no terminal conforme o
 * grafo avança. Os nós computam; a apresentação mora aqui.
 */
export function renderPreview(node: string, patch: Partial<ReviewStateT>): string {
  switch (node) {
    case "argos": {
      const { blocking, warning } = countFindings(patch.findings ?? []);
      return `✓ Argos · verdict: ${patch.verdict ?? "?"} · achados: ${blocking} bloq / ${warning} warn`;
    }
    case "erodos":
      return `↻ Erodos · ${patch.decision ?? "aplicaria fixes"}`;
    case "decisor":
      return `✓ Decisor · ${patch.decision ?? "avaliado"}`;
    default:
      return `· ${node}`;
  }
}
