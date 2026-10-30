import { StateGraph, START, END } from "@langchain/langgraph";
import { ReviewState, type ReviewStateT } from "./state";
import { router } from "./nodes/router";
import { argos } from "./nodes/argos";
import { erodos } from "./nodes/erodos";
import { decisor } from "./nodes/decisor";
import { countFindings } from "./findings";
import { countChecks } from "./checks";

/** Pré-gate: default da plataforma do máximo de warnings que ainda vai ao Clef. */
const DEFAULT_MAX_WARNINGS = 2; // 3+ warnings → delega, sem gastar o Clef

/**
 * PRÉ-GATE — roteamento determinístico e barato, antes de gastar o Clef:
 *   checagem determinística vermelha        → Erodos (o piso: nunca auto_merge)
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

  // O piso determinístico: com uma checagem vermelha, o PR não vai ao Clef, seja qual
  // for o parecer. O Argos pode errar; o resultado de um script, não.
  if (countChecks(state.checks ?? []).red.length > 0) return "erodos";
  if (blocking > 0 || state.verdict === "request_changes") return "erodos";
  if (state.verdict === "approve") return warning > maxWarnings ? "erodos" : "decisor";
  return END;
}

/**
 * START → router → argos → (approve|request_changes|…) → decisor|erodos|END
 *
 * A sequência do orquestrador do code-review: o router (por script) escolhe as lentes
 * e roda os detectores; o Argos roda as lentes e sintetiza um veredito; o runtime
 * provê o que ele entrega: o passo de correção (Erodos) e a decisão de merge
 * (Decisor). O loop Erodos → Argos fecha no CI: o commit do Erodos dispara as
 * checagens de novo e o Argos revisa esse commit no fim delas, com o limite de
 * rodadas contado no histórico do PR.
 */
export function buildGraph() {
  return new StateGraph(ReviewState)
    .addNode("router", router)
    .addNode("argos", argos)
    .addNode("erodos", erodos)
    .addNode("decisor", decisor)
    .addEdge(START, "router")
    .addEdge("router", "argos")
    .addConditionalEdges("argos", afterArgos, ["decisor", "erodos", END])
    .addEdge("decisor", END)
    .addEdge("erodos", END)
    .compile();
}
