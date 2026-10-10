import { Annotation } from "@langchain/langgraph";

export type Verdict = "approve" | "request_changes" | "comment";

/** Estado compartilhado do grafo de code review. */
export const ReviewState = Annotation.Root({
  pr: Annotation<number>(),
  /** Checkout do repositório a revisar (onde o git/route-review rodam). */
  repoPath: Annotation<string>(),
  /** Range da mudança (base...head) que o roteador do framework lê. */
  changed: Annotation<string>(),
  /** Skills que a mudança selecionou, vindas do route-review.py. */
  skills: Annotation<string[]>(),
  /** Verdict do Argos, extraído do texto da revisão. */
  verdict: Annotation<Verdict>(),
  /** Texto da revisão produzida pelo Argos. */
  summary: Annotation<string>(),
  /** Decisão do passo seguinte (Erodos aplicou / Decisor avaliou). */
  decision: Annotation<string>(),
  /** Rodada do loop review↔fix (guard). */
  round: Annotation<number>(),
});

export type ReviewStateT = typeof ReviewState.State;
