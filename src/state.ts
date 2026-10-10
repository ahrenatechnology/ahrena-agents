import { Annotation } from "@langchain/langgraph";

export type Verdict = "approve" | "request_changes" | "comment";

/** Estado compartilhado do grafo. Começa mínimo; cresce conforme o fluxo. */
export const ReviewState = Annotation.Root({
  pr: Annotation<number>(),
  verdict: Annotation<Verdict>(),
  summary: Annotation<string>(),
});

export type ReviewStateT = typeof ReviewState.State;
