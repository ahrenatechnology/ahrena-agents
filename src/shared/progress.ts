const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface Progress {
  /** Troca o rótulo mostrado ao lado do spinner. */
  update(label: string): void;
  /** Para a animação e limpa a linha. */
  done(): void;
}

/**
 * Indicador de progresso em uma linha, atualizada no lugar (sem rolar o
 * terminal). Fora de um TTY (CI/log), imprime uma linha única e não anima.
 */
export function spinner(initial: string): Progress {
  const start = Date.now();

  if (!process.stderr.isTTY) {
    process.stderr.write(`${initial}\n`);
    return { update: () => {}, done: () => {} };
  }

  let label = initial;
  let frame = 0;
  const render = () => {
    const secs = Math.round((Date.now() - start) / 1000);
    frame = (frame + 1) % FRAMES.length;
    process.stderr.write(`\r\x1b[K${FRAMES[frame]} ${label} · ${secs}s`);
  };
  const timer = setInterval(render, 80);
  render();

  return {
    update: (next) => {
      label = next;
    },
    done: () => {
      clearInterval(timer);
      process.stderr.write("\r\x1b[K");
    },
  };
}
