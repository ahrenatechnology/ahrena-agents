import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export interface RoutedSkill {
  id: string;
  skill: string;
  opens: string[];
  why: string;
  on: string[];
}

export interface RouteResult {
  routes: RoutedSkill[];
  skills: string[];
  unrouted: string[];
  ignored: string[];
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
  return JSON.parse(stdout) as RouteResult;
}
