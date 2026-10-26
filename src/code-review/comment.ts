import type { ReviewStateT } from "./state";
import { countFindings, type Finding } from "./findings";
import { countChecks, isRed } from "./checks";

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

  // As checagens determinísticas que o Argos leu antes de revisar.
  const checks = state.checks ?? [];
  if (checks.length) {
    const { passed, red, total } = countChecks(checks);
    const pending = checks.filter((c) => c.conclusion === "pending").length;
    out.push("");
    out.push(
      `**Checagens determinísticas:** ${passed} de ${total} verdes` +
        (red.length ? ` · 🔴 ${red.length} vermelha${red.length === 1 ? "" : "s"}` : "") +
        (pending ? ` · ⏳ ${pending} sem terminar no prazo` : ""),
    );
    for (const c of checks.filter((c) => isRed(c) || c.conclusion === "pending")) {
      const name = c.url ? `[${cell(c.name)}](${c.url})` : cell(c.name);
      out.push(`- ${isRed(c) ? "🔴" : "⏳"} ${name}${c.summary ? ` — ${cell(c.summary)}` : ""}`);
    }
  } else {
    out.push("");
    out.push("**Checagens determinísticas:** nenhuma lida; o parecer não considera o resultado do CI.");
  }

  // O que a review cobriu: as lentes que o router escolheu por script, as que ficaram
  // de fora, os detectores e se algo pôde ser executado. Não selecionada não é limpa.
  const routing = state.routing;
  if (routing) {
    out.push("");
    if (routing.ok) {
      out.push(`**Lentes (router do framework):** ${routing.skills.length} rodaram · ${routing.notSelected.length} não selecionadas`);
      const runs = state.detectorRuns ?? [];
      if (runs.length) {
        const undecided = runs.filter((r) => !r.ok).map((r) => r.detector);
        out.push(
          `**Detectores:** ${runs.map((r) => `\`${r.detector}\``).join(", ")} · ${(state.detections ?? []).length} candidato(s)` +
            (undecided.length ? ` · ⚪ não decidiram: ${undecided.join(", ")}` : ""),
        );
      }
    } else {
      out.push(`**Lentes:** o router do framework não rodou (${cell(routing.error ?? "motivo desconhecido")}); o Argos roteou lendo.`);
    }
  }
  const execution = state.execution;
  if (execution) {
    out.push(
      execution.permitted
        ? `**Execução:** permitida, só com ${execution.commands.map((c) => `\`${c}\``).join(", ")}`
        : `**Execução:** não permitida (${cell(execution.reason ?? "sem motivo")}); o que precisava rodar ficou unchecked`,
    );
  }
  if (state.fixCommit) out.push(`**Erodos:** rodada ${state.round ?? "?"} · \`${state.fixCommit.slice(0, 7)}\` empurrado; a próxima revisão é a desse commit`);

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
