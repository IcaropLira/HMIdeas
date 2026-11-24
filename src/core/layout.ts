// Barras de ferramentas montáveis (0.9.1). Cada ferramenta/botão é um BLOQUINHO (item); bloquinhos ficam em BARRAS.
// Uma barra pode estar encaixada num lado da tela (esquerda, direita, embaixo) ou solta (flutuante, em x/y).
// Arrastar um bloquinho para fora da barra o desacopla (vira uma barra sozinha); soltá-lo em cima/embaixo (ou ao lado)
// de outro bloquinho acopla os dois numa barra nova; soltá-lo dentro de uma barra o encaixa ali. Sem alças.
// Puro e testável; só `useLayout` toca no localStorage (preferência de interface, não é o documento).
import { create } from "zustand";

export type ItemId =
  | "select" | "pen" | "text" | "eraser" | "laser" | "hand" | "shape" | "line" | "mindmap" | "frame" | "vertex" | "edge"
  | "undo" | "redo" | "options" | "colors" | "size" | "brushes" | "blocks" | "insert" | "templates" | "science" | "mapPanel"
  | "layers" | "paper" | "finger" | "quick" | "tape" | "pens";

export const ITEMS: { id: ItemId; label: string; hint: string; kind: "tool" | "action" | "widget" }[] = [
  { id: "select", label: "Selecionar / laço", hint: "Selecionar e laço", kind: "tool" },
  { id: "pen", label: "Caneta e pincéis", hint: "Caneta com todos os pincéis", kind: "tool" },
  { id: "text", label: "Texto", hint: "Ferramenta Texto", kind: "tool" },
  { id: "eraser", label: "Borracha", hint: "Traço inteiro ou pixel", kind: "tool" },
  { id: "laser", label: "Laser", hint: "Ponteiro e caneta laser", kind: "tool" },
  { id: "tape", label: "Fita", hint: "Esconder trechos (toque revela)", kind: "tool" },
  { id: "hand", label: "Mover tela", hint: "Mão", kind: "tool" },
  { id: "shape", label: "Formas", hint: "Retângulo, elipse, losango", kind: "tool" },
  { id: "line", label: "Setas e linhas", hint: "Seta e linha", kind: "tool" },
  { id: "mindmap", label: "Mapa mental", hint: "Ferramenta Mapa mental", kind: "tool" },
  { id: "frame", label: "Quadro", hint: "Ferramenta Quadro", kind: "tool" },
  { id: "vertex", label: "Vértice", hint: "Grafo: criar vértices", kind: "tool" },
  { id: "edge", label: "Aresta", hint: "Grafo: ligar vértices", kind: "tool" },
  { id: "undo", label: "Desfazer", hint: "Desfazer", kind: "action" },
  { id: "redo", label: "Refazer", hint: "Refazer", kind: "action" },
  { id: "options", label: "Opções da ferramenta", hint: "Ajustes da ferramenta ativa", kind: "action" },
  { id: "quick", label: "Acesso rápido", hint: "Favoritas, recentes, presets e macros", kind: "action" },
  { id: "pens", label: "Canetas favoritas", hint: "Pincel + cor + espessura num toque", kind: "widget" },
  { id: "colors", label: "Cores", hint: "Cores rápidas e seletor", kind: "widget" },
  { id: "size", label: "Espessura", hint: "Espessura do traço/borracha", kind: "widget" },
  { id: "brushes", label: "Pincéis", hint: "Painel de pincéis", kind: "action" },
  { id: "blocks", label: "Blocos", hint: "Post-it, tarefas, tabela… (biblioteca)", kind: "action" },
  { id: "insert", label: "Imagem e arquivos", hint: "Colar, imagem, PDF, link, vídeo", kind: "action" },
  { id: "templates", label: "Modelos", hint: "Modelos prontos", kind: "action" },
  { id: "science", label: "Grafos e matemática", hint: "Painel de grafos, figuras e calculadora", kind: "action" },
  { id: "mapPanel", label: "Mapa & quadros", hint: "Estilo de mapas mentais e quadros", kind: "action" },
  { id: "layers", label: "Camadas", hint: "Painel de camadas", kind: "action" },
  { id: "paper", label: "Papel", hint: "Padrão e cor da folha", kind: "action" },
  { id: "finger", label: "Desenhar com o dedo", hint: "Liga/desliga o dedo desenhando", kind: "action" },
];
const IDS = ITEMS.map((i) => i.id);
export const isItemId = (v: unknown): v is ItemId => typeof v === "string" && (IDS as string[]).includes(v);
export const itemLabel = (id: ItemId) => ITEMS.find((i) => i.id === id)?.label ?? id;

export type Side = "left" | "right" | "bottom";
export const SIDES: Side[] = ["left", "right", "bottom"];

export interface Bar {
  id: string;
  items: ItemId[];
  /** Encaixada num lado (as barras do mesmo lado ficam lado a lado, na ordem da lista) ou solta (null). */
  dock: Side | null;
  /** Posição da barra solta (canto superior esquerdo, px da janela). */
  x: number;
  y: number;
  /** Só vale solta; encaixada segue o lado (esquerda/direita = vertical). */
  vertical: boolean;
}

export interface Layout {
  version: 3;
  bars: Bar[];
  /** Trava: nada se arrasta (evita mover sem querer com a caneta). */
  locked: boolean;
}

let seq = 0;
export const newBarId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

export const isVertical = (b: Bar) => (b.dock ? b.dock !== "bottom" : b.vertical);
export const barsOn = (L: Layout, side: Side) => L.bars.filter((b) => b.dock === side);
export const floatingBars = (L: Layout) => L.bars.filter((b) => !b.dock);
export const hiddenItems = (L: Layout): ItemId[] => IDS.filter((id) => !L.bars.some((b) => b.items.includes(id)));

/** Monta um layout a partir de listas por lado (cada lista vira uma barra). */
export function makeLayout(spec: Partial<Record<Side, ItemId[][]>>, floats: { items: ItemId[]; x: number; y: number; vertical?: boolean }[] = []): Layout {
  const bars: Bar[] = [];
  for (const side of SIDES) for (const items of spec[side] ?? []) bars.push({ id: newBarId(), items: [...items], dock: side, x: 0, y: 0, vertical: side !== "bottom" });
  for (const f of floats) bars.push({ id: newBarId(), items: [...f.items], dock: null, x: f.x, y: f.y, vertical: f.vertical ?? true });
  return normalizeLayout({ version: 3, bars, locked: false });
}

/** Padrão (visual clássico): ferramentas embaixo; criar à esquerda; cor e espessura à direita. */
export const DEFAULT_LAYOUT: Layout = makeLayout({
  bottom: [["select", "pen", "text", "eraser", "laser", "hand"], ["shape", "line", "options", "quick"], ["undo", "redo"]],
  left: [["blocks", "insert", "templates"], ["mindmap", "frame", "mapPanel"], ["science", "vertex", "edge"], ["paper"]],
  right: [["brushes", "colors", "size"], ["layers"]],
});

// ---------------- operações ----------------

export function findItem(L: Layout, id: ItemId): { bar: number; index: number } | null {
  for (let b = 0; b < L.bars.length; b++) {
    const i = L.bars[b].items.indexOf(id);
    if (i >= 0) return { bar: b, index: i };
  }
  return null;
}

/** Destino de um bloquinho arrastado. */
export type ItemTarget =
  /** Dentro de uma barra, antes da posição `index` (a orientação só muda em barra de 1 item: `vertical`). */
  | { kind: "into"; bar: string; index: number; vertical?: boolean }
  /** Barra nova encaixada num lado (no fim das barras daquele lado, ou antes da barra `before`). */
  | { kind: "dock"; side: Side; before?: string | null }
  /** Barra nova solta. */
  | { kind: "float"; x: number; y: number; vertical: boolean };

const without = (L: Layout, ids: ItemId[]): Bar[] =>
  L.bars.map((b) => ({ ...b, items: b.items.filter((i) => !ids.includes(i)) }));

/** Move bloquinhos (um, ou todos de uma barra) para o destino. Barras que ficam vazias somem. */
export function moveItems(L: Layout, ids: ItemId[], target: ItemTarget): Layout {
  const valid = ids.filter((i, k) => isItemId(i) && ids.indexOf(i) === k);
  if (!valid.length) return L;
  // índice dentro da barra de destino descontando os itens que saem dela antes da posição
  let bars = L.bars;
  let insertAt = 0;
  if (target.kind === "into") {
    const tb = bars.find((b) => b.id === target.bar);
    if (!tb) return L;
    insertAt = Math.max(0, Math.min(target.index, tb.items.length)) - tb.items.slice(0, target.index).filter((i) => valid.includes(i)).length;
  }
  bars = without(L, valid);
  switch (target.kind) {
    case "into": {
      bars = bars.map((b) => {
        if (b.id !== target.bar) return b;
        const items = [...b.items];
        items.splice(insertAt, 0, ...valid);
        // barra de um item só: a direção do encaixe decide se vira vertical ou horizontal
        const vertical = b.items.length <= 1 && !b.dock && target.vertical !== undefined ? target.vertical : b.vertical;
        return { ...b, items, vertical };
      });
      break;
    }
    case "dock": {
      const nb: Bar = { id: newBarId(), items: valid, dock: target.side, x: 0, y: 0, vertical: target.side !== "bottom" };
      const at = target.before ? bars.findIndex((b) => b.id === target.before) : -1;
      bars = at >= 0 ? [...bars.slice(0, at), nb, ...bars.slice(at)] : [...bars, nb];
      break;
    }
    case "float": {
      bars = [...bars, { id: newBarId(), items: valid, dock: null, x: target.x, y: target.y, vertical: target.vertical }];
      break;
    }
  }
  return { ...L, bars: bars.filter((b) => b.items.length) };
}

/** Move a barra inteira: solta em x/y, encaixa num lado, ou funde com outra barra (no índice). */
export function moveBar(L: Layout, barId: string, target: ItemTarget): Layout {
  const bar = L.bars.find((b) => b.id === barId);
  if (!bar) return L;
  if (target.kind === "float") {
    return { ...L, bars: L.bars.map((b) => (b.id === barId ? { ...b, dock: null, x: target.x, y: target.y } : b)) };
  }
  if (target.kind === "into" && target.bar === barId) return L;
  if (target.kind === "dock") {
    const rest = L.bars.filter((b) => b.id !== barId);
    const moved: Bar = { ...bar, dock: target.side, vertical: target.side !== "bottom" };
    const at = target.before ? rest.findIndex((b) => b.id === target.before) : -1;
    return { ...L, bars: at >= 0 ? [...rest.slice(0, at), moved, ...rest.slice(at)] : [...rest, moved] };
  }
  return moveItems(L, bar.items, target);
}

export function setBarPos(L: Layout, barId: string, x: number, y: number): Layout {
  return { ...L, bars: L.bars.map((b) => (b.id === barId ? { ...b, x, y } : b)) };
}

export function rotateBar(L: Layout, barId: string): Layout {
  return { ...L, bars: L.bars.map((b) => (b.id === barId && !b.dock ? { ...b, vertical: !b.vertical } : b)) };
}

export function hideItem(L: Layout, id: ItemId): Layout {
  return { ...L, bars: without(L, [id]).filter((b) => b.items.length) };
}

/** Mostra de novo um bloquinho oculto: entra no fim da primeira barra encaixada (ou numa barra nova embaixo). */
export function showItem(L: Layout, id: ItemId): Layout {
  if (findItem(L, id)) return L;
  const first = L.bars.find((b) => b.dock);
  return first ? moveItems(L, [id], { kind: "into", bar: first.id, index: first.items.length }) : moveItems(L, [id], { kind: "dock", side: "bottom" });
}

// ---------------- validação / migração ----------------

/** Blocos do formato antigo (0.6–0.9) → bloquinhos. */
const V2_BLOCKS: Record<string, ItemId[]> = {
  tools: ["select", "pen", "text", "eraser", "laser", "hand"],
  shapes: ["shape", "line", "options"],
  history: ["undo", "redo"],
  insert: ["blocks", "insert"],
  brush: ["brushes"],
  colors: ["colors"],
  size: ["size"],
  map: ["mindmap", "frame", "mapPanel", "templates"],
  science: ["science", "vertex", "edge"],
  layers: ["layers"],
  page: ["paper", "finger"],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromV2(r: any): Layout {
  const order: string[] = Array.isArray(r.order) ? r.order.filter((x: unknown) => typeof x === "string" && V2_BLOCKS[x as string]) : [];
  for (const k of Object.keys(V2_BLOCKS)) if (!order.includes(k)) order.push(k);
  const side = (k: string): string => (r.side && typeof r.side[k] === "string" ? r.side[k] : "bottom");
  const bars: Bar[] = [];
  for (const s of SIDES) {
    // cada bloco antigo vira uma barra do mesmo lado
    for (const k of order.filter((x) => side(x) === s)) bars.push({ id: newBarId(), items: [...V2_BLOCKS[k]], dock: s, x: 0, y: 0, vertical: s !== "bottom" });
  }
  // grupos flutuantes: o líder guarda a posição, os membros vêm junto
  const leaders = order.filter((k) => side(k) === "float" && !(r.group && r.group[k]));
  for (const lead of leaders) {
    const pos = r.floats?.[lead];
    const members = order.filter((k) => side(k) === "float" && ((r.group && r.group[k]) || k) === lead);
    bars.push({
      id: newBarId(), items: members.flatMap((m) => V2_BLOCKS[m]), dock: null,
      x: Number.isFinite(pos?.x) ? pos.x : 140, y: Number.isFinite(pos?.y) ? pos.y : 140, vertical: pos?.vertical === true,
    });
  }
  return { version: 3, bars, locked: r.locked === true };
}

/** Aceita qualquer coisa (formato antigo, corrompido, futuro) e devolve um layout válido, sem bloquinho repetido. */
export function normalizeLayout(raw: unknown): Layout {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (raw && typeof raw === "object" ? raw : {}) as any;
  if (!Array.isArray(r.bars)) {
    if (r.side && typeof r.side === "object") return normalizeLayout(fromV2(r));
    return raw === DEFAULT_LAYOUT ? DEFAULT_LAYOUT : normalizeLayout(DEFAULT_LAYOUT);
  }
  const seen = new Set<ItemId>();
  const ids = new Set<string>();
  const bars: Bar[] = [];
  for (const b of r.bars) {
    if (!b || typeof b !== "object") continue;
    const items = (Array.isArray(b.items) ? b.items : []).filter((i: unknown): i is ItemId => isItemId(i) && !seen.has(i) && (seen.add(i), true));
    if (!items.length) continue;
    let id = typeof b.id === "string" && b.id ? b.id : newBarId();
    if (ids.has(id)) id = newBarId();
    ids.add(id);
    const dock: Side | null = SIDES.includes(b.dock) ? b.dock : null;
    bars.push({
      id, items, dock,
      x: Number.isFinite(b.x) ? b.x : 140, y: Number.isFinite(b.y) ? b.y : 140,
      vertical: dock ? dock !== "bottom" : b.vertical === true,
    });
  }
  return { version: 3, bars, locked: r.locked === true };
}

// ---------------- posição na tela ----------------

export interface Size { w: number; h: number }
export interface Viewport { w: number; h: number }
export const FLOAT_MARGIN = 8;

/** Mantém a barra inteira dentro da janela (se for maior que ela, fica colada na margem de cima/esquerda). */
export function clampPosition(pos: { x: number; y: number }, size: Size, vp: Viewport, margin = FLOAT_MARGIN): { x: number; y: number } {
  const maxX = Math.max(margin, vp.w - size.w - margin);
  const maxY = Math.max(margin, vp.h - size.h - margin);
  return { x: Math.min(Math.max(pos.x, margin), maxX), y: Math.min(Math.max(pos.y, margin), maxY) };
}

// ---------------- persistência ----------------

export const LAYOUT_KEY = "hm-ideas-layout-v1";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const browserStorage = (): Storage | null => {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
};

export function loadLayout(storage: Storage | null = browserStorage()): Layout {
  try {
    const raw = storage?.getItem(LAYOUT_KEY);
    return raw ? normalizeLayout(JSON.parse(raw)) : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(layout: Layout, storage: Storage | null = browserStorage()): void {
  try { storage?.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* navegação privada / cota: só não persiste */ }
}

interface LayoutState {
  layout: Layout;
  /** Troca o layout inteiro. `persist: false` durante um arraste (grava ao soltar). */
  setLayout: (layout: Layout, persist?: boolean) => void;
  update: (fn: (L: Layout) => Layout) => void;
  setLocked: (locked: boolean) => void;
  reset: () => void;
}

export const useLayout = create<LayoutState>((set, get) => {
  const apply = (layout: Layout, persist = true) => { if (persist) saveLayout(layout); set({ layout }); };
  return {
    layout: loadLayout(),
    setLayout: (layout, persist = true) => apply(layout, persist),
    update: (fn) => { const n = fn(get().layout); if (n !== get().layout) apply(n); },
    setLocked: (locked) => apply({ ...get().layout, locked }),
    reset: () => apply(normalizeLayout(DEFAULT_LAYOUT)),
  };
});
