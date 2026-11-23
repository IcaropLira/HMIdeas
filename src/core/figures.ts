// Figuras matemáticas: sólidos geométricos (com arestas ocultas tracejadas), espaço 3D com planos, gráficos de funções,
// reta numérica, círculo trigonométrico e transferidor. Puro: gera PRIMITIVAS (linhas, polígonos, textos, pontos) em
// coordenadas locais da caixa (0..w, 0..h). O Renderer (Pixi) e as prévias (SVG) desenham as mesmas primitivas.
import { compile, fmt } from "./expr";

export type SolidId = "cube" | "cuboid" | "prism3" | "prism6" | "pyramid4" | "tetra" | "octa" | "cylinder" | "cone" | "frustum" | "sphere";

export const SOLIDS: { id: SolidId; label: string }[] = [
  { id: "cube", label: "Cubo" },
  { id: "cuboid", label: "Paralelepípedo" },
  { id: "prism3", label: "Prisma triangular" },
  { id: "prism6", label: "Prisma hexagonal" },
  { id: "pyramid4", label: "Pirâmide" },
  { id: "tetra", label: "Tetraedro" },
  { id: "octa", label: "Octaedro" },
  { id: "cylinder", label: "Cilindro" },
  { id: "cone", label: "Cone" },
  { id: "frustum", label: "Tronco de cone" },
  { id: "sphere", label: "Esfera" },
];

export interface PlotFn { expr: string; color: string }
export interface PlotPoint { x: number; y: number; label?: string }

export type FigureSpec =
  | { kind: "solid"; solid: SolidId; yaw: number; pitch: number; color: string; hidden: boolean; labels: boolean }
  | { kind: "plot"; fns: PlotFn[]; points: PlotPoint[]; xmin: number; xmax: number; ymin: number; ymax: number; grid: boolean }
  | { kind: "space"; yaw: number; pitch: number; plane: "none" | "xy" | "xz" | "yz"; color: string }
  | { kind: "numberline"; min: number; max: number; step: number; color: string }
  | { kind: "unitcircle"; color: string; radians: boolean }
  | { kind: "protractor"; color: string };

export type FigureKind = FigureSpec["kind"];

export const FIGURE_KINDS: { id: FigureKind; label: string; hint: string }[] = [
  { id: "plot", label: "Gráfico de função", hint: "Plano cartesiano com funções e pontos" },
  { id: "space", label: "Espaço 3D", hint: "Eixos x, y, z e planos" },
  { id: "numberline", label: "Reta numérica", hint: "Inteiros, frações, intervalos" },
  { id: "unitcircle", label: "Círculo trigonométrico", hint: "Ângulos notáveis" },
  { id: "protractor", label: "Transferidor", hint: "Medir ângulos (0° a 180°)" },
];

export const PLOT_COLORS = ["#2F5BD3", "#D2453A", "#2E9B5F", "#C98612", "#7B4FC9", "#0E8A9B"];

export function defaultFigure(kind: FigureKind | SolidId): FigureSpec {
  if (SOLIDS.some((s) => s.id === kind)) return { kind: "solid", solid: kind as SolidId, yaw: -0.6, pitch: 0.42, color: "#4D6FC4", hidden: true, labels: true };
  switch (kind) {
    case "plot": return { kind: "plot", fns: [{ expr: "x^2 - 2", color: PLOT_COLORS[0] }, { expr: "sin(x)", color: PLOT_COLORS[1] }], points: [], xmin: -5, xmax: 5, ymin: -4, ymax: 6, grid: true };
    case "space": return { kind: "space", yaw: -0.65, pitch: 0.38, plane: "xy", color: "#4D6FC4" };
    case "numberline": return { kind: "numberline", min: -5, max: 5, step: 1, color: "#1B2233" };
    case "unitcircle": return { kind: "unitcircle", color: "#4D6FC4", radians: false };
    case "protractor": return { kind: "protractor", color: "#2F5BD3" };
    default: return { kind: "solid", solid: "cube", yaw: -0.6, pitch: 0.42, color: "#4D6FC4", hidden: true, labels: true };
  }
}

/** Tamanho inicial (mundo) de cada figura. */
export function defaultFigureSize(spec: FigureSpec): { w: number; h: number } {
  switch (spec.kind) {
    case "plot": return { w: 440, h: 360 };
    case "space": return { w: 380, h: 340 };
    case "numberline": return { w: 520, h: 90 };
    case "unitcircle": return { w: 380, h: 380 };
    case "protractor": return { w: 400, h: 230 };
    default: return { w: 260, h: 260 };
  }
}

// ---------------- saneamento (arquivos) ----------------
const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanFigure(raw: any): FigureSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const d = defaultFigure(raw.kind === "solid" ? raw.solid : raw.kind);
  switch (raw.kind) {
    case "solid": {
      const solid = SOLIDS.some((s) => s.id === raw.solid) ? raw.solid : "cube";
      return { kind: "solid", solid, yaw: n(raw.yaw, -0.6), pitch: Math.max(-1.5, Math.min(1.5, n(raw.pitch, 0.42))), color: hex(raw.color, "#4D6FC4"), hidden: raw.hidden !== false, labels: raw.labels !== false };
    }
    case "plot": {
      if (d.kind !== "plot") return null;
      const fns = Array.isArray(raw.fns) ? raw.fns.filter((f: unknown) => f && typeof (f as PlotFn).expr === "string").slice(0, 8).map((f: PlotFn, i: number) => ({ expr: f.expr.slice(0, 200), color: hex(f.color, PLOT_COLORS[i % PLOT_COLORS.length]) })) : [];
      const points = Array.isArray(raw.points) ? raw.points.filter((p: PlotPoint) => p && Number.isFinite(p.x) && Number.isFinite(p.y)).slice(0, 50).map((p: PlotPoint) => ({ x: p.x, y: p.y, label: typeof p.label === "string" ? p.label.slice(0, 20) : undefined })) : [];
      let xmin = n(raw.xmin, -5), xmax = n(raw.xmax, 5), ymin = n(raw.ymin, -5), ymax = n(raw.ymax, 5);
      if (xmax <= xmin) [xmin, xmax] = [-5, 5];
      if (ymax <= ymin) [ymin, ymax] = [-5, 5];
      return { kind: "plot", fns, points, xmin, xmax, ymin, ymax, grid: raw.grid !== false };
    }
    case "space": return { kind: "space", yaw: n(raw.yaw, -0.65), pitch: Math.max(-1.5, Math.min(1.5, n(raw.pitch, 0.38))), plane: ["none", "xy", "xz", "yz"].includes(raw.plane) ? raw.plane : "xy", color: hex(raw.color, "#4D6FC4") };
    case "numberline": {
      let min = n(raw.min, -5), max = n(raw.max, 5);
      if (max <= min) [min, max] = [-5, 5];
      const step = Math.max((max - min) / 200, Math.abs(n(raw.step, 1)) || 1);
      return { kind: "numberline", min, max, step, color: hex(raw.color, "#1B2233") };
    }
    case "unitcircle": return { kind: "unitcircle", color: hex(raw.color, "#4D6FC4"), radians: raw.radians === true };
    case "protractor": return { kind: "protractor", color: hex(raw.color, "#2F5BD3") };
    default: return null;
  }
}

// ---------------- primitivas ----------------
export interface P { x: number; y: number }
export interface FigLine { pts: P[]; color: string; width: number; dash?: boolean; alpha?: number; closed?: boolean }
export interface FigPoly { pts: P[]; fill: string; alpha: number }
export interface FigText { x: number; y: number; text: string; size: number; color: string; anchor: "start" | "middle" | "end"; base: "top" | "middle" | "bottom"; bold?: boolean }
export interface FigDot { x: number; y: number; r: number; color: string }
export interface FigPrims { polys: FigPoly[]; lines: FigLine[]; texts: FigText[]; dots: FigDot[]; arrows: { from: P; to: P; color: string; size: number }[] }

const empty = (): FigPrims => ({ polys: [], lines: [], texts: [], dots: [], arrows: [] });
const INK = "#1B2233";
const SOFT = "#6B7890";

// ---------- 3D ----------
type V3 = [number, number, number];
interface Mesh { v: V3[]; f: number[][]; smooth?: (a: number, b: number) => boolean; labels?: boolean }

function ring(n: number, r: number, y: number, phase = 0): V3[] {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, y, Math.sin(a) * r] as V3;
  });
}

/** Prisma/cilindro/tronco: anel de baixo (r0) e de cima (r1). `smooth` = faces laterais curvas (sem arestas visíveis). */
function prism(nSides: number, r0: number, r1: number, h: number, smooth: boolean, phase = 0): Mesh {
  const bot = ring(nSides, r0, -h / 2, phase);
  const top = ring(nSides, r1, h / 2, phase);
  const v = [...bot, ...top];
  const f: number[][] = [];
  f.push(Array.from({ length: nSides }, (_, i) => i)); // base (vista de baixo)
  f.push(Array.from({ length: nSides }, (_, i) => nSides + (nSides - 1 - i))); // topo
  for (let i = 0; i < nSides; i++) {
    const j = (i + 1) % nSides;
    f.push([j, i, nSides + i, nSides + j]);
  }
  const isSide = (a: number, b: number) => (a < nSides) !== (b < nSides);
  return { v, f, smooth: smooth ? isSide : undefined, labels: !smooth };
}

function pyramid(nSides: number, r: number, h: number, smooth: boolean, phase = 0): Mesh {
  const base = ring(nSides, r, -h / 2, phase);
  const apex: V3 = [0, h / 2, 0];
  const v = [...base, apex];
  const f: number[][] = [Array.from({ length: nSides }, (_, i) => i)];
  for (let i = 0; i < nSides; i++) f.push([(i + 1) % nSides, i, nSides]);
  return { v, f, smooth: smooth ? (a, b) => a === nSides || b === nSides : undefined, labels: !smooth };
}

function meshOf(id: SolidId): Mesh {
  switch (id) {
    case "cube": return prism(4, Math.SQRT2, Math.SQRT2, 2, false, Math.PI / 4);
    case "cuboid": {
      const m = prism(4, 1, 1, 1.4, false, Math.PI / 4);
      return { ...m, v: m.v.map(([x, y, z]) => [x * 1.9, y, z * 1.1] as V3) };
    }
    case "prism3": return prism(3, 1.2, 1.2, 2, false, Math.PI / 2);
    case "prism6": return prism(6, 1.1, 1.1, 2, false);
    case "pyramid4": return pyramid(4, 1.5, 2, false, Math.PI / 4);
    case "tetra": return pyramid(3, 1.4, 1.95, false, Math.PI / 2);
    case "octa": {
      const v: V3[] = [[1.4, 0, 0], [0, 0, 1.4], [-1.4, 0, 0], [0, 0, -1.4], [0, 1.5, 0], [0, -1.5, 0]];
      const f = [[1, 0, 4], [2, 1, 4], [3, 2, 4], [0, 3, 4], [0, 1, 5], [1, 2, 5], [2, 3, 5], [3, 0, 5]];
      return { v, f, labels: true };
    }
    case "cylinder": return prism(48, 1, 1, 2.2, true);
    case "cone": return pyramid(48, 1.2, 2.2, true);
    case "frustum": return prism(48, 1.3, 0.7, 1.8, true);
    default: return prism(48, 1, 1, 2, true);
  }
}

function rotator(yaw: number, pitch: number) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return ([x, y, z]: V3): V3 => {
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy; // giro em torno do eixo vertical
    const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp; // inclinação (olhar de cima)
    return [x1, y2, z2];
  };
}

/** Encaixa pontos 2D (x para a direita, y para CIMA) na caixa w×h com margem. */
function fitter(pts: { x: number; y: number }[], w: number, h: number, pad: number) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const bw = Math.max(1e-6, maxX - minX), bh = Math.max(1e-6, maxY - minY);
  const k = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  const ox = w / 2 - ((minX + maxX) / 2) * k, oy = h / 2 + ((minY + maxY) / 2) * k;
  return { k, map: (p: { x: number; y: number }): P => ({ x: ox + p.x * k, y: oy - p.y * k }) };
}

function shade(hexColor: string, f: number): string {
  const c = parseInt(hexColor.slice(1), 16);
  const ch = (s: number) => Math.round(Math.min(255, Math.max(0, f >= 0 ? s + (255 - s) * f : s * (1 + f))));
  const r = ch((c >> 16) & 255), g = ch((c >> 8) & 255), b = ch(c & 255);
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

function solidPrims(spec: Extract<FigureSpec, { kind: "solid" }>, w: number, h: number): FigPrims {
  const out = empty();
  const rot = rotator(spec.yaw, spec.pitch);
  if (spec.solid === "sphere") return spherePrims(spec, w, h, rot);
  const mesh = meshOf(spec.solid);
  const rv = mesh.v.map(rot);
  const fit = fitter(rv.map(([x, y]) => ({ x, y })), w, h, Math.min(w, h) * 0.12);
  const pv = rv.map(([x, y]) => fit.map({ x, y }));
  // face visível = normal apontando para quem olha (z > 0)
  const front = mesh.f.map((face) => {
    const [a, b, c] = face.map((i) => rv[i]);
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - a[0], vy = c[1] - a[1];
    const nz = ux * vy - uy * vx;
    return nz > 0;
  });
  // preenchimento com luz suave (faces de frente)
  mesh.f.forEach((face, i) => {
    if (!front[i]) return;
    const [a, b, c] = face.map((k) => rv[k]);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz2 = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz2) || 1;
    const light = (-nx * 0.35 + ny * 0.75 + nz2 * 0.55) / len; // luz de cima/esquerda
    out.polys.push({ pts: face.map((k) => pv[k]), fill: shade(spec.color, 0.55 + light * 0.3), alpha: 0.9 });
  });
  // arestas
  const edges = new Map<string, number[]>();
  mesh.f.forEach((face, fi) => face.forEach((a, i) => {
    const b = face[(i + 1) % face.length];
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    const list = edges.get(key) ?? [];
    list.push(fi);
    edges.set(key, list);
  }));
  const stroke = shade(spec.color, -0.45);
  for (const [key, faces] of edges) {
    const [a, b] = key.split("-").map(Number);
    const fr = faces.map((f) => front[f]);
    const anyFront = fr.some(Boolean);
    if (mesh.smooth?.(a, b)) {
      if (fr.length === 2 && fr[0] !== fr[1]) out.lines.push({ pts: [pv[a], pv[b]], color: stroke, width: 2 }); // contorno
      continue;
    }
    if (anyFront) out.lines.push({ pts: [pv[a], pv[b]], color: stroke, width: 2 });
    else if (spec.hidden) out.lines.push({ pts: [pv[a], pv[b]], color: stroke, width: 1.4, dash: true, alpha: 0.75 });
  }
  if (spec.labels) {
    if (mesh.labels) {
      const c = pv.reduce((s, p) => ({ x: s.x + p.x / pv.length, y: s.y + p.y / pv.length }), { x: 0, y: 0 });
      pv.forEach((p, i) => {
        const dx = p.x - c.x, dy = p.y - c.y, L = Math.hypot(dx, dy) || 1;
        out.texts.push({ x: p.x + (dx / L) * 14, y: p.y + (dy / L) * 14, text: String.fromCharCode(65 + (i % 26)), size: 15, color: INK, anchor: "middle", base: "middle", bold: true });
        out.dots.push({ x: p.x, y: p.y, r: 2.5, color: stroke });
      });
    } else {
      // corpos redondos: raio da base e altura (tracejadas), como nos livros
      // índices: 0..47 = anel de baixo; 48 = primeiro do anel de cima (ou o vértice do cone)
      const centerBot = rot([0, mesh.v[0][1], 0]);
      const rimPt = rv[0];
      const topY = mesh.v[48][1];
      const centerTop = rot([0, topY, 0]);
      const cb = fit.map({ x: centerBot[0], y: centerBot[1] }), rp = fit.map({ x: rimPt[0], y: rimPt[1] }), ct = fit.map({ x: centerTop[0], y: centerTop[1] });
      out.lines.push({ pts: [cb, rp], color: INK, width: 1.4, dash: true });
      out.lines.push({ pts: [cb, ct], color: INK, width: 1.4, dash: true });
      out.dots.push({ x: cb.x, y: cb.y, r: 2.5, color: INK });
      out.texts.push({ x: (cb.x + rp.x) / 2, y: (cb.y + rp.y) / 2 + 12, text: "r", size: 15, color: INK, anchor: "middle", base: "middle", bold: true });
      out.texts.push({ x: (cb.x + ct.x) / 2 + 12, y: (cb.y + ct.y) / 2, text: "h", size: 15, color: INK, anchor: "start", base: "middle", bold: true });
    }
  }
  return out;
}

function spherePrims(spec: Extract<FigureSpec, { kind: "solid" }>, w: number, h: number, rot: (v: V3) => V3): FigPrims {
  const out = empty();
  const R = Math.min(w, h) * 0.38;
  const cx = w / 2, cy = h / 2;
  const stroke = shade(spec.color, -0.45);
  const circle = Array.from({ length: 72 }, (_, i) => ({ x: cx + Math.cos((i / 72) * Math.PI * 2) * R, y: cy + Math.sin((i / 72) * Math.PI * 2) * R }));
  out.polys.push({ pts: circle, fill: shade(spec.color, 0.65), alpha: 0.9 });
  // equador e meridiano: metade da frente contínua, de trás tracejada
  const curve = (fn: (a: number) => V3) => {
    const pts = Array.from({ length: 73 }, (_, i) => rot(fn((i / 72) * Math.PI * 2)));
    let cur: P[] = [];
    let curFront: boolean | null = null;
    const flush = () => { if (cur.length > 1) out.lines.push({ pts: cur, color: stroke, width: curFront ? 1.6 : 1.2, dash: !curFront, alpha: curFront ? 1 : 0.7 }); };
    for (const p of pts) {
      const fr = p[2] >= 0;
      const q = { x: cx + p[0] * R, y: cy - p[1] * R };
      if (curFront === null || fr === curFront) cur.push(q);
      else { cur.push(q); flush(); cur = [q]; }
      curFront = fr;
    }
    flush();
  };
  curve((a) => [Math.cos(a), 0, Math.sin(a)]);
  if (spec.hidden) curve((a) => [Math.cos(a), Math.sin(a), 0]);
  out.lines.push({ pts: circle, color: stroke, width: 2, closed: true });
  if (spec.labels) {
    out.lines.push({ pts: [{ x: cx, y: cy }, { x: cx + R, y: cy }], color: INK, width: 1.4, dash: true });
    out.dots.push({ x: cx, y: cy, r: 2.5, color: INK });
    out.texts.push({ x: cx + R / 2, y: cy - 10, text: "r", size: 15, color: INK, anchor: "middle", base: "middle", bold: true });
  }
  return out;
}

function spacePrims(spec: Extract<FigureSpec, { kind: "space" }>, w: number, h: number): FigPrims {
  const out = empty();
  const rot = rotator(spec.yaw, spec.pitch);
  // matemática (x, y, z com z para cima) → desenho (X, Y para cima, Z)
  const M = ([x, y, z]: V3): V3 => rot([x, z, -y]);
  const L = 1.25;
  const all = [[L, 0, 0], [-L * 0.5, 0, 0], [0, L, 0], [0, -L * 0.5, 0], [0, 0, L], [0, 0, -L * 0.5]].map((v) => M(v as V3));
  const fit = fitter(all.map(([x, y]) => ({ x, y })), w, h, 28);
  const P2 = (v: V3) => { const r = M(v); return fit.map({ x: r[0], y: r[1] }); };
  if (spec.plane !== "none") {
    const s = 0.95;
    const corners: V3[] = spec.plane === "xy" ? [[-s, -s, 0], [s, -s, 0], [s, s, 0], [-s, s, 0]] : spec.plane === "xz" ? [[-s, 0, -s], [s, 0, -s], [s, 0, s], [-s, 0, s]] : [[0, -s, -s], [0, s, -s], [0, s, s], [0, -s, s]];
    out.polys.push({ pts: corners.map(P2), fill: spec.color, alpha: 0.16 });
    // malha do plano
    for (let i = -4; i <= 4; i++) {
      const t = (i / 4) * s;
      const seg = (a: V3, b: V3) => out.lines.push({ pts: [P2(a), P2(b)], color: spec.color, width: 0.8, alpha: 0.35 });
      if (spec.plane === "xy") { seg([t, -s, 0], [t, s, 0]); seg([-s, t, 0], [s, t, 0]); }
      else if (spec.plane === "xz") { seg([t, 0, -s], [t, 0, s]); seg([-s, 0, t], [s, 0, t]); }
      else { seg([0, t, -s], [0, t, s]); seg([0, -s, t], [0, s, t]); }
    }
    out.lines.push({ pts: corners.map(P2), color: spec.color, width: 1.5, closed: true });
    const lab = spec.plane === "xy" ? "z = 0" : spec.plane === "xz" ? "y = 0" : "x = 0";
    const c2 = P2(corners[1]);
    out.texts.push({ x: c2.x + 6, y: c2.y, text: `plano ${spec.plane} (${lab})`, size: 12, color: spec.color, anchor: "start", base: "middle" });
  }
  const axes: [V3, string, string][] = [[[1, 0, 0], "x", "#D2453A"], [[0, 1, 0], "y", "#2E9B5F"], [[0, 0, 1], "z", "#2F5BD3"]];
  const o = P2([0, 0, 0]);
  for (const [d, name, color] of axes) {
    const neg = P2([-d[0] * L * 0.5, -d[1] * L * 0.5, -d[2] * L * 0.5] as V3);
    const pos = P2([d[0] * L, d[1] * L, d[2] * L] as V3);
    out.lines.push({ pts: [neg, o], color, width: 1.6, dash: true, alpha: 0.7 });
    out.lines.push({ pts: [o, pos], color, width: 2.2 });
    out.arrows.push({ from: o, to: pos, color, size: 10 });
    const dx = pos.x - o.x, dy = pos.y - o.y, len = Math.hypot(dx, dy) || 1;
    out.texts.push({ x: pos.x + (dx / len) * 14, y: pos.y + (dy / len) * 14, text: name, size: 17, color, anchor: "middle", base: "middle", bold: true });
  }
  out.dots.push({ x: o.x, y: o.y, r: 3, color: INK });
  out.texts.push({ x: o.x - 8, y: o.y + 6, text: "O", size: 13, color: INK, anchor: "end", base: "top" });
  return out;
}

// ---------- gráficos ----------
/** Passo "bonito" (1, 2 ou 5 × 10^k) para ~`target` divisões. */
export function niceStep(span: number, target = 8): number {
  const raw = span / Math.max(1, target);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/** Recorta o segmento ab ao retângulo [0,w]×[0,h] (Liang–Barsky); null se fica todo fora. */
function clipSeg(a: P, b: P, w: number, h: number): [P, P] | null {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const tests: [number, number][] = [[-dx, a.x], [dx, w - a.x], [-dy, a.y], [dy, h - a.y]];
  for (const [p, q] of tests) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
}

export function plotPrims(spec: Extract<FigureSpec, { kind: "plot" }>, w: number, h: number): FigPrims & { errors: string[] } {
  const out = { ...empty(), errors: [] as string[] };
  const { xmin, xmax, ymin, ymax } = spec;
  const sx = (x: number) => ((x - xmin) / (xmax - xmin)) * w;
  const sy = (y: number) => h - ((y - ymin) / (ymax - ymin)) * h;
  out.polys.push({ pts: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], fill: "#FFFFFF", alpha: 1 });
  const stepX = niceStep(xmax - xmin, Math.max(2, w / 60)), stepY = niceStep(ymax - ymin, Math.max(2, h / 50));
  if (spec.grid) {
    const minor = (v0: number, v1: number, st: number, f: (v: number) => void) => { for (let v = Math.ceil(v0 / st) * st; v <= v1 + 1e-9; v += st) f(v); };
    minor(xmin, xmax, stepX / 2, (v) => out.lines.push({ pts: [{ x: sx(v), y: 0 }, { x: sx(v), y: h }], color: "#1B2233", width: 0.6, alpha: 0.06 }));
    minor(ymin, ymax, stepY / 2, (v) => out.lines.push({ pts: [{ x: 0, y: sy(v) }, { x: w, y: sy(v) }], color: "#1B2233", width: 0.6, alpha: 0.06 }));
    minor(xmin, xmax, stepX, (v) => out.lines.push({ pts: [{ x: sx(v), y: 0 }, { x: sx(v), y: h }], color: "#1B2233", width: 0.8, alpha: 0.13 }));
    minor(ymin, ymax, stepY, (v) => out.lines.push({ pts: [{ x: 0, y: sy(v) }, { x: w, y: sy(v) }], color: "#1B2233", width: 0.8, alpha: 0.13 }));
  }
  // eixos (na origem, ou na borda se a origem está fora)
  const ax = Math.min(w, Math.max(0, sx(0))), ay = Math.min(h, Math.max(0, sy(0)));
  out.lines.push({ pts: [{ x: 0, y: ay }, { x: w, y: ay }], color: INK, width: 1.4 });
  out.lines.push({ pts: [{ x: ax, y: h }, { x: ax, y: 0 }], color: INK, width: 1.4 });
  out.arrows.push({ from: { x: 0, y: ay }, to: { x: w, y: ay }, color: INK, size: 8 });
  out.arrows.push({ from: { x: ax, y: h }, to: { x: ax, y: 0 }, color: INK, size: 8 });
  out.texts.push({ x: w - 4, y: ay - 6, text: "x", size: 14, color: INK, anchor: "end", base: "bottom", bold: true });
  out.texts.push({ x: ax + 8, y: 4, text: "y", size: 14, color: INK, anchor: "start", base: "top", bold: true });
  for (let v = Math.ceil(xmin / stepX) * stepX; v <= xmax + 1e-9; v += stepX) {
    if (Math.abs(v) < stepX / 1000) continue;
    const x = sx(v);
    out.lines.push({ pts: [{ x, y: ay - 3 }, { x, y: ay + 3 }], color: INK, width: 1 });
    if (x > 8 && x < w - 14) out.texts.push({ x, y: Math.min(h - 2, ay + 5), text: fmt(Number(v.toPrecision(10)), 6), size: 11, color: SOFT, anchor: "middle", base: ay + 18 > h ? "bottom" : "top" });
  }
  for (let v = Math.ceil(ymin / stepY) * stepY; v <= ymax + 1e-9; v += stepY) {
    if (Math.abs(v) < stepY / 1000) continue;
    const y = sy(v);
    out.lines.push({ pts: [{ x: ax - 3, y }, { x: ax + 3, y }], color: INK, width: 1 });
    if (y > 14 && y < h - 8) out.texts.push({ x: ax - 5 < 20 ? ax + 6 : ax - 5, y, text: fmt(Number(v.toPrecision(10)), 6), size: 11, color: SOFT, anchor: ax - 5 < 20 ? "start" : "end", base: "middle" });
  }
  // funções
  const N = Math.max(240, Math.round(w * 1.5));
  spec.fns.forEach((fn, idx) => {
    if (!fn.expr.trim()) return;
    let f: (x: number) => number;
    try { f = compile(fn.expr); } catch (e) { out.errors.push(`f${idx + 1}: ${e instanceof Error ? e.message : "inválida"}`); return; }
    let poly: P[] = [];
    let prev: P | null = null;
    const flush = () => { if (poly.length > 1) out.lines.push({ pts: poly, color: fn.color, width: 2.4 }); poly = []; };
    for (let i = 0; i <= N; i++) {
      const x = xmin + ((xmax - xmin) * i) / N;
      const y = f(x);
      if (!Number.isFinite(y)) { flush(); prev = null; continue; }
      const p = { x: sx(x), y: sy(y) };
      if (prev) {
        if (Math.abs(p.y - prev.y) > h * 3) { flush(); prev = p; continue; } // assíntota (tan, 1/x)
        const c = clipSeg(prev, p, w, h);
        if (c) {
          if (!poly.length || Math.hypot(poly[poly.length - 1].x - c[0].x, poly[poly.length - 1].y - c[0].y) > 0.01) { flush(); poly.push(c[0]); }
          poly.push(c[1]);
          if (c[1].x !== p.x || c[1].y !== p.y) flush();
        } else flush();
      }
      prev = p;
    }
    flush();
    // legenda
    out.texts.push({ x: 8, y: 8 + idx * 18, text: `f${idx + 1}(x) = ${fn.expr.replace(/^\s*(y|f\(x\))\s*=\s*/i, "")}`, size: 12, color: fn.color, anchor: "start", base: "top", bold: true });
  });
  for (const p of spec.points) {
    const x = sx(p.x), y = sy(p.y);
    if (x < 0 || x > w || y < 0 || y > h) continue;
    out.dots.push({ x, y, r: 4, color: "#D2453A" });
    out.texts.push({ x: x + 6, y: y - 6, text: p.label ?? `(${fmt(p.x, 4)}; ${fmt(p.y, 4)})`, size: 12, color: INK, anchor: "start", base: "bottom" });
  }
  out.lines.push({ pts: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], color: "#C9D1DE", width: 1, closed: true });
  return out;
}

function numberlinePrims(spec: Extract<FigureSpec, { kind: "numberline" }>, w: number, h: number): FigPrims {
  const out = empty();
  const pad = 22, y = h / 2;
  const sx = (v: number) => pad + ((v - spec.min) / (spec.max - spec.min)) * (w - 2 * pad);
  out.lines.push({ pts: [{ x: 4, y }, { x: w - 4, y }], color: spec.color, width: 2 });
  out.arrows.push({ from: { x: w / 2, y }, to: { x: w - 4, y }, color: spec.color, size: 9 });
  out.arrows.push({ from: { x: w / 2, y }, to: { x: 4, y }, color: spec.color, size: 9 });
  const count = Math.floor((spec.max - spec.min) / spec.step + 1e-9);
  const every = Math.max(1, Math.ceil(count / Math.max(2, (w - 2 * pad) / 34)));
  for (let i = 0; i <= count; i++) {
    const v = spec.min + i * spec.step;
    const x = sx(v);
    const major = i % every === 0;
    out.lines.push({ pts: [{ x, y: y - (major ? 7 : 4) }, { x, y: y + (major ? 7 : 4) }], color: spec.color, width: major ? 1.6 : 1 });
    if (major) out.texts.push({ x, y: y + 11, text: fmt(Number(v.toPrecision(10)), 6), size: 13, color: Math.abs(v) < 1e-9 ? INK : SOFT, anchor: "middle", base: "top", bold: Math.abs(v) < 1e-9 });
  }
  return out;
}

const NOTABLE = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];
const RAD: Record<number, string> = { 0: "0", 30: "π/6", 45: "π/4", 60: "π/3", 90: "π/2", 120: "2π/3", 135: "3π/4", 150: "5π/6", 180: "π", 210: "7π/6", 225: "5π/4", 240: "4π/3", 270: "3π/2", 300: "5π/3", 315: "7π/4", 330: "11π/6" };

function unitCirclePrims(spec: Extract<FigureSpec, { kind: "unitcircle" }>, w: number, h: number): FigPrims {
  const out = empty();
  const R = Math.min(w, h) / 2 - 44;
  const cx = w / 2, cy = h / 2;
  const circle = Array.from({ length: 96 }, (_, i) => ({ x: cx + Math.cos((i / 96) * Math.PI * 2) * R, y: cy + Math.sin((i / 96) * Math.PI * 2) * R }));
  out.polys.push({ pts: circle, fill: spec.color, alpha: 0.06 });
  out.lines.push({ pts: [{ x: cx - R - 22, y: cy }, { x: cx + R + 22, y: cy }], color: INK, width: 1.3 });
  out.lines.push({ pts: [{ x: cx, y: cy + R + 22 }, { x: cx, y: cy - R - 22 }], color: INK, width: 1.3 });
  out.arrows.push({ from: { x: cx, y: cy }, to: { x: cx + R + 22, y: cy }, color: INK, size: 8 });
  out.arrows.push({ from: { x: cx, y: cy }, to: { x: cx, y: cy - R - 22 }, color: INK, size: 8 });
  out.texts.push({ x: cx + R + 20, y: cy + 6, text: "cos", size: 12, color: SOFT, anchor: "end", base: "top" });
  out.texts.push({ x: cx + 6, y: cy - R - 20, text: "sen", size: 12, color: SOFT, anchor: "start", base: "top" });
  out.lines.push({ pts: circle, color: spec.color, width: 2.2, closed: true });
  for (const d of NOTABLE) {
    const a = (d * Math.PI) / 180;
    const x = cx + Math.cos(a) * R, y = cy - Math.sin(a) * R;
    if (d % 90 !== 0) out.lines.push({ pts: [{ x: cx, y: cy }, { x, y }], color: spec.color, width: 0.8, alpha: 0.3 });
    out.dots.push({ x, y, r: 3.2, color: spec.color });
    const lx = cx + Math.cos(a) * (R + 22), ly = cy - Math.sin(a) * (R + 22);
    out.texts.push({ x: lx, y: ly, text: spec.radians ? RAD[d] : `${d}°`, size: 12, color: INK, anchor: "middle", base: "middle" });
  }
  out.texts.push({ x: cx + R / 2, y: cy + 4, text: "1", size: 12, color: SOFT, anchor: "middle", base: "top" });
  return out;
}

function protractorPrims(spec: Extract<FigureSpec, { kind: "protractor" }>, w: number, h: number): FigPrims {
  const out = empty();
  const R = Math.min(w / 2 - 10, h - 24);
  const cx = w / 2, cy = h - 14;
  const arc = Array.from({ length: 91 }, (_, i) => ({ x: cx + Math.cos(Math.PI - (i / 90) * Math.PI) * R, y: cy - Math.sin(Math.PI - (i / 90) * Math.PI) * R }));
  out.polys.push({ pts: [...arc, { x: cx + R, y: cy }], fill: spec.color, alpha: 0.08 });
  out.lines.push({ pts: [...arc], color: spec.color, width: 2 });
  out.lines.push({ pts: [{ x: cx - R, y: cy }, { x: cx + R, y: cy }], color: spec.color, width: 2 });
  for (let d = 0; d <= 180; d++) {
    const a = (d * Math.PI) / 180;
    const len = d % 10 === 0 ? 16 : d % 5 === 0 ? 10 : 5;
    const c = Math.cos(Math.PI - a), s = Math.sin(Math.PI - a);
    out.lines.push({ pts: [{ x: cx + c * R, y: cy - s * R }, { x: cx + c * (R - len), y: cy - s * (R - len) }], color: spec.color, width: d % 10 === 0 ? 1.4 : 0.8 });
    if (d % 10 === 0) out.texts.push({ x: cx + c * (R - 28), y: cy - s * (R - 28), text: String(d), size: 11, color: INK, anchor: "middle", base: "middle" });
    if (d % 30 === 0 && d > 0 && d < 180) out.texts.push({ x: cx + c * (R - 46), y: cy - s * (R - 46), text: String(180 - d), size: 9, color: SOFT, anchor: "middle", base: "middle" });
  }
  out.dots.push({ x: cx, y: cy, r: 3, color: spec.color });
  out.lines.push({ pts: [{ x: cx, y: cy }, { x: cx, y: cy - R * 0.55 }], color: spec.color, width: 1, alpha: 0.5 });
  return out;
}

/** Primitivas da figura numa caixa w×h (coordenadas locais). */
export function figurePrims(spec: FigureSpec, w: number, h: number): FigPrims {
  switch (spec.kind) {
    case "solid": return solidPrims(spec, w, h);
    case "plot": return plotPrims(spec, w, h);
    case "space": return spacePrims(spec, w, h);
    case "numberline": return numberlinePrims(spec, w, h);
    case "unitcircle": return unitCirclePrims(spec, w, h);
    case "protractor": return protractorPrims(spec, w, h);
  }
}

/** Nome para o título do anexo. */
export function figureTitle(spec: FigureSpec): string {
  if (spec.kind === "solid") return SOLIDS.find((s) => s.id === spec.solid)?.label ?? "Sólido";
  return FIGURE_KINDS.find((k) => k.id === spec.kind)?.label ?? "Figura";
}
