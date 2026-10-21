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

  const brush = getBrush(st.brush);
  const effectiveTaper = brush.taper ?? st.taper;
  const constantPressure = points.every((p) => Math.abs(p.p - points[0].p) < 0.015);

  // Mouse/dedo não têm pressão real. Para a Caneta/Esferográfica, desenhar um caminho
  // central com joins/caps arredondados evita a triangulação de um polígono que se cruza
  // quando o usuário faz círculos rápidos. A pressão variável da stylus continua usando
  // o contorno do perfect-freehand abaixo.
  if ((brush.id === "pen" || brush.id === "ballpoint") && constantPressure && Math.abs(points[0].p - 0.5) < 0.015 && effectiveTaper <= 0) {
    if (points.length === 1) {
      g.circle(points[0].x, points[0].y, Math.max(0.05, st.width / 2)).fill({ color: st.color });
      return;
    }

    g.moveTo(points[0].x, points[0].y);
    if (points.length === 2) {
      g.lineTo(points[1].x, points[1].y);
    } else {
      for (let i = 1; i < points.length - 1; i++) {
        const midX = (points[i].x + points[i + 1].x) / 2;
        const midY = (points[i].y + points[i + 1].y) / 2;
        g.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
      }
      const end = points[points.length - 1];
      g.lineTo(end.x, end.y);
    }
    g.stroke({ width: Math.max(0.1, st.width), color: st.color, cap: "round", join: "round" });
    return;
  }

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
