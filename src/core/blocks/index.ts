// Registro dos blocos nativos. Cada tipo é uma BlockDef (def.ts) com dados, desenho, toques, campos editáveis e conversão.
// Novo tipo de bloco = um arquivo em defs/ + entrada em ALL; nada mais no app precisa mudar.
import { AnyDef } from "./def";
import { BASIC } from "./defs/basic";
import { LAYOUTS } from "./defs/layouts";
import { MATH } from "./defs/mathBlocks";
import { page } from "./defs/page";
import { PLANNING } from "./defs/planning";
import { STUDY } from "./defs/study";
import { TEXT } from "./defs/text";
import { BField, BHit, BLOCK_COLORS, BlockPrims, STICKY_COLORS, TextMeasure, approxTextMeasure, getAt, hex, newPrims, setAt } from "./kit";
import { BlockContent, BlockKind, BlockSpec } from "./types";

export * from "./kit";
export * from "./types";
export type { AnyDef, Behavior, BlockDef, FormField } from "./def";
export { prettyMath } from "./defs/text";
export { CALLOUT_ICONS } from "./defs/basic";
export { MONTHS, WEEKDAYS } from "./defs/planning";

const ALL = [...BASIC, ...TEXT, ...PLANNING, ...STUDY, ...MATH, ...LAYOUTS, page] as unknown as AnyDef[];
export const BLOCK_DEFS: Record<BlockKind, AnyDef> = Object.fromEntries(ALL.map((d) => [d.kind, d])) as Record<BlockKind, AnyDef>;
export const BLOCK_KINDS: { id: BlockKind; label: string; hint: string }[] = ALL.map((d) => ({ id: d.kind, label: d.label, hint: d.hint }));
export const blockDef = (k: BlockKind): AnyDef => BLOCK_DEFS[k];

export const defaultBlock = (kind: BlockKind): BlockSpec => BLOCK_DEFS[kind].make();
export const defaultBlockSize = (s: BlockSpec) => BLOCK_DEFS[s.kind].size(s);
export const blockTitle = (s: BlockSpec) => BLOCK_DEFS[s.kind]?.label ?? "Bloco";
export const blockText = (s: BlockSpec) => BLOCK_DEFS[s.kind].text(s);
export const blockForm = (s: BlockSpec) => BLOCK_DEFS[s.kind].form;
export const blockPalette = (s: BlockSpec) => BLOCK_DEFS[s.kind].palette ?? "block";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanBlock(raw: any): BlockSpec | null {
  if (!raw || typeof raw !== "object" || !BLOCK_DEFS[raw.kind as BlockKind]) return null;
  const d = BLOCK_DEFS[raw.kind as BlockKind];
  const color = hex(raw.color, (d.make() as { color: string }).color);
  try { return d.clean(raw, color); } catch { return null; }
}

export function blockPrims(s: BlockSpec, w: number, h: number, m: TextMeasure = approxTextMeasure): BlockPrims {
  const p = newPrims();
  BLOCK_DEFS[s.kind]?.draw(s, w, h, m, p);
  return p;
}

export function blockContentHeight(s: BlockSpec, w: number, m: TextMeasure = approxTextMeasure): number {
  return BLOCK_DEFS[s.kind].minH?.(s, w, m) ?? 0;
}

/** Área clicável sob o ponto local (x, y) do bloco (a última desenhada ganha). */
export function blockHitAt(p: BlockPrims, x: number, y: number): BHit | null {
  for (let i = p.hits.length - 1; i >= 0; i--) { const h = p.hits[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h; }
  return null;
}
export const blockTap = (s: BlockSpec, hit: BHit): BlockSpec => BLOCK_DEFS[s.kind].tap?.(s, hit) ?? s;

/** Campos editáveis direto no bloco e o campo sob um ponto local. */
export const blockFields = (s: BlockSpec, w: number, h: number, m: TextMeasure = approxTextMeasure): BField[] => BLOCK_DEFS[s.kind].fields?.(s, w, h, m) ?? [];
export function fieldAt(fields: BField[], x: number, y: number, slack = 4): BField | null {
  return fields.find((f) => x >= f.x - slack && x <= f.x + f.w + slack && y >= f.y - slack && y <= f.y + Math.max(f.h, f.size * 1.3) + slack) ?? null;
}
export const fieldValue = (s: BlockSpec, key: string) => String(getAt(s, key) ?? "");
export const withField = (s: BlockSpec, key: string, v: string): BlockSpec => {
  const cur = getAt(s, key);
  return setAt(s, key, typeof cur === "number" ? Number(v) || 0 : v);
};
export function splitField(s: BlockSpec, key: string, before: string, after: string): { spec: BlockSpec; focus: string } | null {
  return (BLOCK_DEFS[s.kind].split?.(s, key, before, after) as { spec: BlockSpec; focus: string } | null | undefined) ?? null;
}

/** Backspace num item vazio de lista editado no bloco: remove o item e foca o anterior. */
export function removeFieldItem(s: BlockSpec, key: string): { spec: BlockSpec; focus: string } | null {
  const m = key.match(/^(.*)\.(\d+)(\.text)?$/);
  if (!m || !BLOCK_DEFS[s.kind].split || /\.\d+$/.test(m[1])) return null;
  const arrKey = m[1], i = +m[2], list = getAt(s, arrKey);
  if (!Array.isArray(list) || list.length < 2 || i < 1) return null;
  return { spec: setAt(s, arrKey, list.filter((_, j) => j !== i)), focus: `${arrKey}.${i - 1}${m[3] ?? ""}` };
}

/** Novo tamanho depois de editar (tabela cresce por coluna, listas crescem com o texto…). */
export function fitBlock(prev: BlockSpec, next: BlockSpec, w: number, h: number, m: TextMeasure = approxTextMeasure): { w: number; h: number } {
  const d = BLOCK_DEFS[next.kind];
  if (prev.kind === next.kind && d.resize) ({ w, h } = d.resize(prev, next, w, h));
  return { w: Math.round(Math.max(40, w)), h: Math.round(Math.max(24, h, blockContentHeight(next, w, m))) };
}

// ---------------- transformar ----------------
export const blockContent = (s: BlockSpec): BlockContent => BLOCK_DEFS[s.kind].toContent(s);
/** Transforma um bloco em outro tipo levando o conteúdo (título, texto, itens, marcados). */
export function convertBlock(s: BlockSpec, to: BlockKind): BlockSpec {
  if (s.kind === to) return s;
  const c = blockContent(s);
  const d = BLOCK_DEFS[to];
  const color = (s as { color?: string }).color ?? (d.make() as { color: string }).color;
  const out = d.fromContent(c, to === "sticky" || to === "sheet" ? (STICKY_COLORS.includes(color) ? color : STICKY_COLORS[0]) : STICKY_COLORS.includes(color) ? BLOCK_COLORS[0] : color);
  return cleanBlock(out) ?? d.make();
}
export { BLOCK_COLORS, STICKY_COLORS };
