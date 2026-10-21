// Traço de tinta com perfect-freehand: contorno variável, afilamento nas pontas e
// simulação de pressão por velocidade quando o dispositivo não envia pressão (mouse/dedo).
// O MESMO código desenha o traço ao vivo e o gravado → nada "salta" ao soltar a caneta.
import { getStroke } from "perfect-freehand";
import { Graphics } from "pixi.js";
import { InkPoint, StrokeElement } from "../core/model";

export interface InkStyle {
  color: string;
  width: number;
  sens: number;
  taper: number;
}

/** Contorno do traço como lista plana [x0, y0, x1, y1, ...]. */
export function strokeOutline(points: InkPoint[], st: InkStyle, last: boolean): number[] {
  // Caneta real varia a pressão; mouse/dedo ficam sempre em 0.5.
  const simulate = !points.some((p) => p.p !== 0.5);
  const taper = st.taper * st.width * 6;
  const outline = getStroke(
    points.map((p) => [p.x, p.y, p.p]),
    {
      size: st.width,
      thinning: (simulate ? 0.5 : 0.8) * st.sens,
      smoothing: 0.5,
      streamline: 0.15,
      simulatePressure: simulate,
      start: { taper, cap: true },
      end: { taper, cap: true },
      last,
    },
  );
  const flat: number[] = [];
  for (const [x, y] of outline) flat.push(x, y);
  return flat;
}

/** Desenha (ou redesenha) um traço em `g`. `last = false` enquanto a caneta ainda está no papel. */
export function drawInk(g: Graphics, points: InkPoint[], st: InkStyle, last: boolean) {
  if (!points.length) return;
  const flat = strokeOutline(points, st, last);
  if (flat.length >= 6) g.poly(flat).fill({ color: st.color });
}

export function drawStrokeElement(g: Graphics, el: StrokeElement) {
  drawInk(g, el.points, { color: el.color, width: el.width, sens: el.sens, taper: el.taper }, true);
  g.alpha = el.opacity;
}
