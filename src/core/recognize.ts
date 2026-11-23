// Reconhecimento de formas (como o "desenhar e segurar" do GoodNotes): transforma um traço feito à mão em linha,
// retângulo, elipse/círculo, losango, triângulo ou polígono. Puro: recebe pontos do mundo e devolve a forma (ou null).
export interface RP { x: number; y: number }

export type Recognized =
  | { kind: "line"; a: RP; b: RP }
  | { kind: "rect" | "ellipse" | "diamond"; x: number; y: number; w: number; h: number }
  | { kind: "polygon"; points: RP[] };

const dist = (a: RP, b: RP) => Math.hypot(a.x - b.x, a.y - b.y);

function segDist(p: RP, a: RP, b: RP) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker. */
export function simplify(pts: RP[], eps: number): RP[] {
  if (pts.length < 3) return pts;
  let idx = -1, best = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i], pts[0], pts[pts.length - 1]); if (d > best) { best = d; idx = i; } }
  if (best <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

export function recognize(pts: RP[]): Recognized | null {
  if (pts.length < 4) return null;
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const w = maxX - minX, h = maxY - minY, diag = Math.hypot(w, h);
  if (L < 12 || diag < 8) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const closed = dist(first, last) < Math.max(0.18 * L, 0.25 * diag);

  if (!closed) {
    const straight = dist(first, last) / L;
    if (straight > 0.92) return { kind: "line", a: first, b: last };
    return null;
  }

  // elipse: erro radial normalizado em relação à caixa
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  let err = 0;
  for (const p of pts) {
    const v = Math.hypot((p.x - cx) / Math.max(w / 2, 1e-6), (p.y - cy) / Math.max(h / 2, 1e-6));
    err += Math.abs(v - 1);
  }
  err /= pts.length;

  // cantos
  const closedPts = [...pts.slice(0, -1), first];
  let poly = simplify(closedPts, 0.07 * diag);
  if (poly.length > 2 && dist(poly[0], poly[poly.length - 1]) < 0.15 * diag) poly = poly.slice(0, -1);
  // junta cantos muito próximos
  poly = poly.filter((p, i) => i === 0 || dist(p, poly[i - 1]) > 0.12 * diag);
  const n = poly.length;

  if (n >= 5 && err < 0.14) return { kind: "ellipse", x: minX, y: minY, w, h };
  if (n === 3) return { kind: "polygon", points: poly };
  if (n === 4) {
    // retângulo: lados quase horizontais/verticais; losango: vértices perto do meio dos lados da caixa
    const axisAligned = poly.every((p, i) => {
      const q = poly[(i + 1) % 4];
      const a = Math.abs(Math.atan2(q.y - p.y, q.x - p.x)) % (Math.PI / 2);
      return Math.min(a, Math.PI / 2 - a) < 0.3;
    });
    if (axisAligned) return { kind: "rect", x: minX, y: minY, w, h };
    const mids = [{ x: cx, y: minY }, { x: maxX, y: cy }, { x: cx, y: maxY }, { x: minX, y: cy }];
    if (poly.every((p) => mids.some((m) => dist(m, p) < 0.2 * diag))) return { kind: "diamond", x: minX, y: minY, w, h };
    return { kind: "polygon", points: poly };
  }
  if (err < 0.2) return { kind: "ellipse", x: minX, y: minY, w, h };
  if (n >= 5 && n <= 8) return { kind: "polygon", points: poly };
  return null;
}
