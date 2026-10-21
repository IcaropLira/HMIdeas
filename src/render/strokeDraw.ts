// Desenho do traço de tinta no Pixi. O contorno vem de core/ink.ts (puro); aqui só se pinta.
// O MESMO código desenha o traço ao vivo e o gravado → nada "salta" ao soltar a caneta.
import { Graphics } from "pixi.js";
import { Brush, getBrush } from "../core/brushes";
import { InkStyle, strokeOutline } from "../core/ink";
import { InkPoint, StrokeElement } from "../core/model";

export type { InkStyle };
export { strokeOutline };

/** Desenha (ou redesenha) um traço em `g`. `last = false` enquanto a caneta ainda está no papel. */
export function drawInk(g: Graphics, points: InkPoint[], st: InkStyle, last: boolean) {
  if (!points.length) return;
  const flat = strokeOutline(points, st, last);
  if (flat.length >= 6) g.poly(flat).fill({ color: st.color });
}

/** Opacidade e modo de mistura do brush num nó (traço gravado ou camada ao vivo). */
export function applyBrushLook(g: Graphics, brush: Brush, opacity: number) {
  g.alpha = opacity;
  g.blendMode = brush.blend;
}

export function drawStrokeElement(g: Graphics, el: StrokeElement) {
  const brush = getBrush(el.brush);
  drawInk(g, el.points, { color: el.color, width: el.width, sens: el.sens, taper: el.taper, brush: brush.id, opacity: el.opacity }, true);
  applyBrushLook(g, brush, el.opacity);
}
