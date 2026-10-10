import type { Verdict } from "./state";

const LINE = /^\s*\**\s*(?:verdict|veredito)\s*\**\s*[:\-]\s*`?\**\s*(approve|request[ _]changes|comment)/gim;

/**
 * Extrai o verdict do texto do Argos pelo marcador de LINHA ("Verdict: X" /
 * "Veredito: X"), ancorado no início da linha e pegando o ÚLTIMO match — a
 * linha de decisão final vence menções em prosa. Sem marcador, cai no
 * conservador "comment".
 */
export function parseVerdict(text: string): Verdict {
  let verdict: Verdict = "comment";
  for (const match of text.matchAll(LINE)) {
    const found = match[1].toLowerCase().replace(" ", "_");
    verdict =
      found === "approve" ? "approve" : found === "request_changes" ? "request_changes" : "comment";
  }
  return verdict;
}
