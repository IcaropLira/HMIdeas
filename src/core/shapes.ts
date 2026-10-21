// Geometria das formas. Pura. Elementos são imutáveis → o caminho é cacheado por referência.
import { LineStyle, ShapeElement, ShapeType, TextElement } from "./model";

export interface Pt { x: number; y: number }

const cache = new WeakMap<ShapeElement, Pt[]>();

function rectPath(el: ShapeElement): Pt[] {
  const { x, y, w, h } = el;
  if (!el.rounded) return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  const r = Math.min(Math.min(w, h) * 0.2, 32);
  if (r < 1) return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  const out: Pt[] = [];
  const corners = [
    { cx: x + r, cy: y + r, a: Math.PI },
    { cx: x + w - r, cy: y + r, a: Math.PI * 1.5 },
    { cx: x + w - r, cy: y + h - r, a: 0 },
    { cx: x + r, cy: y + h - r, a: Math.PI * 0.5 },
  ];
  for (const c of corners) {
    for (let i = 0; i <= 6; i++) {
      const a = c.a + (i / 6) * (Math.PI / 2);
      out.push({ x: c.cx + Math.cos(a) * r, y: c.cy + Math.sin(a) * r });
    }
  }
  return out;
}

/** Contorno fechado da forma, em coordenadas do mundo (já com rotação). */
export function shapePath(el: ShapeElement): Pt[] {
  const hit = cache.get(el);
  if (hit) return hit;

  const { x, y, w, h } = el;
  const cx = x + w / 2;
  const cy = y + h / 2;
  let pts: Pt[];

  if (el.type === "diamond") {
    pts = [{ x: cx, y }, { x: x + w, y: cy }, { x: cx, y: y + h }, { x, y: cy }];
  } else if (el.type === "ellipse") {
    const n = Math.max(32, Math.min(256, Math.round((w + h) / 4)));
    pts = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return { x: cx + (Math.cos(a) * w) / 2, y: cy + (Math.sin(a) * h) / 2 };
    });
  } else {
    pts = rectPath(el);
  }

  if (el.angle) {
    const cos = Math.cos(el.angle);
    const sin = Math.sin(el.angle);
    pts = pts.map((p) => ({
      x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
      y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
    }));
  }
  cache.set(el, pts);
  return pts;
}

export interface Box { x: number; y: number; w: number; h: number }

/** Caixa a partir de um arrasto. Shift = quadrado/círculo; Alt = a partir do centro (como no Excalidraw). */
export function boxFromDrag(a: Pt, b: Pt, shift: boolean, alt: boolean): Box {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (shift) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * m;
    dy = (dy < 0 ? -1 : 1) * m;
  }
  if (alt) return { x: a.x - Math.abs(dx), y: a.y - Math.abs(dy), w: Math.abs(dx) * 2, h: Math.abs(dy) * 2 };
  return { x: Math.min(a.x, a.x + dx), y: Math.min(a.y, a.y + dy), w: Math.abs(dx), h: Math.abs(dy) };
}

export interface ShapeStyle {
  stroke: string;
  strokeWidth: number;
  strokeStyle: LineStyle;
  fill: string | null;
  rounded: boolean;
}

export function makeShape(id: string, type: ShapeType, box: Box, st: ShapeStyle): ShapeElement {
  return { id, type, ...box, angle: 0, ...st, opacity: 1 };
}

/** Ponto dentro do polígono (regra par-ímpar). */
export function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const textCache = new WeakMap<TextElement, Pt[]>();

/** Retângulo girado do texto (4 cantos, mundo). */
export function textBox(el: TextElement): Pt[] {
  const hit = textCache.get(el);
  if (hit) return hit;
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
  const c = Math.cos(el.angle), s = Math.sin(el.angle);
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
    const lx = (u * el.w) / 2, ly = (v * el.h) / 2;
    return { x: cx + lx * c - ly * s, y: cy + lx * s + ly * c };
  });
  textCache.set(el, pts);
  return pts;
}

/** Contorno fechado de qualquer elemento "de caixa" (forma ou texto). */
export const outlinePath = (el: ShapeElement | TextElement): Pt[] => (el.type === "text" ? textBox(el) : shapePath(el));
