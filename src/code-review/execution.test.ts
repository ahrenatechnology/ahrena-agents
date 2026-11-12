import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveExecution } from "./execution";

function withEvent(event: unknown, run: () => void): void {
  const dir = mkdtempSync(join(tmpdir(), "event-"));
  const path = join(dir, "event.json");
  writeFileSync(path, JSON.stringify(event));
  process.env.GITHUB_EVENT_PATH = path;
  try {
    run();
  } finally {
    delete process.env.GITHUB_EVENT_PATH;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("#19/AC-5: inside Actions, a fork's event wins over a forced same-repository", () => {
  const fork = { pull_request: { head: { ref: "x", repo: { full_name: "fork/r" } }, base: { repo: { full_name: "o/r" } } } };
  withEvent(fork, () => assert.equal(resolveExecution({ sameRepository: true, headRef: "main" }).sameRepository, false));
});

test("#19/AC-5: an event that is not a pull request never writes", () => {
  withEvent({ comment: {} }, () => assert.equal(resolveExecution({ sameRepository: true }).sameRepository, false));
});

test("#19/AC-5: the event's head branch wins over a forced head-ref", () => {
  const same = { pull_request: { head: { ref: "feat/x", repo: { full_name: "o/r" } }, base: { repo: { full_name: "o/r" } } } };
  withEvent(same, () => assert.equal(resolveExecution({ headRef: "main" }).headRef, "feat/x"));
});
