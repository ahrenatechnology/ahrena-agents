import { parseArgs } from "node:util";
import { buildGraph } from "./graph";

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { pr: { type: "string" } } });
  if (!values.pr) {
    console.error("uso: npm run dev -- --pr <n>");
    process.exit(1);
  }

  const graph = buildGraph();
  const out = await graph.invoke({ pr: Number(values.pr) });
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
