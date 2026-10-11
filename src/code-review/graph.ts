import { StateGraph, START, END } from "@langchain/langgraph";
import { ReviewState, type ReviewStateT } from "./state";
import { argos } from "./nodes/argos";
import { erodos } from "./nodes/erodos";
import { decisor } from "./nodes/decisor";

/**
 * Roteia pelo verdict que o Argos sintetizou:
 *   approve          → Decisor (merge decision)
 *   request_changes  → Erodos (fix step, run separado)
 *   comment/outros   → fim (deixa para uma pessoa)
 */
function afterArgos(state: ReviewStateT): "decisor" | "erodos" | typeof END {
  if (state.verdict === "approve") return "decisor";
  if (state.verdict === "request_changes") return "erodos";
  return END;
}

/**
 * START → argos → (approve|request_changes|…) → decisor|erodos|END
 *
 * O Argos (orquestrador) roteia e roda as lenses por dentro; o runtime provê o
 * que ele "entrega": o fix step (Erodos) e a merge decision (Decisor). O loop
 * Erodos → Argos (re-review com guard) entra quando o Erodos aplicar de fato.
 */
export function buildGraph() {
  return new StateGraph(ReviewState)
    .addNode("argos", argos)
    .addNode("erodos", erodos)
    .addNode("decisor", decisor)
    .addEdge(START, "argos")
    .addConditionalEdges("argos", afterArgos, ["decisor", "erodos", END])
    .addEdge("decisor", END)
    .addEdge("erodos", END)
    .compile();
}
