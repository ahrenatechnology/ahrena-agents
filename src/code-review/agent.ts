import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { spinner } from "../shared/progress";
import { PLUGINS } from "../shared/paths";

/** Modelo default do Argos quando nada é passado por parâmetro/env. */
export const DEFAULT_MODEL = "claude-opus-4-8";

/**
 * Invoca o agente orquestrador `argos` do ahrena-framework (plugin
 * `code-review`), que conduz a review: roteia, roda as lenses, funde num
 * verdict. Carrega todos os plugins das lenses. Mesmo prompt/skills do dev —
 * zero cópia.
 */
export async function runArgos(opts: { cwd: string; prompt: string; model?: string }): Promise<string> {
  const controller = new AbortController();
  const TIMEOUT_S = 600;
  const timer = setTimeout(() => controller.abort(), TIMEOUT_S * 1000);

  const options: Options = {
    model: opts.model || DEFAULT_MODEL,
    plugins: PLUGINS.map((path) => ({ type: "local", path })),
    // O Argos orquestrador vive no plugin `code-review`. NOTA: o plugin
    // `quality` ainda traz um agente legado também chamado "argos" — se houver
    // ambiguidade no run real, desambiguar (ou remover quality/argos.md no
    // framework, já que o orquestrador o substitui).
    agent: "argos",
    permissionMode: "dontAsk",
    // Read-only: o Argos conduz e lê; quem escreve (fix) e mergeia é o runtime.
    allowedTools: ["Read", "Grep", "Glob"],
    abortController: controller,
    maxTurns: 100,
    cwd: opts.cwd,
  };

  const chunks: string[] = [];
  const problems: string[] = [];
  const progress = spinner("Argos conduzindo a review…");
  let actions = 0;
  try {
    for await (const message of query({ prompt: opts.prompt, options })) {
      if (message.type === "assistant") {
        if (message.error) problems.push(`assistant: ${message.error}`);
        for (const block of message.message.content) {
          if (block.type === "text") chunks.push(block.text);
          else if (block.type === "tool_use") progress.update(`Argos trabalhando… ${++actions} ação(ões)`);
        }
      } else if (message.type === "result" && message.subtype !== "success") {
        const detail = message.errors.length ? message.errors.join(" | ") : message.subtype;
        const denied = message.permission_denials.length;
        problems.push(`result ${message.subtype}: ${detail}${denied ? ` [${denied} permissão(ões) negada(s)]` : ""}`);
      }
    }
  } catch (error) {
    if (controller.signal.aborted) problems.push(`tempo excedido (${TIMEOUT_S}s)`);
    else throw error;
  } finally {
    clearTimeout(timer);
    progress.done();
  }

  const text = chunks.join("");
  if (!text && problems.length) throw new Error(problems.join(" ;; "));
  return text;
}
