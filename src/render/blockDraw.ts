// Blocos nativos (core/blocks.ts): medida de texto e SVG (prévias/miniaturas). SEM Pixi aqui: este arquivo é usado
// por ferramentas e testes em Node; o desenho no Pixi fica em blockPaint.ts.
import { AttachmentElement } from "../core/model";
import { BText, BlockPrims, TextMeasure, approxTextMeasure, blockPrims } from "../core/blocks";
import { FONT_CSS } from "../core/text";

let ctx: CanvasRenderingContext2D | null = null;
const fontOf = (t: Pick<BText, "font" | "bold" | "size">) => `${t.bold ? "600 " : ""}${t.size}px ${FONT_CSS[t.font ?? "sans"]}`;

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

export function blockPrimsSvg(p: BlockPrims, measure: TextMeasure = canvasMeasure): string {
  let s = "";
  for (const r of p.rects) s += `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(Math.max(0, r.w))}" height="${n(Math.max(0, r.h))}" rx="${r.r}" fill="${col(r.fill)}"${r.alpha !== undefined ? ` fill-opacity="${r.alpha}"` : ""}${r.stroke ? ` stroke="${col(r.stroke)}" stroke-width="${r.sw ?? 1}"` : ""}/>`;
  for (const l of p.lines) s += `<path d="${l.pts.map((q, i) => `${i ? "L" : "M"}${n(q.x)} ${n(q.y)}`).join("")}" fill="none" stroke="${col(l.color)}" stroke-width="${l.width}" stroke-linecap="round" stroke-linejoin="round"${l.alpha !== undefined ? ` stroke-opacity="${l.alpha}"` : ""}/>`;
  for (const c of p.circles) s += `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${c.r}" fill="${col(c.fill)}"${c.stroke ? ` stroke="${col(c.stroke)}" stroke-width="${c.sw ?? 1}"` : ""}/>`;
  for (const t of p.texts) {
    if (!t.text) continue;
    const anchor = t.align === "center" ? "middle" : t.align === "right" ? "end" : "start";
    s += `<text x="${n(t.x)}" y="${n(t.y)}" font-size="${t.size}" font-family='${FONT_CSS[t.font ?? "sans"].replace(/'/g, "")}' fill="${col(t.color)}" text-anchor="${anchor}" dominant-baseline="hanging"${t.bold ? ' font-weight="600"' : ""}${t.alpha !== undefined ? ` fill-opacity="${t.alpha}"` : ""}>${esc(t.text)}</text>`;
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
  return p ? `<g transform="translate(${el.x} ${el.y})">${blockPrimsSvg(p)}</g>` : "";
}
