// Exportação (0.16): elementos → SVG (texto de verdade, imagens embutidas, papel opcional). Sem Pixi: serve para SVG,
// e — desenhado num <canvas> — para PNG, JPEG e PDF. O mesmo desenho das prévias (ElementsPreview), em texto.
import { HirakuElement, Layer, LinearElement, Page, isLinear } from "../core/model";
import { clipUnits, cssBlend } from "../core/layerPro";
import { linearPath } from "../core/linear";
import { autoLineColor, drawPaperPattern, layerAlpha, MARGIN_COLOR } from "../core/paper";
import { Bounds, elementBounds } from "../core/selection";
import { shapePath } from "../core/shapes";
import { FONT_CSS, LINE_HEIGHT } from "../core/text";
import { safeColor } from "./svgThumb";
import { figureSvg } from "./figureSvg";
import { blockSvg } from "./blockDraw";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f = (n: number) => (Math.round(n * 10) / 10).toString();
const d = (pts: { x: number; y: number }[], close = true) => pts.map((p, i) => `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`).join("") + (close ? "Z" : "");
const op = (o: number | undefined) => (o !== undefined && o < 1 ? ` opacity="${f(o)}"` : "");

function arrowHead(el: LinearElement, end: boolean): string {
  const path = linearPath(el);
  if (path.length < 2) return "";
  const a = end ? path[path.length - 2] : path[1], b = end ? path[path.length - 1] : path[0];
  const ang = Math.atan2(b.y - a.y, b.x - a.x), s = 8 + el.strokeWidth * 2;
  const p1 = { x: b.x - Math.cos(ang - 0.45) * s, y: b.y - Math.sin(ang - 0.45) * s }, p2 = { x: b.x - Math.cos(ang + 0.45) * s, y: b.y - Math.sin(ang + 0.45) * s };
  return `<path d="${d([p1, b, p2])}" fill="${safeColor(el.stroke, "#1B2233")}"/>`;
}

/** Traço com a pressão: trechos de ~6 pontos, cada um com a largura média da pressão dele. */
function strokeSvg(el: Extract<HirakuElement, { type: "stroke" }>): string {
  const pts = el.points, c = safeColor(el.color, "#1B2233");
  const blend = el.dyn?.blend === "multiply" ? ` style="mix-blend-mode:multiply"` : "";
  if (pts.length < 2) return pts.length ? `<circle cx="${f(pts[0].x)}" cy="${f(pts[0].y)}" r="${f(el.width / 2)}" fill="${c}"${op(el.opacity)}/>` : "";
  if (!el.sens || pts.length < 8) return `<path d="${d(pts, false)}" fill="none" stroke="${c}" stroke-width="${f(el.width)}" stroke-linecap="round" stroke-linejoin="round"${op(el.opacity)}${blend}/>`;
  const parts: string[] = [];
  for (let i = 0; i < pts.length - 1; i += 5) {
    const seg = pts.slice(i, Math.min(pts.length, i + 6));
    const p = seg.reduce((a, q) => a + q.p, 0) / seg.length;
    const w = el.width * (1 - el.sens * 0.6 + el.sens * 0.6 * Math.min(1.6, p * 1.6));
    parts.push(`<path d="${d(seg, false)}" stroke-width="${f(Math.max(0.4, w))}"/>`);
  }
  return `<g fill="none" stroke="${c}" stroke-linecap="round" stroke-linejoin="round"${op(el.opacity)}${blend}>${parts.join("")}</g>`;
}

export function elementSvg(el: HirakuElement): string {
  if (el.invisible) return "";
  if (el.type === "stroke") return strokeSvg(el);
  if (el.type === "text") {
    const x = el.align === "center" ? el.x + el.w / 2 : el.align === "right" ? el.x + el.w : el.x;
    const anchor = el.align === "center" ? "middle" : el.align === "right" ? "end" : "start";
    const deco = [el.underline && "underline", el.strike && "line-through"].filter(Boolean).join(" ");
    const tr = el.angle ? ` transform="rotate(${f((el.angle * 180) / Math.PI)} ${f(el.x + el.w / 2)} ${f(el.y + el.h / 2)})"` : "";
    const bg = el.bg ? `<rect x="${f(el.x - 4)}" y="${f(el.y - 2)}" width="${f(el.w + 8)}" height="${f(el.h + 4)}" rx="4" fill="${safeColor(el.bg, "#FFFFFF")}"/>` : "";
    const spans = el.text.split("\n").map((l, i) => `<tspan x="${f(x)}" dy="${f(i === 0 ? el.fontSize * 0.95 : el.fontSize * (el.lineHeight ?? LINE_HEIGHT))}">${esc(l || " ")}</tspan>`).join("");
    return `<g${tr}>${bg}<text x="${f(x)}" y="${f(el.y)}" font-size="${f(el.fontSize)}" font-family="${esc(FONT_CSS[el.fontFamily])}" fill="${safeColor(el.color, "#1B2233")}" text-anchor="${anchor}"${el.bold ? ' font-weight="700"' : ""}${el.italic ? ' font-style="italic"' : ""}${deco ? ` text-decoration="${deco}"` : ""}${el.letterSpacing ? ` letter-spacing="${f(el.letterSpacing * el.fontSize)}"` : ""}${op(el.opacity)}>${spans}</text></g>`;
  }
  if (isLinear(el)) {
    const path = linearPath(el), w = el.strokeWidth, mid = path[Math.floor(path.length / 2)];
    const dash = el.strokeStyle === "dashed" ? ` stroke-dasharray="${f(w * 4)} ${f(w * 3)}"` : el.strokeStyle === "dotted" ? ` stroke-dasharray="0.1 ${f(w * 2.5)}"` : "";
    return `<g${op(el.opacity)}><path d="${d(path, false)}" fill="none" stroke="${safeColor(el.stroke, "#1B2233")}" stroke-width="${f(w)}" stroke-linecap="round"${dash}/>${el.endHead !== "none" ? arrowHead(el, true) : ""}${el.startHead !== "none" ? arrowHead(el, false) : ""}${el.label && mid ? `<text x="${f(mid.x)}" y="${f(mid.y - 6)}" font-size="14" text-anchor="middle" fill="#1B2233" stroke="#FFFFFF" stroke-width="4" paint-order="stroke" font-family="Inter, sans-serif">${esc(el.label)}</text>` : ""}</g>`;
  }
  if (el.type === "frame") {
    const c = safeColor(el.color, "#5E6B7E");
    return `<g${op(el.opacity)}><rect x="${f(el.x)}" y="${f(el.y)}" width="${f(el.w)}" height="${f(el.h)}" rx="${el.rounded ? 8 : 0}" fill="${c}" fill-opacity="${f(el.tint)}" stroke="${c}" stroke-width="${f(el.strokeWidth)}"/><text x="${f(el.x + 2)}" y="${f(el.y - 8)}" font-size="15" font-weight="600" fill="${c}" font-family="Inter, sans-serif">${esc(el.title)}</text></g>`;
  }
  if (el.type === "node") {
    if (el.hidden) return "";
    const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
    const body = el.shape !== "none" && el.shape !== "underline" ? `<path d="${d(shapePath(el))}" fill="${el.fill ? safeColor(el.fill, "none") : "none"}" stroke="${el.stroke ? safeColor(el.stroke, "none") : "none"}" stroke-width="${f(el.strokeWidth)}"/>` : el.shape === "underline" ? `<path d="M${f(el.x)} ${f(el.y + el.h)}H${f(el.x + el.w)}" stroke="${safeColor(el.branchColor, "#2F4B8F")}" stroke-width="${f(el.strokeWidth)}"/>` : "";
    return `<g${op(el.opacity)}>${body}<text x="${f(cx)}" y="${f(cy)}" font-size="${f(el.fontSize)}" font-family="${esc(FONT_CSS[el.fontFamily])}" fill="${safeColor(el.color, "#1B2233")}" text-anchor="middle" dominant-baseline="central">${esc((el.icon ? el.icon + " " : "") + el.text)}</text></g>`;
  }
  if (el.type === "attachment") {
    if (el.kind === "figure" && el.figure) return figureSvg(el);
    if (el.kind === "block" && el.block) return blockSvg(el);
    if (el.kind === "image" && el.data?.startsWith("data:image/")) return `<image href="${esc(el.data)}" x="${f(el.x)}" y="${f(el.y)}" width="${f(el.w)}" height="${f(el.h)}" preserveAspectRatio="none"${op(el.opacity)}/>`;
    return `<g><rect x="${f(el.x)}" y="${f(el.y)}" width="${f(el.w)}" height="${f(el.h)}" rx="10" fill="#F7F8FC" stroke="#9AA8C0"/><text x="${f(el.x + 14)}" y="${f(el.y + 28)}" font-size="15" font-weight="700" fill="#1B2233" font-family="Inter, sans-serif">${esc(el.title || el.kind)}</text></g>`;
  }
  const w = el.strokeWidth;
  const dash = el.strokeStyle === "dashed" ? ` stroke-dasharray="${f(w * 4 + 4)} ${f(w * 2 + 4)}"` : el.strokeStyle === "dotted" ? ` stroke-dasharray="0.1 ${f(w * 2 + 3)}"` : "";
  return `<path d="${d(shapePath(el))}" fill="${el.fill ? safeColor(el.fill, "none") : "none"}" stroke="${w > 0 ? safeColor(el.stroke, "#1B2233") : "none"}" stroke-width="${f(w)}"${dash}${op(el.opacity)}/>`;
}

/** Caixa que contém os elementos (títulos de quadro incluídos). */
export function contentBounds(els: HirakuElement[]): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of els) {
    if (e.invisible || (e.type === "node" && e.hidden)) continue;
    const b = elementBounds(e);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY - (e.type === "frame" ? 26 : 0)); maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/** Linhas/pontos do papel em coordenadas do mundo, cobrindo a caixa. */
function paperSvg(p: Pick<Page, "paper" | "background" | "paperScale" | "lineColor" | "size">, b: Bounds): string {
  if (p.paper === "blank") return "";
  const W = b.maxX - b.minX, H = b.maxY - b.minY;
  if (W * H > 25_000_000) return "";
  const color = p.lineColor ?? autoLineColor(p.background), dark = autoLineColor(p.background) !== "#1B2233";
  const lines: string[][] = [[], [], []], dots: string[] = [];
  drawPaperPattern(p.paper, { x: -b.minX, y: -b.minY, zoom: 1 }, W, H, {
    line: (x1, y1, x2, y2, l) => lines[l].push(`M${f(x1 + b.minX)} ${f(y1 + b.minY)}L${f(x2 + b.minX)} ${f(y2 + b.minY)}`),
    dot: (x, y, r) => dots.push(`M${f(x + b.minX - r)} ${f(y + b.minY)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`),
  }, { scale: p.paperScale ?? 1, sheetH: p.size?.h });
  const accent = p.paper === "margin" || p.paper === "header" || p.paper === "cornell" ? MARGIN_COLOR : color;
  return lines.map((l, i) => (l.length ? `<path d="${l.join("")}" stroke="${i === 2 ? accent : color}" stroke-opacity="${f(layerAlpha(i as 0 | 1 | 2, dark))}" stroke-width="${i === 2 ? 1.5 : 1}" fill="none"/>` : "")).join("")
    + (dots.length ? `<path d="${dots.join("")}" fill="${color}" fill-opacity="${f(layerAlpha("dot", dark))}"/>` : "");
}

export interface SvgOpts {
  /** Área exportada (mundo). */
  box: Bounds;
  /** Fundo: cor (com papel, se `paper`) ou null = transparente. */
  background: string | null;
  paper?: Pick<Page, "paper" | "background" | "paperScale" | "lineColor" | "size"> | null;
  /** Px por unidade do mundo (só muda width/height; o viewBox é o mundo). */
  scale?: number;
  /** Camadas da página (0.19): ocultas saem, opacidade, modo de mesclagem e máscara de recorte entram. */
  layers?: Layer[];
}

/** SVG completo (string) dos elementos na caixa. */
export function exportSvg(els: HirakuElement[], o: SvgOpts): string {
  const { box } = o, w = box.maxX - box.minX, h = box.maxY - box.minY, k = o.scale ?? 1;
  const body = (list: HirakuElement[]) => list.filter((e) => e.type === "frame").map(elementSvg).join("") + list.filter((e) => e.type !== "frame").map(elementSvg).join("");
  const content = o.layers?.length ? layersSvg(els, o.layers, body) : body(els);
  const bg = o.background ? `<rect x="${f(box.minX)}" y="${f(box.minY)}" width="${f(w)}" height="${f(h)}" fill="${safeColor(o.background, "#FFFFFF")}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${f(box.minX)} ${f(box.minY)} ${f(w)} ${f(h)}" width="${f(w * k)}" height="${f(h * k)}">${bg}${o.paper ? paperSvg(o.paper, box) : ""}${content}</svg>`;
}

/** Modo de cor "tons de cinza" (0.18): embrulha o conteúdo num filtro que tira a saturação (vale no SVG e ao rasterizar). */
export function grayscaleSvg(svg: string): string {
  const open = svg.indexOf(">", svg.indexOf("<svg"));
  const close = svg.lastIndexOf("</svg>");
  if (open < 0 || close < 0) return svg;
  return `${svg.slice(0, open + 1)}<defs><filter id="hm-gray" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/></filter></defs><g filter="url(#hm-gray)">${svg.slice(open + 1, close)}</g></svg>`;
}

/** Cor em cinza pela luminância (Rec. 709), para o fundo pintado fora do SVG. */
export function grayHex(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const y = Math.round(0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255));
  const h = y.toString(16).padStart(2, "0").toUpperCase();
  return `#${h}${h}${h}`;
}

/** Conteúdo por camada (0.19): `<g>` com opacidade e `mix-blend-mode`; recortadas usam a base como máscara de alfa. */
function layersSvg(els: HirakuElement[], layers: Layer[], body: (l: HirakuElement[]) => string): string {
  const ids = new Set(layers.map((l) => l.id));
  const first = layers[0].id;
  const of = (l: Layer) => els.filter((e) => (e.layerId && ids.has(e.layerId) ? e.layerId : first) === l.id);
  const attrs = (l: Layer, blend = true) => {
    const b = blend ? cssBlend(l.blend) : null;
    return `${l.opacity < 1 ? ` opacity="${Math.round(l.opacity * 100) / 100}"` : ""}${b ? ` style="mix-blend-mode:${b}"` : ""}`;
  };
  let out = "", n = 0;
  for (const u of clipUnits(layers)) {
    if (!u.base.visible) continue;
    const base = body(of(u.base));
    const clipped = u.clipped.filter((l) => l.visible);
    if (!clipped.length) { if (base) out += `<g${attrs(u.base)}>${base}</g>`; continue; }
    const id = `hm-clip-${n++}`;
    const inner = clipped.map((l) => `<g${attrs(l, false)}>${body(of(l))}</g>`).join("");
    out += `<g${cssBlend(u.base.blend) ? ` style="mix-blend-mode:${cssBlend(u.base.blend)};isolation:isolate"` : ' style="isolation:isolate"'}>`
      + `<mask id="${id}" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="-1e7" y="-1e7" width="2e7" height="2e7"><g${attrs(u.base, false)}>${base}</g></mask>`
      + `<g${attrs(u.base, false)}>${base}</g><g mask="url(#${id})">${inner}</g></g>`;
  }
  return out;
}
