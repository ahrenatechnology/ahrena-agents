import { Annotation } from "@langchain/langgraph";
import type { Finding } from "./findings";

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
  /** Provider do Decisor: "cloudflare" (default) ou "bedrock". */
  provider: Annotation<string>(),
  /** Modelo de decisão (Clef); vazio → default da plataforma. */
  clefModel: Annotation<string>(),
  /** Id do modelo Bedrock (quando provider=bedrock). */
  bedrockModel: Annotation<string>(),
  /** Limiar do gate: prob. mínima de auto_merge; vazio → default. */
  autoMergeMin: Annotation<number>(),
  /** Limiar do gate: prob. máxima de regressão tolerada; vazio → default. */
  regressionMax: Annotation<number>(),
  /** Pré-gate: máximo de warnings que ainda vai ao Clef; vazio → default (2). */
  maxWarnings: Annotation<number>(),
  /** Verdict do Argos, extraído do texto da review. */
  verdict: Annotation<Verdict>(),
  /** Achados estruturados do Argos (alicerce do pré-gate e dos follow-ups). */
  findings: Annotation<Finding[]>(),
  /** Texto da review conduzida pelo Argos. */
  summary: Annotation<string>(),
  /** Decisão do passo seguinte (Erodos aplicou / Decisor avaliou). */
  decision: Annotation<string>(),
  /** Rodada do loop review↔fix (guard). */
  round: Annotation<number>(),
});

export type ReviewStateT = typeof ReviewState.State;
