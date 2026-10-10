import type { ReviewStateT } from "./state";
import { routeReview } from "./router";
import { runArgos } from "./agent";
import { parseVerdict } from "./verdict";

/**
 * Ponto de entrada: roteia a mudança com o route-review.py do framework e
 * guarda as skills que ela seleciona. Sem range, pula o roteamento.
 */
export function intake(state: ReviewStateT): Partial<ReviewStateT> {
  if (!state.changed) {
    return { summary: `PR #${state.pr}: sem range (--changed), roteamento pulado`, skills: [] };
  }
  try {
    const { skills } = routeReview({ changed: state.changed, cwd: process.cwd() });
    return { summary: `PR #${state.pr}: ${skills.length} skill(s) roteada(s)`, skills };
  } catch (error) {
    const reason = (error instanceof Error ? error.message : String(error)).split("\n")[0];
    return {
      summary: `PR #${state.pr}: roteamento prévio falhou (${reason}); o Argos roteia internamente`,
      skills: [],
    };
  }
}

/**
 * Nó do Argos: invoca o agente real do framework e extrai o verdict do texto.
 * Em falha (credencial/agente), degrada para "comment" com o motivo.
 */
export async function argos(state: ReviewStateT): Promise<Partial<ReviewStateT>> {
  const skills = state.skills ?? [];
  try {
    const prompt = `Revise o PR #${state.pr} (mudança: ${state.changed ?? "não informada"}).`;
    const text = await runArgos({ cwd: process.cwd(), prompt });
    return { verdict: parseVerdict(text), summary: text || "(Argos não devolveu texto)" };
  } catch (error) {
    const reason = (error instanceof Error ? error.message : String(error)).split("\n")[0];
    return {
      verdict: "comment",
      summary: `Argos não rodou: ${reason}. Skills roteadas: ${skills.join(", ") || "nenhuma"}`,
    };
  }
}

/**
 * Nó do Erodos: aplicaria os findings mecânicos e devolveria ao Argos.
 * Ainda NÃO escreve — aplicar fixes exige permissão de escrita (hoje o agente
 * roda read-only) e o loop de re-review entra quando isso estiver liberado.
 */
export function erodos(state: ReviewStateT): Partial<ReviewStateT> {
  return {
    round: (state.round ?? 0) + 1,
    decision: "request_changes: Erodos aplicaria os fixes mecânicos (pendente: permissão de escrita + loop de re-review).",
  };
}

/**
 * Nó do Decisor: avalia o merge. Com land=off (default), apenas reporta;
 * o gate determinístico (checks/branch protection) e o probabilístico
 * (score de risco) entram quando houver PR real e modo de land ligado.
 */
export function decisor(state: ReviewStateT): Partial<ReviewStateT> {
  return {
    decision: `approve: Decisor avaliaria o merge (land=off, nada mergeado). PR #${state.pr}.`,
  };
}
