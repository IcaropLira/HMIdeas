import { FrameElement, HirakuElement, StrokeElement, isLinear } from "./model";
import { linearPath } from "./linear";
import { outlinePath, pointInPolygon, shapePath } from "./shapes";

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

interface Box { minX: number; minY: number; maxX: number; maxY: number }
// Elementos são imutáveis → o bbox pode ser cacheado por referência.
const boxes = new WeakMap<StrokeElement, Box>();

function boxOf(el: StrokeElement): Box {
  let b = boxes.get(el);
  if (!b) {
    b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const p of el.points) {
      if (p.x < b.minX) b.minX = p.x;
      if (p.y < b.minY) b.minY = p.y;
      if (p.x > b.maxX) b.maxX = p.x;
      if (p.y > b.maxY) b.maxY = p.y;
    }
    boxes.set(el, b);
  }
  return b;
}

/** O círculo (x, y, r) em coordenadas do mundo toca o traço? */
export function strokeHit(el: StrokeElement, x: number, y: number, r: number): boolean {
  const reach = r + el.width; // folga: largura máxima ≈ 1.8 × base, metade ≈ 0.9
  const b = boxOf(el);
  if (x < b.minX - reach || x > b.maxX + reach || y < b.minY - reach || y > b.maxY + reach) return false;
  const pts = el.points;
  if (pts.length === 1) return Math.hypot(x - pts[0].x, y - pts[0].y) <= reach;
  for (let i = 1; i < pts.length; i++) {
    if (distToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= reach) return true;
  }
  return false;
}

/** O círculo (x, y, r) toca o elemento? Traço: pelo eixo. Forma: pelo contorno ou, se preenchida, pelo interior. */
export function elementHit(el: HirakuElement, x: number, y: number, r: number): boolean {
  if (el.type === "stroke") return strokeHit(el, x, y, r);
  if (el.type === "node") return !el.hidden && pointInPolygon(x, y, shapePath(el)) || (!el.hidden && nearPolygon(shapePath(el), x, y, r));
  if (el.type === "frame") return frameHit(el, x, y, r);

  if (isLinear(el)) {
    const lr = r + el.strokeWidth / 2;
    const path = linearPath(el);
    for (let i = 1; i < path.length; i++) {
      if (distToSegment(x, y, path[i - 1].x, path[i - 1].y, path[i].x, path[i].y) <= lr) return true;
    }
    return false;
  }

  if (el.type === "text") {
    const box = outlinePath(el);
    if (pointInPolygon(x, y, box)) return true;
    for (let i = 0; i < 4; i++) {
      const a = box[i], b = box[(i + 1) % 4];
      if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= r) return true;
    }
    return false;
  }

  const reach = r + el.strokeWidth / 2;
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  if (Math.hypot(x - cx, y - cy) > Math.hypot(el.w, el.h) / 2 + reach) return false;

  const pts = shapePath(el);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= reach) return true;
  }
  return el.fill !== null && pointInPolygon(x, y, pts);
}

function nearPolygon(poly: { x: number; y: number }[], x: number, y: number, r: number): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= r) return true;
  }
  return false;
}

/** Altura (mundo) da faixa do título acima do quadro. */
export const FRAME_TITLE_H = 22;

/** Quadro só é "tocado" pelo contorno ou pela faixa do título; o miolo deixa passar o clique para o que está dentro. */
function frameHit(el: FrameElement, x: number, y: number, r: number): boolean {
  const reach = r + 4;
  const inX = x >= el.x - reach && x <= el.x + el.w + reach;
  const inY = y >= el.y - reach && y <= el.y + el.h + reach;
  if (!inX || !inY) {
    // faixa do título (acima do canto superior esquerdo)
    const tw = Math.min(el.w, Math.max(60, el.title.length * 8 + 16));
    return x >= el.x && x <= el.x + tw && y >= el.y - FRAME_TITLE_H - reach && y <= el.y;
  }
  const nearEdge = x - el.x <= reach || el.x + el.w - x <= reach || y - el.y <= reach || el.y + el.h - y <= reach;
  if (nearEdge) return true;
  const tw = Math.min(el.w, Math.max(60, el.title.length * 8 + 16));
  return x >= el.x && x <= el.x + tw && y >= el.y - FRAME_TITLE_H && y <= el.y;
}
