import type { Verdict } from "./state";

const EXPLICIT = /(?:verdict|veredito)[:\s*`]*\s*(approve|request[_ ]changes|comment)/i;

/**
 * Extrai o verdict do texto que o Argos produziu. Prefere o marcador explícito
 * ("Verdict: X" / "Veredito: X"); na ausência, cai em "comment" (o mais
 * conservador — não aprova nem pede mudança sem sinal claro).
 */
export function parseVerdict(text: string): Verdict {
  const match = text.match(EXPLICIT);
  if (!match) return "comment";
  const found = match[1].toLowerCase().replace(" ", "_");
  if (found === "approve") return "approve";
  if (found === "request_changes") return "request_changes";
  return "comment";
}
