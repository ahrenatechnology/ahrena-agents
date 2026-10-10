import { parseArgs } from "node:util";
import { buildGraph } from "./graph";

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
  const out = await graph.invoke({
    pr: values.pr ? Number(values.pr) : 0,
    changed: values.changed,
  });
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
