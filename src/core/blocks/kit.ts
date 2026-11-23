// Ferramentas comuns dos blocos: primitivas de desenho, quebra de linha, cores e saneamento. Puro.
import type { BlockContent } from "./types";
export interface BP { x: number; y: number }
export interface BRect { x: number; y: number; w: number; h: number; r: number; fill: string; alpha?: number; stroke?: string; sw?: number; dash?: boolean }
export interface BText { x: number; y: number; text: string; size: number; color: string; bold?: boolean; italic?: boolean; font?: "sans" | "hand" | "mono" | "serif"; align?: "left" | "center" | "right"; alpha?: number; strike?: boolean; angle?: number }
export interface BLine { pts: BP[]; color: string; width: number; alpha?: number; dash?: boolean; fill?: string; fillAlpha?: number }
export interface BCircle { x: number; y: number; r: number; fill: string; stroke?: string; sw?: number; alpha?: number }
/** Área clicável com comportamento próprio (marcar tarefa, virar flashcard, escolher alternativa…). */
export interface BHit { action: string; index: number; index2?: number; x: number; y: number; w: number; h: number }
export interface BlockPrims { rects: BRect[]; lines: BLine[]; circles: BCircle[]; texts: BText[]; hits: BHit[]; /** giro do conteúdo (adesivos), em radianos, em torno do centro */ tilt?: number }

/** Campo editável direto no bloco (duplo toque): caminho no spec + onde fica e como é o texto. */
export interface BField { key: string; x: number; y: number; w: number; h: number; size: number; font?: BText["font"]; bold?: boolean; italic?: boolean; color: string; bg: string; align?: BText["align"]; multiline: boolean; placeholder?: string }

export type TextMeasure = (text: string, size: number, font: BText["font"], bold?: boolean) => number;
export const approxTextMeasure: TextMeasure = (t, size, font, bold) => t.length * size * (font === "mono" ? 0.6 : 0.53) * (bold ? 1.06 : 1);

export const INK = "#1B2233", SOFT = "#5B677D", LINE = "#DDE3EE", MUTED = "#9AA3B2";
export const LH = 1.3;
export const STICKY_COLORS = ["#FFF1A8", "#FFD6A5", "#FFC8DD", "#CDB4FF", "#BDE0FE", "#B9F3D0", "#E9ECEF"];
export const BLOCK_COLORS = ["#4D6FC4", "#D2453A", "#2E9B5F", "#C98612", "#7B4FC9", "#0E8A9B", "#D1307A", "#3D4557"];

export const newPrims = (): BlockPrims => ({ rects: [], lines: [], circles: [], texts: [], hits: [] });

/** Quebra o texto em linhas que cabem em `maxW` (palavras inteiras; palavra gigante é cortada). */
export function wrap(text: string, maxW: number, size: number, measure: TextMeasure, font: BText["font"] = "sans", bold = false): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para) { out.push(""); continue; }
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const tryLine = line + word;
      if (measure(tryLine.trimEnd(), size, font, bold) <= maxW || !line.trim()) {
        if (measure(word, size, font, bold) > maxW && !line.trim()) {
          let chunk = "";
          for (const ch of word) { if (measure(chunk + ch, size, font, bold) > maxW && chunk) { out.push(chunk); chunk = ch; } else chunk += ch; }
          line = chunk;
        } else line = tryLine;
      } else { out.push(line.trimEnd()); line = word.trimStart(); }
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** Clareia (f > 0) ou escurece (f < 0) uma cor #rrggbb. */
export function mix(hexColor: string, f: number): string {
  const c = parseInt(hexColor.slice(1), 16);
  const ch = (s: number) => Math.round(Math.min(255, Math.max(0, f >= 0 ? s + (255 - s) * f : s * (1 + f))));
  return "#" + ((ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255)).toString(16).padStart(6, "0");
}
/** Cor do texto que contrasta com o fundo. */
export function onColor(bg: string): string {
  const c = parseInt(bg.slice(1), 16);
  const l = 0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255);
  return l > 150 ? INK : "#FFFFFF";
}
export const cycle = (base: string, i: number) => BLOCK_COLORS[((BLOCK_COLORS.indexOf(base) < 0 ? 0 : BLOCK_COLORS.indexOf(base)) + i) % BLOCK_COLORS.length];

/** Texto multilinha a partir de (x, y) (topo); devolve a altura usada. */
export function para(p: BlockPrims, lines: string[], x: number, y: number, size: number, color: string, o: Partial<BText> = {}, maxLines = 999): number {
  const n = Math.max(0, Math.min(lines.length, maxLines));
  for (let i = 0; i < n; i++) {
    const t = i === maxLines - 1 && lines.length > maxLines ? lines[i].replace(/\s*\S*$/, "") + "…" : lines[i];
    p.texts.push({ x, y: y + i * size * LH, text: t, size, color, ...o });
  }
  return n * size * LH;
}
export const linesFit = (h: number, size: number) => Math.max(1, Math.floor(h / (size * LH)));

/** Fundo de cartão branco com sombra suave. */
export function cardBg(p: BlockPrims, w: number, h: number, r = 12, fill = "#FFFFFF", shadow = 0.1, stroke = LINE) {
  if (shadow) p.rects.push({ x: 2, y: 4, w, h, r, fill: INK, alpha: shadow });
  p.rects.push({ x: 0, y: 0, w, h, r, fill, stroke, sw: stroke ? 1 : 0 });
}
export const check = (p: BlockPrims, x: number, y: number, s: number, on: boolean, color: string) => {
  p.rects.push({ x, y, w: s, h: s, r: s * 0.28, fill: on ? color : "#FFFFFF", stroke: on ? color : "#B8C1D1", sw: 1.6 });
  if (on) p.lines.push({ pts: [{ x: x + s * 0.22, y: y + s * 0.53 }, { x: x + s * 0.42, y: y + s * 0.72 }, { x: x + s * 0.78, y: y + s * 0.3 }], color: "#FFFFFF", width: Math.max(1.6, s * 0.12) });
};

// ---------------- saneamento ----------------
export const str = (v: unknown, d = "", max = 4000) => (typeof v === "string" ? v.slice(0, max) : d);
export const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
export const num = (v: unknown, d: number, min = -Infinity, max = Infinity) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
export const bool = (v: unknown, d = false) => (typeof v === "boolean" ? v : d);
export const arr = <T>(v: unknown, max: number, f: (x: unknown, i: number) => T): T[] => (Array.isArray(v) ? v.slice(0, max).map(f) : []);
export const strs = (v: unknown, max = 60, len = 300) => arr(v, max, (x) => str(x, "", len));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as any) ? (v as T) : d);

// ---------------- caminhos (edição no bloco) ----------------
// "items.2.text" → spec.items[2].text
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAt(o: any, key: string): unknown {
  return key.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setAt<T>(o: T, key: string, value: unknown): T {
  const [k, ...rest] = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cur = (o as any)?.[k];
  const next = rest.length ? setAt(cur, rest.join("."), value) : value;
  if (Array.isArray(o)) { const c = [...o]; c[+k] = next; return c as T; }
  return { ...(o as object), [k]: next } as T;
}

// ---------------- conteúdo neutro (transformar um bloco em outro) ----------------
export const contentItems = (c: BlockContent): string[] =>
  c.items?.length ? c.items.map((i) => i.text) : (c.text ?? "").split("\n").map((l) => l.replace(/^\s*([-*•]|\d+[.)]|\[[ x]\])\s+/i, "").trim()).filter(Boolean);
export const contentBody = (c: BlockContent): string =>
  c.text ?? (c.items ?? []).map((i) => (i.sub ? `${i.text}: ${i.sub}` : i.text)).join("\n");
export const bulletBody = (c: BlockContent): string =>
  c.text ?? (c.items ?? []).map((i) => `- ${i.sub ? `${i.text}: ${i.sub}` : i.text}`).join("\n");
