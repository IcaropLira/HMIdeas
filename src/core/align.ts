// Alinhar, distribuir, igualar, grade e encaixe (guias inteligentes). Puro: trabalha com caixas e devolve
// deslocamentos/escalas; quem chama aplica nos elementos (ver alignActions.ts e selectTool).
import { Pt } from "./shapes";

export interface Box { minX: number; minY: number; maxX: number; maxY: number }
export interface Delta { dx: number; dy: number }

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type Axis = "h" | "v";

export const boxW = (b: Box) => b.maxX - b.minX;
export const boxH = (b: Box) => b.maxY - b.minY;
export const cx = (b: Box) => (b.minX + b.maxX) / 2;
export const cy = (b: Box) => (b.minY + b.maxY) / 2;

export function unionBox(bs: Box[]): Box | null {
  if (!bs.length) return null;
  return {
    minX: Math.min(...bs.map((b) => b.minX)), minY: Math.min(...bs.map((b) => b.minY)),
    maxX: Math.max(...bs.map((b) => b.maxX)), maxY: Math.max(...bs.map((b) => b.maxY)),
  };
}

export const shift = (b: Box, d: Delta): Box => ({ minX: b.minX + d.dx, maxX: b.maxX + d.dx, minY: b.minY + d.dy, maxY: b.maxY + d.dy });

/** Alinha cada caixa à referência (padrão: a caixa que envolve todas — com uma só, quem chama passa a página/tela). */
export function alignDeltas(boxes: Box[], mode: AlignMode, ref: Box | null = unionBox(boxes)): Delta[] {
  if (!ref) return boxes.map(() => ({ dx: 0, dy: 0 }));
  return boxes.map((b) => {
    switch (mode) {
      case "left": return { dx: ref.minX - b.minX, dy: 0 };
      case "right": return { dx: ref.maxX - b.maxX, dy: 0 };
      case "hcenter": return { dx: cx(ref) - cx(b), dy: 0 };
      case "top": return { dx: 0, dy: ref.minY - b.minY };
      case "bottom": return { dx: 0, dy: ref.maxY - b.maxY };
      case "vcenter": return { dx: 0, dy: cy(ref) - cy(b) };
    }
  });
}

/** Espaços iguais entre as caixas (as das pontas ficam onde estão). `gap` fixo opcional parte da primeira. */
export function distributeDeltas(boxes: Box[], axis: Axis, gap?: number): Delta[] {
  const out: Delta[] = boxes.map(() => ({ dx: 0, dy: 0 }));
  if (boxes.length < (gap == null ? 3 : 2)) return out;
  const lo = (b: Box) => (axis === "h" ? b.minX : b.minY);
  const size = (b: Box) => (axis === "h" ? boxW(b) : boxH(b));
  const order = boxes.map((_, i) => i).sort((a, b) => lo(boxes[a]) - lo(boxes[b]) || a - b);
  const first = boxes[order[0]], last = boxes[order[order.length - 1]];
  const total = order.reduce((s, i) => s + size(boxes[i]), 0);
  const span = (axis === "h" ? last.maxX : last.maxY) - lo(first);
  const g = gap ?? (span - total) / (order.length - 1);
  let pos = lo(first);
  for (const i of order) {
    const d = pos - lo(boxes[i]);
    out[i] = axis === "h" ? { dx: d, dy: 0 } : { dx: 0, dy: d };
    pos += size(boxes[i]) + g;
  }
  return out;
}

/** Centros igualmente espaçados (distribuir pelos centros). */
export function distributeCenters(boxes: Box[], axis: Axis): Delta[] {
  const out: Delta[] = boxes.map(() => ({ dx: 0, dy: 0 }));
  if (boxes.length < 3) return out;
  const c = (b: Box) => (axis === "h" ? cx(b) : cy(b));
  const order = boxes.map((_, i) => i).sort((a, b) => c(boxes[a]) - c(boxes[b]) || a - b);
  const a = c(boxes[order[0]]), z = c(boxes[order[order.length - 1]]);
  order.forEach((i, k) => {
    const d = a + ((z - a) * k) / (order.length - 1) - c(boxes[i]);
    out[i] = axis === "h" ? { dx: d, dy: 0 } : { dx: 0, dy: d };
  });
  return out;
}

/** Organiza em grade (ordem de leitura: linha por linha), células do tamanho da maior caixa. */
export function gridDeltas(boxes: Box[], cols?: number, gap = 24): Delta[] {
  const n = boxes.length;
  if (!n) return [];
  const c = Math.max(1, Math.min(n, cols ?? Math.ceil(Math.sqrt(n))));
  const cw = Math.max(...boxes.map(boxW)), ch = Math.max(...boxes.map(boxH));
  const u = unionBox(boxes)!;
  // ordem de leitura: por linhas aproximadas (centro y arredondado à altura média), depois x
  const rowH = Math.max(1, ch * 0.6);
  const order = boxes.map((_, i) => i).sort((a, b) => Math.round(cy(boxes[a]) / rowH) - Math.round(cy(boxes[b]) / rowH) || cx(boxes[a]) - cx(boxes[b]));
  const out: Delta[] = boxes.map(() => ({ dx: 0, dy: 0 }));
  order.forEach((i, k) => {
    const col = k % c, row = Math.floor(k / c);
    const tx = u.minX + col * (cw + gap) + (cw - boxW(boxes[i])) / 2;
    const ty = u.minY + row * (ch + gap) + (ch - boxH(boxes[i])) / 2;
    out[i] = { dx: tx - boxes[i].minX, dy: ty - boxes[i].minY };
  });
  return out;
}

/** Escalas para igualar larguras/alturas (à maior, à menor ou à média). */
export function equalizeScales(boxes: Box[], dim: "w" | "h" | "both", to: "max" | "min" | "first" = "max"): { sx: number; sy: number }[] {
  const pick = (vals: number[]) => (to === "max" ? Math.max(...vals) : to === "min" ? Math.min(...vals) : vals[0]);
  const W = pick(boxes.map(boxW)), H = pick(boxes.map(boxH));
  return boxes.map((b) => ({
    sx: dim !== "h" && boxW(b) > 0.001 ? W / boxW(b) : 1,
    sy: dim !== "w" && boxH(b) > 0.001 ? H / boxH(b) : 1,
  }));
}

// ---------- encaixe ao arrastar ----------

export interface Guide { a: Pt; b: Pt; kind?: "align" | "gap" }
export interface SnapResult { dx: number; dy: number; guides: Guide[] }

/**
 * Encaixe da caixa em movimento (`moving`, já deslocada pelo ponteiro) nas outras caixas: bordas e centros em X/Y
 * (guias de alinhamento) e espaço igual entre vizinhos da mesma linha/coluna (marcas de espaçamento). `tol` no mundo.
 * Com `grid`, encaixa o canto na grade quando nenhuma guia estiver mais perto.
 */
export function snapMove(moving: Box, others: Box[], tol: number, grid = 0): SnapResult {
  const xs = [moving.minX, cx(moving), moving.maxX];
  const ys = [moving.minY, cy(moving), moving.maxY];
  let bestX: { d: number; v: number } | null = null, bestY: { d: number; v: number } | null = null;
  for (const o of others) {
    for (const ov of [o.minX, cx(o), o.maxX]) for (const mv of xs) {
      const d = ov - mv;
      if (Math.abs(d) <= tol && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, v: ov };
    }
    for (const ov of [o.minY, cy(o), o.maxY]) for (const mv of ys) {
      const d = ov - mv;
      if (Math.abs(d) <= tol && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, v: ov };
    }
  }
  // espaço igual entre vizinhos (linha: caixas que cruzam a faixa vertical da caixa movida)
  let gapX: { d: number; l: Box; r: Box } | null = null, gapY: { d: number; t: Box; b: Box } | null = null;
  const row = others.filter((o) => o.maxY > moving.minY && o.minY < moving.maxY);
  const L = row.filter((o) => o.maxX <= cx(moving)).sort((a, b) => b.maxX - a.maxX)[0];
  const R = row.filter((o) => o.minX >= cx(moving)).sort((a, b) => a.minX - b.minX)[0];
  if (L && R) {
    const target = (L.maxX + R.minX - boxW(moving)) / 2;
    const d = target - moving.minX;
    if (Math.abs(d) <= tol && (!bestX || Math.abs(d) <= Math.abs(bestX.d))) gapX = { d, l: L, r: R };
  }
  const col = others.filter((o) => o.maxX > moving.minX && o.minX < moving.maxX);
  const T = col.filter((o) => o.maxY <= cy(moving)).sort((a, b) => b.maxY - a.maxY)[0];
  const B = col.filter((o) => o.minY >= cy(moving)).sort((a, b) => a.minY - b.minY)[0];
  if (T && B) {
    const target = (T.maxY + B.minY - boxH(moving)) / 2;
    const d = target - moving.minY;
    if (Math.abs(d) <= tol && (!bestY || Math.abs(d) <= Math.abs(bestY.d))) gapY = { d, t: T, b: B };
  }

  let dx = gapX ? gapX.d : bestX ? bestX.d : 0;
  let dy = gapY ? gapY.d : bestY ? bestY.d : 0;
  if (grid > 0) {
    if (!gapX && !bestX) dx = Math.round(moving.minX / grid) * grid - moving.minX;
    if (!gapY && !bestY) dy = Math.round(moving.minY / grid) * grid - moving.minY;
  }
  const m = shift(moving, { dx, dy });
  const guides: Guide[] = [];
  if (bestX && !gapX) {
    const v = bestX.v;
    const hits = others.filter((o) => [o.minX, cx(o), o.maxX].some((x) => Math.abs(x - v) < 0.01));
    const y0 = Math.min(m.minY, ...hits.map((o) => o.minY)), y1 = Math.max(m.maxY, ...hits.map((o) => o.maxY));
    guides.push({ a: { x: v, y: y0 }, b: { x: v, y: y1 } });
  }
  if (bestY && !gapY) {
    const v = bestY.v;
    const hits = others.filter((o) => [o.minY, cy(o), o.maxY].some((y) => Math.abs(y - v) < 0.01));
    const x0 = Math.min(m.minX, ...hits.map((o) => o.minX)), x1 = Math.max(m.maxX, ...hits.map((o) => o.maxX));
    guides.push({ a: { x: x0, y: v }, b: { x: x1, y: v } });
  }
  if (gapX) {
    const y = cy(m);
    guides.push({ a: { x: gapX.l.maxX, y }, b: { x: m.minX, y }, kind: "gap" }, { a: { x: m.maxX, y }, b: { x: gapX.r.minX, y }, kind: "gap" });
  }
  if (gapY) {
    const x = cx(m);
    guides.push({ a: { x, y: gapY.t.maxY }, b: { x, y: m.minY }, kind: "gap" }, { a: { x, y: m.maxY }, b: { x, y: gapY.b.minY }, kind: "gap" });
  }
  return { dx, dy, guides };
}
