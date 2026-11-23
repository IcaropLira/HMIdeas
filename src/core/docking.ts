// Gerenciador de janelas acopláveis (Docking Window Manager), puro. Painéis vivem em PILHAS (abas) dentro de uma das
// quatro áreas de encaixe (esquerda, direita, em cima, embaixo) ou em JANELAS FLUTUANTES. Fechar um painel guarda o
// lugar dele (reabre onde estava) e não mexe nas configurações próprias do painel (que ficam nos stores de cada um).
// Toda operação devolve um layout NOVO; `normalizeDock` aceita qualquer JSON e devolve um layout válido.

export type PanelId =
  | "props" | "transform" | "align" | "objects" | "layers" | "colors" | "brushes" | "history" | "navigator"
  | "library" | "materials" | "shortcuts" | "text" | "tools" | "paper" | "map" | "science";

export interface PanelInfo { id: PanelId; label: string; hint: string }

/** Ordem = ordem no menu Janela. */
export const PANELS: PanelInfo[] = [
  { id: "tools", label: "Ferramentas", hint: "Todas as ferramentas e subferramentas" },
  { id: "props", label: "Propriedades", hint: "Opções da ferramenta ou do objeto selecionado" },
  { id: "transform", label: "Transformação", hint: "Posição, tamanho, giro e espelhar" },
  { id: "align", label: "Alinhamento", hint: "Alinhar, distribuir, igualar, grade e encaixe" },
  { id: "objects", label: "Objetos", hint: "Árvore de objetos, grupos e subgrupos" },
  { id: "layers", label: "Camadas", hint: "Camadas da página" },
  { id: "colors", label: "Cores", hint: "Seletor de cor, paletas e recentes" },
  { id: "brushes", label: "Pincéis", hint: "Pincéis da caneta" },
  { id: "text", label: "Texto", hint: "Fontes, tamanho, estilo e espaçamento" },
  { id: "history", label: "Histórico", hint: "Passos de desfazer/refazer" },
  { id: "navigator", label: "Navegador", hint: "Miniatura da página e zoom" },
  { id: "library", label: "Biblioteca", hint: "Blocos, adesivos e modelos de bloco" },
  { id: "materials", label: "Materiais", hint: "Modelos prontos (Kanban, SWOT, Cornell…)" },
  { id: "paper", label: "Papel", hint: "Padrão, cor e formato da folha" },
  { id: "map", label: "Mapa & quadros", hint: "Layout, formas e cores de mapas mentais" },
  { id: "science", label: "Grafos e matemática", hint: "Grafos, figuras, gráficos e calculadora" },
  { id: "shortcuts", label: "Atalhos", hint: "Ver e trocar atalhos de teclado" },
];
const PANEL_IDS = PANELS.map((p) => p.id);
export const panelLabel = (id: PanelId) => PANELS.find((p) => p.id === id)?.label ?? id;

export type Side = "left" | "right" | "top" | "bottom";
export const SIDES: Side[] = ["left", "right", "top", "bottom"];
export const isVerticalSide = (s: Side) => s === "left" || s === "right";

export interface Stack {
  id: string;
  panels: PanelId[];
  active: PanelId;
  /** Peso no espaço da área (as pilhas dividem a altura — ou largura, em cima/embaixo — pelo peso). */
  size: number;
  /** Minimizada: só a barra de abas. */
  collapsed?: boolean;
}

export interface DockArea {
  stacks: Stack[];
  /** Largura (esquerda/direita) ou altura (em cima/embaixo), em px. */
  size: number;
  /** Recolhida em ícones (uma coluna fina de botões). */
  iconic: boolean;
}

export interface FloatWin {
  id: string;
  panels: PanelId[];
  active: PanelId;
  x: number;
  y: number;
  w: number;
  h: number;
  collapsed?: boolean;
}

export type Place =
  | { kind: "dock"; side: Side; stack: number; split?: boolean }
  | { kind: "float"; x: number; y: number; w: number; h: number };

export interface DockLayout {
  version: 1;
  areas: Record<Side, DockArea>;
  floats: FloatWin[];
  /** Último lugar de cada painel fechado (reabre ali). */
  last: Partial<Record<PanelId, Place>>;
  /** Travado: nada se arrasta, só abas e botões. */
  locked: boolean;
}

export const AREA_MIN: Record<Side, number> = { left: 200, right: 200, top: 120, bottom: 120 };
export const AREA_MAX: Record<Side, number> = { left: 640, right: 640, top: 520, bottom: 520 };
export const AREA_DEFAULT: Record<Side, number> = { left: 300, right: 320, top: 220, bottom: 240 };
export const FLOAT_MIN = { w: 220, h: 140 };

let seq = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

const emptyArea = (side: Side): DockArea => ({ stacks: [], size: AREA_DEFAULT[side], iconic: false });
export const emptyDock = (): DockLayout => ({
  version: 1,
  areas: { left: emptyArea("left"), right: emptyArea("right"), top: emptyArea("top"), bottom: emptyArea("bottom") },
  floats: [],
  last: {},
  locked: false,
});

/** Monta um layout a partir de listas de abas por pilha (presets de workspace). */
export function dockOf(spec: Partial<Record<Side, { size?: number; iconic?: boolean; stacks: (PanelId[] | { panels: PanelId[]; size?: number; collapsed?: boolean })[] }>>, floats: Omit<FloatWin, "id" | "active">[] = []): DockLayout {
  const L = emptyDock();
  for (const side of SIDES) {
    const a = spec[side];
    if (!a) continue;
    L.areas[side] = {
      size: a.size ?? AREA_DEFAULT[side],
      iconic: !!a.iconic,
      stacks: a.stacks.map((s) => {
        const o = Array.isArray(s) ? { panels: s } : s;
        return { id: uid("s"), panels: o.panels, active: o.panels[0], size: o.size ?? 1, ...(o.collapsed ? { collapsed: true } : {}) };
      }),
    };
  }
  L.floats = floats.map((f) => ({ ...f, id: uid("f"), active: f.panels[0] }));
  return normalizeDock(L);
}

// ---------- consultas ----------

export type Where =
  | { where: "dock"; side: Side; stack: number; tab: number }
  | { where: "float"; float: number; tab: number };

export function findPanel(L: DockLayout, id: PanelId): Where | null {
  for (const side of SIDES) {
    const st = L.areas[side].stacks;
    for (let i = 0; i < st.length; i++) {
      const t = st[i].panels.indexOf(id);
      if (t >= 0) return { where: "dock", side, stack: i, tab: t };
    }
  }
  for (let i = 0; i < L.floats.length; i++) {
    const t = L.floats[i].panels.indexOf(id);
    if (t >= 0) return { where: "float", float: i, tab: t };
  }
  return null;
}

export const isOpen = (L: DockLayout, id: PanelId) => !!findPanel(L, id);

/** Painel aparecendo agora (aba ativa de uma pilha aberta, área não recolhida em ícones). */
export function isShowing(L: DockLayout, id: PanelId): boolean {
  const w = findPanel(L, id);
  if (!w) return false;
  if (w.where === "float") return L.floats[w.float].active === id && !L.floats[w.float].collapsed;
  const a = L.areas[w.side];
  const s = a.stacks[w.stack];
  return !a.iconic && s.active === id && !s.collapsed;
}

export const openPanels = (L: DockLayout): PanelId[] =>
  [...SIDES.flatMap((s) => L.areas[s].stacks.flatMap((x) => x.panels)), ...L.floats.flatMap((f) => f.panels)];

/** Largura/altura ocupada por área (0 se vazia; recolhida em ícones = faixa fina). */
export const ICON_STRIP = 44;
export function areaExtent(L: DockLayout, side: Side): number {
  const a = L.areas[side];
  if (!a.stacks.length) return 0;
  return a.iconic ? ICON_STRIP : a.size;
}

// ---------- operações ----------

const clone = (L: DockLayout): DockLayout => ({
  ...L,
  areas: {
    left: { ...L.areas.left, stacks: L.areas.left.stacks.map((s) => ({ ...s, panels: [...s.panels] })) },
    right: { ...L.areas.right, stacks: L.areas.right.stacks.map((s) => ({ ...s, panels: [...s.panels] })) },
    top: { ...L.areas.top, stacks: L.areas.top.stacks.map((s) => ({ ...s, panels: [...s.panels] })) },
    bottom: { ...L.areas.bottom, stacks: L.areas.bottom.stacks.map((s) => ({ ...s, panels: [...s.panels] })) },
  },
  floats: L.floats.map((f) => ({ ...f, panels: [...f.panels] })),
  last: { ...L.last },
});

/** Tira o painel de onde estiver (guarda o lugar em `last`). Pilhas/janelas vazias somem. */
export function removePanel(L: DockLayout, id: PanelId): DockLayout {
  const w = findPanel(L, id);
  if (!w) return L;
  const N = clone(L);
  if (w.where === "dock") {
    const a = N.areas[w.side];
    const s = a.stacks[w.stack];
    N.last[id] = { kind: "dock", side: w.side, stack: w.stack, split: s.panels.length === 1 };
    s.panels.splice(w.tab, 1);
    if (!s.panels.length) a.stacks.splice(w.stack, 1);
    else if (s.active === id) s.active = s.panels[Math.min(w.tab, s.panels.length - 1)];
  } else {
    const f = N.floats[w.float];
    N.last[id] = { kind: "float", x: f.x, y: f.y, w: f.w, h: f.h };
    f.panels.splice(w.tab, 1);
    if (!f.panels.length) N.floats.splice(w.float, 1);
    else if (f.active === id) f.active = f.panels[Math.min(w.tab, f.panels.length - 1)];
  }
  return N;
}

export const closePanel = removePanel;

/** Mostra o painel: se já está aberto, vira a aba ativa (e a área sai de "ícones"); senão reabre no último lugar. */
export function openPanel(L: DockLayout, id: PanelId, place?: Place): DockLayout {
  const w = findPanel(L, id);
  if (w) {
    const N = clone(L);
    if (w.where === "dock") {
      const s = N.areas[w.side].stacks[w.stack];
      s.active = id;
      s.collapsed = false;
    } else {
      const f = N.floats[w.float];
      f.active = id;
      f.collapsed = false;
      // traz a janela para frente
      N.floats.push(N.floats.splice(w.float, 1)[0]);
    }
    return N;
  }
  const to = place ?? L.last[id] ?? { kind: "dock", side: "right", stack: 0 };
  if (to.kind === "float") return dropPanels(L, [id], { kind: "float", x: to.x, y: to.y, w: to.w, h: to.h }, id);
  const st = L.areas[to.side].stacks;
  if (!st.length) return dropPanels(L, [id], { kind: "edge", side: to.side }, id);
  if (to.split) return dropPanels(L, [id], { kind: "split", side: to.side, stack: Math.min(to.stack, st.length), where: "before" }, id);
  return dropPanels(L, [id], { kind: "tab", side: to.side, stack: Math.min(to.stack, st.length - 1) }, id);
}

export function togglePanel(L: DockLayout, id: PanelId): DockLayout {
  return isShowing(L, id) ? removePanel(L, id) : openPanel(L, id);
}

export type DropTarget =
  | { kind: "tab"; side: Side; stack: number; index?: number }
  | { kind: "tabf"; float: string; index?: number }
  | { kind: "split"; side: Side; stack: number; where: "before" | "after" }
  | { kind: "edge"; side: Side; where?: "start" | "end" }
  | { kind: "float"; x: number; y: number; w: number; h: number };

/** Move painéis (uma aba ou a pilha toda) para o destino. */
export function dropPanels(L: DockLayout, ids: PanelId[], target: DropTarget, active: PanelId = ids[0]): DockLayout {
  const valid = ids.filter((i, k) => PANEL_IDS.includes(i) && ids.indexOf(i) === k);
  if (!valid.length) return L;
  // destino por id (a remoção muda índices): identifica a pilha/janela antes de tirar
  let stackId: string | null = null;
  if (target.kind === "tab" || target.kind === "split") stackId = L.areas[target.side].stacks[target.stack]?.id ?? null;
  let N = L;
  for (const id of valid) N = removePanel(N, id);
  N = clone(N);
  for (const id of valid) delete N.last[id];
  const stIdx = (side: Side) => (stackId ? N.areas[side].stacks.findIndex((s) => s.id === stackId) : -1);
  const fresh = (): Stack => ({ id: uid("s"), panels: [...valid], active, size: 1 });
  switch (target.kind) {
    case "tab": {
      const i = stIdx(target.side);
      if (i < 0) { N.areas[target.side].stacks.push(fresh()); break; }
      const s = N.areas[target.side].stacks[i];
      const at = Math.max(0, Math.min(target.index ?? s.panels.length, s.panels.length));
      s.panels.splice(at, 0, ...valid);
      s.active = active;
      s.collapsed = false;
      break;
    }
    case "tabf": {
      const f = N.floats.find((x) => x.id === target.float);
      if (!f) { N.floats.push({ id: uid("f"), panels: [...valid], active, x: 120, y: 120, w: 320, h: 420 }); break; }
      const at = Math.max(0, Math.min(target.index ?? f.panels.length, f.panels.length));
      f.panels.splice(at, 0, ...valid);
      f.active = active;
      f.collapsed = false;
      break;
    }
    case "split": {
      const st = N.areas[target.side].stacks;
      const i = stIdx(target.side);
      const at = i < 0 ? st.length : target.where === "before" ? i : i + 1;
      // a pilha nova pega metade do peso da vizinha
      const nb = st[i] ?? null;
      const s = fresh();
      if (nb) { s.size = nb.size / 2; nb.size = nb.size / 2; }
      st.splice(at, 0, s);
      break;
    }
    case "edge": {
      const a = N.areas[target.side];
      if (target.where === "start") a.stacks.unshift(fresh());
      else a.stacks.push(fresh());
      a.iconic = false;
      break;
    }
    case "float": {
      N.floats.push({ id: uid("f"), panels: [...valid], active, x: target.x, y: target.y, w: Math.max(FLOAT_MIN.w, target.w), h: Math.max(FLOAT_MIN.h, target.h) });
      break;
    }
  }
  return N;
}

export function setActive(L: DockLayout, container: string, id: PanelId): DockLayout {
  const N = clone(L);
  for (const side of SIDES) for (const s of N.areas[side].stacks) if (s.id === container && s.panels.includes(id)) { s.active = id; s.collapsed = false; }
  for (const f of N.floats) if (f.id === container && f.panels.includes(id)) { f.active = id; f.collapsed = false; }
  return N;
}

/** Reordena uma aba dentro da própria pilha/janela. */
export function moveTab(L: DockLayout, id: PanelId, toIndex: number): DockLayout {
  const w = findPanel(L, id);
  if (!w) return L;
  const N = clone(L);
  const list = w.where === "dock" ? N.areas[w.side].stacks[w.stack].panels : N.floats[w.float].panels;
  list.splice(w.tab, 1);
  list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, id);
  return N;
}

export function resizeArea(L: DockLayout, side: Side, size: number): DockLayout {
  const v = Math.round(Math.max(AREA_MIN[side], Math.min(AREA_MAX[side], size)));
  if (v === L.areas[side].size) return L;
  return { ...L, areas: { ...L.areas, [side]: { ...L.areas[side], size: v } } };
}

/** Divisória entre a pilha i e a i+1: `frac` = fração do espaço das duas que fica com a de cima/esquerda. */
export function resizeStacks(L: DockLayout, side: Side, i: number, frac: number): DockLayout {
  const st = L.areas[side].stacks;
  if (i < 0 || i + 1 >= st.length) return L;
  const N = clone(L);
  const a = N.areas[side].stacks[i], b = N.areas[side].stacks[i + 1];
  const tot = a.size + b.size;
  const f = Math.max(0.1, Math.min(0.9, frac));
  a.size = tot * f;
  b.size = tot * (1 - f);
  return N;
}

export function toggleIconic(L: DockLayout, side: Side, on?: boolean): DockLayout {
  const v = on ?? !L.areas[side].iconic;
  return { ...L, areas: { ...L.areas, [side]: { ...L.areas[side], iconic: v } } };
}

export function toggleCollapsed(L: DockLayout, container: string): DockLayout {
  const N = clone(L);
  for (const side of SIDES) for (const s of N.areas[side].stacks) if (s.id === container) s.collapsed = !s.collapsed;
  for (const f of N.floats) if (f.id === container) f.collapsed = !f.collapsed;
  return N;
}

export function setFloatRect(L: DockLayout, id: string, r: Partial<{ x: number; y: number; w: number; h: number }>): DockLayout {
  const i = L.floats.findIndex((f) => f.id === id);
  if (i < 0) return L;
  const N = clone(L);
  const f = N.floats[i];
  Object.assign(f, r);
  f.w = Math.max(FLOAT_MIN.w, f.w);
  f.h = Math.max(FLOAT_MIN.h, f.h);
  return N;
}

export function raiseFloat(L: DockLayout, id: string): DockLayout {
  const i = L.floats.findIndex((f) => f.id === id);
  if (i < 0 || i === L.floats.length - 1) return L;
  const N = clone(L);
  N.floats.push(N.floats.splice(i, 1)[0]);
  return N;
}

/** Fecha a pilha/janela inteira. */
export function closeContainer(L: DockLayout, container: string): DockLayout {
  let ids: PanelId[] = [];
  for (const side of SIDES) for (const s of L.areas[side].stacks) if (s.id === container) ids = s.panels;
  for (const f of L.floats) if (f.id === container) ids = f.panels;
  return ids.reduce((acc, id) => removePanel(acc, id), L);
}

/**
 * Janelas fora da tela voltam (monitor desligado, janela menor): a barra de título fica sempre ao alcance
 * e a janela nunca é maior que a tela.
 */
export function clampFloats(L: DockLayout, vw: number, vh: number, margin = 8): DockLayout {
  let changed = false;
  const floats = L.floats.map((f) => {
    const w = Math.min(f.w, Math.max(FLOAT_MIN.w, vw - margin * 2));
    const h = Math.min(f.h, Math.max(FLOAT_MIN.h, vh - margin * 2));
    const x = Math.max(margin - w + 80, Math.min(f.x, vw - 80));
    const y = Math.max(margin, Math.min(f.y, vh - 40));
    if (x !== f.x || y !== f.y || w !== f.w || h !== f.h) { changed = true; return { ...f, x, y, w, h }; }
    return f;
  });
  return changed ? { ...L, floats } : L;
}

// ---------- validação ----------

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeDock(raw: any): DockLayout {
  const L = emptyDock();
  if (!raw || typeof raw !== "object") return L;
  const seen = new Set<PanelId>();
  const take = (list: unknown): PanelId[] =>
    Array.isArray(list) ? list.filter((p): p is PanelId => PANEL_IDS.includes(p as PanelId) && !seen.has(p as PanelId) && (seen.add(p as PanelId), true)) : [];
  for (const side of SIDES) {
    const a = raw.areas?.[side];
    if (!a) continue;
    const stacks: Stack[] = [];
    for (const s of Array.isArray(a.stacks) ? a.stacks : []) {
      const panels = take(s?.panels);
      if (!panels.length) continue;
      stacks.push({
        id: typeof s.id === "string" && s.id ? s.id : uid("s"),
        panels,
        active: panels.includes(s.active) ? s.active : panels[0],
        size: Math.max(0.05, num(s.size, 1)),
        ...(s.collapsed === true ? { collapsed: true } : {}),
      });
    }
    L.areas[side] = { stacks, size: Math.max(AREA_MIN[side], Math.min(AREA_MAX[side], num(a.size, AREA_DEFAULT[side]))), iconic: a.iconic === true };
  }
  for (const f of Array.isArray(raw.floats) ? raw.floats : []) {
    const panels = take(f?.panels);
    if (!panels.length) continue;
    L.floats.push({
      id: typeof f.id === "string" && f.id ? f.id : uid("f"),
      panels,
      active: panels.includes(f.active) ? f.active : panels[0],
      x: num(f.x, 120), y: num(f.y, 120),
      w: Math.max(FLOAT_MIN.w, num(f.w, 320)), h: Math.max(FLOAT_MIN.h, num(f.h, 420)),
      ...(f.collapsed === true ? { collapsed: true } : {}),
    });
  }
  if (raw.last && typeof raw.last === "object") {
    for (const [k, v] of Object.entries(raw.last)) {
      if (!PANEL_IDS.includes(k as PanelId) || !v || typeof v !== "object") continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = v as any;
      if (p.kind === "float") L.last[k as PanelId] = { kind: "float", x: num(p.x, 120), y: num(p.y, 120), w: num(p.w, 320), h: num(p.h, 420) };
      else if (p.kind === "dock" && SIDES.includes(p.side)) L.last[k as PanelId] = { kind: "dock", side: p.side, stack: Math.max(0, Math.floor(num(p.stack, 0))), ...(p.split ? { split: true } : {}) };
    }
  }
  L.locked = raw.locked === true;
  return L;
}
