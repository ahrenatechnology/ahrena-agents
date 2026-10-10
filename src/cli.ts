import { parseArgs } from "node:util";
import { buildGraph } from "./graph";

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
