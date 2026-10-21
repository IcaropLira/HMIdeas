// Miniaturas de página em SVG: independente do Pixi, barato e fácil de memorizar.
// Cada elemento é convertido UMA vez (WeakMap, elementos são imutáveis).
import { HirakuElement, Page } from "../core/model";
import { linearPath } from "../core/linear";
import { Bounds, elementBounds } from "../core/selection";
import { shapePath } from "../core/shapes";
import { strokeOutline } from "./strokeDraw";

export interface ThumbPath {
  d: string;
  fill: string;
  stroke: string | null;
  sw: number;
  dash: string | null;
  b: Bounds;
  /** Opacidade (texto aparece como barras suaves na miniatura). */
  alpha: number;
}

const cache = new WeakMap<HirakuElement, ThumbPath>();

/** Cores vêm de arquivos: só aceitamos hex, para nunca injetar valores estranhos no SVG. */
export const safeColor = (c: string | null | undefined, fallback: string) =>
  c && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : fallback;

function pathFrom(flat: number[], close = true): string {
  let d = "";
  for (let i = 0; i < flat.length; i += 2) d += (i ? "L" : "M") + flat[i].toFixed(1) + " " + flat[i + 1].toFixed(1);
  return close ? d + "Z" : d;
}

export function thumbPath(el: HirakuElement): ThumbPath {
  const hit = cache.get(el);
  if (hit) return hit;
  let tp: ThumbPath;
  if (el.type === "stroke") {
    tp = {
      d: pathFrom(strokeOutline(el.points, { color: el.color, width: el.width, sens: el.sens, taper: el.taper }, true)),
      fill: safeColor(el.color, "#1B2233"),
      stroke: null, sw: 0, dash: null, b: elementBounds(el), alpha: 1,
    };
  } else if (el.type === "text") {
    const lines = el.text.split("\n");
    const longest = Math.max(...lines.map((l) => l.length), 1);
    const lh = el.fontSize * 1.25;
    const bars = lines.map((l, i) => {
      const lw = (el.w * l.length) / longest;
      return `M${el.x.toFixed(1)} ${(el.y + i * lh + lh * 0.25).toFixed(1)}h${lw.toFixed(1)}v${(lh * 0.5).toFixed(1)}h${(-lw).toFixed(1)}Z`;
    });
    tp = { d: bars.join(""), fill: safeColor(el.color, "#1B2233"), stroke: null, sw: 0, dash: null, b: elementBounds(el), alpha: 0.55 };
  } else if (el.type === "line" || el.type === "arrow") {
    const w = el.strokeWidth;
    tp = {
      d: pathFrom(linearPath(el).flatMap((p) => [p.x, p.y]), false), // pontas omitidas na miniatura
      fill: "none",
      stroke: safeColor(el.stroke, "#1B2233"),
      sw: w,
      dash: el.strokeStyle === "dashed" ? `${w * 4 + 6} ${w * 2 + 5}` : el.strokeStyle === "dotted" ? `0.1 ${w * 2 + 4}` : null,
      b: elementBounds(el), alpha: 1,
    };
  } else {
    const w = el.strokeWidth;
    tp = {
      d: pathFrom(shapePath(el).flatMap((p) => [p.x, p.y])),
      fill: el.fill ? safeColor(el.fill, "none") : "none",
      stroke: safeColor(el.stroke, "#1B2233"),
      sw: w,
      dash: el.strokeStyle === "dashed" ? `${w * 4 + 6} ${w * 2 + 5}` : el.strokeStyle === "dotted" ? `0.1 ${w * 2 + 4}` : null,
      b: elementBounds(el), alpha: 1,
    };
  }
  cache.set(el, tp);
  return tp;
}

/** viewBox 4:3 que enquadra o conteúdo (com um mínimo, para um ponto solitário não virar gigante). */
export function thumbViewBox(paths: ThumbPath[]): string {
  if (!paths.length) return "0 0 800 600";
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { b } of paths) {
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  const k = Math.max(((maxX - minX) * 1.15) / 4, ((maxY - minY) * 1.15) / 3, 150);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return `${(cx - 2 * k).toFixed(1)} ${(cy - 1.5 * k).toFixed(1)} ${(4 * k).toFixed(1)} ${(3 * k).toFixed(1)}`;
}

export const pageThumb = (page: Page) => {
  const paths = page.elements.map(thumbPath);
  return { paths, viewBox: thumbViewBox(paths) };
};
