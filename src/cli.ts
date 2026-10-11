import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { buildGraph } from "./code-review/graph";
import { renderPreview } from "./code-review/preview";
import type { ReviewStateT } from "./code-review/state";

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
      "repo-path": { type: "string" },
      gates: { type: "string" },
    },
  });

  let gates: string | undefined;
  if (values.gates) {
    try {
      gates = readFileSync(values.gates, "utf8");
    } catch {
      gates = undefined;
    }
  }

  const graph = buildGraph();
  const input = {
    pr: values.pr ? Number(values.pr) : 0,
    changed: values.changed,
    repoPath: values["repo-path"] ?? process.cwd(),
    gates,
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

  console.log(JSON.stringify(final, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
