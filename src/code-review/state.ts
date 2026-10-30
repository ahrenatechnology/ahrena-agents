import { Annotation } from "@langchain/langgraph";
import type { Finding } from "./findings";
import type { Check } from "./checks";
import type { Detection, DetectorRun, Routing } from "./routing";
import type { Execution } from "./execution";

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
  /**
   * As checagens determinísticas do pipeline (CI, lint, testes), que rodaram ANTES
   * do Argos: ele lê o PR sabendo o que passou e o que quebrou, e o Decisor as pesa.
   * Vazio → o Argos revisa sem elas, como antes.
   */
  checks: Annotation<Check[]>(),
  /** As lentes que o router do framework selecionou, por script, antes do Argos. */
  routing: Annotation<Routing>(),
  /** Os detectores do framework que rodaram, e se cada um decidiu. */
  detectorRuns: Annotation<DetectorRun[]>(),
  /** Os candidatos que os detectores levantaram, para o Argos passar pelo limite de cada regra. */
  detections: Annotation<Detection[]>(),
  /** Se o review pode executar, e quais comandos (passo 5 das lentes; o Erodos confirma o fix com eles). */
  execution: Annotation<Execution>(),
  /** O Erodos aplica os achados mecânicos e empurra o commit; desligado, a delegação cai para uma pessoa. */
  fix: Annotation<boolean>(),
  /** Limite de rodadas do loop correção → nova revisão; vazio → default (2). */
  maxRounds: Annotation<number>(),
  /** O commit que o Erodos empurrou, quando empurrou. */
  fixCommit: Annotation<string>(),
  /** Verdict do Argos, extraído do texto da review. */
  verdict: Annotation<Verdict>(),
  /** Achados estruturados do Argos (alicerce do pré-gate e dos follow-ups). */
  findings: Annotation<Finding[]>(),
  /** Texto da review conduzida pelo Argos. */
  summary: Annotation<string>(),
  /** Decisão do passo seguinte (Erodos aplicou / Decisor avaliou). */
  decision: Annotation<string>(),
  /** Comentário do PR já renderizado (header + tabela de achados + parecer). */
  comment: Annotation<string>(),
  /** Rodada do loop review↔fix (guard). */
  round: Annotation<number>(),
});

export type ReviewStateT = typeof ReviewState.State;
