import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
  const options: Options = {
    plugins: [{ type: "local", path: QUALITY_PLUGIN }],
    agent: "argos",
    permissionMode: "dontAsk",
    allowedTools: ["Read", "Grep", "Glob"],
    cwd: opts.cwd,
  };

  const chunks: string[] = [];
  const problems: string[] = [];
  // Progresso ao vivo vai para stderr; o stdout fica só com o JSON final.
  process.stderr.write("⟳ Argos revisando…\n");
  for await (const message of query({ prompt: opts.prompt, options })) {
    if (message.type === "assistant") {
      if (message.error) problems.push(`assistant: ${message.error}`);
      for (const block of message.message.content) {
        if (block.type === "text") {
          chunks.push(block.text);
          process.stderr.write(block.text);
        } else if (block.type === "tool_use") {
          process.stderr.write(`\n  · ${block.name}\n`);
        }
      }
    } else if (message.type === "result" && message.subtype !== "success") {
      const detail = message.errors.length ? message.errors.join(" | ") : message.subtype;
      const denied = message.permission_denials.length;
      problems.push(`result ${message.subtype}: ${detail}${denied ? ` [${denied} permissão(ões) negada(s)]` : ""}`);
    }
  }
  process.stderr.write("\n");

  const text = chunks.join("");
  if (!text && problems.length) throw new Error(problems.join(" ;; "));
  return text;
}
