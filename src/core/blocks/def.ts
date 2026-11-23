// Definição de um tipo de bloco: tudo o que o app precisa saber dele num lugar só (registro em index.ts).
import { BField, BHit, BlockPrims, TextMeasure } from "./kit";
import { BlockContent, BlockKind, BlockSpec, SpecOf } from "./types";

/** Campos do editor flutuante (o editor é gerado a partir disto). */
export type FormField =
  | { t: "text"; key: string; label: string; ph?: string }
  | { t: "area"; key: string; label: string; rows?: number; font?: "mono" | "serif" | "hand"; ph?: string }
  | { t: "number"; key: string; label: string; min?: number; max?: number; step?: number }
  | { t: "select"; key: string; label: string; options: [string | number, string][] }
  | { t: "bool"; key: string; label: string }
  | { t: "icon"; key: string; label: string; options: string[] }
  | { t: "lines"; key: string; label: string; add: string; ph?: string }
  | { t: "checklist"; key: string; label: string }
  | { t: "pairs"; key: string; label: string; a: [string, string]; b: [string, string]; add: string; aNum?: boolean; bArea?: boolean }
  | { t: "table"; key: string }
  | { t: "columns"; key: string }
  | { t: "goals"; key: string }
  | { t: "gantt"; key: string }
  | { t: "habits" }
  | { t: "cells" }
  | { t: "options" };

export type Behavior = "livre" | "estruturado" | "relacional";

export interface BlockDef<K extends BlockKind = BlockKind> {
  kind: K;
  label: string;
  hint: string;
  behavior: Behavior;
  /** paleta usada no editor */
  palette?: "sticky" | "block" | "none";
  make(): SpecOf<K>;
  size(s: SpecOf<K>): { w: number; h: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clean(raw: any, color: string): SpecOf<K>;
  draw(s: SpecOf<K>, w: number, h: number, m: TextMeasure, p: BlockPrims): void;
  /** altura mínima para o conteúdo caber (blocos que crescem) */
  minH?(s: SpecOf<K>, w: number, m: TextMeasure): number;
  /** toque numa área clicável */
  tap?(s: SpecOf<K>, hit: BHit): SpecOf<K>;
  /** campos editáveis direto no bloco */
  fields?(s: SpecOf<K>, w: number, h: number, m: TextMeasure): BField[];
  /** Enter num campo de lista editado no bloco: divide o item e diz qual campo focar */
  split?(s: SpecOf<K>, key: string, before: string, after: string): { spec: SpecOf<K>; focus: string } | null;
  form: FormField[];
  text(s: SpecOf<K>): string;
  toContent(s: SpecOf<K>): BlockContent;
  fromContent(c: BlockContent, color: string): SpecOf<K>;
  /** novo tamanho ao editar (tabela cresce por coluna etc.) */
  resize?(prev: SpecOf<K>, next: SpecOf<K>, w: number, h: number): { w: number; h: number };
}

export type AnyDef = BlockDef<BlockKind>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defineBlock = <K extends BlockKind>(d: BlockDef<K>): BlockDef<K> => d;
export type { BlockSpec };
