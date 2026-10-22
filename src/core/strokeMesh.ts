// Malha do traço de tinta. Puro: sem Pixi nem React (testável em Node).
//
// Por que NÃO é mais "um polígono de contorno" (perfect-freehand + earcut):
//  • ao girar rápido ou cruzar o próprio traço, o contorno se cruza e o triangulador (earcut) preenche o
//    miolo / falha — era o glitch do marca-texto — e fica quadrático nesses casos (a tela "trava");
//  • o contorno era refeito inteiro a cada evento, com triangulação, no custo do pior caso.
//
// Aqui o traço é uma FITA: para cada trecho um trapézio (círculo → círculo, com tangentes corretas) mais
// leques redondos nas curvas e nas pontas. Tudo são triângulos independentes: sobrepor nunca "inverte" nada,
// o custo é linear no número de pontos e o mesmo cálculo serve ao traço ao vivo, ao gravado e à pré-visualização.
import { InkPoint, StrokeDyn } from "./model";
import { DEFAULT_BRUSH_ID, brushDyn, getBrush } from "./brushes";

export interface InkStyle {
  color: string;
  /** Largura JÁ multiplicada pelo `size` do brush (é o que fica guardado em StrokeElement.width). */
  width: number;
  sens: number;
  /** Afilamento efetivo das pontas (0..1). */
  taper: number;
  brush: string;
  /** Opacidade final (brush × controle do usuário). */
  opacity: number;
  /** Dinâmica congelada; sem ela, usa a do brush registrado. */
  dyn?: StrokeDyn;
  /** Ponta cortada pela borracha de pixel: não afila e fica reta. */
  openStart?: boolean;
  openEnd?: boolean;
}

export interface StrokeMesh {
  /** Vértices RELATIVOS à origem (ox, oy): evita perder precisão em float32 longe da origem do mundo. */
  positions: Float32Array;
  indices: Uint32Array;
  ox: number;
  oy: number;
}

/** Largura máxima relativa à largura base (pressão total). Usada por seleção/hit-test como folga. */
export const MAX_WIDTH_FACTOR = 1.6;
/** Largura mínima da ponta afilada, relativa à largura (a ponta nunca vira agulha). */
const TIP_MIN = 0.2;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function dynOf(st: Pick<InkStyle, "brush" | "dyn">): StrokeDyn {
  return st.dyn ?? brushDyn(getBrush(st.brush ?? DEFAULT_BRUSH_ID));
}

interface Sample { x: number; y: number; r: number }

/** Remove amostras inválidas e repetidas (gestos curtos geravam contornos degenerados). */
export function cleanPoints(points: InkPoint[]): InkPoint[] {
  const out: InkPoint[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const q = { x: p.x, y: p.y, p: Number.isFinite(p.p) ? clamp(p.p, 0, 1) : 0.5 };
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(q.x - prev.x, q.y - prev.y) > 1e-3) out.push(q);
  }
  return out;
}

/** Fator de largura (≈ 0.2..1.6) de cada ponto, vindo da pressão (caneta) ou da velocidade (mouse/dedo). */
function widthFactors(pts: InkPoint[], w0: number, sens: number, dyn: StrokeDyn): number[] {
  const n = pts.length;
  const f = new Array<number>(n).fill(1);
  const mouse = !pts.some((p) => Math.abs(p.p - 0.5) > 1e-6);
  const minSize = clamp(dyn.minSize, 0, 1);
  if (mouse) {
    const k = clamp(dyn.simThinning, 0, 1);
    if (k > 0 && n > 1) {
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(n - 1, i + 1)];
        const d = Math.hypot(b.x - a.x, b.y - a.y) / (i === 0 || i === n - 1 ? 1 : 2);
        const s = clamp(d / (w0 * 6), 0, 1);
        f[i] = 1 - k * (1 - minSize) * (s * s * (3 - 2 * s));
      }
    }
  } else {
    const k = clamp(dyn.thinning * sens, 0, 1);
    if (k > 0) {
      const g = clamp(dyn.gamma, 0.2, 5);
      for (let i = 0; i < n; i++) {
        const pc = Math.pow(clamp(pts[i].p, 0.001, 1), g);
        f[i] = 1 + k * (lerp(minSize, MAX_WIDTH_FACTOR, pc) - 1);
      }
    }
  }
  // Suaviza nos dois sentidos (sem atraso): evita degraus de largura entre amostras.
  for (let pass = 0; pass < 2; pass++) {
    let prev = f[0];
    for (let i = 1; i < n - 1; i++) {
      const cur = f[i];
      f[i] = 0.25 * prev + 0.5 * cur + 0.25 * f[i + 1];
      prev = cur;
    }
  }
  return f;
}

/** Suavização geométrica sem atraso: as pontas ficam onde estão, o miolo perde o serrilhado do mouse. */
function relax(pts: InkPoint[], amount: number): InkPoint[] {
  const n = pts.length;
  if (n < 3 || amount <= 0) return pts;
  let cur = pts;
  const passes = amount > 0.5 ? 2 : 1;
  const k = clamp(amount, 0, 1) * 0.5;
  for (let pass = 0; pass < passes; pass++) {
    const next = cur.slice();
    for (let i = 1; i < n - 1; i++) {
      const a = cur[i - 1], b = cur[i], c = cur[i + 1];
      next[i] = { x: b.x + k * (a.x + c.x - 2 * b.x), y: b.y + k * (a.y + c.y - 2 * b.y), p: b.p };
    }
    cur = next;
  }
  return cur;
}

/** Centro + raio de cada ponto → curva suave que PASSA pelos pontos (Hermite com tangentes limitadas). */
function curveSamples(pts: InkPoint[], radii: number[]): Sample[] {
  const n = pts.length;
  if (n < 3) return pts.map((p, i) => ({ x: p.x, y: p.y, r: radii[i] }));
  const dir: Array<[number, number]> = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    dir[i] = [dx / l, dy / l];
  }
  const out: Sample[] = [{ x: pts[0].x, y: pts[0].y, r: radii[0] }];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const cx = p1.x - p0.x, cy = p1.y - p0.y;
    const L = Math.hypot(cx, cy);
    const [d0x, d0y] = dir[i], [d1x, d1y] = dir[i + 1];
    // Quanto as tangentes se afastam da corda decide quantas subdivisões o trecho precisa.
    const dev = Math.max(
      Math.acos(clamp((d0x * cx + d0y * cy) / L, -1, 1)),
      Math.acos(clamp((d1x * cx + d1y * cy) / L, -1, 1)),
    );
    const steps = dev < 0.08 ? 1 : Math.min(14, Math.ceil(dev / 0.08));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (s === steps) {
        out.push({ x: p1.x, y: p1.y, r: radii[i + 1] });
        break;
      }
      const t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push({
        x: h00 * p0.x + h10 * d0x * L + h01 * p1.x + h11 * d1x * L,
        y: h00 * p0.y + h10 * d0y * L + h01 * p1.y + h11 * d1y * L,
        r: lerp(radii[i], radii[i + 1], t),
      });
    }
  }
  return out;
}

/** Escritor de malha indexada com buffers tipados que dobram de tamanho (sem arrays de números boxed). */
class MeshWriter {
  private pos = new Float32Array(1024);
  private idx = new Uint32Array(1536);
  private nv = 0;
  private ni = 0;
  constructor(private ox: number, private oy: number) {}
  vert(x: number, y: number): number {
    if (this.nv * 2 + 2 > this.pos.length) {
      const g = new Float32Array(this.pos.length * 2);
      g.set(this.pos);
      this.pos = g;
    }
    this.pos[this.nv * 2] = x - this.ox;
    this.pos[this.nv * 2 + 1] = y - this.oy;
    return this.nv++;
  }
  tri(a: number, b: number, c: number) {
    if (this.ni + 3 > this.idx.length) {
      const g = new Uint32Array(this.idx.length * 2);
      g.set(this.idx);
      this.idx = g;
    }
    this.idx[this.ni++] = a;
    this.idx[this.ni++] = b;
    this.idx[this.ni++] = c;
  }
  /** Leque de círculo/arco: centro + pontos do ângulo a0 até a1 (passos de ~`step` rad). */
  fan(cx: number, cy: number, r: number, a0: number, a1: number, steps: number) {
    const c = this.vert(cx, cy);
    let prev = this.vert(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    for (let i = 1; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      const v = this.vert(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      this.tri(c, prev, v);
      prev = v;
    }
  }
  done(ox: number, oy: number): StrokeMesh {
    return { positions: this.pos.slice(0, this.nv * 2), indices: this.idx.slice(0, this.ni), ox, oy };
  }
}

const capSteps = (r: number) => clamp(Math.ceil(Math.sqrt(r) * 6), 8, 24);

/**
 * Malha do traço. Devolve null se não há nada a desenhar.
 * `last` é aceito por compatibilidade: ao vivo e gravado usam a MESMA geometria (nada "salta" ao soltar).
 */
export function buildStrokeMesh(points: InkPoint[], st: InkStyle): StrokeMesh | null {
  const dyn = dynOf(st);
  const clean = cleanPoints(points);
  if (!clean.length) return null;
  const w0 = Math.max(0.1, st.width);
  const ox = clean[0].x, oy = clean[0].y;
  const mw = new MeshWriter(ox, oy);

  // Toque sem arrastar (ou arraste mínimo): um pontinho.
  const span = clean.length === 1 ? 0 : Math.hypot(clean[clean.length - 1].x - clean[0].x, clean[clean.length - 1].y - clean[0].y);
  if (clean.length === 1 || (clean.length === 2 && span < w0 * 0.05)) {
    const f = widthFactors(clean, w0, st.sens, dyn)[0];
    const r = Math.max(0.05, (w0 * f) / 2);
    mw.fan(clean[0].x, clean[0].y, r, 0, Math.PI * 2, Math.max(12, capSteps(r) * 2));
    return mw.done(ox, oy);
  }

  const pts = relax(clean, dyn.smoothing);
  const f = widthFactors(pts, w0, st.sens, dyn);

  // Afilamento: comprimento limitado a 40% do traço por ponta e ponta nunca fecha em agulha (TIP_MIN).
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = cum[cum.length - 1];
  const taper = clamp(st.taper, 0, 1);
  const tlEnd = st.openEnd ? 0 : Math.min(taper * w0 * 5, total * 0.4);
  const tlStart = st.openStart ? 0 : Math.min(taper * clamp(dyn.taperStart, 0, 1) * w0 * 5, total * 0.4);
  const radii = pts.map((_, i) => {
    let m = 1;
    if (tlStart > 0 && cum[i] < tlStart) m = Math.min(m, TIP_MIN + (1 - TIP_MIN) * Math.sin((cum[i] / tlStart) * (Math.PI / 2)));
    const toEnd = total - cum[i];
    if (tlEnd > 0 && toEnd < tlEnd) m = Math.min(m, TIP_MIN + (1 - TIP_MIN) * Math.sin((toEnd / tlEnd) * (Math.PI / 2)));
    return Math.max(0.05, (w0 * f[i] * m) / 2);
  });

  // Amostras da curva (sem duplicatas para não gerar direção nula).
  const raw = curveSamples(pts, radii);
  const S: Sample[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const a = S[S.length - 1];
    if (Math.hypot(raw[i].x - a.x, raw[i].y - a.y) > 1e-4) S.push(raw[i]);
  }
  const n = S.length;
  if (n < 2) {
    mw.fan(S[0].x, S[0].y, S[0].r, 0, Math.PI * 2, Math.max(12, capSteps(S[0].r) * 2));
    return mw.done(ox, oy);
  }

  // Direção de cada trecho.
  const dx = new Array<number>(n - 1), dy = new Array<number>(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const vx = S[i + 1].x - S[i].x, vy = S[i + 1].y - S[i].y;
    const l = Math.hypot(vx, vy);
    dx[i] = vx / l;
    dy[i] = vy / l;
  }

  // Trapézios: tangentes externas entre dois círculos de raios diferentes. Guarda o ângulo das duas
  // tangentes (esquerda `angU`, direita `angV`) para que juntas e pontas continuem EXATAMENTE de onde o
  // trapézio parou (sem frestas quando o raio muda, como no afilamento).
  const angU = new Array<number>(n - 1), angV = new Array<number>(n - 1), phi = new Array<number>(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const a = S[i], b = S[i + 1];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const sinPhi = clamp((a.r - b.r) / L, -1, 1);
    const cosPhi = Math.sqrt(1 - sinPhi * sinPhi);
    phi[i] = Math.asin(sinPhi);
    // normal da esquerda (-dy, dx) girada para a tangente do par de círculos
    const ux = -dy[i] * cosPhi + dx[i] * sinPhi;
    const uy = dx[i] * cosPhi + dy[i] * sinPhi;
    const vx = dy[i] * cosPhi + dx[i] * sinPhi;
    const vy = -dx[i] * cosPhi + dy[i] * sinPhi;
    angU[i] = Math.atan2(uy, ux);
    angV[i] = Math.atan2(vy, vx);
    const a0 = mw.vert(a.x + ux * a.r, a.y + uy * a.r);
    const a1 = mw.vert(a.x + vx * a.r, a.y + vy * a.r);
    const b0 = mw.vert(b.x + ux * b.r, b.y + uy * b.r);
    const b1 = mw.vert(b.x + vx * b.r, b.y + vy * b.r);
    mw.tri(a0, a1, b0);
    mw.tri(a1, b1, b0);
    // Fatias até o centro de cada ponta: cobrem a faixa entre o fim de um trapézio e o começo do seguinte
    // (as cordas das tangentes não passam pelo centro quando o raio muda).
    if (Math.abs(sinPhi) > 1e-3) {
      const ca = mw.vert(a.x, a.y), cb = mw.vert(b.x, b.y);
      mw.tri(ca, a0, a1);
      mw.tri(cb, b0, b1);
    }
  }

  // Juntas redondas onde os trapézios vizinhos se abririam em fresta: do lado de fora da curva e também
  // onde o raio muda (afilamento). O lado oposto já se sobrepõe e não precisa de nada.
  const wrap = (a: number) => (a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a);
  const join = (i: number, from: number, sweep: number) =>
    mw.fan(S[i].x, S[i].y, S[i].r, from, from + sweep, Math.max(1, Math.ceil(Math.abs(sweep) / 0.35)));
  for (let i = 1; i < n - 1; i++) {
    const right = wrap(angV[i] - angV[i - 1]); // fresta à direita se a tangente gira no sentido anti-horário
    if (right > 0.002) join(i, angV[i - 1], right);
    const left = wrap(angU[i] - angU[i - 1]); // fresta à esquerda se gira no sentido horário
    if (left < -0.002) join(i, angU[i - 1], left);
  }

  // Pontas.
  if (dyn.round) {
    const first = S[0], last = S[n - 1];
    // começo: da tangente esquerda, passando por trás (-d), até a direita (π + 2φ)
    mw.fan(first.x, first.y, first.r, angU[0], angU[0] + Math.PI + 2 * phi[0], capSteps(first.r));
    // fim: da tangente direita, passando pela frente (+d), até a esquerda (π − 2φ)
    mw.fan(last.x, last.y, last.r, angV[n - 2], angV[n - 2] + Math.PI - 2 * phi[n - 2], capSteps(last.r));
  }
  return mw.done(ox, oy);
}

/**
 * Caminho SVG da malha (para miniaturas e pré-visualização). Todo triângulo é orientado do mesmo jeito,
 * então o preenchimento "nonzero" do SVG faz a união exata, sem buracos onde o traço se cruza.
 */
export function meshToSvgPath(m: StrokeMesh, dx = 0, dy = 0, digits = 1): string {
  const { positions: p, indices: ix } = m;
  let d = "";
  for (let i = 0; i < ix.length; i += 3) {
    let a = ix[i], b = ix[i + 1], c = ix[i + 2];
    const ax = p[a * 2], ay = p[a * 2 + 1], bx = p[b * 2], by = p[b * 2 + 1], cx = p[c * 2], cy = p[c * 2 + 1];
    if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) < 0) { const t = b; b = c; c = t; }
    d += `M${(p[a * 2] + m.ox + dx).toFixed(digits)} ${(p[a * 2 + 1] + m.oy + dy).toFixed(digits)}`
      + `L${(p[b * 2] + m.ox + dx).toFixed(digits)} ${(p[b * 2 + 1] + m.oy + dy).toFixed(digits)}`
      + `L${(p[c * 2] + m.ox + dx).toFixed(digits)} ${(p[c * 2 + 1] + m.oy + dy).toFixed(digits)}Z`;
  }
  return d;
}
