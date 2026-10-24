// Layout das barras de ferramentas: cada BLOCO de botões (ferramentas, formas, cores…) fica embaixo, na lateral
// esquerda/direita, FLUTUANDO em qualquer lugar da tela ou oculto. O usuário escolhe pelo menu de configurações
// ou arrasta pela alça de 6 pontos. Puro e testável; só `useLayout` toca no localStorage (preferência de
// interface, não é o documento — ver AGENTS.md, regra 9).
import { create } from "zustand";

export type BlockId = "tools" | "shapes" | "history" | "brush" | "colors" | "size" | "map" | "page";
export type DockSide = "bottom" | "left" | "right" | "float" | "hidden";

export const BLOCKS: { id: BlockId; label: string; hint: string }[] = [
  { id: "tools", label: "Ferramentas", hint: "Selecionar, laço, caneta, texto, borracha e mão" },
  { id: "shapes", label: "Formas e linhas", hint: "Retângulo, elipse, losango, seta e linha" },
  { id: "history", label: "Desfazer e refazer", hint: "Os dois botões de histórico" },
  { id: "brush", label: "Pincéis", hint: "Abre o painel de pincéis" },
  { id: "colors", label: "Cores", hint: "Cores rápidas e seletor completo" },
  { id: "size", label: "Espessura", hint: "Controle de espessura do traço ou da borracha" },
  { id: "map", label: "Mapa mental e modelos", hint: "Mapa mental, quadros e modelos prontos" },
  { id: "page", label: "Papel e ajustes", hint: "Papel, ajustes da caneta, estilo do texto e dedo" },
];

export const SIDES: { id: DockSide; label: string }[] = [
  { id: "bottom", label: "Embaixo" },
  { id: "left", label: "Esquerda" },
  { id: "right", label: "Direita" },
  { id: "float", label: "Flutuante" },
  { id: "hidden", label: "Oculto" },
];

/** Posição de um bloco flutuante: canto superior esquerdo em pixels da janela e se a barra é vertical. */
export interface FloatPos { x: number; y: number; vertical: boolean }

export interface Layout {
  version: 2;
  /** Ordem global; dentro de cada lado vale a ordem em que os blocos aparecem aqui. */
  order: BlockId[];
  side: Record<BlockId, DockSide>;
  /** Posição de cada bloco cujo lado é "float". */
  floats: Partial<Record<BlockId, FloatPos>>;
  /** Trava as posições: esconde as alças de arrastar (evita arrastar sem querer com a caneta). */
  locked: boolean;
}

/** Padrão: embaixo só o essencial; cor, espessura e pincéis na direita; o resto na esquerda. */
export const DEFAULT_LAYOUT: Layout = {
  version: 2,
  order: ["tools", "shapes", "history", "brush", "colors", "size", "map", "page"],
  side: { tools: "bottom", shapes: "bottom", history: "bottom", brush: "right", colors: "right", size: "right", map: "left", page: "left" },
  floats: {},
  locked: false,
};

const IDS = BLOCKS.map((b) => b.id);
const isBlockId = (v: unknown): v is BlockId => typeof v === "string" && (IDS as string[]).includes(v);
const isSide = (v: unknown): v is DockSide => SIDES.some((s) => s.id === v);
const isFloatPos = (v: unknown): v is FloatPos => {
  const p = v as FloatPos | null;
  return !!p && typeof p === "object" && Number.isFinite(p.x) && Number.isFinite(p.y) && typeof p.vertical === "boolean";
};

/** Blocos de um lado, na ordem. */
export function blocksOn(layout: Layout, side: DockSide): BlockId[] {
  return layout.order.filter((id) => layout.side[id] === side);
}

/**
 * Aceita qualquer coisa (JSON da versão 1, corrompido, de versão futura) e devolve um layout válido:
 * ids e lados desconhecidos caem no padrão, blocos que faltam voltam, repetidos somem, e um bloco
 * "flutuante" sem posição válida volta para o lado padrão dele.
 */
export function normalizeLayout(raw: unknown): Layout {
  const r = (raw && typeof raw === "object" ? raw : {}) as { order?: unknown; side?: unknown; floats?: unknown; locked?: unknown };
  const sideIn = (r.side && typeof r.side === "object" ? r.side : {}) as Record<string, unknown>;
  const floatsIn = (r.floats && typeof r.floats === "object" ? r.floats : {}) as Record<string, unknown>;
  const side = {} as Record<BlockId, DockSide>;
  const floats: Partial<Record<BlockId, FloatPos>> = {};
  for (const id of IDS) {
    let s = isSide(sideIn[id]) ? (sideIn[id] as DockSide) : DEFAULT_LAYOUT.side[id];
    if (s === "float") {
      const p = floatsIn[id];
      if (isFloatPos(p)) floats[id] = { x: p.x, y: p.y, vertical: p.vertical };
      else s = DEFAULT_LAYOUT.side[id];
    }
    side[id] = s;
  }
  const order: BlockId[] = [];
  for (const id of Array.isArray(r.order) ? r.order : []) if (isBlockId(id) && !order.includes(id)) order.push(id);
  for (const id of DEFAULT_LAYOUT.order) if (!order.includes(id)) order.push(id);
  return { version: 2, order, side, floats, locked: r.locked === true };
}

/** Posição inicial de um bloco que passa a flutuar sem posição definida (escalonada para não empilhar). */
export function defaultFloat(layout: Layout): FloatPos {
  const n = Object.keys(layout.floats).length;
  return { x: 140 + 28 * n, y: 140 + 28 * n, vertical: false };
}

/**
 * Move o bloco para outro lado, no fim dele (depois do último bloco que já está lá).
 * Para "float", `pos` define onde; sem `pos` usa a posição que ele já tinha ou uma padrão.
 */
export function placeBlock(layout: Layout, id: BlockId, side: DockSide, pos?: FloatPos): Layout {
  if (layout.side[id] === side && !(side === "float" && pos)) return layout;
  const floats = { ...layout.floats };
  if (side === "float") floats[id] = pos ?? floats[id] ?? defaultFloat(layout);
  else delete floats[id];
  if (layout.side[id] === side) return { ...layout, floats }; // já flutuava: só muda a posição
  const rest = layout.order.filter((x) => x !== id);
  let at = rest.length;
  for (let i = rest.length - 1; i >= 0; i--) {
    if (layout.side[rest[i]] === side) { at = i + 1; break; }
  }
  const order = [...rest.slice(0, at), id, ...rest.slice(at)];
  return { ...layout, order, side: { ...layout.side, [id]: side }, floats };
}

/** Sobe (-1) ou desce (+1) o bloco entre os vizinhos do MESMO lado. */
export function moveBlock(layout: Layout, id: BlockId, dir: -1 | 1): Layout {
  const same = blocksOn(layout, layout.side[id]);
  const i = same.indexOf(id);
  const other = same[i + dir];
  if (i < 0 || !other) return layout;
  const order = [...layout.order];
  const a = order.indexOf(id);
  const b = order.indexOf(other);
  [order[a], order[b]] = [order[b], order[a]];
  return { ...layout, order };
}

// ---------------- posição na tela: limite e ímã ----------------

export interface Size { w: number; h: number }
export interface Viewport { w: number; h: number }
export const FLOAT_MARGIN = 8;
export const SNAP_THRESHOLD = 24;

/** Mantém o bloco inteiro dentro da janela (se for maior que ela, fica colado na margem de cima/esquerda). */
export function clampPosition(pos: { x: number; y: number }, size: Size, vp: Viewport, margin = FLOAT_MARGIN): { x: number; y: number } {
  const maxX = Math.max(margin, vp.w - size.w - margin);
  const maxY = Math.max(margin, vp.h - size.h - margin);
  return { x: Math.min(Math.max(pos.x, margin), maxX), y: Math.min(Math.max(pos.y, margin), maxY) };
}

type Edge = "start" | "end" | "center";

function nearest(value: number, targets: { at: number; edge: Edge }[], threshold: number): { at: number; edge: Edge } | null {
  let best: { at: number; edge: Edge } | null = null;
  for (const t of targets) {
    if (Math.abs(value - t.at) <= threshold && (!best || Math.abs(value - t.at) < Math.abs(value - best.at))) best = t;
  }
  return best;
}

export interface SnapResult extends FloatPos {
  /** Em quais pontos magnéticos encostou (para a interface destacar, se quiser). */
  edgeX: Edge | null;
  edgeY: Edge | null;
}

/**
 * Posição final de um bloco arrastado: primeiro limita à janela; depois, se chegou perto de uma borda
 * (ou do centro) em X ou Y, cola nela. Colar numa lateral deixa a barra vertical; colar em cima/embaixo,
 * horizontal; colar num canto (ou em nenhuma borda) mantém a orientação atual.
 * `insetLeft` reserva espaço à esquerda (a barra de páginas, quando aberta).
 */
export function snapPosition(
  pos: { x: number; y: number },
  size: Size,
  vp: Viewport,
  vertical: boolean,
  opts: { margin?: number; threshold?: number; insetLeft?: number } = {},
): SnapResult {
  const margin = opts.margin ?? FLOAT_MARGIN;
  const threshold = opts.threshold ?? SNAP_THRESHOLD;
  const insetLeft = opts.insetLeft ?? 0;
  const c = clampPosition(pos, size, vp, margin);
  const maxX = Math.max(margin, vp.w - size.w - margin);
  const maxY = Math.max(margin, vp.h - size.h - margin);
  const minX = Math.min(margin + insetLeft, maxX);
  const sx = nearest(c.x, [{ at: minX, edge: "start" }, { at: maxX, edge: "end" }, { at: Math.round((minX + maxX) / 2), edge: "center" }], threshold);
  const sy = nearest(c.y, [{ at: margin, edge: "start" }, { at: maxY, edge: "end" }, { at: Math.round((margin + maxY) / 2), edge: "center" }], threshold);
  const x = sx ? sx.at : c.x;
  const y = sy ? sy.at : c.y;
  const onSideEdge = sx?.edge === "start" || sx?.edge === "end";
  const onVerticalEdge = sy?.edge === "start" || sy?.edge === "end";
  const nextVertical = onSideEdge && !onVerticalEdge ? true : onVerticalEdge && !onSideEdge ? false : vertical;
  return { x, y, vertical: nextVertical, edgeX: sx?.edge ?? null, edgeY: sy?.edge ?? null };
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
    return raw ? normalizeLayout(JSON.parse(raw)) : normalizeLayout(DEFAULT_LAYOUT);
  } catch {
    return normalizeLayout(DEFAULT_LAYOUT);
  }
}

export function saveLayout(layout: Layout, storage: Storage | null = browserStorage()): void {
  try { storage?.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* navegação privada / cota: só não persiste */ }
}

interface LayoutState {
  layout: Layout;
  setSide: (id: BlockId, side: DockSide) => void;
  /** Posiciona um bloco flutuante. `persist: false` durante o arrastar (grava só ao soltar, com `commit`). */
  setFloat: (id: BlockId, pos: FloatPos, persist?: boolean) => void;
  setLocked: (locked: boolean) => void;
  move: (id: BlockId, dir: -1 | 1) => void;
  commit: () => void;
  reset: () => void;
}

export const useLayout = create<LayoutState>((set, get) => {
  const apply = (layout: Layout, persist = true) => { if (persist) saveLayout(layout); set({ layout }); };
  return {
    layout: loadLayout(),
    setSide: (id, side) => apply(placeBlock(get().layout, id, side)),
    setFloat: (id, pos, persist = true) => apply(placeBlock(get().layout, id, "float", pos), persist),
    setLocked: (locked) => apply({ ...get().layout, locked }),
    move: (id, dir) => apply(moveBlock(get().layout, id, dir)),
    commit: () => saveLayout(get().layout),
    reset: () => apply(normalizeLayout(DEFAULT_LAYOUT)),
  };
});
