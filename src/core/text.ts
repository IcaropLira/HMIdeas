// Fontes e medição de texto. Usa um <canvas> 2D só para medir (depende do DOM).
import { FontFamily, TextAlign, TextElement } from "./model";

export const LINE_HEIGHT = 1.25;

export type FontGroup = "Sem serifa" | "Serifa" | "Manuscrita" | "Mono" | "Sistema";

/** Fontes oferecidas (as do sistema primeiro, por compatibilidade; as embutidas vêm em src/fonts.ts). */
export const FONTS: { id: FontFamily; label: string; css: string; group: FontGroup; sample?: string }[] = [
  { id: "sans", label: "Sem serifa (sistema)", css: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif', group: "Sistema" },
  { id: "serif", label: "Serifa (sistema)", css: 'Georgia, "Times New Roman", "Noto Serif", serif', group: "Sistema" },
  { id: "mono", label: "Mono (sistema)", css: 'ui-monospace, "Cascadia Code", Menlo, Consolas, "DejaVu Sans Mono", monospace', group: "Sistema" },
  { id: "hand", label: "Manuscrita", css: '"Patrick Hand", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive', group: "Manuscrita" },
  { id: "inter", label: "Inter", css: '"Inter", system-ui, sans-serif', group: "Sem serifa" },
  { id: "nunito", label: "Nunito", css: '"Nunito", system-ui, sans-serif', group: "Sem serifa" },
  { id: "oswald", label: "Oswald", css: '"Oswald", "Arial Narrow", sans-serif', group: "Sem serifa" },
  { id: "robotoslab", label: "Roboto Slab", css: '"Roboto Slab", Georgia, serif', group: "Serifa" },
  { id: "lora", label: "Lora", css: '"Lora", Georgia, serif', group: "Serifa" },
  { id: "merriweather", label: "Merriweather", css: '"Merriweather", Georgia, serif', group: "Serifa" },
  { id: "playfair", label: "Playfair Display", css: '"Playfair Display", Georgia, serif', group: "Serifa" },
  { id: "caveat", label: "Caveat", css: '"Caveat", "Patrick Hand", cursive', group: "Manuscrita" },
  { id: "patrick", label: "Patrick Hand", css: '"Patrick Hand", cursive', group: "Manuscrita" },
  { id: "kalam", label: "Kalam", css: '"Kalam", "Patrick Hand", cursive', group: "Manuscrita" },
  { id: "indie", label: "Indie Flower", css: '"Indie Flower", "Patrick Hand", cursive', group: "Manuscrita" },
  { id: "jetbrains", label: "JetBrains Mono", css: '"JetBrains Mono", ui-monospace, monospace', group: "Mono" },
];

export const FONT_GROUPS: FontGroup[] = ["Sem serifa", "Serifa", "Manuscrita", "Mono", "Sistema"];

export const FONT_CSS: Record<FontFamily, string> = Object.fromEntries(FONTS.map((f) => [f.id, f.css])) as Record<FontFamily, string>;

export const FONT_SIZES: { value: number; label: string }[] = [
  { value: 16, label: "P" },
  { value: 20, label: "M" },
  { value: 28, label: "G" },
  { value: 36, label: "GG" },
];

/** Tamanhos para a lista (como num editor de texto). */
export const SIZE_STEPS = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 60, 72, 96, 120, 160];

/** Estilo extra do texto (0.9). */
export interface TextFx {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  lineHeight?: number;
  letterSpacing?: number;
  bg?: string;
}

export const fxOf = (e: TextFx): TextFx => ({
  bold: e.bold, italic: e.italic, underline: e.underline, strike: e.strike, lineHeight: e.lineHeight, letterSpacing: e.letterSpacing, bg: e.bg,
});

/** `font` do CSS/canvas ("italic 700 20px Inter, …"). */
export const fontString = (family: FontFamily, size: number, fx: TextFx = {}) =>
  `${fx.italic ? "italic " : ""}${fx.bold ? "700 " : ""}${size}px ${FONT_CSS[family] ?? FONT_CSS.sans}`;

let ctx: CanvasRenderingContext2D | null = null;
const getCtx = () => (ctx ??= typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null);

/** Largura de cada linha (para sublinhado/tachado e alinhamento). */
export function measureLines(text: string, family: FontFamily, size: number, fx: TextFx = {}): number[] {
  const c = getCtx();
  const lines = text.split("\n");
  const ls = (fx.letterSpacing ?? 0) * size;
  if (!c) return lines.map((l) => l.length * size * 0.6 + Math.max(0, l.length - 1) * ls);
  c.font = fontString(family, size, fx);
  return lines.map((l) => c.measureText(l).width + Math.max(0, [...l].length - 1) * ls);
}

/** Largura e altura do bloco de texto (linhas separadas por \n). */
export function measureBlock(text: string, family: FontFamily, size: number, fx: TextFx = {}): { w: number; h: number } {
  const ws = measureLines(text, family, size, fx);
  const lh = fx.lineHeight ?? LINE_HEIGHT;
  return { w: Math.max(Math.max(0, ...ws), size * 0.5), h: ws.length * size * lh };
}

export interface TextStyle extends TextFx {
  fontSize: number;
  fontFamily: FontFamily;
  align: TextAlign;
  color: string;
}

export function makeText(id: string, x: number, y: number, text: string, st: TextStyle): TextElement {
  const m = measureBlock(text, st.fontFamily, st.fontSize, st);
  const fx = Object.fromEntries(Object.entries(fxOf(st)).filter(([, v]) => v !== undefined && v !== false));
  return { id, type: "text", x, y, w: m.w, h: m.h, angle: 0, text, fontSize: st.fontSize, fontFamily: st.fontFamily, align: st.align, color: st.color, opacity: 1, ...fx };
}

/** Garante que as fontes embutidas estejam carregadas (medidas e desenho do Pixi usam o canvas). */
export function loadFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  const loads = FONTS.filter((f) => f.group !== "Sistema").flatMap((f) => [
    document.fonts.load(`16px ${f.css}`), document.fonts.load(`700 16px ${f.css}`),
  ]);
  return Promise.allSettled(loads).then(() => undefined);
}
