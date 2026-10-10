import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export interface RouteResult {
  /** Skills que a mudança selecionou (o que o intake consome). */
  skills: string[];
}

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = join(
  PROJECT_ROOT,
  "ahrena/ahrena-framework/engineering/quality/hooks/route-review.py",
);

/**
 * Roda o roteador do ahrena-framework (route-review.py) sobre um range e
 * devolve o que a mudança seleciona. O hook roda `git diff` sozinho, então
 * `cwd` tem que ser o checkout do repositório revisado.
 */
export function routeReview(opts: { changed: string; cwd: string }): RouteResult {
  let stdout: string;
  try {
    stdout = execFileSync("python3", [HOOK, "--changed", opts.changed, "--json"], {
      cwd: opts.cwd,
      encoding: "utf8",
    });
  } catch (error) {
    const e = error as { status?: number; stderr?: string };
    throw new Error(`route-review falhou (exit ${e.status ?? "?"}): ${(e.stderr ?? "").trim()}`);
  }
  const parsed = JSON.parse(stdout) as { skills?: string[] };
  return { skills: parsed.skills ?? [] };
}
