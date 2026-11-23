// Desenho dos blocos nativos (core/blocks.ts): Pixi (canvas) e SVG (prévias/miniaturas) a partir das MESMAS primitivas.
import { Container, Graphics, Text } from "pixi.js";
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

const anchorX = (t: BText) => (t.align === "center" ? 0.5 : t.align === "right" ? 1 : 0);

export function paintBlock(node: Container, el: AttachmentElement, res: number) {
  const p = primsFor(el);
  if (!p) return;
  const g = new Graphics();
  g.position.set(el.x, el.y);
  node.addChild(g);
  for (const r of p.rects) {
    g.roundRect(r.x, r.y, r.w, r.h, r.r).fill({ color: r.fill, alpha: r.alpha ?? 1 });
    if (r.stroke) g.roundRect(r.x, r.y, r.w, r.h, r.r).stroke({ color: r.stroke, width: r.sw ?? 1 });
  }
  for (const l of p.lines) {
    if (l.pts.length < 2) continue;
    g.moveTo(l.pts[0].x, l.pts[0].y);
    for (let i = 1; i < l.pts.length; i++) g.lineTo(l.pts[i].x, l.pts[i].y);
    g.stroke({ width: l.width, color: l.color, alpha: l.alpha ?? 1, cap: "round", join: "round" });
  }
  for (const c of p.circles) {
    g.circle(c.x, c.y, c.r).fill({ color: c.fill });
    if (c.stroke) g.circle(c.x, c.y, c.r).stroke({ color: c.stroke, width: c.sw ?? 1 });
  }
  const strikes = new Graphics();
  strikes.position.set(el.x, el.y);
  for (const t of p.texts) {
    if (!t.text) continue;
    const tx = new Text({ text: t.text, style: { fontFamily: FONT_CSS[t.font ?? "sans"], fontSize: t.size, fill: t.color, fontWeight: t.bold ? "600" : "400" } });
    tx.resolution = res;
    tx.alpha = t.alpha ?? 1;
    tx.anchor.set(anchorX(t), 0);
    tx.position.set(el.x + t.x, el.y + t.y);
    node.addChild(tx);
    if (t.strike) {
      const w = canvasMeasure(t.text, t.size, t.font, t.bold);
      const x0 = t.x - w * anchorX(t);
      strikes.moveTo(x0, t.y + t.size * 0.62).lineTo(x0 + w, t.y + t.size * 0.62);
    }
  }
  strikes.stroke({ width: 1.4, color: 0x9aa3b2 });
  node.addChild(strikes);
}

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
