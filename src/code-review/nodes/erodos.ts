import type { ReviewStateT } from "../state";

/**
 * Nó do Erodos: aplicaria os findings mecânicos e devolveria ao Argos.
 * Ainda NÃO escreve — aplicar fixes exige permissão de escrita e o loop de
 * re-review entra quando isso estiver liberado.
 */
export function erodos(state: ReviewStateT): Partial<ReviewStateT> {
  return {
    round: (state.round ?? 0) + 1,
    decision: "request_changes: Erodos aplicaria os fixes mecânicos (pendente: permissão de escrita + loop de re-review).",
  };
}
