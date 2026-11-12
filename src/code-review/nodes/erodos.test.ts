import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { erodos, outsideFindings, configDigest, gitFailure, WARNING_ROUNDS } from "./erodos";
import { FIXER_TOOLS, GIT_WRITES } from "../agent";
import type { ReviewStateT } from "../state";
import type { Finding } from "../findings";

const warning: Finding = { severity: "warning", title: "nome pouco claro", file: "src/x.ts", line: 1, kind: "como" };
const intent: Finding = { severity: "warning", title: "escopo", file: "src/x.ts", line: 3, kind: "oque" };
const blocking: Finding = { severity: "blocking", title: "segredo no código", file: "src/y.ts", line: 2, kind: "como" };

let repo: string;
let base: string;
let head: string;
let fixed: string;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

before(() => {
  repo = mkdtempSync(join(tmpdir(), "erodos-"));
  git("init", "--quiet", "-b", "main");
  git("config", "user.name", "t");
  git("config", "user.email", "t@example.com");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "base");
  base = git("rev-parse", "HEAD");
  writeFileSync(join(repo, "b.txt"), "b\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "feat: b");
  head = git("rev-parse", "HEAD");
  writeFileSync(join(repo, "c.txt"), "c\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "fix(review): aplica 1 achado\n\nAhrena-Fix-Round: 1");
  fixed = git("rev-parse", "HEAD");
});

after(() => rmSync(repo, { recursive: true, force: true }));

const execution = { sameRepository: true, permitted: false, commands: [], headRef: "feat/x" };
const state = (patch: Partial<ReviewStateT>) =>
  ({ pr: 1, repoPath: repo, changed: `${base}...${head}`, execution, fix: true, ...patch }) as ReviewStateT;

test("#19/AC-6: with fix off, an approve with warnings stays approve and says so", async () => {
  const out = await erodos(state({ verdict: "approve", findings: [warning], fix: false }));
  assert.equal(out.verdict, undefined);
  assert.equal(out.decision, undefined);
  assert.match(out.fixNote ?? "", /desligado/);
});

test("#19/AC-6: with fix off, a blocker holds as request_changes", async () => {
  const out = await erodos(state({ verdict: "approve", findings: [blocking], fix: false }));
  assert.equal(out.verdict, "request_changes");
  assert.match(out.decision ?? "", /^hold_for_human: .*desligado/);
});

test("#19/AC-2: an oque warning is never applied, and the approve stands", async () => {
  const out = await erodos(state({ verdict: "approve", findings: [intent] }));
  assert.equal(out.verdict, undefined);
  assert.match(out.fixNote ?? "", /nenhum achado mecânico/);
});

test("#19/AC-2: after the warnings round, an approve is settled with no new commit", async () => {
  assert.equal(WARNING_ROUNDS, 1);
  process.env.ARGOS_PUSH_TOKEN = "t";
  process.env.GITHUB_REPOSITORY = "o/r";
  try {
    const out = await erodos(state({ verdict: "approve", findings: [warning], changed: `${base}...${fixed}` }));
    assert.equal(out.fixCommit, undefined);
    assert.equal(out.round, 1);
    assert.match(out.fixNote ?? "", /limite de 1 rodada/);
  } finally {
    delete process.env.ARGOS_PUSH_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
  }
});

test("#19/AC-4: a blocker counts the rounds from the trailers, up to max-rounds", async () => {
  const out = await erodos(state({ verdict: "request_changes", findings: [blocking], changed: `${base}...${fixed}`, maxRounds: 1 }));
  assert.equal(out.verdict, "request_changes");
  assert.match(out.decision ?? "", /limite de 1 rodada/);
});

test("#19/AC-5: the push token is only ARGOS_PUSH_TOKEN, never the job's GITHUB_TOKEN", async () => {
  process.env.GH_TOKEN = "job";
  process.env.GITHUB_TOKEN = "job";
  process.env.GITHUB_REPOSITORY = "o/r";
  try {
    const out = await erodos(state({ verdict: "approve", findings: [warning] }));
    assert.equal(out.fixCommit, undefined);
    assert.match(out.fixNote ?? "", /sem push token/);
  } finally {
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
  }
});

test("#19/AC-5: the Erodos has no git in its shell and no agent writes under .git", () => {
  assert.ok(!FIXER_TOOLS.some((t) => t.startsWith("Bash")));
  for (const rule of ["Write(.git/**)", "Edit(.git/**)", "Write(**/.git/**)", "Write(~/.gitconfig)"]) {
    assert.ok(GIT_WRITES.includes(rule), rule);
  }
});

test("#19/AC-5: a change to the repository's git config is detected", () => {
  const before = configDigest(repo);
  appendFileSync(join(repo, ".git", "config"), '[url "https://evil.example/"]\n\tinsteadOf = https://github.com/\n');
  assert.notEqual(configDigest(repo), before);
});

test("#19/AC-3: a file no finding names is outside", () => {
  assert.deepEqual(outsideFindings(["src/x.ts", "src/z.ts"], [warning]), ["src/z.ts"]);
});

test("a git failure never shows the credential", () => {
  const error = Object.assign(new Error("x"), { stderr: "fatal: Authorization: Basic c2VjcmV0 refused for s3cr3t" });
  const line = gitFailure(error, "s3cr3t");
  assert.ok(!line.includes("s3cr3t") && !line.includes("c2VjcmV0"), line);
});
