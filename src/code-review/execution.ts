import { readFileSync } from "node:fs";

/**
 * Se o review pode executar algo, e o quê. É o passo 1 do `reviewing-diffs`: executar
 * é permitido quando o head é uma branch do mesmo repositório que a base, porque
 * construir o projeto roda o código do autor da mudança nesta máquina. E só os
 * comandos que o próprio projeto declara (passados por quem chama o runtime) — o
 * agente nunca ganha um shell aberto.
 */
export interface Execution {
  /** O head é uma branch do mesmo repositório: o Erodos pode escrever nela. */
  sameRepository: boolean;
  /** O review pode executar: mesmo repositório e algum comando declarado. */
  permitted: boolean;
  /** Por que não, quando não: vira um achado `unchecked`, nunca um silêncio. */
  reason?: string;
  /** Os comandos que o agente pode rodar, como prefixo (ex.: `make test-unit`). */
  commands: string[];
  /** A branch do head, para quem precisa escrever nela (o Erodos). */
  headRef?: string;
}

interface PullRequestEvent {
  pull_request?: {
    head?: { ref?: string; repo?: { full_name?: string } | null };
    base?: { repo?: { full_name?: string } };
  };
}

/** Lista separada por `;` ou quebra de linha; um comando com operador de shell é recusado. */
export function parseCommands(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[;\n]/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && !/[|&;<>`$(){}]/.test(c));
}

/**
 * Decide a execução. Fora do GitHub Actions, quem chama diz se o head é do mesmo
 * repositório (`sameRepository`); dentro, o evento do pull request diz. Na dúvida, não
 * executa.
 */
export function resolveExecution(opts: { commands?: string; sameRepository?: boolean; headRef?: string }): Execution {
  const commands = parseCommands(opts.commands);
  let same = opts.sameRepository;
  let headRef = opts.headRef;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath) {
    try {
      const event = JSON.parse(readFileSync(eventPath, "utf8")) as PullRequestEvent;
      const head = event.pull_request?.head?.repo?.full_name;
      const base = event.pull_request?.base?.repo?.full_name;
      if (same === undefined && head && base) same = head === base;
      headRef ??= event.pull_request?.head?.ref;
    } catch {
      // sem evento legível: fica o que foi passado
    }
  }
  if (!same) {
    return { sameRepository: false, permitted: false, reason: "o head não é uma branch do mesmo repositório (ou não deu para saber)", commands: [], headRef };
  }
  if (commands.length === 0) {
    return { sameRepository: true, permitted: false, reason: "o projeto não declarou nenhum comando de teste para o review", commands: [], headRef };
  }
  return { sameRepository: true, permitted: true, commands, headRef };
}

/** As regras de permissão do Agent SDK que liberam só esses comandos, por prefixo. */
export function bashRules(commands: string[]): string[] {
  return commands.map((c) => `Bash(${c}:*)`);
}
