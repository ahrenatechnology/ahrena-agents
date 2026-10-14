import { parseArgs } from "node:util";
import { buildGraph } from "./code-review/graph";
import { renderPreview } from "./code-review/preview";
import { renderComment } from "./code-review/comment";
import type { ReviewStateT } from "./code-review/state";

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

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      pr: { type: "string" },
      changed: { type: "string" },
      "repo-path": { type: "string" },
      model: { type: "string" },
      "clef-model": { type: "string" },
      "auto-merge-min": { type: "string" },
      "regression-max": { type: "string" },
      "max-warnings": { type: "string" },
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
    autoMergeMin: numOpt(values["auto-merge-min"] ?? process.env.DECISOR_AUTO_MERGE_MIN),
    regressionMax: numOpt(values["regression-max"] ?? process.env.DECISOR_REGRESSION_MAX),
    maxWarnings: numOpt(values["max-warnings"] ?? process.env.DECISOR_MAX_WARNINGS),
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
