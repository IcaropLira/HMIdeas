// Contorno da tinta. Puro: só perfect-freehand, sem Pixi nem React (testável em Node).
// O MESMO cálculo serve ao traço ao vivo, ao gravado, à miniatura e à pré-visualização do brush.
// O comportamento de cada brush vem de core/brushes.ts; aqui só se aplica.
import { getStroke } from "perfect-freehand";
import { getBrush } from "./brushes";
import { InkPoint } from "./model";

export interface InkStyle {
  color: string;
  /** Largura JÁ multiplicada pelo `size` do brush (é o que fica guardado em StrokeElement.width). */
  width: number;
  sens: number;
  taper: number;
  brush: string;
  /** Opacidade final (brush × controle do usuário). */
  opacity: number;
}

/** Contorno do traço como lista plana [x0, y0, x1, y1, ...]. */
export function strokeOutline(points: InkPoint[], st: InkStyle, last: boolean): number[] {
  const b = getBrush(st.brush);
  // Protege o renderizador contra amostras inválidas vindas de tablets/drivers instáveis.
  // Também elimina pontos repetidos: eles podem produzir contornos degenerados em gestos curtos.
  const clean: InkPoint[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.p)) continue;
    const next = { x: p.x, y: p.y, p: Math.max(0, Math.min(1, p.p)) };
    const prev = clean[clean.length - 1];
    if (!prev || Math.hypot(next.x - prev.x, next.y - prev.y) > 0.001) clean.push(next);
  }
  if (!clean.length) return [];

  // Caneta real varia a pressão; mouse/dedo ficam sempre em 0.5.
  const simulate = !clean.some((p) => p.p !== 0.5);
  const taper = Math.max(0, b.taper ?? st.taper) * st.width * 6;
  const outline = getStroke(
    clean.map((p) => [p.x, p.y, p.p]),
    {
      size: Math.max(0.1, st.width),
      thinning: (simulate ? b.simThinning : b.thinning) * Math.max(0, st.sens),
      smoothing: b.smoothing,
      streamline: b.streamline,
      simulatePressure: simulate,
      start: { taper, cap: b.round },
      end: { taper, cap: b.round },
      last,
    },
  );
  const flat: number[] = [];
  for (const [x, y] of outline) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    flat.push(x, y);
  }
  // Pixi não deve receber um polígono com menos de três vértices.
  return flat.length >= 6 ? flat : [];
}
