import { parseArgs } from "node:util";
import { buildGraph } from "./graph";
import { renderPreview } from "./preview";
import type { ReviewStateT } from "./state";

// Carrega CLAUDE_CODE_OAUTH_TOKEN (e afins) de um .env local, se houver.
try {
  process.loadEnvFile();
} catch {
  // sem .env: segue com o ambiente como está
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      pr: { type: "string" },
      changed: { type: "string" },
    },
  });

  const graph = buildGraph();
  const input = { pr: values.pr ? Number(values.pr) : 0, changed: values.changed };

  // Cospe uma prévia por etapa conforme o grafo avança; acumula o resultado.
  const final: Partial<ReviewStateT> = { pr: input.pr, changed: input.changed };
  const stream = await graph.stream(input, { streamMode: "updates" });
  for await (const update of stream) {
    for (const [node, patch] of Object.entries(update) as [string, Partial<ReviewStateT>][]) {
      process.stderr.write(renderPreview(node, patch) + "\n");
      Object.assign(final, patch);
    }
  }

  console.log(JSON.stringify(final, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
