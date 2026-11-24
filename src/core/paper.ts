// Padrões de papel (folha) desenhados em espaço de TELA, com nível de detalhe por zoom. Puro: o Renderer (Pixi)
// e as miniaturas (SVG) dos painéis usam o MESMO gerador, então a prévia é exatamente o que aparece no quadro.
import { Camera } from "./camera";
import { hexToRgb } from "./color";
import { PaperKind } from "./model";

/** Camadas de traço: 0 = linha fina, 1 = linha forte (a cada 5/10), 2 = destaque (margem, eixos). */
export type PaperLayer = 0 | 1 | 2;

export interface PaperSink {
  line(x1: number, y1: number, x2: number, y2: number, layer: PaperLayer): void;
  dot(x: number, y: number, r: number): void;
}

export interface PaperOpts {
  /** Multiplicador do espaçamento (0.5 = apertado, 2 = largo). */
  scale: number;
  /** Altura da folha (caderno com páginas): o Cornell põe o resumo no rodapé. */
  sheetH?: number;
}

/** Faixa de cabeçalho (Cornell / Cabeçalho e margem) e coluna de palavras-chave do Cornell, em unidades do mundo. */
export const HEADER_Y = 108;
export const CUE_X = 210;

/** Cor das linhas: escura sobre papel claro, clara sobre papel escuro (lousa, preto, azul-marinho…). */
export function autoLineColor(bg: string): string {
  const { r, g, b } = hexToRgb(bg);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#1B2233" : "#F2F4FA";
}

/** Opacidade de cada camada (o papel escuro precisa de um pouco mais para as linhas aparecerem). */
export function layerAlpha(layer: PaperLayer | "dot", dark: boolean): number {
  const k = dark ? 1.35 : 1;
  if (layer === "dot") return 0.3 * k;
  return (layer === 0 ? 0.1 : layer === 1 ? 0.2 : 0.55) * k;
}

export const MARGIN_COLOR = "#E0565B";
/** Posição da margem vermelha do "caderno" (x do mundo). */
export const MARGIN_X = 72;

const SQ3 = Math.sqrt(3);

/** Primeiro múltiplo de `sp` (deslocado por `off`) que fica antes de 0, para varrer a tela. */
const first = (off: number, sp: number) => off - Math.ceil(off / sp) * sp;

/** Passo em mundo que vira ≥ `minPx` na tela (dobra enquanto ficar apertado demais). */
function lod(base: number, zoom: number, minPx: number): number {
  let step = base;
  let guard = 0;
  while (step * zoom < minPx && guard++ < 40) step *= 2;
  return step;
}

/** Família de retas paralelas com normal `ang` (radianos), espaçadas `sp` px na tela e passando pela origem do mundo. */
function family(cam: Camera, W: number, H: number, ang: number, sp: number, sink: PaperSink, layer: PaperLayer, every = 0) {
  const nx = Math.cos(ang), ny = Math.sin(ang);
  const dx = -ny, dy = nx;
  const o = cam.x * nx + cam.y * ny; // a origem do mundo projetada na normal
  const proj = [0 * nx + 0 * ny, W * nx, H * ny, W * nx + H * ny];
  const lo = Math.min(...proj), hi = Math.max(...proj);
  const cx = W / 2, cy = H / 2;
  const tc = cx * dx + cy * dy;
  const L = Math.hypot(W, H);
  const k0 = Math.floor((lo - o) / sp) - 1;
  const k1 = Math.ceil((hi - o) / sp) + 1;
  if (k1 - k0 > 4000) return;
  for (let k = k0; k <= k1; k++) {
    const v = o + k * sp;
    const lay = every && k % every === 0 ? 1 : layer;
    const px = nx * v + dx * tc, py = ny * v + dy * tc;
    sink.line(px - dx * L, py - dy * L, px + dx * L, py + dy * L, lay);
  }
}

/** Gera as linhas/pontos de um papel para a área de tela W×H vista pela câmera. */
export function drawPaperPattern(kind: PaperKind, cam: Camera, W: number, H: number, sink: PaperSink, opts: PaperOpts = { scale: 1 }) {
  const { x, y, zoom } = cam;
  const s = Math.max(0.25, Math.min(4, opts.scale || 1));
  if (kind === "blank") return;

  if (kind === "ruled" || kind === "margin" || kind === "header" || kind === "cornell") {
    const step = lod(36 * s, zoom, 9);
    const sp = step * zoom;
    const top = kind === "ruled" || kind === "margin" ? -Infinity : HEADER_Y * zoom + y; // sem pauta no cabeçalho
    for (let sy = first(y, sp); sy < H + sp; sy += sp) if (sy > top + 1) sink.line(0, sy, W, sy, 0);
    if (kind !== "ruled") {
      const mx = (kind === "cornell" ? CUE_X : MARGIN_X) * zoom + x;
      const y0 = Math.max(0, kind === "margin" ? 0 : top);
      if (mx > -2 && mx < W + 2 && y0 < H) sink.line(mx, y0, mx, H, 2);
    }
    if (kind === "header" || kind === "cornell") {
      if (top > -2 && top < H + 2) sink.line(0, top, W, top, 2);
      if (kind === "cornell" && opts.sheetH) {
        const by = (opts.sheetH - 220) * zoom + y; // resumo: os últimos ~220 do mundo
        if (by > -2 && by < H + 2) sink.line(0, by, W, by, 2);
      }
    }
    return;
  }

  if (kind === "calligraphy") {
    // blocos de 4 linhas (ascendente, altura-x, base, descendente) + guias inclinadas a ~65°
    const block = 96 * s;
    if (block * zoom < 10) return;
    const sp = block * zoom;
    const offs: [number, PaperLayer][] = [[0, 0], [0.3, 0], [0.62, 1], [0.86, 0]];
    for (let sy = first(y, sp); sy < H + sp; sy += sp) for (const [o, l] of offs) sink.line(0, sy + o * sp, W, sy + o * sp, l);
    const g = lod(48 * s, zoom, 16) * zoom;
    family(cam, W, H, 0.44, g * Math.cos(0.44), sink, 0);
    return;
  }

  if (kind === "dots") {
    const sp = lod(32 * s, zoom, 14) * zoom;
    if ((W / sp) * (H / sp) > 40000) return;
    for (let sx = first(x, sp); sx < W + sp; sx += sp) for (let sy = first(y, sp); sy < H + sp; sy += sp) sink.dot(sx, sy, 1.3);
    return;
  }

  if (kind === "grid" || kind === "cartesian" || kind === "mm") {
    // milimetrado: célula pequena (8) com linha forte a cada 5 e a cada 10; nos outros, a cada 5
    const base = kind === "mm" ? 8 * s : 32 * s;
    const step = lod(base, zoom, kind === "mm" ? 6 : 9);
    const sp = step * zoom;
    const majorEvery = 5;
    const fx = first(x, sp), fy = first(y, sp);
    for (let sx = fx; sx < W + sp; sx += sp) {
      const i = Math.round((sx - x) / sp);
      sink.line(sx, 0, sx, H, i % majorEvery === 0 ? 1 : 0);
    }
    for (let sy = fy; sy < H + sp; sy += sp) {
      const j = Math.round((sy - y) / sp);
      sink.line(0, sy, W, sy, j % majorEvery === 0 ? 1 : 0);
    }
    if (kind === "cartesian") {
      if (x > -2 && x < W + 2) sink.line(x, 0, x, H, 2);
      if (y > -2 && y < H + 2) sink.line(0, y, W, y, 2);
    }
    return;
  }

  if (kind === "iso") {
    // grade triangular (isométrica): verticais + retas a 30° e 150°
    const a = lod(32 * s, zoom, 12);
    const h = (a * SQ3) / 2 * zoom;
    family(cam, W, H, 0, h, sink, 0);
    family(cam, W, H, (2 * Math.PI) / 3, h, sink, 0);
    family(cam, W, H, (4 * Math.PI) / 3, h, sink, 0);
    return;
  }

  if (kind === "isodots") {
    const a = lod(32 * s, zoom, 14);
    const ax = a * zoom, ay = ((a * SQ3) / 2) * zoom;
    if ((W / ax) * (H / ay) > 40000) return;
    const j0 = Math.floor(-y / ay) - 1, j1 = Math.ceil((H - y) / ay) + 1;
    for (let j = j0; j <= j1; j++) {
      const sy = y + j * ay;
      const shift = (((j % 2) + 2) % 2) * (ax / 2);
      for (let sx = first(x + shift, ax); sx < W + ax; sx += ax) sink.dot(sx, sy, 1.3);
    }
    return;
  }

  if (kind === "hex") {
    // hexágonos de topo chato; cada hexágono desenha 3 arestas (as outras 3 são do vizinho): nenhuma aresta sai dobrada
    const r = lod(20 * s, zoom, 8) * zoom;
    const cw = 1.5 * r, ch = SQ3 * r;
    const i0 = Math.floor(-x / cw) - 2, i1 = Math.ceil((W - x) / cw) + 2;
    if ((i1 - i0) * (H / ch) > 20000) return;
    const vx = [1, 0.5, -0.5, -1, -0.5, 0.5].map((v) => v * r);
    const vy = [0, SQ3 / 2, SQ3 / 2, 0, -SQ3 / 2, -SQ3 / 2].map((v) => v * r);
    for (let i = i0; i <= i1; i++) {
      const cx = x + i * cw;
      const off = ((i % 2) + 2) % 2 ? ch / 2 : 0;
      const j0 = Math.floor((-y - off) / ch) - 2, j1 = Math.ceil((H - y - off) / ch) + 2;
      for (let j = j0; j <= j1; j++) {
        const cy = y + off + j * ch;
        for (const k of [0, 1, 2]) sink.line(cx + vx[k], cy + vy[k], cx + vx[k + 1], cy + vy[k + 1], 0);
      }
    }
    return;
  }

  if (kind === "music") {
    // pautas de 5 linhas (espaço 9) separadas por 54 (unidades do mundo)
    const gap = 9 * s, block = 90 * s;
    if (gap * zoom < 2.5) return;
    const sp = block * zoom;
    for (let sy = first(y, sp); sy < H + sp; sy += sp) {
      for (let k = 0; k < 5; k++) {
        const ly = sy + k * gap * zoom;
        sink.line(0, ly, W, ly, 1);
      }
    }
  }
}

/** Monta o desenho como caminhos SVG (miniaturas dos painéis). */
export function paperSvgPaths(kind: PaperKind, W: number, H: number, scale: number, zoom = 0.55): { thin: string; bold: string; accent: string; dots: string } {
  const p = { thin: "", bold: "", accent: "", dots: "" };
  const f = (v: number) => v.toFixed(1);
  // Cornell/cabeçalho: a prévia mostra o canto de cima da folha (cabeçalho, coluna e resumo), não o meio do mundo.
  const top = kind === "cornell" || kind === "header";
  const cam = top ? { x: kind === "cornell" ? W * 0.32 - CUE_X * zoom : W * 0.14 - MARGIN_X * zoom, y: H * 0.2 - HEADER_Y * zoom, zoom } : { x: W / 2, y: H / 2, zoom };
  drawPaperPattern(kind, cam, W, H, {
    line(x1, y1, x2, y2, layer) {
      const d = `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
      if (layer === 0) p.thin += d; else if (layer === 1) p.bold += d; else p.accent += d;
    },
    dot(x, y, r) { p.dots += `M${f(x - r)} ${f(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`; },
  }, { scale, sheetH: top ? (H * 0.8 - cam.y) / zoom + 220 : undefined });
  return p;
}
