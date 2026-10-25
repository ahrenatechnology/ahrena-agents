import { readFileSync } from "node:fs";

/**
 * O resultado de uma checagem determinística do pipeline (um job de CI, um lint,
 * um teste): o que já foi DECIDIDO por script antes de o Argos ler o PR. O Argos
 * não decide de novo o que um script decidiu; ele lê o PR sabendo disso.
 */
export interface Check {
  name: string;
  /** success, failure, cancelled, skipped, timed_out, neutral, action_required… */
  conclusion: string;
  url?: string;
  /** Um resumo curto do que a checagem disse, quando o pipeline o tem. */
  summary?: string;
}

/** Conclusões que são uma checagem vermelha: o PR não entra com nenhuma delas. */
const RED = new Set(["failure", "timed_out", "action_required", "cancelled", "startup_failure"]);

export function isRed(check: Check): boolean {
  return RED.has(check.conclusion.toLowerCase());
}

/** Quantas checagens passaram e quais ficaram vermelhas — o que o pré-gate e o Decisor leem. */
export function countChecks(checks: Check[]): { passed: number; red: string[]; total: number } {
  const red = checks.filter(isRed).map((c) => c.name);
  const passed = checks.filter((c) => c.conclusion.toLowerCase() === "success").length;
  return { passed, red, total: checks.length };
}

/**
 * Lê as checagens de um arquivo JSON: um array de `{name, conclusion, url?, summary?}`,
 * ou o objeto `needs` de um workflow do GitHub Actions (`toJSON(needs)`), em que cada
 * chave é um job e `result` é a conclusão. Robusto de propósito: sem arquivo, arquivo
 * vazio ou formato inesperado, devolve [] e o Argos revisa como antes — a feature é
 * aditiva e falha segura.
 */
export function loadChecks(path: string | undefined): Check[] {
  if (!path) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
  const asCheck = (name: string, value: unknown): Check | null => {
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    const conclusion = String(v.conclusion ?? v.result ?? "").trim();
    if (!conclusion) return null;
    return {
      name: String(v.name ?? name).trim() || name,
      conclusion,
      url: typeof v.url === "string" ? v.url : undefined,
      summary: typeof v.summary === "string" ? v.summary.slice(0, 500) : undefined,
    };
  };
  if (Array.isArray(raw)) {
    return raw.map((v, i) => asCheck(`check ${i + 1}`, v)).filter((c): c is Check => c !== null);
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .map(([name, v]) => asCheck(name, v))
      .filter((c): c is Check => c !== null);
  }
  return [];
}

/** As checagens como texto, para o prompt do Argos: as vermelhas primeiro, com o resumo de cada uma. */
export function renderChecksForPrompt(checks: Check[]): string {
  const sorted = [...checks].sort((a, b) => Number(isRed(b)) - Number(isRed(a)) || a.name.localeCompare(b.name));
  return sorted
    .map((c) => {
      const mark = isRed(c) ? "VERMELHA" : c.conclusion;
      const tail = c.summary ? ` — ${c.summary.replace(/\s+/g, " ")}` : "";
      return `- ${c.name}: ${mark}${tail}`;
    })
    .join("\n");
}

/** O que o GitHub devolve de um check run e de um status (só os campos lidos aqui). */
interface CheckRunApi {
  name: string;
  status: string;
  conclusion: string | null;
  html_url?: string;
  details_url?: string;
  output?: { title?: string | null; summary?: string | null };
}
interface StatusApi {
  context: string;
  state: string;
  target_url?: string | null;
  description?: string | null;
}

async function githubGet<T>(api: string, path: string, token: string): Promise<T> {
  const res = await fetch(`${api}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`GitHub respondeu ${res.status} em ${path}`);
  return (await res.json()) as T;
}

/**
 * Lê do GitHub as checagens do commit do PR: os check runs (GitHub Actions e qualquer
 * app de CI) e os commit statuses (CIs que reportam por status). Não sabe o nome de
 * nenhum job: é o que o pipeline do repositório publicou, qualquer que seja.
 *
 * As checagens da própria execução do Argos ficam de fora, reconhecidas pela URL do
 * run (`selfRunId`), e as que casam com `exclude`, quando dado.
 *
 * Com `waitSeconds` > 0, espera até que todas terminem (ou o prazo vença): o Argos lê
 * o PR depois das determinísticas. Uma que não terminou no prazo entra como "pending",
 * que não é vermelha, e o parecer diz que ela não estava pronta.
 */
export async function fetchGithubChecks(opts: {
  repository: string;
  sha: string;
  token: string;
  api?: string;
  selfRunId?: string;
  exclude?: RegExp;
  waitSeconds?: number;
  pollSeconds?: number;
}): Promise<Check[]> {
  const api = (opts.api ?? "https://api.github.com").replace(/\/$/, "");
  const deadline = Date.now() + Math.max(0, opts.waitSeconds ?? 0) * 1000;
  const poll = Math.max(5, opts.pollSeconds ?? 20) * 1000;
  const self = opts.selfRunId ? `/actions/runs/${opts.selfRunId}/` : null;
  const mine = (url?: string | null) => Boolean(self && url && url.includes(self));
  const skip = (name: string) => Boolean(opts.exclude && opts.exclude.test(name));

  for (;;) {
    const runs: CheckRunApi[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const body = await githubGet<{ check_runs: CheckRunApi[] }>(
        api,
        `/repos/${opts.repository}/commits/${opts.sha}/check-runs?per_page=100&page=${page}`,
        opts.token,
      );
      runs.push(...body.check_runs);
      if (body.check_runs.length < 100) break;
    }
    const combined = await githubGet<{ statuses: StatusApi[] }>(
      api,
      `/repos/${opts.repository}/commits/${opts.sha}/status`,
      opts.token,
    );

    const others = runs.filter((r) => !mine(r.details_url) && !mine(r.html_url) && !skip(r.name));
    const statuses = combined.statuses.filter((s) => !mine(s.target_url) && !skip(s.context));
    const pending = others.some((r) => r.status !== "completed") || statuses.some((s) => s.state === "pending");

    if (!pending || Date.now() >= deadline) {
      const fromRuns: Check[] = others.map((r) => ({
        name: r.name,
        conclusion: r.status === "completed" ? (r.conclusion ?? "neutral") : "pending",
        url: r.html_url ?? r.details_url,
        summary: (r.output?.title || r.output?.summary || "").slice(0, 300) || undefined,
      }));
      const fromStatuses: Check[] = statuses.map((s) => ({
        name: s.context,
        conclusion: s.state === "error" ? "failure" : s.state,
        url: s.target_url ?? undefined,
        summary: s.description ?? undefined,
      }));
      return [...fromRuns, ...fromStatuses];
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(poll, Math.max(0, deadline - Date.now()))));
  }
}
