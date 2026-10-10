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
  const options: Options = {
    plugins: [{ type: "local", path: QUALITY_PLUGIN }],
    agent: "argos",
    permissionMode: "dontAsk",
    // Leitura + análise read-only: deixa o Argos rodar os gates do framework
    // (route-review.py em python3, tsc) e ler o git. Nada de write/merge:
    // sem git push, sem gh, sem Bash genérico.
    allowedTools: [
      "Read",
      "Grep",
      "Glob",
      "Bash(git diff:*)",
      "Bash(git show:*)",
      "Bash(git log:*)",
      "Bash(git rev-parse:*)",
      "Bash(git status:*)",
      "Bash(python3:*)",
      "Bash(npx tsc:*)",
    ],
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
  } finally {
    progress.done();
  }

  const text = chunks.join("");
  if (!text && problems.length) throw new Error(problems.join(" ;; "));
  return text;
}
