import { test } from "node:test";
import assert from "node:assert/strict";
import { END } from "@langchain/langgraph";
import { afterArgos, afterErodos } from "./graph";
import type { ReviewStateT } from "./state";
import type { Finding } from "./findings";

const warning: Finding = { severity: "warning", title: "nome pouco claro", file: "src/x.ts", line: 1, kind: "como" };
const blocking: Finding = { severity: "blocking", title: "segredo no código", file: "src/y.ts", line: 2, kind: "como" };
const state = (patch: Partial<ReviewStateT>) => patch as ReviewStateT;

test("#19/AC-1: an approve with warnings goes to the Erodos", () => {
  assert.equal(afterArgos(state({ verdict: "approve", findings: [warning] })), "erodos");
});

test("#19/AC-7: an approve with no warnings goes to the Decisor, which only informs", () => {
  assert.equal(afterArgos(state({ verdict: "approve", findings: [] })), "decisor");
});

test("#19/AC-4: a blocker, a red check or request_changes go to the Erodos", () => {
  assert.equal(afterArgos(state({ verdict: "request_changes", findings: [blocking] })), "erodos");
  assert.equal(afterArgos(state({ verdict: "request_changes", findings: [] })), "erodos");
  assert.equal(
    afterArgos(state({ verdict: "approve", findings: [], checks: [{ name: "ci", conclusion: "failure" }] })),
    "erodos",
  );
});

test("a comment opinion ends with no merge decision", () => {
  assert.equal(afterArgos(state({ verdict: "comment", findings: [] })), END);
});

test("#19/AC-1: a pushed Erodos commit ends the run; the next review is the CI's", () => {
  assert.equal(afterErodos(state({ verdict: "approve", fixCommit: "a".repeat(40) })), END);
});

test("#19/AC-2: an approve whose warnings were not applied goes on to the Decisor", () => {
  assert.equal(afterErodos(state({ verdict: "approve" })), "decisor");
  assert.equal(afterErodos(state({ verdict: "request_changes" })), END);
});
