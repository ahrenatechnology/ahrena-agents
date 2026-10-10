import { StateGraph, START, END } from "@langchain/langgraph";
import { ReviewState, type ReviewStateT } from "./state";
import { intake } from "./nodes/intake";
import { argos } from "./nodes/argos";
import { erodos } from "./nodes/erodos";
import { decisor } from "./nodes/decisor";

/**
 * Roteia pelo verdict do Argos:
 *   approve          → Decisor (gate de merge)
 *   request_changes  → Erodos (aplicaria fixes)
 *   comment/outros   → fim (deixa para uma pessoa)
 */
function afterArgos(state: ReviewStateT): "decisor" | "erodos" | typeof END {
  if (state.verdict === "approve") return "decisor";
  if (state.verdict === "request_changes") return "erodos";
  return END;
}

/**
 * START → intake → argos → (approve|request_changes|…) → decisor|erodos|END
 *
 * O loop Erodos → Argos (re-review com guard de rodadas) entra quando o Erodos
 * passar a aplicar fixes de verdade.
 */
export function buildGraph() {
  return new StateGraph(ReviewState)
    .addNode("intake", intake)
    .addNode("argos", argos)
    .addNode("erodos", erodos)
    .addNode("decisor", decisor)
    .addEdge(START, "intake")
    .addEdge("intake", "argos")
    .addConditionalEdges("argos", afterArgos, ["decisor", "erodos", END])
    .addEdge("decisor", END)
    .addEdge("erodos", END)
    .compile();
}
