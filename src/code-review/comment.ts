import type { ReviewStateT } from "./state";
import { countFindings, type Finding } from "./findings";

/** Escapa o que quebraria uma célula de tabela Markdown (pipe e quebra de linha). */
function cell(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function where(f: Finding): string {
  if (!f.file) return "—";
  return `\`${f.file}${f.line ? `:${f.line}` : ""}\``;
}

function kindLabel(f: Finding): string {
  if (f.kind === "como") return "como";
  if (f.kind === "oque") return "o quê";
  return "—";
}

/**
 * Monta o comentário do PR a partir do estado: cabeçalho com verdict + decisão,
 * uma tabela dos achados estruturados (severidade · achado · onde · tipo ·
 * regra) e o parecer completo num bloco recolhível. A apresentação mora aqui;
 * os nós só computam. Marcador `<!-- ahrena-review -->` no topo para o workflow
 * identificar/atualizar o comentário.
 */
export function renderComment(state: Partial<ReviewStateT>): string {
  const findings = state.findings ?? [];
  const { blocking, warning } = countFindings(findings);

  const out: string[] = [];
  out.push("<!-- ahrena-review -->");
  out.push("## Ahrena · Code Review");
  out.push("");
  out.push(`**Verdict:** \`${state.verdict ?? "?"}\`  ·  **Decisor:** \`${state.decision ?? "—"}\``);
  out.push("");
  out.push(`🔴 **${blocking}** bloqueante${blocking === 1 ? "" : "s"} · 🟡 **${warning}** warning${warning === 1 ? "" : "s"}`);

  if (findings.length) {
    out.push("");
    out.push("| | Achado | Onde | Tipo | Regra |");
    out.push("|:--:|---|---|:--:|---|");
    for (const f of findings) {
      const sev = f.severity === "blocking" ? "🔴" : "🟡";
      const rule = f.rule ? `\`${cell(f.rule)}\`` : "—";
      out.push(`| ${sev} | ${cell(f.title)} | ${where(f)} | ${kindLabel(f)} | ${rule} |`);
    }
  }

  const summary = (state.summary ?? "").trim();
  if (summary) {
    out.push("");
    out.push("<details><summary>Parecer completo</summary>");
    out.push("");
    out.push(summary);
    out.push("");
    out.push("</details>");
  }

  return out.join("\n");
}
