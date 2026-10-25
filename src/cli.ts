import { parseArgs } from "node:util";
import { buildGraph } from "./code-review/graph";
import { renderPreview } from "./code-review/preview";
import { renderComment } from "./code-review/comment";
import type { ReviewStateT } from "./code-review/state";
import { fetchGithubChecks, loadChecks, type Check } from "./code-review/checks";

// Carrega CLAUDE_CODE_OAUTH_TOKEN (e afins) de um .env local, se houver.
try {
  process.loadEnvFile();
} catch {
  // sem .env: segue com o ambiente como está
}

/** Lê um número de CLI/env; vazio ou inválido → undefined (o nó usa o default). */
function numOpt(raw: string | undefined): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Default da espera pelas checagens dentro do GitHub Actions: o bastante para um CI típico. */
const DEFAULT_CHECKS_WAIT_SECONDS = 900;

/**
 * As checagens determinísticas que o Argos lê antes de revisar. Um arquivo dado vence
 * (qualquer CI: um array de {name, conclusion}, ou o `needs` de um workflow). Sem ele,
 * dentro do GitHub Actions, lê o commit do PR pela API do GitHub, esperando as outras
 * checagens terminarem até o prazo. Sem nenhum dos dois, ou com erro na leitura, [] —
 * e o Argos revisa como antes.
 */
async function resolveChecks(opts: { file?: string; changed?: string; wait?: number; exclude?: string }): Promise<Check[]> {
  const fromFile = loadChecks(opts.file);
  if (opts.file) return fromFile;
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const sha = opts.changed?.split("...")[1]?.trim();
  if (!repository || !token || !sha || !/^[0-9a-f]{7,40}$/i.test(sha)) return [];
  const inActions = process.env.GITHUB_ACTIONS === "true";
  try {
    return await fetchGithubChecks({
      repository,
      sha,
      token,
      api: process.env.GITHUB_API_URL,
      selfRunId: process.env.GITHUB_RUN_ID,
      exclude: opts.exclude ? new RegExp(opts.exclude) : undefined,
      waitSeconds: opts.wait ?? (inActions ? DEFAULT_CHECKS_WAIT_SECONDS : 0),
    });
  } catch (error) {
    process.stderr.write(`checagens: não consegui ler do GitHub (${error instanceof Error ? error.message : error}); sigo sem elas\n`);
    return [];
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      pr: { type: "string" },
      changed: { type: "string" },
      "repo-path": { type: "string" },
      model: { type: "string" },
      "clef-model": { type: "string" },
      "decisor-provider": { type: "string" },
      "bedrock-model": { type: "string" },
      "auto-merge-min": { type: "string" },
      "regression-max": { type: "string" },
      "max-warnings": { type: "string" },
      checks: { type: "string" },
      "checks-wait": { type: "string" },
      "checks-exclude": { type: "string" },
    },
  });

  const graph = buildGraph();
  const input = {
    pr: values.pr ? Number(values.pr) : 0,
    changed: values.changed,
    repoPath: values["repo-path"] ?? process.cwd(),
    // Vazio → o nó aplica o default da plataforma (flag vence env).
    model: values.model ?? process.env.ARGOS_MODEL,
    clefModel: values["clef-model"] ?? process.env.CLEF_MODEL,
    provider: values["decisor-provider"] ?? process.env.DECISOR_PROVIDER,
    bedrockModel: values["bedrock-model"] ?? process.env.BEDROCK_MODEL,
    autoMergeMin: numOpt(values["auto-merge-min"] ?? process.env.DECISOR_AUTO_MERGE_MIN),
    regressionMax: numOpt(values["regression-max"] ?? process.env.DECISOR_REGRESSION_MAX),
    maxWarnings: numOpt(values["max-warnings"] ?? process.env.DECISOR_MAX_WARNINGS),
    checks: await resolveChecks({
      file: values.checks ?? process.env.ARGOS_CHECKS_FILE,
      changed: values.changed,
      wait: numOpt(values["checks-wait"] ?? process.env.ARGOS_CHECKS_WAIT),
      exclude: values["checks-exclude"] ?? process.env.ARGOS_CHECKS_EXCLUDE,
    }),
  };

  // Cospe uma prévia por etapa conforme o grafo avança; acumula o resultado.
  const final: Partial<ReviewStateT> = { pr: input.pr, changed: input.changed };
  const stream = await graph.stream(input, { streamMode: "updates" });
  for await (const update of stream) {
    for (const [node, patch] of Object.entries(update) as [string, Partial<ReviewStateT>][]) {
      process.stderr.write(renderPreview(node, patch) + "\n");
      Object.assign(final, patch);
    }
  }

  // O comentário renderizado (tabela de achados + parecer) vai no mesmo JSON,
  // pra o workflow só postar — a apresentação mora no runtime.
  final.comment = renderComment(final);

  console.log(JSON.stringify(final, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
