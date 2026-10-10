import { execFileSync } from "node:child_process";
import { ROUTE_REVIEW_HOOK } from "../shared/paths";

export interface RouteResult {
  /** Skills que a mudança selecionou (o que o intake consome). */
  skills: string[];
}

/**
 * Roda o roteador do ahrena-framework (route-review.py) sobre um range e
 * devolve o que a mudança seleciona. O hook roda `git diff` sozinho, então
 * `cwd` tem que ser o checkout do repositório revisado.
 */
export function routeReview(opts: { changed: string; cwd: string }): RouteResult {
  let stdout: string;
  try {
    stdout = execFileSync("python3", [ROUTE_REVIEW_HOOK, "--changed", opts.changed, "--json"], {
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
