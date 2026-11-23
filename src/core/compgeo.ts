// Geometria computacional: fecho convexo, triangulação de Delaunay, par mais próximo, menor círculo envolvente,
// área de polígono e ponto-em-polígono. Puro.
export interface Pt2 { x: number; y: number }

const crossO = (o: Pt2, a: Pt2, b: Pt2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Fecho convexo (cadeia monótona de Andrew), no sentido anti-horário, sem pontos colineares. */
export function convexHull(pts: Pt2[]): Pt2[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const lower: Pt2[] = [];
  for (const q of p) { while (lower.length >= 2 && crossO(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper: Pt2[] = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && crossO(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Área (fórmula do cadarço; positiva se anti-horário). */
export const polygonArea = (poly: Pt2[]) => poly.reduce((s, a, i) => { const b = poly[(i + 1) % poly.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
export const perimeter = (poly: Pt2[]) => poly.reduce((s, a, i) => { const b = poly[(i + 1) % poly.length]; return s + Math.hypot(b.x - a.x, b.y - a.y); }, 0);

/** Triângulos de Delaunay (Bowyer–Watson), como trios de índices nos pontos de entrada. */
export function delaunay(pts: Pt2[]): [number, number, number][] {
  const n = pts.length;
  if (n < 3) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const d = Math.max(maxX - minX, maxY - minY, 1) * 20;
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const P = [...pts, { x: mx - d, y: my - d }, { x: mx + d, y: my - d }, { x: mx, y: my + d }];
  let tris: [number, number, number][] = [[n, n + 1, n + 2]];
  const circum = (t: [number, number, number]) => {
    const [a, b, c] = t.map((i) => P[i]);
    const D = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(D) < 1e-12) return { x: 0, y: 0, r2: Infinity };
    const ux = ((a.x ** 2 + a.y ** 2) * (b.y - c.y) + (b.x ** 2 + b.y ** 2) * (c.y - a.y) + (c.x ** 2 + c.y ** 2) * (a.y - b.y)) / D;
    const uy = ((a.x ** 2 + a.y ** 2) * (c.x - b.x) + (b.x ** 2 + b.y ** 2) * (a.x - c.x) + (c.x ** 2 + c.y ** 2) * (b.x - a.x)) / D;
    return { x: ux, y: uy, r2: (a.x - ux) ** 2 + (a.y - uy) ** 2 };
  };
  for (let i = 0; i < n; i++) {
    const p = P[i];
    const bad = tris.filter((t) => { const c = circum(t); return (p.x - c.x) ** 2 + (p.y - c.y) ** 2 < c.r2 - 1e-9; });
    const edges: [number, number][] = [];
    for (const t of bad) for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]] as [number, number][]) {
      const k = edges.findIndex((e) => (e[0] === b && e[1] === a) || (e[0] === a && e[1] === b));
      if (k >= 0) edges.splice(k, 1); else edges.push([a, b]);
    }
    tris = tris.filter((t) => !bad.includes(t));
    for (const [a, b] of edges) tris.push([a, b, i]);
  }
  return tris.filter((t) => t.every((i) => i < n));
}

/** Par de pontos mais próximos (força bruta: até algumas centenas de pontos é instantâneo). */
export function closestPair(pts: Pt2[]): { i: number; j: number; d: number } | null {
  let best: { i: number; j: number; d: number } | null = null;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
    if (!best || d < best.d) best = { i, j, d };
  }
  return best;
}

/** Menor círculo que contém todos os pontos (Welzl iterativo). */
export function minEnclosingCircle(pts: Pt2[]): { x: number; y: number; r: number } | null {
  if (!pts.length) return null;
  const inC = (c: { x: number; y: number; r: number }, p: Pt2) => Math.hypot(p.x - c.x, p.y - c.y) <= c.r + 1e-9;
  const two = (a: Pt2, b: Pt2) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: Math.hypot(a.x - b.x, a.y - b.y) / 2 });
  const three = (a: Pt2, b: Pt2, c: Pt2) => {
    const D = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(D) < 1e-12) return null;
    const x = ((a.x ** 2 + a.y ** 2) * (b.y - c.y) + (b.x ** 2 + b.y ** 2) * (c.y - a.y) + (c.x ** 2 + c.y ** 2) * (a.y - b.y)) / D;
    const y = ((a.x ** 2 + a.y ** 2) * (c.x - b.x) + (b.x ** 2 + b.y ** 2) * (a.x - c.x) + (c.x ** 2 + c.y ** 2) * (b.x - a.x)) / D;
    return { x, y, r: Math.hypot(a.x - x, a.y - y) };
  };
  let c = { x: pts[0].x, y: pts[0].y, r: 0 };
  for (let i = 1; i < pts.length; i++) {
    if (inC(c, pts[i])) continue;
    c = { x: pts[i].x, y: pts[i].y, r: 0 };
    for (let j = 0; j < i; j++) {
      if (inC(c, pts[j])) continue;
      c = two(pts[i], pts[j]);
      for (let k = 0; k < j; k++) if (!inC(c, pts[k])) c = three(pts[i], pts[j], pts[k]) ?? c;
    }
  }
  return c;
}

/** Integral numérica (Simpson composto). */
export function integrate(f: (x: number) => number, a: number, b: number, n = 400): number {
  if (a === b) return 0;
  const N = n % 2 ? n + 1 : n;
  const h = (b - a) / N;
  let s = 0;
  for (let i = 0; i <= N; i++) {
    const y = f(a + i * h);
    const w = i === 0 || i === N ? 1 : i % 2 ? 4 : 2;
    s += w * (Number.isFinite(y) ? y : 0);
  }
  return (s * h) / 3;
}
