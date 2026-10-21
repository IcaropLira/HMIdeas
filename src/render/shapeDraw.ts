import { Graphics } from "pixi.js";
import { linearPath, pathLength, pointFromEnd } from "../core/linear";
import { ArrowHead, LineStyle, LinearElement, ShapeElement } from "../core/model";
import { Pt, shapePath } from "../core/shapes";

const flat = (pts: Pt[]) => pts.flatMap((p) => [p.x, p.y]);

/** Contorno tracejado/pontilhado: o padrão corre contínuo pelo perímetro, inclusive nos cantos. */
function dashPath(g: Graphics, pts: Pt[], pattern: [number, number], closed = true) {
  const path = closed ? [...pts, pts[0]] : pts;
  let on = true;
  let remain = pattern[0];
  g.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) {
    let ax = path[i - 1].x;
    let ay = path[i - 1].y;
    const bx = path[i].x;
    const by = path[i].y;
    let segLen = Math.hypot(bx - ax, by - ay);
    while (segLen > 1e-6) {
      const take = Math.min(remain, segLen);
      const t = take / segLen;
      const nx = ax + (bx - ax) * t;
      const ny = ay + (by - ay) * t;
      if (on) g.lineTo(nx, ny);
      else g.moveTo(nx, ny);
      ax = nx;
      ay = ny;
      segLen -= take;
      remain -= take;
      if (remain <= 1e-9) {
        on = !on;
        remain = pattern[on ? 0 : 1];
      }
    }
  }
}

function strokeOutline(g: Graphics, pts: Pt[], width: number, color: string, style: LineStyle) {
  if (style === "solid") {
    g.poly(flat(pts), true);
  } else if (style === "dashed") {
    dashPath(g, pts, [width * 4 + 6, width * 2 + 5]);
  } else {
    dashPath(g, pts, [0.01, width * 2 + 4]);
  }
  g.stroke({ width, color, cap: "round", join: "round" });
}

export function drawShapeElement(g: Graphics, el: ShapeElement) {
  if (el.w < 0.5 && el.h < 0.5) return;
  const pts = shapePath(el);
  if (el.fill) g.poly(flat(pts), true).fill({ color: el.fill });
  strokeOutline(g, pts, el.strokeWidth, el.stroke, el.strokeStyle);
  g.alpha = el.opacity;
}

const dashPattern = (style: LineStyle, w: number): [number, number] =>
  style === "dashed" ? [w * 4 + 6, w * 2 + 5] : [0.01, w * 2 + 4];

function drawHead(g: Graphics, tip: Pt, back: Pt, kind: ArrowHead, size: number, width: number, color: string) {
  if (kind === "none") return;
  const dx = tip.x - back.x, dy = tip.y - back.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const ax = tip.x - ux * size + nx * size * 0.45, ay = tip.y - uy * size + ny * size * 0.45;
  const bx = tip.x - ux * size - nx * size * 0.45, by = tip.y - uy * size - ny * size * 0.45;
  const st = { width, color, cap: "round", join: "round" } as const;

  if (kind === "arrow") {
    g.moveTo(ax, ay).lineTo(tip.x, tip.y).lineTo(bx, by).stroke(st);
  } else if (kind === "triangle") {
    g.poly([tip.x, tip.y, ax, ay, bx, by], true).fill({ color }).stroke(st);
  } else if (kind === "dot") {
    g.circle(tip.x - ux * size * 0.3, tip.y - uy * size * 0.3, size * 0.3).fill({ color });
  } else {
    g.moveTo(tip.x + nx * size * 0.5, tip.y + ny * size * 0.5).lineTo(tip.x - nx * size * 0.5, tip.y - ny * size * 0.5).stroke(st);
  }
}

export function drawLinearElement(g: Graphics, el: LinearElement) {
  const pts = linearPath(el);
  if (pts.length < 2) return;
  const w = el.strokeWidth;

  if (el.strokeStyle === "solid") {
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  } else {
    dashPath(g, pts, dashPattern(el.strokeStyle, w), false);
  }
  g.stroke({ width: w, color: el.stroke, cap: "round", join: "round" });

  // Pontas: tamanho cresce com a espessura e nunca passa de metade do comprimento.
  const size = Math.min(12 + w * 3.5, pathLength(pts) * 0.5);
  drawHead(g, pts[pts.length - 1], pointFromEnd(pts, size, false), el.endHead, size, w, el.stroke);
  drawHead(g, pts[0], pointFromEnd(pts, size, true), el.startHead, size, w, el.stroke);
  g.alpha = el.opacity;
}
