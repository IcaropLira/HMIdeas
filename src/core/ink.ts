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
  // Caneta real varia a pressão; mouse/dedo ficam sempre em 0.5.
  const simulate = !points.some((p) => p.p !== 0.5);
  const taper = (b.taper ?? st.taper) * st.width * 6;
  const outline = getStroke(
    points.map((p) => [p.x, p.y, p.p]),
    {
      size: st.width,
      thinning: (simulate ? b.simThinning : b.thinning) * st.sens,
      smoothing: b.smoothing,
      streamline: b.streamline,
      simulatePressure: simulate,
      start: { taper, cap: b.round },
      end: { taper, cap: b.round },
      last,
    },
  );
  const flat: number[] = [];
  for (const [x, y] of outline) flat.push(x, y);
  return flat;
}
