import type { ReviewStateT } from "../state";
import { countFindings } from "../findings";
import { countChecks } from "../checks";

/**
 * Nó do Erodos: destino de "rejeita + delega o fix". Aplicaria os achados
 * mecânicos (kind `como`) e devolveria ao Argos. Ainda NÃO escreve — aplicar
 * fixes exige permissão de escrita; hoje a delegação cai para o humano. Reporta
 * por que caiu aqui (o pré-gate decidiu).
 */
export function erodos(state: ReviewStateT): Partial<ReviewStateT> {
  const { blocking, warning } = countFindings(state.findings ?? []);
  const { red } = countChecks(state.checks ?? []);
  const reason =
    red.length > 0
      ? `checagem vermelha: ${red.join(", ")}`
      : blocking > 0
      ? `${blocking} bloqueante(s)`
      : state.verdict === "request_changes"
        ? "mudanças solicitadas"
        : `${warning} warnings (acima do corte)`;
  return {
    round: (state.round ?? 0) + 1,
    decision: `hold_for_human: delega o fix — ${reason}. Hoje cai pro humano (Erodos ainda não escreve).`,
  };
}
