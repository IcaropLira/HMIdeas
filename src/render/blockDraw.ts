// Blocos nativos (core/blocks.ts): medida de texto e SVG (prévias/miniaturas). SEM Pixi aqui: este arquivo é usado
// por ferramentas e testes em Node; o desenho no Pixi fica em blockPaint.ts.
import { AttachmentElement } from "../core/model";
import { BP, BText, BlockPrims, TextMeasure, approxTextMeasure, blockPrims } from "../core/blocks";
import { FONT_CSS } from "../core/text";

let ctx: CanvasRenderingContext2D | null = null;
const fontOf = (t: Pick<BText, "font" | "bold" | "size">) => `${t.bold ? "600 " : ""}${t.size}px ${FONT_CSS[t.font ?? "sans"]}`;

/** Contorno de retângulo arredondado como polilinha (para tracejar). */
export function roundRectPts(x: number, y: number, w: number, h: number, r: number): BP[] {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const out: BP[] = [];
  const arc = (cx: number, cy: number, a0: number) => { for (let k = 0; k <= 6; k++) { const a = a0 + (k / 6) * (Math.PI / 2); out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); } };
  arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + h - r, 0); arc(x + r, y + h - r, Math.PI / 2); arc(x + r, y + r, Math.PI);
  out.push(out[0]);
  return out;
}
/** Quebra uma polilinha em traços. */
export function dashes(pts: BP[], on = 7, off = 5): BP[][] {
  const out: BP[][] = [];
  let cur: BP[] = [], drawing = true, left = on;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1];
    const b = pts[i];
    let seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (drawing && !cur.length) cur.push(a);
    while (seg > left) {
      const f = left / seg, q = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      if (drawing) { cur.push(q); out.push(cur); cur = []; } else cur = [q];
      drawing = !drawing; seg -= left; a = q; left = drawing ? on : off;
    }
    left -= seg;
    if (drawing) cur.push(b);
  }
  if (drawing && cur.length > 1) out.push(cur);
  return out;
}

/** Medida real (canvas 2D) — igual à do Pixi, então a quebra de linha bate com o desenho. */
export const canvasMeasure: TextMeasure = (text, size, font, bold) => {
  ctx ??= typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  if (!ctx) return approxTextMeasure(text, size, font, bold);
  ctx.font = fontOf({ size, font, bold });
  return ctx.measureText(text).width;
};

export function primsFor(el: AttachmentElement): BlockPrims | null {
  return el.block ? blockPrims(el.block, el.w, el.h, canvasMeasure) : null;
}

export const anchorX = (t: BText) => (t.align === "center" ? 0.5 : t.align === "right" ? 1 : 0);

// ---------------- SVG ----------------
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const col = (c: string) => (/^#[0-9a-fA-F]{3,8}$/.test(c) ? c : "#1B2233");
const n = (v: number) => v.toFixed(1);

const path = (pts: BP[], close = false) => pts.map((q, i) => `${i ? "L" : "M"}${n(q.x)} ${n(q.y)}`).join("") + (close ? "Z" : "");
export function blockPrimsSvg(p: BlockPrims, measure: TextMeasure = canvasMeasure): string {
  let s = "";
  for (const r of p.rects) {
    s += `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(Math.max(0, r.w))}" height="${n(Math.max(0, r.h))}" rx="${r.r}" fill="${col(r.fill)}"${r.alpha !== undefined ? ` fill-opacity="${r.alpha}"` : ""}${r.stroke && !r.dash ? ` stroke="${col(r.stroke)}" stroke-width="${r.sw ?? 1}"` : ""}/>`;
    if (r.stroke && r.dash) s += `<path d="${path(roundRectPts(r.x, r.y, r.w, r.h, r.r))}" fill="none" stroke="${col(r.stroke)}" stroke-width="${r.sw ?? 1}" stroke-dasharray="7 5"/>`;
  }
  for (const l of p.lines) {
    if (l.fill) s += `<path d="${path(l.pts, true)}" fill="${col(l.fill)}" fill-opacity="${l.fillAlpha ?? 1}" stroke="none"/>`;
    if (l.width > 0) s += `<path d="${path(l.pts)}" fill="none" stroke="${col(l.color)}" stroke-width="${l.width}" stroke-linecap="round" stroke-linejoin="round"${l.alpha !== undefined ? ` stroke-opacity="${l.alpha}"` : ""}${l.dash ? ' stroke-dasharray="6 5"' : ""}/>`;
  }
  for (const c of p.circles) s += `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(c.r)}" fill="${col(c.fill)}"${c.alpha !== undefined ? ` fill-opacity="${c.alpha}"` : ""}${c.stroke ? ` stroke="${col(c.stroke)}" stroke-width="${c.sw ?? 1}"` : ""}/>`;
  for (const t of p.texts) {
    if (!t.text) continue;
    const anchor = t.align === "center" ? "middle" : t.align === "right" ? "end" : "start";
    const rot = t.angle ? ` transform="rotate(${n((t.angle * 180) / Math.PI)} ${n(t.x)} ${n(t.y)})"` : "";
    s += `<text x="${n(t.x)}" y="${n(t.y)}" font-size="${n(t.size)}" font-family='${FONT_CSS[t.font ?? "sans"].replace(/'/g, "")}' fill="${col(t.color)}" text-anchor="${anchor}" dominant-baseline="hanging"${t.bold ? ' font-weight="600"' : ""}${t.italic ? ' font-style="italic"' : ""}${t.alpha !== undefined ? ` fill-opacity="${t.alpha}"` : ""}${rot}>${esc(t.text)}</text>`;
    if (t.strike) {
      const w = measure(t.text, t.size, t.font, t.bold);
      const x0 = t.x - w * anchorX(t);
      s += `<path d="M${n(x0)} ${n(t.y + t.size * 0.62)}H${n(x0 + w)}" stroke="#9AA3B2" stroke-width="1.4"/>`;
    }
  }
  return s;
}

export function blockSvg(el: AttachmentElement): string {
  const p = primsFor(el);
  if (!p) return "";
  const tilt = p.tilt ? ` rotate(${n((p.tilt * 180) / Math.PI)} ${n(el.w / 2)} ${n(el.h / 2)})` : "";
  return `<g transform="translate(${el.x} ${el.y})${tilt}">${blockPrimsSvg(p)}</g>`;
}
