import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spinner } from "./progress";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** O plugin `quality` do framework: traz o agente `argos` + suas skills + hooks. */
const QUALITY_PLUGIN = join(PROJECT_ROOT, "ahrena/ahrena-framework/engineering/quality");

/**
 * Invoca o agente `argos` REAL do ahrena-framework, carregado como plugin
 * local, e devolve o texto que ele produz. Mesmo prompt e skills do dev —
 * zero cópia (o prompt vem do próprio argos.md via plugin). A autenticação é
 * a do Claude Code já logado (ou CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY).
 */
export async function runArgos(opts: { cwd: string; prompt: string }): Promise<string> {
  const controller = new AbortController();
  const TIMEOUT_S = 600;
  const timer = setTimeout(() => controller.abort(), TIMEOUT_S * 1000);

  const options: Options = {
    plugins: [{ type: "local", path: QUALITY_PLUGIN }],
    agent: "argos",
    permissionMode: "dontAsk",
    // Read-only confiável: SEM Bash. O Bash fazia o agente pendurar em comandos
    // que bloqueiam. As condições de script ficam `unchecked` (semântica do
    // ADR-002). Decidir os gates fica para o orquestrador rodá-los e alimentar.
    allowedTools: ["Read", "Grep", "Glob"],
    abortController: controller,
    maxTurns: 100,
    cwd: opts.cwd,
  };

  const chunks: string[] = [];
  const problems: string[] = [];
  // Progresso enxuto no stderr (spinner); o texto da revisão fica só no retorno.
  const progress = spinner("Argos pensando…");
  let actions = 0;
  try {
    for await (const message of query({ prompt: opts.prompt, options })) {
      if (message.type === "assistant") {
        if (message.error) problems.push(`assistant: ${message.error}`);
        for (const block of message.message.content) {
          if (block.type === "text") chunks.push(block.text);
          else if (block.type === "tool_use") progress.update(`Argos analisando… ${++actions} ação(ões)`);
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
