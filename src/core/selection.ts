// Matemática de seleção e transformação. Pura (sem Pixi/React), toda em coordenadas do MUNDO,
// exceto onde o nome diz "Screen".
import { Camera } from "./camera";
import { elementHit } from "./geometry";
import { HirakuElement } from "./model";
import { linearPath } from "./linear";
import { Pt, outlinePath, pointInPolygon, shapePath } from "./shapes";

// ---------- afim ----------
/** x' = a·x + c·y + e ; y' = b·x + d·y + f  (mesma convenção do PIXI.Matrix) */
export interface Affine { a: number; b: number; c: number; d: number; e: number; f: number }

export const applyAffine = (m: Affine, x: number, y: number): Pt => ({
  x: m.a * x + m.c * y + m.e,
  y: m.b * x + m.d * y + m.f,
});

/** Transformação a aplicar a elementos: matriz + escalas nos eixos do quadro + rotação extra. */
export interface Xform { m: Affine; sx: number; sy: number; dAngle: number }

export const moveXform = (dx: number, dy: number): Xform => ({
  m: { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy }, sx: 1, sy: 1, dAngle: 0,
});

/** Aplica a transformação a um elemento (devolve um NOVO elemento; o original não muda). */
export function applyXform(el: HirakuElement, x: Xform): HirakuElement {
  if (el.type === "stroke") {
    // Espessura acompanha a escala só quando ela é uniforme (como no GoodNotes).
    const uniform = Math.abs(Math.abs(x.sx) - Math.abs(x.sy)) < 1e-3;
    return {
      ...el,
      points: el.points.map((p) => {
        const q = applyAffine(x.m, p.x, p.y);
        return { x: q.x, y: q.y, p: p.p };
      }),
      width: uniform ? el.width * Math.abs(x.sx) : el.width,
    };
  }
  if (el.type === "line" || el.type === "arrow") {
    return { ...el, points: el.points.map((p) => { const q = applyAffine(x.m, p.x, p.y); return { x: q.x, y: q.y }; }) };
  }
  if (el.type === "text") {
    // Redimensionar texto escala a fonte (proporcional); girar/mover só reposiciona.
    const k = Math.sqrt(Math.abs(x.sx * x.sy));
    const size = Math.max(6, Math.min(400, el.fontSize * k));
    const r = size / el.fontSize;
    const c = applyAffine(x.m, el.x + el.w / 2, el.y + el.h / 2);
    return { ...el, fontSize: size, w: el.w * r, h: el.h * r, x: c.x - (el.w * r) / 2, y: c.y - (el.h * r) / 2, angle: el.angle + x.dAngle };
  }
  const c = applyAffine(x.m, el.x + el.w / 2, el.y + el.h / 2);
  const w = el.w * Math.abs(x.sx);
  const h = el.h * Math.abs(x.sy);
  return { ...el, x: c.x - w / 2, y: c.y - h / 2, w, h, angle: el.angle + x.dAngle };
}

// ---------- limites ----------
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

export function elementBounds(el: HirakuElement): Bounds {
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (x: number, y: number) => {
    if (x < b.minX) b.minX = x;
    if (y < b.minY) b.minY = y;
    if (x > b.maxX) b.maxX = x;
    if (y > b.maxY) b.maxY = y;
  };
  let pad: number;
  if (el.type === "stroke") {
    el.points.forEach((p) => add(p.x, p.y));
    pad = el.width * 0.9;
  } else if (el.type === "line" || el.type === "arrow") {
    linearPath(el).forEach((p) => add(p.x, p.y));
    pad = el.strokeWidth / 2 + (el.startHead !== "none" || el.endHead !== "none" ? 8 + el.strokeWidth * 2 : 0);
  } else if (el.type === "text") {
    outlinePath(el).forEach((p) => add(p.x, p.y));
    pad = 2;
  } else {
    shapePath(el).forEach((p) => add(p.x, p.y));
    pad = el.strokeWidth / 2;
  }
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
}

export const boundsPolygon = (b: Bounds): Pt[] => [
  { x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY },
];

// ---------- quadro de seleção ----------
export interface Frame { cx: number; cy: number; w: number; h: number; angle: number }

/** Uma forma sozinha usa o quadro girado dela; qualquer outra seleção usa a caixa alinhada aos eixos. */
export function selectionFrame(els: HirakuElement[]): Frame | null {
  if (!els.length) return null;
  // Uma linha/seta sozinha não tem quadro: ela é editada ponto a ponto.
  if (els.length === 1 && (els[0].type === "line" || els[0].type === "arrow")) return null;
  if (els.length === 1 && els[0].type !== "stroke") {
    const e = els[0];
    return { cx: e.x + e.w / 2, cy: e.y + e.h / 2, w: e.w, h: e.h, angle: e.angle };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of els) {
    const b = elementBounds(el);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY, angle: 0 };
}

export function pointInFrame(f: Frame, p: Pt, pad: number): boolean {
  const c = Math.cos(f.angle), s = Math.sin(f.angle);
  const dx = p.x - f.cx, dy = p.y - f.cy;
  return Math.abs(dx * c + dy * s) <= f.w / 2 + pad && Math.abs(-dx * s + dy * c) <= f.h / 2 + pad;
}

// ---------- alças ----------
export type HandleId = "rot" | "nw" | "ne" | "se" | "sw" | "n" | "e" | "s" | "w";
const HANDLE_ORDER: HandleId[] = ["rot", "nw", "ne", "se", "sw", "n", "e", "s", "w"];
const UV: Record<Exclude<HandleId, "rot">, [number, number]> = {
  nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0],
};
/** Distância (em px de tela) da alça de rotação até a borda superior. */
export const ROTATE_OFFSET = 28;

const toScreen = (f: Frame, cam: Camera, lx: number, ly: number): Pt => {
  const c = Math.cos(f.angle), s = Math.sin(f.angle);
  return {
    x: (f.cx + lx * c - ly * s) * cam.zoom + cam.x,
    y: (f.cy + lx * s + ly * c) * cam.zoom + cam.y,
  };
};

export function handlePositions(f: Frame, cam: Camera): { id: HandleId; x: number; y: number }[] {
  return HANDLE_ORDER.map((id) => {
    const p = id === "rot"
      ? toScreen(f, cam, 0, -f.h / 2 - ROTATE_OFFSET / cam.zoom)
      : toScreen(f, cam, (UV[id][0] * f.w) / 2, (UV[id][1] * f.h) / 2);
    return { id, x: p.x, y: p.y };
  });
}

export const frameCornersScreen = (f: Frame, cam: Camera): Pt[] =>
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => toScreen(f, cam, (u * f.w) / 2, (v * f.h) / 2));

export function hitHandle(f: Frame, cam: Camera, sx: number, sy: number, tol: number): HandleId | null {
  let best: HandleId | null = null;
  let bestD = tol;
  for (const h of handlePositions(f, cam)) {
    const d = Math.hypot(h.x - sx, h.y - sy);
    if (d <= bestD) { best = h.id; bestD = d; }
  }
  return best;
}

// ---------- gestos de transformação ----------
export function resizeXform(f: Frame, handle: Exclude<HandleId, "rot">, P: Pt, shift: boolean, alt: boolean): Xform {
  const [u, v] = UV[handle];
  const c = Math.cos(f.angle), s = Math.sin(f.angle);
  const dx = P.x - f.cx, dy = P.y - f.cy;
  const lx = dx * c + dy * s;   // posição do ponteiro no eixo x do quadro
  const ly = -dx * s + dy * c;  // ... e no eixo y
  const hw = f.w / 2, hh = f.h / 2;
  const axl = alt ? 0 : -u * hw; // âncora (ponto que fica parado), em coords locais
  const ayl = alt ? 0 : -v * hh;

  let sx = 1, sy = 1;
  if (u !== 0 && hw > 1e-6) sx = (lx - axl) / (u * hw - axl);
  if (v !== 0 && hh > 1e-6) sy = (ly - ayl) / (v * hh - ayl);

  if (shift && u !== 0 && v !== 0) {
    const m = Math.max(Math.abs(sx), Math.abs(sy));
    sx = (sx < 0 ? -1 : 1) * m;
    sy = (sy < 0 ? -1 : 1) * m;
  }
  const clamp = (k: number) => (Math.abs(k) < 0.02 ? (k < 0 ? -0.02 : 0.02) : k);
  sx = clamp(sx);
  sy = clamp(sy);

  // L = R · S · Rᵀ
  const a = c * c * sx + s * s * sy;
  const b = c * s * (sx - sy);
  const d = s * s * sx + c * c * sy;
  const Ax = f.cx + axl * c - ayl * s;
  const Ay = f.cy + axl * s + ayl * c;
  return {
    m: { a, b, c: b, d, e: Ax - (a * Ax + b * Ay), f: Ay - (b * Ax + d * Ay) },
    sx, sy, dAngle: 0,
  };
}

export function rotateXform(f: Frame, startP: Pt, P: Pt, snap: boolean): Xform {
  let phi = Math.atan2(P.y - f.cy, P.x - f.cx) - Math.atan2(startP.y - f.cy, startP.x - f.cx);
  if (snap) {
    const step = Math.PI / 12; // 15°
    phi = Math.round((f.angle + phi) / step) * step - f.angle;
  }
  const c = Math.cos(phi), s = Math.sin(phi);
  return {
    m: { a: c, b: s, c: -s, d: c, e: f.cx - (c * f.cx - s * f.cy), f: f.cy - (s * f.cx + c * f.cy) },
    sx: 1, sy: 1, dAngle: phi,
  };
}

// ---------- seleção por área ----------
/** Caixa: seleciona o que está TOTALMENTE dentro dela. */
export function boxSelect(els: HirakuElement[], a: Pt, b: Pt): string[] {
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
  return els
    .filter((el) => {
      const e = elementBounds(el);
      return e.minX >= minX && e.maxX <= maxX && e.minY >= minY && e.maxY <= maxY;
    })
    .map((e) => e.id);
}

function samplePoints(el: HirakuElement): Pt[] {
  const pts: Pt[] = el.type === "stroke" ? el.points : el.type === "line" || el.type === "arrow" ? linearPath(el) : outlinePath(el);
  const stride = Math.max(1, Math.ceil(pts.length / 80));
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i += stride) out.push(pts[i]);
  out.push(pts[pts.length - 1]);
  return out;
}

function densify(poly: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

export function lassoSelect(els: HirakuElement[], poly: Pt[], mode: "inside" | "touch", zoom: number): string[] {
  if (poly.length < 3) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let perimeter = 0;
  poly.forEach((p, i) => {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    const q = poly[(i + 1) % poly.length];
    perimeter += Math.hypot(q.x - p.x, q.y - p.y);
  });
  const r = 4 / zoom;
  const dense = mode === "touch" ? densify(poly, Math.max(3 / zoom, perimeter / 500)) : [];
  const ids: string[] = [];

  for (const el of els) {
    const b = elementBounds(el);
    if (mode === "inside") {
      if (b.minX < minX || b.maxX > maxX || b.minY < minY || b.maxY > maxY) continue;
      if (samplePoints(el).every((p) => pointInPolygon(p.x, p.y, poly))) ids.push(el.id);
    } else {
      if (b.maxX < minX || b.minX > maxX || b.maxY < minY || b.minY > maxY) continue;
      if (
        samplePoints(el).some((p) => pointInPolygon(p.x, p.y, poly)) ||
        dense.some((q) => elementHit(el, q.x, q.y, r))
      ) ids.push(el.id);
    }
  }
  return ids;
}

// ---------- o que o renderer precisa desenhar por cima ----------
export interface SelectionUI {
  frame: Frame | null;
  /** Contornos finos por elemento (só com 2+ selecionados). */
  outlines: Pt[][];
  marquee: null | { kind: "box"; a: Pt; b: Pt } | { kind: "lasso"; pts: Pt[] };
  /** Linha/seta selecionada sozinha: pontos editáveis (e ponto-médio de cada segmento para inserir). */
  lineEdit: null | { points: Pt[] };
  /** Forma que receberá a ponta da seta (realce durante o arrasto). */
  bindHint?: Pt[] | null;
}
