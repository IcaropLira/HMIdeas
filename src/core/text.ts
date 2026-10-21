// Fontes e medição de texto. Usa um <canvas> 2D só para medir (depende do DOM).
import { FontFamily, TextAlign, TextElement } from "./model";

export const LINE_HEIGHT = 1.25;

export const FONTS: { id: FontFamily; label: string; css: string }[] = [
  { id: "sans", label: "Sem serifa", css: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif' },
  { id: "serif", label: "Serifa", css: 'Georgia, "Times New Roman", "Noto Serif", serif' },
  { id: "mono", label: "Mono", css: 'ui-monospace, "Cascadia Code", Menlo, Consolas, "DejaVu Sans Mono", monospace' },
  { id: "hand", label: "Manuscrita", css: '"Segoe Print", "Bradley Hand", "Comic Sans MS", "Comic Neue", "Noto Sans", cursive' },
];

export const FONT_CSS: Record<FontFamily, string> = Object.fromEntries(FONTS.map((f) => [f.id, f.css])) as Record<FontFamily, string>;

export const FONT_SIZES: { value: number; label: string }[] = [
  { value: 16, label: "P" },
  { value: 20, label: "M" },
  { value: 28, label: "G" },
  { value: 36, label: "GG" },
];

let ctx: CanvasRenderingContext2D | null = null;

/** Largura e altura do bloco de texto (linhas separadas por \n). */
export function measureBlock(text: string, family: FontFamily, size: number): { w: number; h: number } {
  ctx ??= document.createElement("canvas").getContext("2d");
  const lines = text.split("\n");
  let w = 0;
  if (ctx) {
    ctx.font = `${size}px ${FONT_CSS[family]}`;
    for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
  } else {
    w = Math.max(...lines.map((l) => l.length)) * size * 0.6;
  }
  return { w: Math.max(w, size * 0.5), h: lines.length * size * LINE_HEIGHT };
}

export interface TextStyle {
  fontSize: number;
  fontFamily: FontFamily;
  align: TextAlign;
  color: string;
}

export function makeText(id: string, x: number, y: number, text: string, st: TextStyle): TextElement {
  const m = measureBlock(text, st.fontFamily, st.fontSize);
  return { id, type: "text", x, y, w: m.w, h: m.h, angle: 0, text, ...st, opacity: 1 };
}
