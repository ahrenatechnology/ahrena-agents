import type { ClefAnswer, ClefAnswers, ClefQuestion } from "./clef";

/**
 * Adapter do Decisor para **AWS Bedrock** (modelo on-demand — o caminho mais
 * barato pra rodar na AWS, sem GPU ligada parada). Como o Bedrock não tem o
 * Clef nativo, a gente usa um LLM de chat (Converse API) e pede a decisão como
 * JSON, traduzindo de volta pra MESMA forma `ClefAnswers` que o decisor já
 * consome — então `decide()` e o resto não mudam. É uma APROXIMAÇÃO do modelo
 * de decisão (não as probabilidades calibradas do Clef), aceitável pra volume
 * baixo + calibragem manual.
 *
 * Auth: cadeia de credenciais padrão da AWS (env/role) + região (AWS_REGION).
 * Requer o id do modelo Bedrock por parâmetro (ex.: um Claude no Bedrock).
 */

function clamp01(n: unknown): number {
  const x = Number(n);
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
}

function argmax(probs: Record<string, number>): string {
  let best = "";
  let bestP = -1;
  for (const [k, v] of Object.entries(probs)) if (v > bestP) ((bestP = v), (best = k));
  return best;
}

/** Extrai o objeto JSON do texto do modelo (tolera crases/prosa em volta). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Converte a saída livre do modelo na forma `ClefAnswers`, PILOTANDO pelas
 * perguntas que a gente mandou (não confia na estrutura do modelo): usa os
 * números dele quando existem (clampados), e preenche legenda/opções a partir
 * da nossa própria definição. Robusto: faltando algo, cai em default seguro.
 */
export function coerceAnswers(raw: unknown, questions: Record<string, ClefQuestion>): ClefAnswers {
  const obj = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) ?? {};
  const out: ClefAnswers = {};

  for (const [id, q] of Object.entries(questions)) {
    const a = (obj[id] && typeof obj[id] === "object" ? (obj[id] as Record<string, unknown>) : {}) ?? {};

    if (q.type === "noul") {
      out[id] = { type: "noul", noul: clamp01(a.noul) };
    } else if (q.type === "choice") {
      const probabilities: Record<string, number> = {};
      const aProbs = (a.probabilities as Record<string, unknown>) ?? {};
      for (const key of Object.keys(q.criteria)) probabilities[key] = clamp01(aProbs[key]);
      const chosen = typeof a.choice === "string" && a.choice in q.criteria ? a.choice : argmax(probabilities);
      out[id] = { type: "choice", choice: chosen, probabilities, confidence: clamp01(a.confidence) };
    } else {
      const legend: Record<string, string> = {};
      const probabilities: Record<string, number> = {};
      const aProbs = (a.probabilities as Record<string, unknown>) ?? {};
      q.criteria.forEach((label, i) => {
        legend[String(i)] = label;
        probabilities[String(i)] = clamp01(aProbs[String(i)]);
      });
      const score = Number.isFinite(Number(a.score)) ? Number(a.score) : 0;
      out[id] = { type: "score", score, legend, probabilities, confidence: clamp01(a.confidence) } as ClefAnswer;
    }
  }
  return out;
}

const SYSTEM = [
  "You are a decision engine. You receive a STATE (a review dossier) and a set of typed QUESTIONS.",
  "Answer every question and return ONLY a JSON object mapping each question id to its answer — no prose, no code fences.",
  "Shapes by question type:",
  '- noul:   {"noul": <probability 0..1 that the answer is yes>}',
  '- choice: {"choice": "<one of the criteria keys>", "probabilities": {"<key>": <0..1>, ...}, "confidence": <0..1>}',
  '- score:  {"score": <index into criteria, 0-based, probability-weighted>, "probabilities": {"0": <0..1>, ...}, "confidence": <0..1>}',
  "Probabilities for a choice/score question should sum to about 1.",
].join("\n");

export async function runBedrockDecision(input: {
  state: unknown;
  questions: Record<string, ClefQuestion>;
  model?: string;
}): Promise<ClefAnswers> {
  const model = input.model;
  if (!model) {
    throw new Error("BEDROCK_MODEL (ou --bedrock-model) é obrigatório para o provider bedrock");
  }
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!region) {
    throw new Error("AWS_REGION é obrigatória para o provider bedrock");
  }

  // Import dinâmico: o SDK da AWS só carrega quando o provider é bedrock.
  const { BedrockRuntimeClient, ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
  const client = new BedrockRuntimeClient({ region });

  const userText = JSON.stringify({ state: input.state, questions: input.questions });
  const resp = await client.send(
    new ConverseCommand({
      modelId: model,
      system: [{ text: SYSTEM }],
      messages: [{ role: "user", content: [{ text: userText }] }],
      inferenceConfig: { maxTokens: 1024, temperature: 0 },
    }),
  );

  const text =
    resp.output?.message?.content?.map((c) => ("text" in c ? c.text : "")).filter(Boolean).join("") ?? "";
  const raw = extractJson(text);
  if (!raw) throw new Error("Bedrock não devolveu JSON parseável para a decisão");
  return coerceAnswers(raw, input.questions);
}
