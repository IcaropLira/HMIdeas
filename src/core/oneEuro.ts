// Filtro "One Euro" (Casiez et al.): suaviza o tremido quando a mão está devagar e quase não atrasa quando
// está rápida. Substitui a média móvel exponencial fixa, que fazia a ponta "ser puxada por uma linha" atrás
// do cursor. Puro e testável em Node.

const alpha = (cutoffHz: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dt);
};

class LowPass {
  private y = 0;
  private init = false;
  filter(x: number, a: number) {
    this.y = this.init ? a * x + (1 - a) * this.y : x;
    this.init = true;
    return this.y;
  }
  get last() {
    return this.y;
  }
}

export interface OneEuroOptions {
  /** Frequência de corte mínima (Hz): menor = mais liso/lento quando devagar. */
  minCutoff: number;
  /** Quanto a velocidade abre o filtro: maior = menos atraso em traços rápidos. */
  beta: number;
  dCutoff?: number;
}

export class OneEuro {
  private x = new LowPass();
  private dx = new LowPass();
  private prevT = 0;
  private prevRaw = 0;
  private started = false;
  constructor(private o: OneEuroOptions) {}

  reset() {
    this.x = new LowPass();
    this.dx = new LowPass();
    this.started = false;
  }

  /** `tMs` em milissegundos (timeStamp do evento). */
  filter(value: number, tMs: number): number {
    if (!this.started) {
      this.started = true;
      this.prevT = tMs;
      this.prevRaw = value;
      this.x.filter(value, 1);
      this.dx.filter(0, 1);
      return value;
    }
    const dt = Math.max(1e-3, (tMs - this.prevT) / 1000);
    this.prevT = tMs;
    const rate = (value - this.prevRaw) / dt;
    this.prevRaw = value;
    const edx = this.dx.filter(rate, alpha(this.o.dCutoff ?? 1, dt));
    const cutoff = this.o.minCutoff + this.o.beta * Math.abs(edx);
    return this.x.filter(value, alpha(cutoff, dt));
  }
}

/**
 * Parâmetros a partir de um "nível de estabilização" 0..1 (0 = cola no cursor). Os valores foram escolhidos
 * para que mesmo no máximo a ponta alcance o cursor em traços rápidos (beta alto) e só segure o tremido lento.
 */
export function stabilizerOptions(level: number): OneEuroOptions | null {
  const a = Math.max(0, Math.min(1, level));
  if (a < 0.02) return null;
  return { minCutoff: 28 - 25.5 * a, beta: 0.045 + 0.03 * a, dCutoff: 1.5 };
}
