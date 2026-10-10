import { Annotation } from "@langchain/langgraph";

export type Verdict = "approve" | "request_changes" | "comment";

/** Estado compartilhado do grafo. Começa mínimo; cresce conforme o fluxo. */
export const ReviewState = Annotation.Root({
  pr: Annotation<number>(),
  /** Range da mudança (base...head) que o roteador do framework lê. */
  changed: Annotation<string>(),
  /** Skills que a mudança selecionou, vindas do route-review.py. */
  skills: Annotation<string[]>(),
  verdict: Annotation<Verdict>(),
  summary: Annotation<string>(),
});

export type ReviewStateT = typeof ReviewState.State;
