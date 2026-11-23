// Figura matemática como SVG (prévias e miniaturas). As mesmas primitivas do Renderer (core/figures.ts).
import { AttachmentElement } from "../core/model";
import { FigPrims, P, figurePrims } from "../core/figures";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const col = (c: string) => (/^#[0-9a-fA-F]{3,8}$/.test(c) ? c : "#1B2233");
const path = (pts: P[], close = false) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("") + (close ? "Z" : "");

export function arrowHead(from: P, to: P, size: number): P[] {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  return [to, { x: to.x - Math.cos(a - 0.42) * size, y: to.y - Math.sin(a - 0.42) * size }, { x: to.x - Math.cos(a + 0.42) * size, y: to.y - Math.sin(a + 0.42) * size }];
}

export function primsSvg(p: FigPrims): string {
  let s = "";
  for (const q of p.polys) s += `<path d="${path(q.pts, true)}" fill="${col(q.fill)}" fill-opacity="${q.alpha}"/>`;
  for (const l of p.lines) s += `<path d="${path(l.pts, l.closed)}" fill="none" stroke="${col(l.color)}" stroke-width="${l.width}" stroke-linecap="round" stroke-linejoin="round"${l.dash ? ` stroke-dasharray="${l.width * 3} ${l.width * 2.5}"` : ""}${l.alpha !== undefined ? ` stroke-opacity="${l.alpha}"` : ""}/>`;
  for (const a of p.arrows) s += `<path d="${path(arrowHead(a.from, a.to, a.size), true)}" fill="${col(a.color)}"/>`;
  for (const d of p.dots) s += `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.r}" fill="${col(d.color)}"/>`;
  for (const t of p.texts) {
    const base = t.base === "middle" ? "central" : t.base === "top" ? "hanging" : "auto";
    s += `<text x="${t.x.toFixed(1)}" y="${t.y.toFixed(1)}" font-size="${t.size}" font-family="Inter, system-ui, sans-serif" fill="${col(t.color)}" text-anchor="${t.anchor}" dominant-baseline="${base}"${t.bold ? ' font-weight="600"' : ""}>${esc(t.text)}</text>`;
  }
  return s;
}

/** Markup SVG da figura já posicionada em (x, y) do elemento. */
export function figureSvg(el: AttachmentElement): string {
  if (!el.figure) return "";
  return `<g transform="translate(${el.x} ${el.y})">${primsSvg(figurePrims(el.figure, el.w, el.h))}</g>`;
}
