import { StateGraph, START, END } from "@langchain/langgraph";
import { ReviewState, type ReviewStateT } from "./state";
import { router } from "./nodes/router";
import { argos } from "./nodes/argos";
import { erodos } from "./nodes/erodos";
import { decisor } from "./nodes/decisor";
import { countFindings } from "./findings";
import { countChecks } from "./checks";

/**
 * PRÉ-GATE — roteamento determinístico e barato:
 *   checagem determinística vermelha        → Erodos (o piso: o parecer nunca libera)
 *   bloqueante (ou request_changes)         → Erodos (corrige o mecânico; segura)
 *   approve com warnings                    → Erodos (uma rodada dos warnings)
 *   approve sem warnings                    → Decisor (só informa)
 *   comment/outros                          → fim (deixa para uma pessoa)
 *
 * O Decisor (o Clef) não segura o merge: um approve sem bloqueante libera, e a resposta
 * dele vai no parecer como informação (#19, decisão do Fernando de 12/11/2026).
 *
 * Sem achados estruturados (lista vazia), as contagens são 0 e o roteamento cai
 * no antigo, só por verdict — a feature é aditiva e falha segura.
 */
export function afterArgos(state: ReviewStateT): "decisor" | "erodos" | typeof END {
  const { blocking, warning } = countFindings(state.findings ?? []);
  // O piso determinístico: com uma checagem vermelha, o parecer não libera, seja qual
  // for. O Argos pode errar; o resultado de um script, não.
  if (countChecks(state.checks ?? []).red.length > 0) return "erodos";
  if (blocking > 0 || state.verdict === "request_changes") return "erodos";
  if (state.verdict === "approve") return warning > 0 ? "erodos" : "decisor";
  return END;
}

/**
 * Depois do Erodos: um commit empurrado espera a revisão do CI dele; um approve cujos
 * warnings o Erodos não aplicou segue para o Decisor, que só informa; o resto (segurado)
 * termina.
 */
export function afterErodos(state: ReviewStateT): "decisor" | typeof END {
  if (state.fixCommit) return END;
  return state.verdict === "approve" ? "decisor" : END;
}

/**
 * START → router → argos → (approve|request_changes|…) → decisor|erodos|END; erodos → decisor|END
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
    .addConditionalEdges("erodos", afterErodos, ["decisor", END])
    .compile();
}
