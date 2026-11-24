// Motores de pincel (0.17). Puro: sem Pixi nem React.
//
// Um "motor" junta as três coisas que fazem um app de desenho ter a "mão" que tem:
//  1. ESTABILIZADOR — como a ponta segue o cursor (filtro adaptativo do GoodNotes, média ponderada e janela do Krita,
//     corda puxada do Photoshop, média + pós-correção do Clip Studio);
//  2. DINÂMICA — curva de pressão, pressão → espessura/opacidade, velocidade → espessura e a ENTRADA do traço
//     (a pressão cresce com a distância percorrida, então segurar a caneta parada no começo não vira uma "bola");
//  3. PONTA — fita vetorial contínua (fluida, sem serrilhado) ou CARIMBOS (dabs) com espaçamento, dureza, fluxo,
//     arredondamento e ângulo, como o motor de pixel do Krita, o pincel redondo do Photoshop e os pincéis do CSP.
//
// Implementado a partir do comportamento documentado desses apps (Krita é open source; nada foi copiado de código
// proprietário). O traço GUARDA a dinâmica e a ponta usadas (StrokeDyn): trocar de motor não muda o que já foi feito.

export type EngineId = "fluid" | "krita" | "photoshop" | "csp" | "custom";
export type Stabilizer = "none" | "adaptive" | "weighted" | "window" | "string";
export type PressureCurve = "linear" | "soft" | "firm" | "s";
export type RenderMode = "ribbon" | "dab";

export interface EngineCfg {
  /** Fita vetorial (fluida) ou carimbos. Pincéis que só funcionam de um jeito (marca-texto) ignoram. */
  render: RenderMode;
  stabilizer: Stabilizer;
  /** Força do estabilizador (0..1); somada ao controle "Estabilizar" da barra. */
  stabBoost: number;
  /** Ao soltar, a ponta alcança o cursor (linha de chegada do Krita / "catch-up" do Photoshop). */
  catchUp: boolean;
  curve: PressureCurve;
  /** Entrada: distância (em larguras do traço) até a pressão valer inteira. 0 = sem rampa. */
  rampIn: number;
  /** Velocidade → espessura com caneta (−1 rápido = mais fino … +1 rápido = mais grosso). */
  speedSize: number;
  /** Pós-correção do caminho (0..1), como a do Clip Studio. */
  postSmooth: number;
  /** Pressão → opacidade dos carimbos (0..1). */
  pressureOpacity: number;
}

export interface EngineDef { id: EngineId; label: string; like: string; hint: string; cfg: EngineCfg }

export const ENGINES: EngineDef[] = [
  {
    id: "fluid", label: "Fluido", like: "GoodNotes / Notability",
    hint: "Prioriza a fluidez: fita vetorial lisa, filtro adaptativo que quase não atrasa, entrada suave (sem bolinha no começo) e leve afinamento com a velocidade, como tinta.",
    cfg: { render: "ribbon", stabilizer: "adaptive", stabBoost: 0.15, catchUp: true, curve: "soft", rampIn: 1.6, speedSize: -0.25, postSmooth: 0.5, pressureOpacity: 0 },
  },
  {
    id: "krita", label: "Krita", like: "Motor de pixel do Krita",
    hint: "Carimbos com espaçamento, suavização ponderada pela distância (a do Krita) e pressão linear. Ótimo para desenho e pintura.",
    cfg: { render: "dab", stabilizer: "weighted", stabBoost: 0.1, catchUp: true, curve: "linear", rampIn: 0.5, speedSize: 0, postSmooth: 0, pressureOpacity: 0 },
  },
  {
    id: "photoshop", label: "Photoshop", like: "Pincel redondo + suavização",
    hint: "Carimbos e a suavização de \"corda puxada\": a ponta só anda quando o cursor se afasta mais que o raio da corda. Linhas retas e firmes.",
    cfg: { render: "dab", stabilizer: "string", stabBoost: 0.1, catchUp: true, curve: "linear", rampIn: 0.4, speedSize: 0, postSmooth: 0, pressureOpacity: 0 },
  },
  {
    id: "csp", label: "Clip Studio", like: "Caneta/pincel do CSP",
    hint: "Estabilização por média das últimas amostras + pós-correção, curva de pressão em S. Lineart limpo para HQ e mangá.",
    cfg: { render: "dab", stabilizer: "window", stabBoost: 0.2, catchUp: true, curve: "s", rampIn: 0.8, speedSize: 0, postSmooth: 0.35, pressureOpacity: 0 },
  },
];
export const DEFAULT_ENGINE: EngineId = "fluid";
export const engineDef = (id: EngineId) => ENGINES.find((e) => e.id === id) ?? ENGINES[0];

export const STABILIZERS: { id: Stabilizer; label: string; hint: string }[] = [
  { id: "none", label: "Nenhum", hint: "A ponta cola no cursor" },
  { id: "adaptive", label: "Adaptativo", hint: "Filtro One Euro: liso devagar, sem atraso rápido (GoodNotes)" },
  { id: "weighted", label: "Ponderado", hint: "Média ponderada pela distância (Krita)" },
  { id: "window", label: "Média", hint: "Média das últimas amostras (Krita estabilizador / CSP)" },
  { id: "string", label: "Corda", hint: "Corda puxada: a ponta só anda além do raio (Photoshop / lazy nudge)" },
];
export const CURVES: { id: PressureCurve; label: string }[] = [
  { id: "linear", label: "Linear" }, { id: "soft", label: "Macia" }, { id: "firm", label: "Firme" }, { id: "s", label: "Em S" },
];

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : d);

export function cleanEngineCfg(raw: unknown, base: EngineCfg = ENGINES[0].cfg): EngineCfg {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (raw && typeof raw === "object" ? raw : {}) as any;
  return {
    render: r.render === "dab" || r.render === "ribbon" ? r.render : base.render,
    stabilizer: STABILIZERS.some((s) => s.id === r.stabilizer) ? r.stabilizer : base.stabilizer,
    stabBoost: num(r.stabBoost, base.stabBoost, 0, 1),
    catchUp: typeof r.catchUp === "boolean" ? r.catchUp : base.catchUp,
    curve: CURVES.some((c) => c.id === r.curve) ? r.curve : base.curve,
    rampIn: num(r.rampIn, base.rampIn, 0, 6),
    speedSize: num(r.speedSize, base.speedSize, -1, 1),
    postSmooth: num(r.postSmooth, base.postSmooth, 0, 1),
    pressureOpacity: num(r.pressureOpacity, base.pressureOpacity, 0, 1),
  };
}

// ---------- curva de pressão ----------

/** Aplica a curva (0..1 → 0..1). */
export function pressureCurve(p: number, c: PressureCurve | undefined): number {
  const x = clamp(p, 0, 1);
  switch (c) {
    case "soft": return 1 - (1 - x) * (1 - x);          // engrossa com pouca força
    case "firm": return x * x;                           // precisa apertar
    case "s": return x * x * (3 - 2 * x);                // controle fino no meio
    default: return x;
  }
}

/**
 * Entrada do traço: multiplica a pressão por uma rampa que vai de ~0.35 a 1 ao longo de `rampIn` larguras de
 * caminho percorrido. Segurar a caneta parada no começo não engrossa nada (não anda → não cresce).
 */
export function rampFactors(pts: { x: number; y: number }[], width: number, rampIn: number): number[] {
  const n = pts.length, out = new Array<number>(n).fill(1);
  if (!(rampIn > 0) || n < 2) return out;
  const L = Math.max(1e-6, rampIn * width);
  let cum = 0;
  for (let i = 0; i < n; i++) {
    if (i) cum += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const t = clamp(cum / L, 0, 1);
    out[i] = 0.35 + 0.65 * (t * t * (3 - 2 * t));
  }
  return out;
}

// ---------- estabilizadores (entrada em pixels de TELA) ----------

export interface RawSample { x: number; y: number; p: number; t: number }

export interface StabilizerState {
  /** Nova amostra crua → zero, um ou mais pontos estabilizados. */
  push(s: RawSample): RawSample[];
  /** Fim do traço: os pontos que faltam até a ponta alcançar `s` (se catch-up). */
  finish(s: RawSample, catchUp: boolean): RawSample[];
}

/** One Euro (Casiez): mesmo filtro do motor antigo, agora como estabilizador "adaptativo". */
function oneEuro(minCutoff: number, beta: number) {
  const alpha = (c: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * c) / dt);
  let started = false, px = 0, py = 0, dx = 0, dy = 0, rx = 0, ry = 0, pt = 0;
  return (s: RawSample): RawSample => {
    if (!started) { started = true; px = rx = s.x; py = ry = s.y; pt = s.t; return s; }
    const dt = Math.max(1e-3, (s.t - pt) / 1000); pt = s.t;
    const ad = alpha(1.5, dt);
    dx = ad * ((s.x - rx) / dt) + (1 - ad) * dx; dy = ad * ((s.y - ry) / dt) + (1 - ad) * dy;
    rx = s.x; ry = s.y;
    const speed = Math.hypot(dx, dy);
    const a = alpha(minCutoff + beta * speed, dt);
    px = a * s.x + (1 - a) * px; py = a * s.y + (1 - a) * py;
    return { x: px, y: py, p: s.p, t: s.t };
  };
}

/**
 * Cria o estabilizador. `amount` 0..1 (já com o reforço do motor). Todos devolvem pontos em ordem e terminam,
 * com catch-up, exatamente onde a caneta soltou.
 */
export function makeStabilizer(kind: Stabilizer, amount: number): StabilizerState {
  const a = clamp(amount, 0, 1);
  let last: RawSample | null = null;
  const done = (s: RawSample, catchUp: boolean, emit: RawSample[] = []): RawSample[] => {
    if (!catchUp || !last) return emit;
    // alcança o cursor em passos curtos (sem pular): a ponta "chega" sem um traço reto artificial longo
    const d = Math.hypot(s.x - last.x, s.y - last.y);
    const steps = Math.min(12, Math.ceil(d / 3));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      emit.push({ x: last.x + (s.x - last.x) * t, y: last.y + (s.y - last.y) * t, p: last.p + (s.p - last.p) * t, t: s.t });
    }
    return emit;
  };
  if (kind === "none" || a < 0.02) {
    return { push: (s) => [s], finish: () => [] };
  }
  if (kind === "adaptive") {
    const f = oneEuro(28 - 25.5 * a, 0.045 + 0.03 * a);
    return { push: (s) => [(last = f(s))], finish: (s, c) => done(s, c) };
  }
  if (kind === "weighted") {
    // Krita "ponderado": quanto menor o passo em relação à distância de suavização, mais a ponta segura.
    const dist = 4 + 60 * a;
    return {
      push: (s) => {
        if (!last) return [(last = s)];
        const d = Math.hypot(s.x - last.x, s.y - last.y);
        const w = clamp(d / dist, 0.06, 1) * (1 - 0.6 * a) + 0.06;
        last = { x: last.x + (s.x - last.x) * Math.min(1, w), y: last.y + (s.y - last.y) * Math.min(1, w), p: last.p + (s.p - last.p) * 0.5, t: s.t };
        return [last];
      },
      finish: (s, c) => done(s, c),
    };
  }
  if (kind === "window") {
    // média ponderada (gaussiana) das últimas N amostras — o "estabilizador" do Krita e a estabilização do CSP
    const N = Math.max(2, Math.round(3 + 26 * a));
    const buf: RawSample[] = [];
    return {
      push: (s) => {
        buf.push(s);
        if (buf.length > N) buf.shift();
        let sx = 0, sy = 0, sp = 0, sw = 0;
        for (let i = 0; i < buf.length; i++) {
          const k = Math.exp(-(((buf.length - 1 - i) / N) ** 2) * 2);
          sx += buf[i].x * k; sy += buf[i].y * k; sp += buf[i].p * k; sw += k;
        }
        last = { x: sx / sw, y: sy / sw, p: sp / sw, t: s.t };
        return [last];
      },
      finish: (s, c) => done(s, c),
    };
  }
  // "string": corda puxada (Photoshop / lazy nudge). A ponta fica parada dentro do raio e, fora dele, é arrastada.
  const R = 2 + 38 * a;
  return {
    push: (s) => {
      if (!last) return [(last = s)];
      const dx = s.x - last.x, dy = s.y - last.y, d = Math.hypot(dx, dy);
      if (d <= R) { last = { ...last, p: last.p + (s.p - last.p) * 0.3 }; return []; }
      const k = (d - R) / d;
      last = { x: last.x + dx * k, y: last.y + dy * k, p: s.p, t: s.t };
      return [last];
    },
    finish: (s, c) => done(s, c),
  };
}

// ---------- ponta de carimbos (dabs) ----------

export interface DabTip {
  /** Espaçamento entre carimbos (fração do diâmetro). */
  spacing: number;
  /** 0 = borda macia (aerógrafo) … 1 = borda dura. */
  hardness: number;
  /** Opacidade de CADA carimbo (acumula onde se sobrepõem, como o fluxo do Photoshop/Krita). */
  flow: number;
  /** 1 = redonda, menor = achatada (pena de caligrafia). */
  roundness: number;
  /** Ângulo da ponta achatada (graus). */
  angle: number;
  /** A ponta gira com a direção do traço. */
  follow: boolean;
  /** Variação aleatória do tamanho (0..1), com semente fixa por traço (desenha igual sempre). */
  jitter: number;
}
export const DEFAULT_TIP: DabTip = { spacing: 0.08, hardness: 0.88, flow: 1, roundness: 1, angle: 0, follow: false, jitter: 0 };

export function cleanTip(raw: unknown, base: DabTip = DEFAULT_TIP): DabTip {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (raw && typeof raw === "object" ? raw : {}) as any;
  return {
    spacing: num(r.spacing, base.spacing, 0.02, 2), hardness: num(r.hardness, base.hardness, 0, 1), flow: num(r.flow, base.flow, 0.01, 1),
    roundness: num(r.roundness, base.roundness, 0.05, 1), angle: num(r.angle, base.angle, -180, 180),
    follow: typeof r.follow === "boolean" ? r.follow : base.follow, jitter: num(r.jitter, base.jitter, 0, 1),
  };
}

export interface Dab { x: number; y: number; r: number; a: number; rot: number }

/** Números pseudoaleatórios estáveis (mulberry32) a partir de uma semente. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Carimbos ao longo de amostras com raio (centro + raio já com pressão/afilamento) e alfa por amostra.
 * Anda pelo caminho e põe um carimbo a cada `spacing × diâmetro` (mínimo 0.3 px do mundo), interpolando raio e alfa.
 */
export function dabsAlong(samples: { x: number; y: number; r: number; a: number }[], tip: DabTip, seed = 1): Dab[] {
  const out: Dab[] = [];
  if (!samples.length) return out;
  const rnd = rng(seed);
  const base = (tip.angle * Math.PI) / 180;
  const jit = (r: number) => (tip.jitter > 0 ? r * (1 - tip.jitter * 0.6 * rnd()) : r);
  const first = samples[0];
  let dir = 0;
  if (samples.length > 1) dir = Math.atan2(samples[1].y - first.y, samples[1].x - first.x);
  out.push({ x: first.x, y: first.y, r: jit(first.r), a: first.a, rot: tip.follow ? dir + base : base });
  let carry = 0; // distância andada desde o último carimbo
  for (let i = 1; i < samples.length; i++) {
    const p = samples[i - 1], q = samples[i];
    const seg = Math.hypot(q.x - p.x, q.y - p.y);
    if (seg < 1e-6) continue;
    dir = Math.atan2(q.y - p.y, q.x - p.x);
    let t = 0;
    for (let guard = 0; guard < 10000; guard++) {
      const r = p.r + (q.r - p.r) * t;
      const step = Math.max(0.3, 2 * r * tip.spacing);
      const need = step - carry;
      const left = seg * (1 - t);
      if (need > left) { carry += left; break; }
      t += need / seg;
      carry = 0;
      const rr = p.r + (q.r - p.r) * t;
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, r: jit(rr), a: p.a + (q.a - p.a) * t, rot: tip.follow ? dir + base : base });
    }
  }
  return out;
}
