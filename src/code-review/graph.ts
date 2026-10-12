import { StateGraph, START, END } from "@langchain/langgraph";
import { ReviewState, type ReviewStateT } from "./state";
import { argos } from "./nodes/argos";
import { erodos } from "./nodes/erodos";
import { decisor } from "./nodes/decisor";
import { countFindings } from "./findings";

/** Pré-gate: default da plataforma do máximo de warnings que ainda vai ao Clef. */
const DEFAULT_MAX_WARNINGS = 2; // 3+ warnings → delega, sem gastar o Clef

/**
 * PRÉ-GATE — roteamento determinístico e barato, antes de gastar o Clef:
 *   bloqueante (ou request_changes)        → Erodos (rejeita + delega o fix)
 *   approve com > maxWarnings (ex.: 3+)     → Erodos (rejeita + delega o fix)
 *   approve com 0–maxWarnings warnings      → Decisor (zona cinza; Clef decide)
 *   comment/outros                          → fim (deixa para uma pessoa)
 *
 * Sem achados estruturados (lista vazia), as contagens são 0 e o roteamento cai
 * no antigo, só por verdict — a feature é aditiva e falha segura.
 */
function afterArgos(state: ReviewStateT): "decisor" | "erodos" | typeof END {
  const { blocking, warning } = countFindings(state.findings ?? []);
  // Clampa como os limiares de probabilidade: inteiro não-negativo. Um valor cru
  // negativo/fracionário poderia desligar o auto-merge silenciosamente.
  const raw = Number.isFinite(state.maxWarnings) ? (state.maxWarnings as number) : DEFAULT_MAX_WARNINGS;
  const maxWarnings = Math.max(0, Math.floor(raw));

  if (blocking > 0 || state.verdict === "request_changes") return "erodos";
  if (state.verdict === "approve") return warning > maxWarnings ? "erodos" : "decisor";
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
