// Geometria de linhas e setas. Pura; o caminho amostrado é cacheado por referência (elementos imutáveis).
import { LinearElement, LinearType, ArrowHead, LineStyle } from "./model";
import { Pt } from "./shapes";

const cache = new WeakMap<LinearElement, Pt[]>();

/** Caminho a desenhar/testar: os próprios pontos, ou uma spline Catmull-Rom amostrada se "curved". */
export function linearPath(el: LinearElement): Pt[] {
  const hit = cache.get(el);
  if (hit) return hit;
  const p = el.points;
  let out: Pt[];
  if (!el.curved || p.length < 3) {
    out = p;
  } else {
    out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] ?? p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] ?? p[i + 1];
      const n = Math.max(6, Math.min(40, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 8)));
      for (let k = 1; k <= n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        });
      }
    }
  }
  cache.set(el, out);
  return out;
}

export function pathLength(path: Pt[]): number {
  let L = 0;
  for (let i = 1; i < path.length; i++) L += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return L;
}

/** Ponto a `dist` de uma das pontas, andando pelo caminho (usado para orientar as pontas da seta). */
export function pointFromEnd(path: Pt[], dist: number, atStart: boolean): Pt {
  const seq = atStart ? path : [...path].reverse(); // seq[0] é a ponta
  let acc = 0;
  for (let i = 1; i < seq.length; i++) {
    const d = Math.hypot(seq[i].x - seq[i - 1].x, seq[i].y - seq[i - 1].y);
    if (d > 0 && acc + d >= dist) {
      const t = (dist - acc) / d;
      return { x: seq[i - 1].x + (seq[i].x - seq[i - 1].x) * t, y: seq[i - 1].y + (seq[i].y - seq[i - 1].y) * t };
    }
    acc += d;
  }
  return seq[seq.length - 1];
}

/** Trava o ângulo (de `from` até `to`) em múltiplos de 15°. */
export function snapAngle(from: Pt, to: Pt, step = Math.PI / 12): Pt {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return to;
  const a = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len };
}

export interface LinearStyle {
  stroke: string;
  strokeWidth: number;
  strokeStyle: LineStyle;
  startHead: ArrowHead;
  endHead: ArrowHead;
  curved: boolean;
}

export function makeLinear(id: string, type: LinearType, a: Pt, b: Pt, st: LinearStyle): LinearElement {
  return {
    id,
    type,
    points: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }],
    stroke: st.stroke,
    strokeWidth: st.strokeWidth,
    strokeStyle: st.strokeStyle,
    startHead: type === "line" ? "none" : st.startHead,
    endHead: type === "line" ? "none" : st.endHead,
    curved: st.curved,
    opacity: 1,
  };
}
