import { StateGraph, START, END } from "@langchain/langgraph";
import { ReviewState } from "./state";
import { intake, argos } from "./nodes";

/**
 * Grafo mínimo: START → intake → argos → END.
 * Erodos, Decisor e os revisores especialistas entram nos próximos passos.
 */
export function buildGraph() {
  return new StateGraph(ReviewState)
    .addNode("intake", intake)
    .addNode("argos", argos)
    .addEdge(START, "intake")
    .addEdge("intake", "argos")
    .addEdge("argos", END)
    .compile();
}
