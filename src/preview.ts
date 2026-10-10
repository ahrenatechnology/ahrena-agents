import type { ReviewStateT } from "./state";

/**
 * Uma linha de prévia por etapa concluída, mostrada no terminal conforme o
 * grafo avança. Os nós computam; a apresentação mora aqui.
 */
export function renderPreview(node: string, patch: Partial<ReviewStateT>): string {
  switch (node) {
    case "intake":
      return `▶ roteado · ${patch.skills?.length ?? 0} skill(s)`;
    case "argos":
      return `✓ Argos · verdict: ${patch.verdict ?? "?"}`;
    case "erodos":
      return `↻ Erodos · ${patch.decision ?? "aplicaria fixes"}`;
    case "decisor":
      return `✓ Decisor · ${patch.decision ?? "avaliado"}`;
    default:
      return `· ${node}`;
  }
}
