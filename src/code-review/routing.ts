import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ENGINEERING } from "../shared/paths";

/**
 * O passo 1 do orquestrador do code-review, decidido por script e não pelo modelo:
 * o router do framework (`route-review.py`) lê a tabela de rotas e a mudança e diz
 * quais lentes rodam e por quê. Duas execuções sobre o mesmo diff escolhem as mesmas
 * lentes. Depois, os detectores que o framework entrega rodam sobre os arquivos que
 * dispararam a rota de cada um: o que um script decide, um script decide.
 */

const ROUTER = join(ENGINEERING, "quality", "hooks", "route-review.py");
const ROUTES_TABLE = join(ENGINEERING, "quality", "skills", "reviewing-diffs", "references", "routes.json");

/** Cada rota que liga um detector do framework, e o script que ela liga. */
const DETECTORS: Record<string, string> = {
  "python-structure": join(ENGINEERING, "fundamentals", "hooks", "check-structure.py"),
  "python-comments": join(ENGINEERING, "fundamentals", "hooks", "check-comments.py"),
  "backstage-language": join(ENGINEERING, "fundamentals", "hooks", "check-backstage-language.py"),
};

/** Uma rota que disparou: a lente que ela seleciona e os arquivos que a dispararam. */
export interface Route {
  id: string;
  skill: string;
  on: string[];
}

export interface Routing {
  /** false quando o router não rodou ou não resolveu a mudança (exit 2): nada foi selecionado por script. */
  ok: boolean;
  routes: Route[];
  /** As lentes selecionadas. */
  skills: string[];
  /** As lentes da tabela que nenhuma rota selecionou: não selecionada não é o mesmo que limpa. */
  notSelected: string[];
  /** Caminhos que só as rotas de base alcançaram. */
  unrouted: string[];
  error?: string;
}

/** Um candidato que um detector do framework levantou, ainda sujeito ao limite da própria regra. */
export interface Detection {
  detector: string;
  file: string;
  line?: number;
  rule: string;
  message: string;
}

export interface DetectorRun {
  detector: string;
  /** false quando o detector não decidiu (exit 2, sem python): as condições dele ficam unchecked. */
  ok: boolean;
  error?: string;
}

function python(args: string[], cwd: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync("python3", args, { cwd, encoding: "utf8", timeout: 120_000, env: process.env });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.error ? String(r.error) : (r.stderr ?? "") };
}

function tableSkills(): string[] {
  try {
    const table = JSON.parse(readFileSync(ROUTES_TABLE, "utf8")) as { routes?: { skill?: string }[] };
    return [...new Set((table.routes ?? []).map((r) => r.skill).filter((s): s is string => Boolean(s)))].sort();
  } catch {
    return [];
  }
}

/** Roda o router sobre `base...head`. Sem o script, sem python ou com exit 2, devolve ok=false e o motivo. */
export function route(repoPath: string, changed: string | undefined): Routing {
  const empty: Routing = { ok: false, routes: [], skills: [], notSelected: [], unrouted: [] };
  if (!changed) return { ...empty, error: "a mudança (base...head) não foi informada" };
  if (!existsSync(ROUTER)) return { ...empty, error: `o framework não traz o router (${ROUTER})` };
  const r = python([ROUTER, "--changed", changed, "--json"], repoPath);
  if (r.status !== 0) return { ...empty, error: (r.stderr || `o router saiu com ${r.status}`).trim().split("\n")[0] };
  try {
    const out = JSON.parse(r.stdout) as { routes?: Route[]; skills?: string[]; unrouted?: string[] };
    const skills = out.skills ?? [];
    return {
      ok: true,
      routes: (out.routes ?? []).map((x) => ({ id: x.id, skill: x.skill, on: x.on ?? [] })),
      skills,
      notSelected: tableSkills().filter((s) => !skills.includes(s)),
      unrouted: out.unrouted ?? [],
    };
  } catch {
    return { ...empty, error: "a saída do router não é JSON" };
  }
}

/**
 * Os detectores saem no formato `arquivo:linha` seguido de `    [regra] condição N: texto`.
 * Uma linha que não casa é ignorada: o que importa é o candidato, e o detector diz o resto.
 */
export function parseDetections(detector: string, output: string): Detection[] {
  const found: Detection[] = [];
  let file: string | undefined;
  let line: number | undefined;
  for (const raw of output.split("\n")) {
    const at = /^(\S.*?):(\d+)$/.exec(raw.trim() === raw ? raw : "");
    if (at) {
      file = at[1];
      line = Number(at[2]);
      continue;
    }
    const finding = /^\s+\[([^\]]+)\]\s*(.*)$/.exec(raw);
    if (finding && file) {
      found.push({ detector, file, line, rule: finding[1], message: finding[2].trim() });
    }
  }
  return found;
}

/** Roda, report-only, cada detector cuja rota disparou, sobre os arquivos que a dispararam. */
export function detect(repoPath: string, changed: string, routing: Routing): { runs: DetectorRun[]; detections: Detection[] } {
  const runs: DetectorRun[] = [];
  const detections: Detection[] = [];
  for (const r of routing.routes) {
    const script = DETECTORS[r.id];
    if (!script || r.on.length === 0) continue;
    const name = script.split("/").pop() as string;
    if (!existsSync(script)) {
      runs.push({ detector: name, ok: false, error: "o framework não traz o detector" });
      continue;
    }
    const out = python([script, "--changed", changed, ...r.on], repoPath);
    if (out.status === 2 || out.status === null) {
      runs.push({ detector: name, ok: false, error: (out.stderr || "não resolveu a mudança").trim().split("\n")[0] });
      continue;
    }
    runs.push({ detector: name, ok: true });
    detections.push(...parseDetections(name, out.stdout));
  }
  return { runs, detections };
}
