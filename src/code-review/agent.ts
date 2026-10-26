import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { spinner } from "../shared/progress";
import { PLUGINS } from "../shared/paths";

/** Modelo default do Argos quando nada é passado por parâmetro/env. */
export const DEFAULT_MODEL = "claude-opus-4-8";

/**
 * Os agentes, pelo nome qualificado do plugin. Há dois `argos` no framework: o
 * orquestrador (`code-review`), que conduz a review inteira, e o revisor do `quality`.
 * O runtime conduz a review, então chama o orquestrador, sem ambiguidade.
 */
export const ORCHESTRATOR = "ahrena-engineering-code-review:argos";
export const FIXER = "ahrena-engineering-quality:erodos";

/** O que o Argos sempre pode usar: ler. Executar entra só pelos comandos que o projeto declarou. */
const READ_ONLY = ["Read", "Grep", "Glob"];

/**
 * As credenciais do job não são do agente. O que ele lê e o que os comandos dele rodam
 * pode acabar no parecer, e o parecer é público no PR: uma instrução plantada no diff
 * não pode levar um token até ali. Saem do ambiente do agente os tokens que o runtime
 * usa por conta própria (ler os checks, empurrar o commit do Erodos, perguntar ao Clef);
 * fica a credencial do modelo, sem a qual o agente não roda.
 */
const SECRET_ENV = /^(GH_TOKEN|GITHUB_TOKEN|ARGOS_PUSH_TOKEN|CLOUDFLARE_API_TOKEN|AWS_.*|ACTIONS_RUNTIME_TOKEN|ACTIONS_ID_TOKEN_REQUEST_.*|ACTIONS_CACHE_URL|ACTIONS_RESULTS_URL|NPM_TOKEN|NODE_AUTH_TOKEN|DOCKER_AUTH_CONFIG)$/;

/** E os arquivos onde um job costuma deixar credencial em disco (docker login, gh, git, npm, aws). */
const SECRET_FILES = [
  "Read(~/.docker/**)",
  "Read(~/.config/gh/**)",
  "Read(~/.git-credentials)",
  "Read(~/.npmrc)",
  "Read(~/.aws/**)",
  "Read(//root/.docker/**)",
  "Read(//home/*/.docker/**)",
];

export function agentEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !SECRET_ENV.test(key)) out[key] = value;
  }
  return out;
}

/**
 * Invoca o agente orquestrador `argos` do ahrena-framework (plugin
 * `code-review`), que conduz a review: roteia, roda as lenses, funde num
 * verdict. Carrega todos os plugins das lenses. Mesmo prompt/skills do dev —
 * zero cópia.
 */
export async function runArgos(opts: { cwd: string; prompt: string; model?: string; allow?: string[] }): Promise<string> {
  return runAgent({ ...opts, agent: ORCHESTRATOR, tools: [...READ_ONLY, ...(opts.allow ?? [])], label: "Argos conduzindo a review…" });
}

/**
 * Roda um agente do framework até o fim e devolve o texto dele. `tools` é tudo o que ele
 * pode usar: com `dontAsk`, o que não está na lista é negado.
 */
export async function runAgent(opts: {
  cwd: string;
  prompt: string;
  model?: string;
  agent: string;
  tools: string[];
  label: string;
}): Promise<string> {
  const controller = new AbortController();
  const TIMEOUT_S = 600;
  const timer = setTimeout(() => controller.abort(), TIMEOUT_S * 1000);

  const options: Options = {
    model: opts.model || DEFAULT_MODEL,
    plugins: PLUGINS.map((path) => ({ type: "local", path })),
    agent: opts.agent,
    permissionMode: "dontAsk",
    allowedTools: opts.tools,
    disallowedTools: SECRET_FILES,
    env: agentEnv(process.env),
    abortController: controller,
    maxTurns: 100,
    cwd: opts.cwd,
  };

  const chunks: string[] = [];
  const problems: string[] = [];
  const progress = spinner(opts.label);
  let actions = 0;
  try {
    for await (const message of query({ prompt: opts.prompt, options })) {
      if (message.type === "assistant") {
        if (message.error) problems.push(`assistant: ${message.error}`);
        for (const block of message.message.content) {
          if (block.type === "text") chunks.push(block.text);
          else if (block.type === "tool_use") progress.update(`${opts.label.replace(/…$/, "")} · ${++actions} ação(ões)`);
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
