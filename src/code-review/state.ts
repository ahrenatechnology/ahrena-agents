import { Annotation } from "@langchain/langgraph";

export type Verdict = "approve" | "request_changes" | "comment";

/** Estado compartilhado do grafo de code review. */
export const ReviewState = Annotation.Root({
  pr: Annotation<number>(),
  /** Checkout do repositório a revisar (onde o Argos lê o git). */
  repoPath: Annotation<string>(),
  /** Range da mudança (base...head). */
  changed: Annotation<string>(),
  /** Modelo a usar no Argos; vazio → default do agente. */
  model: Annotation<string>(),
  /** Modelo de decisão (Clef); vazio → default da plataforma. */
  clefModel: Annotation<string>(),
  /** Limiar do gate: prob. mínima de auto_merge; vazio → default. */
  autoMergeMin: Annotation<number>(),
  /** Limiar do gate: prob. máxima de regressão tolerada; vazio → default. */
  regressionMax: Annotation<number>(),
  /** Verdict do Argos, extraído do texto da review. */
  verdict: Annotation<Verdict>(),
  /** Texto da review conduzida pelo Argos. */
  summary: Annotation<string>(),
  /** Decisão do passo seguinte (Erodos aplicou / Decisor avaliou). */
  decision: Annotation<string>(),
  /** Rodada do loop review↔fix (guard). */
  round: Annotation<number>(),
});

export type ReviewStateT = typeof ReviewState.State;
