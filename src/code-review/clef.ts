import Cloudflare from "cloudflare";

/** Modelo de decisão default (Workers AI). `clef-flash` é a variante rápida. */
export const DEFAULT_CLEF_MODEL = "clef";

/** Uma pergunta tipada da System One API do Clef. */
export type ClefQuestion =
  | { type: "noul"; instructions: string }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

/** Uma resposta do Clef — formato depende do tipo da pergunta. */
export type ClefAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | {
      type: "score";
      score: number;
      legend: Record<string, string>;
      probabilities: Record<string, number>;
      confidence: number;
    };

/** Respostas do Clef, uma por id de pergunta. */
export type ClefAnswers = Record<string, ClefAnswer | undefined>;

interface ClefEnvelope {
  result: { model: string; answers: ClefAnswers; usage: { input_tokens: number; output_tokens: number } };
  success: boolean;
  errors: { code: number; message: string }[];
}

/**
 * Chama o modelo de decisão Clef (Workers AI) pelo SDK oficial da Cloudflare.
 *
 * Usa `client.post` com path literal de propósito: o helper `ai.run` escapa o
 * id do modelo (`@cf/cloudflare/clef`) e quebra a rota (400 "No route"). Pelo
 * `post` a gente mantém o que o SDK dá (auth, retry, timeout, erro tipado) sem
 * o bug de encoding. Requer CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN
 * (escopo Workers AI).
 */
export async function runClef(input: {
  state: unknown;
  questions: Record<string, ClefQuestion>;
  model?: string;
}): Promise<ClefAnswers> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN são obrigatórios para o Decisor");
  }

  const model = input.model || DEFAULT_CLEF_MODEL;
  const client = new Cloudflare({ apiToken });
  const res = (await client.post(`/accounts/${accountId}/ai/run/@cf/cloudflare/${model}`, {
    body: { model, state: input.state, questions: input.questions },
  })) as ClefEnvelope;

  // O envelope da Workers AI pode vir com HTTP 200 e success=false (ex.: erro de
  // modelo). Sem validar, a leitura de `result.answers` estoura com um TypeError
  // genérico; validando, o motivo real (errors[].message) chega ao chamador.
  if (!res.success || !res.result) {
    const message =
      res.errors?.map((e) => e.message).filter(Boolean).join("; ") || "resposta sem detalhe de erro";
    throw new Error(`Clef retornou falha: ${message}`);
  }

  return res.result.answers;
}
