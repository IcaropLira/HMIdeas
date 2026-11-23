// Layout das barras de ferramentas: cada BLOCO de botões (ferramentas, formas, cores…) fica embaixo, na lateral
// esquerda/direita, FLUTUANDO em qualquer lugar da tela ou oculto. O usuário escolhe pelo menu de configurações
// ou arrasta pela alça de 6 pontos. Puro e testável; só `useLayout` toca no localStorage (preferência de
// interface, não é o documento — ver AGENTS.md, regra 9).
import { create } from "zustand";

export type BlockId = "tools" | "shapes" | "history" | "insert" | "brush" | "colors" | "size" | "map" | "page";
export type DockSide = "bottom" | "left" | "right" | "float" | "hidden";

export const BLOCKS: { id: BlockId; label: string; hint: string }[] = [
  { id: "tools", label: "Ferramentas", hint: "Selecionar, laço, caneta, texto, borracha e mão" },
  { id: "shapes", label: "Formas e linhas", hint: "Retângulo, elipse, losango, seta e linha" },
  { id: "history", label: "Desfazer e refazer", hint: "Os dois botões de histórico" },
  { id: "insert", label: "Inserir", hint: "Imagem, arquivo, link, colar e texto" },
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
  /**
   * Grupos de blocos flutuantes ("lego"): bloco → LÍDER do grupo. O líder é quem tem a posição em `floats`;
   * os membros vão juntos na mesma barra, na ordem de `order`. Bloco flutuante sem entrada aqui é líder de si mesmo.
   */
  group: Partial<Record<BlockId, BlockId>>;
}

/** Padrão: embaixo só o essencial; cor, espessura e pincéis na direita; o resto na esquerda. */
export const DEFAULT_LAYOUT: Layout = {
  version: 2,
  order: ["tools", "shapes", "history", "insert", "brush", "colors", "size", "map", "page"],
  side: { tools: "bottom", shapes: "bottom", history: "bottom", insert: "left", brush: "right", colors: "right", size: "right", map: "left", page: "left" },
  floats: {},
  locked: false,
  group: {},
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
  const r = (raw && typeof raw === "object" ? raw : {}) as { order?: unknown; side?: unknown; floats?: unknown; locked?: unknown; group?: unknown };
  const sideIn = (r.side && typeof r.side === "object" ? r.side : {}) as Record<string, unknown>;
  const floatsIn = (r.floats && typeof r.floats === "object" ? r.floats : {}) as Record<string, unknown>;
  const side = {} as Record<BlockId, DockSide>;
  const floats: Partial<Record<BlockId, FloatPos>> = {};
  for (const id of IDS) {
    let s = isSide(sideIn[id]) ? (sideIn[id] as DockSide) : DEFAULT_LAYOUT.side[id];
    if (s === "float") {
      const p = floatsIn[id];
      const member = r.group && typeof r.group === "object" && isBlockId((r.group as Record<string, unknown>)[id]);
      if (isFloatPos(p)) floats[id] = { x: p.x, y: p.y, vertical: p.vertical };
      else if (!member) s = DEFAULT_LAYOUT.side[id];
    }
    side[id] = s;
  }
  const order: BlockId[] = [];
  for (const id of Array.isArray(r.order) ? r.order : []) if (isBlockId(id) && !order.includes(id)) order.push(id);
  for (const id of DEFAULT_LAYOUT.order) if (!order.includes(id)) order.push(id);
  // grupos: só valem entre blocos flutuantes, apontando para um líder de verdade (sem correntes nem ciclos)
  const groupIn = (r.group && typeof r.group === "object" ? r.group : {}) as Record<string, unknown>;
  const group: Partial<Record<BlockId, BlockId>> = {};
  for (const id of IDS) {
    const g = groupIn[id];
    if (side[id] !== "float" || !isBlockId(g) || g === id) continue;
    if (side[g] === "float" && floats[g] && !isBlockId(groupIn[g] === g ? undefined : groupIn[g])) {
      group[id] = g;
      delete floats[id]; // membro não tem posição própria
    }
  }
  for (const id of IDS) if (side[id] === "float" && !floats[id] && !group[id]) side[id] = DEFAULT_LAYOUT.side[id];
  return { version: 2, order, side, floats, locked: r.locked === true, group };
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
  if (layout.side[id] === "float" && side === "float" && leaderOf(layout, id) === id) {
    return { ...layout, floats: { ...layout.floats, [id]: pos ?? layout.floats[id] ?? defaultFloat(layout) } }; // move o grupo
  }
  layout = detachBlock(layout, id);
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

/**
 * Encaixa o bloco num lado, ANTES de `beforeId` (que deve estar nesse lado) ou no fim se for null.
 * É o que permite juntar de novo uma barra solta: soltar sobre outra barra ou numa zona de encaixe.
 */
export function placeBlockAt(layout: Layout, id: BlockId, side: Exclude<DockSide, "float">, beforeId: BlockId | null): Layout {
  layout = detachBlock(layout, id);
  const rest = layout.order.filter((x) => x !== id);
  let at = rest.length;
  if (beforeId && beforeId !== id && layout.side[beforeId] === side) at = rest.indexOf(beforeId);
  else for (let i = rest.length - 1; i >= 0; i--) if (layout.side[rest[i]] === side) { at = i + 1; break; }
  const order = [...rest.slice(0, at), id, ...rest.slice(at)];
  const floats = { ...layout.floats };
  delete floats[id];
  return { ...layout, order, side: { ...layout.side, [id]: side }, floats };
}

/** "Voltar ao lugar": devolve o bloco ao lado padrão dele (nunca flutuante/oculto). */
export function homeBlock(layout: Layout, id: BlockId): Layout {
  const home = DEFAULT_LAYOUT.side[id];
  return placeBlockAt(layout, id, home === "float" || home === "hidden" ? "bottom" : home, null);
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

// ---------------- grupos ("lego") ----------------

/** Líder do grupo de um bloco flutuante (ele mesmo, se estiver sozinho); null se não flutua. */
export function leaderOf(layout: Layout, id: BlockId): BlockId | null {
  if (layout.side[id] !== "float") return null;
  return layout.group[id] ?? id;
}

/** Blocos de um grupo flutuante, na ordem. */
export function groupMembers(layout: Layout, leader: BlockId): BlockId[] {
  return layout.order.filter((b) => layout.side[b] === "float" && (layout.group[b] ?? b) === leader);
}

/** Líderes de todos os grupos flutuantes. */
export const floatLeaders = (layout: Layout): BlockId[] =>
  layout.order.filter((b) => layout.side[b] === "float" && !layout.group[b]);

/**
 * Tira o bloco do grupo flutuante (fica sozinho, na mesma posição do grupo). Se ele era o líder,
 * o próximo membro herda a posição e a liderança. Bloco que não está em grupo: nada muda.
 */
export function detachBlock(layout: Layout, id: BlockId): Layout {
  const leader = leaderOf(layout, id);
  if (!leader) return layout;
  const members = groupMembers(layout, leader);
  if (members.length < 2) return layout;
  const group = { ...layout.group };
  const floats = { ...layout.floats };
  const pos = floats[leader] ?? defaultFloat(layout);
  if (leader === id) {
    const heir = members.find((m) => m !== id)!;
    delete group[heir];
    floats[heir] = pos;
    for (const m of members) if (m !== id && m !== heir) group[m] = heir;
  } else {
    delete group[id];
  }
  floats[id] = { ...pos };
  return { ...layout, group, floats };
}

/** Junta o bloco ao grupo do bloco `target` (flutuante), antes ou depois dele. */
export function joinGroup(layout: Layout, id: BlockId, target: BlockId, before: boolean): Layout {
  const leader = leaderOf(layout, target);
  if (!leader || id === target) return layout;
  if (leaderOf(layout, id) === leader) {
    // mesmo grupo: só reordena
  } else {
    layout = detachBlock(layout, id);
  }
  // se `id` era líder de si mesmo e de ninguém mais, deixa de ter posição
  const floats = { ...layout.floats };
  if (id !== leader) delete floats[id];
  const group = { ...layout.group };
  if (id !== leader) group[id] = leader;
  const rest = layout.order.filter((x) => x !== id);
  const at = rest.indexOf(target) + (before ? 0 : 1);
  const order = [...rest.slice(0, at), id, ...rest.slice(at)];
  return { ...layout, order, side: { ...layout.side, [id]: "float" }, floats, group };
}

/** Move o grupo inteiro (posição do líder). */
export function moveGroup(layout: Layout, leader: BlockId, pos: FloatPos): Layout {
  if (leaderOf(layout, leader) !== leader) return layout;
  return { ...layout, floats: { ...layout.floats, [leader]: pos } };
}

/** Encaixa o grupo inteiro numa barra (antes de `beforeId`, ou no fim), mantendo a ordem dos blocos. */
export function dockGroup(layout: Layout, leader: BlockId, side: Exclude<DockSide, "float">, beforeId: BlockId | null = null): Layout {
  const members = leaderOf(layout, leader) === leader ? groupMembers(layout, leader) : [leader];
  let l = layout;
  for (const m of members) l = placeBlockAt(l, m, side, beforeId);
  return l;
}

/** Junta o grupo inteiro a OUTRO grupo flutuante, ao lado do bloco `target`. */
export function mergeGroups(layout: Layout, leader: BlockId, target: BlockId, before: boolean): Layout {
  const members = groupMembers(layout, leader);
  let l = layout;
  let anchor = target;
  let first = true;
  for (const m of members) {
    l = joinGroup(l, m, anchor, first ? before : false);
    anchor = m;
    first = false;
  }
  return l;
}

/** Tira a barra inteira de um lado (esquerda/direita/embaixo) e a transforma num grupo flutuante em `pos`. */
export function floatSide(layout: Layout, side: "bottom" | "left" | "right", pos: FloatPos): { layout: Layout; leader: BlockId | null } {
  const ids = blocksOn(layout, side);
  if (!ids.length) return { layout, leader: null };
  const [leader, ...rest] = ids;
  const sideMap = { ...layout.side };
  const group = { ...layout.group };
  for (const id of ids) sideMap[id] = "float";
  for (const id of rest) group[id] = leader;
  return { layout: { ...layout, side: sideMap, group, floats: { ...layout.floats, [leader]: pos } }, leader };
}

/** "Encaixar": devolve cada bloco do grupo ao lado de fábrica dele. */
export function homeGroup(layout: Layout, leader: BlockId): Layout {
  const members = leaderOf(layout, leader) === leader ? groupMembers(layout, leader) : [leader];
  let l = layout;
  for (const m of members) l = homeBlock(l, m);
  return l;
}

/** Retângulos de outras barras (tela) para o ímã entre barras. */
export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Ímã entre barras: encosta a borda do bloco arrastado na borda de outra barra (lado a lado, com `gap`) e alinha
 * topo/esquerda quando estão próximos. Devolve a posição ajustada (ou a mesma, se nada estiver perto).
 */
export function snapToRects(pos: { x: number; y: number }, size: Size, rects: Rect[], threshold = SNAP_THRESHOLD / 2, gap = 6): { x: number; y: number } {
  let bestX: { d: number; v: number } | null = null;
  let bestY: { d: number; v: number } | null = null;
  const tryX = (v: number) => { const d = Math.abs(pos.x - v); if (d <= threshold && (!bestX || d < bestX.d)) bestX = { d, v }; };
  const tryY = (v: number) => { const d = Math.abs(pos.y - v); if (d <= threshold && (!bestY || d < bestY.d)) bestY = { d, v }; };
  for (const r of rects) {
    const overlapY = pos.y < r.y + r.h + threshold && pos.y + size.h > r.y - threshold;
    const overlapX = pos.x < r.x + r.w + threshold && pos.x + size.w > r.x - threshold;
    if (overlapY) { tryX(r.x + r.w + gap); tryX(r.x - size.w - gap); tryX(r.x); }
    if (overlapX) { tryY(r.y + r.h + gap); tryY(r.y - size.h - gap); tryY(r.y); }
  }
  const bx = bestX as { d: number; v: number } | null;
  const by = bestY as { d: number; v: number } | null;
  return { x: bx ? bx.v : pos.x, y: by ? by.v : pos.y };
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
  opts: { margin?: number; threshold?: number; insetLeft?: number; pointer?: { x: number; y: number } } = {},
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
  // Com o ponteiro informado, a orientação só troca se ELE estiver perto daquela borda: uma barra alta empurrada contra
  // o fundo da tela (só por não caber) não deve virar horizontal.
  const P = opts.pointer;
  const near = 96;
  const pSide = !P || P.x <= near + insetLeft || P.x >= vp.w - near;
  const pTopBottom = !P || P.y <= near || P.y >= vp.h - near;
  const onSideEdge = (sx?.edge === "start" || sx?.edge === "end") && pSide;
  const onVerticalEdge = (sy?.edge === "start" || sy?.edge === "end") && pTopBottom;
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
  /** Encaixa numa barra (lado) antes de `beforeId`. */
  dockAt: (id: BlockId, side: Exclude<DockSide, "float">, beforeId: BlockId | null) => void;
  home: (id: BlockId) => void;
  /** Posiciona um bloco flutuante. `persist: false` durante o arrastar (grava só ao soltar, com `commit`). */
  setFloat: (id: BlockId, pos: FloatPos, persist?: boolean) => void;
  setLocked: (locked: boolean) => void;
  /** Troca o layout inteiro (gestos de grupo). `persist: false` durante o arraste. */
  setLayout: (layout: Layout, persist?: boolean) => void;
  homeGroup: (leader: BlockId) => void;
  move: (id: BlockId, dir: -1 | 1) => void;
  commit: () => void;
  reset: () => void;
}

export const useLayout = create<LayoutState>((set, get) => {
  const apply = (layout: Layout, persist = true) => { if (persist) saveLayout(layout); set({ layout }); };
  return {
    layout: loadLayout(),
    setSide: (id, side) => apply(placeBlock(get().layout, id, side)),
    dockAt: (id, side, beforeId) => apply(placeBlockAt(get().layout, id, side, beforeId)),
    home: (id) => apply(homeBlock(get().layout, id)),
    setFloat: (id, pos, persist = true) => apply(placeBlock(get().layout, id, "float", pos), persist),
    setLocked: (locked) => apply({ ...get().layout, locked }),
    setLayout: (layout, persist = true) => apply(layout, persist),
    homeGroup: (leader) => apply(homeGroup(get().layout, leader)),
    move: (id, dir) => apply(moveBlock(get().layout, id, dir)),
    commit: () => saveLayout(get().layout),
    reset: () => apply(normalizeLayout(DEFAULT_LAYOUT)),
  };
});
