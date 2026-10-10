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
    permissionMode: "bypassPermissions",
    cwd: opts.cwd,
  };

  const chunks: string[] = [];
  for await (const message of query({ prompt: opts.prompt, options })) {
    if (message.type === "assistant") {
      if (message.error) throw new Error(message.error);
      for (const block of message.message.content) {
        if (block.type === "text") chunks.push(block.text);
      }
    }
  }
  return chunks.join("");
}
