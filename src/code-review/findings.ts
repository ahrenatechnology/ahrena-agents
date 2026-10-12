/** Severidade de um achado: bloqueante impede o merge; warning não. */
export type Severity = "blocking" | "warning";

/** Natureza do conserto: `como` preserva comportamento (Erodos); `oque` mudou a intenção (humano). */
export type Kind = "como" | "oque";

/** Um achado estruturado do Argos — o alicerce do pré-gate e dos follow-ups. */
export interface Finding {
  severity: Severity;
  title: string;
  file?: string;
  line?: number;
  kind?: Kind;
  rule?: string;
}

/** Contagem por severidade — o que o pré-gate usa para rotear. */
export function countFindings(findings: Finding[]): { blocking: number; warning: number } {
  let blocking = 0;
  let warning = 0;
  for (const f of findings) {
    if (f.severity === "blocking") blocking += 1;
    else warning += 1;
  }
  return { blocking, warning };
}

/**
 * Extrai a lista de achados do bloco ```findings … ``` que o Argos emite no fim
 * da review. Robusto de propósito: sem bloco, JSON inválido ou formato
 * inesperado → `[]` (o pré-gate cai no roteamento só por verdict). Severidade
 * desconhecida vira `warning` (conservador: conta, mas não bloqueia).
 */
export function parseFindings(text: string): Finding[] {
  const fence = /```[ \t]*findings[ \t]*\r?\n([\s\S]*?)```/gi;
  let raw: string | undefined;
  for (const match of text.matchAll(fence)) raw = match[1]; // último bloco vence
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: Finding[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title : "";
    if (!title) continue;
    const severity: Severity = o.severity === "blocking" ? "blocking" : "warning";
    const finding: Finding = { severity, title };
    if (typeof o.file === "string") finding.file = o.file;
    if (typeof o.line === "number" && Number.isFinite(o.line)) finding.line = o.line;
    if (o.kind === "como" || o.kind === "oque") finding.kind = o.kind;
    if (typeof o.rule === "string") finding.rule = o.rule;
    out.push(finding);
  }
  return out;
}
