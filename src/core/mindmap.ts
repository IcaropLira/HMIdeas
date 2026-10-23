// Mapa mental: árvore, layout automático, recolher/expandir, estilos e atalhos de edição. PURO (sem Pixi,
// React nem store): recebe a lista de elementos e devolve uma NOVA lista; quem grava é core/mapActions.ts.
//
// A árvore vem de `parentId`; a ordem dos irmãos é a ordem dos nós na lista de elementos. Posição (x, y) e
// `hidden` são derivados por `relayout` e gravados no nó para o desenho ser rápido.
import {
  BranchStyle, FontFamily, HirakuElement, ID, MapLayout, NodeElement, NodeShape, newId,
} from "./model";

/** Mede um bloco de texto (no app usa canvas 2D; nos testes, uma aproximação). */
export type Measure = (text: string, family: FontFamily, size: number) => { w: number; h: number };

export const approxMeasure: Measure = (text, _f, size) => {
  const lines = text.split("\n");
  return { w: Math.max(...lines.map((l) => l.length), 1) * size * 0.55, h: lines.length * size * 1.25 };
};

export const BRANCH_PALETTE = ["#2F4B8F", "#C8372D", "#2F7D5B", "#D98A1F", "#7B4FB5", "#0E8A9B", "#B5487A", "#5E6B7E"];

/** Códigos visuais prontos (prioridade, status…). `stroke` também vira a cor do ramo se "recolorir ramo". */
export const NODE_PRESETS: { id: string; label: string; fill: string | null; stroke: string; color: string }[] = [
  { id: "high", label: "Prioridade alta", fill: "#F6D5D2", stroke: "#C8372D", color: "#7A1F18" },
  { id: "mid", label: "Atenção", fill: "#F7E3BD", stroke: "#D98A1F", color: "#6B4208" },
  { id: "ok", label: "Ideia validada", fill: "#CFE8DB", stroke: "#2F7D5B", color: "#174B34" },
  { id: "info", label: "Informação", fill: "#C9D6F2", stroke: "#2F4B8F", color: "#1B2D5C" },
  { id: "idea", label: "Ideia nova", fill: "#E4D9F4", stroke: "#7B4FB5", color: "#3F2468" },
  { id: "plain", label: "Neutro", fill: "#FFFFFF", stroke: "#5E6B7E", color: "#1B2233" },
];

export const NODE_ICONS = ["✅", "⚠️", "⭐", "❓", "💡", "🔥", "📌", "🚩", "❤️", "1", "2", "3"];

export const FONT_SIZE_ROOT = 24;
export const FONT_SIZE_NODE = 18;
const GAP_LEVEL_H = 56;
const GAP_SIB_H = 14;
const GAP_LEVEL_V = 48;
const GAP_SIB_V = 22;

// ---------- cores ----------
const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
/** Mistura `hex` com branco (amount 0 = cor pura, 1 = branco). */
export function tint(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => clamp8(c + (255 - c) * amount));
  return "#" + ch.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase();
}
/** Preto ou branco, o que ler melhor sobre `hex`. */
export function readableOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#1B2233";
  const n = parseInt(m[1], 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? "#1B2233" : "#FFFFFF";
}

// ---------- árvore ----------
export const isNodeEl = (e: HirakuElement): e is NodeElement => e.type === "node";
export const nodesOf = (els: HirakuElement[]): NodeElement[] => els.filter(isNodeEl);

/** Pai VÁLIDO (existe e é um nó) ou null (raiz). Evita nós órfãos depois de apagar/colar. */
export function parentMap(els: HirakuElement[]): Map<ID, ID | null> {
  const ids = new Set(nodesOf(els).map((n) => n.id));
  const out = new Map<ID, ID | null>();
  for (const n of nodesOf(els)) out.set(n.id, n.parentId && n.parentId !== n.id && ids.has(n.parentId) ? n.parentId : null);
  return out;
}

export function childrenMap(els: HirakuElement[]): Map<ID | null, NodeElement[]> {
  const pm = parentMap(els);
  const out = new Map<ID | null, NodeElement[]>();
  for (const n of nodesOf(els)) {
    const p = pm.get(n.id) ?? null;
    const list = out.get(p);
    if (list) list.push(n);
    else out.set(p, [n]);
  }
  return out;
}

/** Ids do nó + todos os descendentes. */
export function subtreeIds(els: HirakuElement[], id: ID): Set<ID> {
  const ch = childrenMap(els);
  const out = new Set<ID>();
  const walk = (i: ID) => {
    if (out.has(i)) return; // proteção contra ciclos em arquivos corrompidos
    out.add(i);
    for (const c of ch.get(i) ?? []) walk(c.id);
  };
  walk(id);
  return out;
}

export function ancestorsOf(els: HirakuElement[], id: ID): ID[] {
  const pm = parentMap(els);
  const out: ID[] = [];
  let cur = pm.get(id) ?? null;
  while (cur && !out.includes(cur)) {
    out.push(cur);
    cur = pm.get(cur) ?? null;
  }
  return out;
}

export const depthOf = (els: HirakuElement[], id: ID): number => ancestorsOf(els, id).length;

export function rootOf(els: HirakuElement[], id: ID): NodeElement | null {
  const anc = ancestorsOf(els, id);
  const rootId = anc.length ? anc[anc.length - 1] : id;
  return nodesOf(els).find((n) => n.id === rootId) ?? null;
}

export const rootsOf = (els: HirakuElement[]): NodeElement[] => childrenMap(els).get(null) ?? [];

/** Todos os nós (e ids extras) a mover/copiar/apagar junto: descendentes e membros de quadro. */
export function withDependents(els: HirakuElement[], ids: Iterable<ID>): Set<ID> {
  const out = new Set<ID>(ids);
  let grew = true;
  const pm = parentMap(els);
  while (grew) {
    grew = false;
    for (const e of els) {
      if (out.has(e.id)) continue;
      const parent = e.type === "node" ? pm.get(e.id) : null;
      const inFrame = e.frameId;
      if ((parent && out.has(parent)) || (inFrame && out.has(inFrame))) {
        out.add(e.id);
        grew = true;
      }
    }
  }
  return out;
}

// ---------- tamanho do nó ----------
const PAD: Record<NodeShape, [number, number]> = {
  pill: [18, 8], rounded: [14, 8], rect: [12, 8], ellipse: [26, 12], underline: [6, 6], none: [4, 4],
};

export function nodeSize(n: Pick<NodeElement, "text" | "fontFamily" | "fontSize" | "shape" | "icon">, measure: Measure): { w: number; h: number } {
  const label = n.text || " ";
  const m = measure(label, n.fontFamily, n.fontSize);
  const [px, py] = PAD[n.shape];
  const iconW = n.icon ? n.fontSize * 1.35 : 0;
  const minW = n.shape === "none" || n.shape === "underline" ? 24 : 56;
  return { w: Math.max(minW, Math.ceil(m.w + iconW + px * 2)), h: Math.ceil(Math.max(m.h, n.icon ? n.fontSize * 1.25 : 0) + py * 2) };
}

/** Recalcula w/h de um nó (a posição fica; o layout ajusta depois). */
export function refit(n: NodeElement, measure: Measure): NodeElement {
  const { w, h } = nodeSize(n, measure);
  if (w === n.w && h === n.h) return n;
  // mantém o centro: a raiz não "anda" ao editar o texto
  return { ...n, x: n.x + (n.w - w) / 2, y: n.y + (n.h - h) / 2, w, h };
}

// ---------- layout ----------
type Dir = "right" | "left" | "down";

interface Placed { x: number; y: number }

/**
 * Posiciona todos os mapas da lista. A raiz de cada mapa fica onde está; os descendentes são colocados em
 * volta dela sem sobreposição (altura de cada ramo = soma dos filhos). Também recalcula `hidden`.
 * Devolve a MESMA lista se nada mudou.
 */
export function relayout(els: HirakuElement[]): HirakuElement[] {
  const ch = childrenMap(els);
  const pos = new Map<ID, Placed>();
  const hidden = new Set<ID>();

  // escondido = algum ancestral recolhido
  const markHidden = (n: NodeElement, hid: boolean, seen = new Set<ID>()) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    for (const c of ch.get(n.id) ?? []) {
      if (hid || n.collapsed) hidden.add(c.id);
      markHidden(c, hid || n.collapsed, seen);
    }
  };
  const visibleKids = (n: NodeElement) => (n.collapsed ? [] : ch.get(n.id) ?? []);

  for (const root of ch.get(null) ?? []) {
    markHidden(root, false);
    const layout: MapLayout = root.layout;
    const cross = (n: NodeElement, d: Dir) => (d === "down" ? n.w : n.h);
    const sibGap = (d: Dir) => (d === "down" ? GAP_SIB_V : GAP_SIB_H);
    const levelGap = (d: Dir) => (d === "down" ? GAP_LEVEL_V : GAP_LEVEL_H);

    const memo = new Map<ID, number>();
    const extent = (n: NodeElement, d: Dir): number => {
      const hit = memo.get(n.id + d);
      if (hit !== undefined) return hit;
      const kids = visibleKids(n);
      let total = 0;
      kids.forEach((k, i) => (total += extent(k, d) + (i ? sibGap(d) : 0)));
      const v = Math.max(cross(n, d), total);
      memo.set(n.id + d, v);
      return v;
    };

    const rec = (n: NodeElement, at: Placed, d: Dir, kids: NodeElement[]) => {
      // `at` = posição (canto superior esquerdo) já decidida de `n`
      pos.set(n.id, at);
      if (!kids.length) return;
      let total = 0;
      kids.forEach((k, i) => (total += extent(k, d) + (i ? sibGap(d) : 0)));
      if (d === "down") {
        let cx = at.x + n.w / 2 - total / 2;
        for (const k of kids) {
          const ext = extent(k, d);
          rec(k, { x: cx + ext / 2 - k.w / 2, y: at.y + n.h + levelGap(d) }, d, visibleKids(k));
          cx += ext + sibGap(d);
        }
      } else {
        let cy = at.y + n.h / 2 - total / 2;
        for (const k of kids) {
          const ext = extent(k, d);
          const x = d === "right" ? at.x + n.w + levelGap(d) : at.x - levelGap(d) - k.w;
          rec(k, { x, y: cy + ext / 2 - k.h / 2 }, d, visibleKids(k));
          cy += ext + sibGap(d);
        }
      }
    };

    const rootAt = { x: root.x, y: root.y };
    const rootKids = visibleKids(root);
    if (layout === "both") {
      const right: NodeElement[] = [];
      const left: NodeElement[] = [];
      let rs = 0, ls = 0;
      for (const k of rootKids) {
        const e = extent(k, "right");
        const goRight = k.side === "right" ? true : k.side === "left" ? false : rs <= ls;
        if (goRight) { right.push(k); rs += e; } else { left.push(k); ls += e; }
      }
      pos.set(root.id, rootAt);
      // cada lado é um "mapa" ancorado na raiz, com os filhos centrados na altura da raiz
      const side = (kids: NodeElement[], d: Dir) => {
        if (!kids.length) return;
        let total = 0;
        kids.forEach((k, i) => (total += extent(k, d) + (i ? sibGap(d) : 0)));
        let cy = rootAt.y + root.h / 2 - total / 2;
        for (const k of kids) {
          const ext = extent(k, d);
          const x = d === "right" ? rootAt.x + root.w + levelGap(d) : rootAt.x - levelGap(d) - k.w;
          rec(k, { x, y: cy + ext / 2 - k.h / 2 }, d, visibleKids(k));
          cy += ext + sibGap(d);
        }
      };
      side(right, "right");
      side(left, "left");
    } else {
      rec(root, rootAt, layout as Dir, rootKids);
    }
  }

  let out: HirakuElement[] | null = null;
  els.forEach((e, i) => {
    if (e.type !== "node") return;
    const p = pos.get(e.id);
    const h = hidden.has(e.id);
    const nx = p ? p.x : e.x, ny = p ? p.y : e.y;
    if (Math.abs(nx - e.x) < 0.01 && Math.abs(ny - e.y) < 0.01 && !!e.hidden === h) return;
    out ??= els.slice();
    out[i] = { ...e, x: nx, y: ny, hidden: h };
  });
  return out ?? els;
}

// ---------- criação ----------
export function defaultNodeStyle(depth: number, branchColor: string): Pick<NodeElement, "shape" | "fill" | "stroke" | "color" | "fontSize" | "strokeWidth"> {
  if (depth === 0) return { shape: "rounded", fill: "#2F4B8F", stroke: null, color: "#FFFFFF", fontSize: FONT_SIZE_ROOT, strokeWidth: 2 };
  if (depth === 1) return { shape: "pill", fill: tint(branchColor, 0.85), stroke: branchColor, color: "#1B2233", fontSize: FONT_SIZE_NODE, strokeWidth: 2 };
  return { shape: "underline", fill: null, stroke: branchColor, color: "#1B2233", fontSize: FONT_SIZE_NODE - 2, strokeWidth: 2 };
}

export function makeNode(id: ID, x: number, y: number, text: string, over: Partial<NodeElement> = {}): NodeElement {
  const depth0 = defaultNodeStyle(0, BRANCH_PALETTE[0]);
  return {
    id, type: "node", x, y, w: 80, h: 36, angle: 0,
    text, fontFamily: "sans", icon: null, done: false, parentId: null, collapsed: false, side: "auto",
    layout: "both", branchStyle: "curve", branchColor: BRANCH_PALETTE[0], hidden: false, opacity: 1,
    ...depth0, ...over,
  };
}

export interface Added { elements: HirakuElement[]; id: ID }

/** Novo mapa (nó raiz) no ponto dado. */
export function newRoot(els: HirakuElement[], x: number, y: number, text: string, measure: Measure): Added {
  const n = refit(makeNode(newId(), x, y, text), measure);
  return { elements: [...els, { ...n, x: x - n.w / 2, y: y - n.h / 2 }], id: n.id };
}

/** Novo filho (último dos irmãos). Em mapas "dos dois lados" vai para o lado mais leve. */
export function addChild(els: HirakuElement[], parentId: ID, text: string, measure: Measure): Added | null {
  const parent = nodesOf(els).find((n) => n.id === parentId);
  if (!parent) return null;
  const depth = depthOf(els, parentId) + 1;
  const ch = childrenMap(els);
  const sibs = ch.get(parentId) ?? [];
  const root = rootOf(els, parentId)!;
  const branchColor = depth === 1 ? BRANCH_PALETTE[sibs.length % BRANCH_PALETTE.length] : parent.branchColor;
  const st = defaultNodeStyle(depth, branchColor);
  let side: NodeElement["side"] = "auto";
  if (depth === 1 && root.layout === "both") {
    // lado com menos "peso" (soma da altura dos ramos) — fica fixo, então o mapa não embaralha
    let r = 0, l = 0;
    for (const s of sibs) { const w = 1 + (ch.get(s.id)?.length ?? 0); if (s.side === "left") l += w; else r += w; }
    side = r <= l ? "right" : "left";
  }
  const n = refit(
    makeNode(newId(), parent.x, parent.y, text, {
      ...st,
      // filhos de quem já tem estilo próprio herdam forma e fonte (menos a raiz, que tem estilo de título)
      ...(depth >= 2 ? { shape: parent.shape === "none" ? "none" : st.shape } : {}),
      parentId, branchColor, side,
      fontFamily: parent.fontFamily,
    }),
    measure,
  );
  // se estava recolhido, abre para o novo filho aparecer
  const next = els.map((e) => (e.id === parentId && e.type === "node" && e.collapsed ? { ...e, collapsed: false } : e));
  return { elements: relayout([...next, n]), id: n.id };
}

/** Novo irmão logo depois (ou antes) do nó. Na raiz, vira filho. */
export function addSibling(els: HirakuElement[], id: ID, text: string, measure: Measure, before = false): Added | null {
  const pm = parentMap(els);
  const parentId = pm.get(id);
  if (parentId === undefined) return null;
  if (parentId === null) return addChild(els, id, text, measure);
  const cur = nodesOf(els).find((n) => n.id === id)!;
  const added = addChild(els, parentId, text, measure);
  if (!added) return null;
  // addChild põe no fim; move o novo nó para a posição certa e herda o lado do irmão
  const list = added.elements.filter((e) => e.id !== added.id);
  const nn = added.elements.find((e) => e.id === added.id)! as NodeElement;
  const at = list.findIndex((e) => e.id === id);
  const placed: NodeElement = { ...nn, side: cur.side, branchColor: depthOf(els, id) === 1 ? nn.branchColor : cur.branchColor };
  list.splice(before ? at : at + 1, 0, placed);
  return { elements: relayout(list), id: added.id };
}

// ---------- recolher / expandir ----------
const patchNodes = (els: HirakuElement[], ids: Set<ID>, patch: (n: NodeElement) => NodeElement): HirakuElement[] => {
  let changed = false;
  const out = els.map((e) => {
    if (e.type !== "node" || !ids.has(e.id)) return e;
    const n = patch(e);
    if (n !== e) changed = true;
    return n;
  });
  return changed ? out : els;
};

export function toggleCollapse(els: HirakuElement[], id: ID, collapsed?: boolean): HirakuElement[] {
  const has = (childrenMap(els).get(id) ?? []).length > 0;
  return relayout(patchNodes(els, new Set([id]), (n) => {
    const want = collapsed ?? !n.collapsed;
    if (want && !has) return n; // nada para recolher
    return n.collapsed === want ? n : { ...n, collapsed: want };
  }));
}

/** Recolhe/expande o mapa inteiro. `fromLevel`: só nós a partir dessa profundidade (1 = filhos da raiz). */
export function setAllCollapsed(els: HirakuElement[], rootId: ID, collapsed: boolean, fromLevel = 1): HirakuElement[] {
  const ids = subtreeIds(els, rootId);
  const ch = childrenMap(els);
  const depth = (id: ID) => depthOf(els, id);
  return relayout(patchNodes(els, ids, (n) => {
    const has = (ch.get(n.id) ?? []).length > 0;
    const want = collapsed ? has && depth(n.id) >= fromLevel : false;
    return n.collapsed === want ? n : { ...n, collapsed: want };
  }));
}

/** Modo foco: deixa aberto só o caminho até o nó; os irmãos ao longo do caminho ficam recolhidos. */
export function focusBranch(els: HirakuElement[], id: ID): HirakuElement[] {
  const path = new Set([id, ...ancestorsOf(els, id)]);
  const ch = childrenMap(els);
  const root = rootOf(els, id);
  if (!root) return els;
  const ids = subtreeIds(els, root.id);
  return relayout(patchNodes(els, ids, (n) => {
    const has = (ch.get(n.id) ?? []).length > 0;
    if (!has) return n;
    const want = path.has(n.id) ? false : true;
    return n.collapsed === want ? n : { ...n, collapsed: want };
  }));
}

export const visibleDescendantCount = (els: HirakuElement[], id: ID): number => subtreeIds(els, id).size - 1;

// ---------- reparentar e reordenar ----------
/** Move `id` (com os descendentes) para baixo de `newParentId`. Recusa ciclos. */
export function reparent(els: HirakuElement[], id: ID, newParentId: ID, measure?: Measure): HirakuElement[] {
  void measure;
  const sub = subtreeIds(els, id);
  if (sub.has(newParentId)) return els;
  const np = nodesOf(els).find((n) => n.id === newParentId);
  if (!np) return els;
  const toRoot = parentMap(els).get(newParentId) === null;
  const out = patchNodes(els, new Set([id]), (n) => ({ ...n, parentId: newParentId, side: "auto" }));
  // dentro de um ramo, o nó assume a cor do ramo de destino
  const recolored = toRoot ? out : patchNodes(out, sub, (n) => ({ ...n, branchColor: np.branchColor, stroke: n.stroke ? np.branchColor : n.stroke }));
  // abre o destino para o nó movido continuar visível
  return relayout(patchNodes(recolored, new Set([newParentId]), (n) => (n.collapsed ? { ...n, collapsed: false } : n)));
}

/** Torna o nó uma raiz (novo mapa) mantendo o lugar. */
export function detachToRoot(els: HirakuElement[], id: ID): HirakuElement[] {
  return relayout(patchNodes(els, new Set([id]), (n) => ({ ...n, parentId: null, side: "auto", layout: "both", branchStyle: "curve" })));
}

/** Reordena `id` entre os irmãos conforme a posição atual (usado ao soltar um nó arrastado). */
export function reorderByPosition(els: HirakuElement[], id: ID): HirakuElement[] {
  const pm = parentMap(els);
  const parentId = pm.get(id);
  if (parentId === undefined) return els;
  const me = nodesOf(els).find((n) => n.id === id)!;
  const sibs = (childrenMap(els).get(parentId) ?? []).filter((s) => s.id !== id);
  if (!sibs.length) return els;
  const root = rootOf(els, id)!;
  const vertical = root.layout === "down";
  const key = (n: NodeElement) => (vertical ? n.x + n.w / 2 : n.y + n.h / 2);
  // em mapas "dos dois lados" só compara com irmãos do mesmo lado da raiz
  const sameSide = (n: NodeElement) => (root.layout === "both" && parentId === root.id ? (n.x + n.w / 2 < root.x + root.w / 2) === (me.x + me.w / 2 < root.x + root.w / 2) : true);
  const peers = sibs.filter(sameSide);
  const mine = key(me);
  const after = peers.filter((s) => key(s) < mine).pop();
  const list = els.filter((e) => e.id !== id);
  let target: number;
  if (after) target = list.findIndex((e) => e.id === after.id) + 1;
  else if (peers.length) target = list.findIndex((e) => e.id === peers[0].id);
  else return els;
  list.splice(target, 0, me);
  let side = me.side;
  if (root.layout === "both" && parentId === root.id) side = me.x + me.w / 2 < root.x + root.w / 2 ? "left" : "right";
  return relayout(list.map((e) => (e.id === id && e.type === "node" ? { ...e, side } : e)));
}

// ---------- estilo ----------
export type NodePatch = Partial<Pick<NodeElement, "shape" | "fill" | "stroke" | "color" | "fontSize" | "fontFamily" | "icon" | "done" | "branchColor" | "side" | "layout" | "branchStyle" | "strokeWidth">>;

/** Aplica estilo aos nós `ids` (opcionalmente a todos os descendentes) e refaz tamanho/layout. */
export function styleNodes(els: HirakuElement[], ids: ID[], patch: NodePatch, measure: Measure, withSubtree = false): HirakuElement[] {
  const target = new Set<ID>();
  for (const id of ids) (withSubtree ? subtreeIds(els, id) : new Set([id])).forEach((x) => target.add(x));
  const out = patchNodes(els, target, (n) => {
    const m = { ...n, ...patch };
    // `layout` e `branchStyle` pertencem à raiz do mapa: ignorados em outros nós
    return refit(m, measure);
  });
  return relayout(out);
}

export function setNodeText(els: HirakuElement[], id: ID, text: string, measure: Measure): HirakuElement[] {
  return relayout(patchNodes(els, new Set([id]), (n) => (n.text === text ? n : refit({ ...n, text }, measure))));
}

/** Refaz tamanho de todos os nós (depois de abrir um arquivo, por exemplo) e o layout. */
export function refitAll(els: HirakuElement[], measure: Measure): HirakuElement[] {
  return relayout(els.map((e) => (e.type === "node" ? refit(e, measure) : e)));
}

// ---------- navegação por teclado ----------
/** Próximo nó VISÍVEL na direção pedida, preferindo parentes (pai/filho/irmão) e depois o mais próximo. */
export function neighbor(els: HirakuElement[], id: ID, dir: "left" | "right" | "up" | "down"): ID | null {
  const nodes = nodesOf(els).filter((n) => !n.hidden);
  const me = nodes.find((n) => n.id === id);
  if (!me) return null;
  const cx = me.x + me.w / 2, cy = me.y + me.h / 2;
  let best: NodeElement | null = null;
  let bestScore = Infinity;
  for (const n of nodes) {
    if (n.id === id) continue;
    const dx = n.x + n.w / 2 - cx, dy = n.y + n.h / 2 - cy;
    const along = dir === "right" ? dx : dir === "left" ? -dx : dir === "down" ? dy : -dy;
    if (along <= 1) continue;
    const across = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    if (across > along * 2.2 + 40) continue; // fora do cone da direção
    const score = along + across * 2.2;
    if (score < bestScore) { bestScore = score; best = n; }
  }
  return best?.id ?? null;
}

// ---------- lista (outline) ----------
export interface OutlineItem { text: string; depth: number }

/** Texto indentado em lista Markdown ("- tópico"), um mapa por vez. */
export function toOutline(els: HirakuElement[], rootId: ID): string {
  const ch = childrenMap(els);
  const lines: string[] = [];
  const walk = (n: NodeElement, d: number) => {
    const text = n.text.replace(/\n+/g, " ").trim();
    const mark = n.done ? "[x] " : "";
    lines.push(`${"  ".repeat(d)}- ${mark}${n.icon ? n.icon + " " : ""}${text}`);
    for (const c of ch.get(n.id) ?? []) walk(c, d + 1);
  };
  const root = nodesOf(els).find((n) => n.id === rootId);
  if (root) walk(root, 0);
  return lines.join("\n") + "\n";
}

/** Lê uma lista indentada (espaços ou tabs; marcadores -, *, +, •, "1." ou nenhum). */
export function parseOutline(text: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const stack: number[] = []; // indentações abertas
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    if (!raw.trim()) continue;
    const m = /^([ \t]*)(?:[-*+•]\s+|\d+[.)]\s+)?(.*)$/.exec(raw)!;
    const indent = m[1].replace(/\t/g, "    ").length;
    const label = m[2].replace(/^\[( |x|X)\]\s*/, "").trim();
    if (!label) continue;
    while (stack.length && stack[stack.length - 1] >= indent) stack.pop();
    stack.push(indent);
    items.push({ text: label, depth: stack.length - 1 });
  }
  // normaliza: um item nunca pode ser mais de 1 nível mais fundo que o anterior
  let prev = -1;
  for (const it of items) {
    it.depth = Math.min(it.depth, prev + 1);
    prev = it.depth;
  }
  return items;
}

/** Cria um mapa a partir de uma lista. O primeiro item é a raiz; vários itens de nível 0 viram filhos da raiz. */
export function mapFromOutline(els: HirakuElement[], items: OutlineItem[], at: { x: number; y: number }, measure: Measure): Added | null {
  if (!items.length) return null;
  let cur = els;
  let rootId: ID;
  const level0 = items.filter((i) => i.depth === 0);
  let list = items;
  if (level0.length > 1) list = [{ text: "Mapa", depth: 0 }, ...items.map((i) => ({ ...i, depth: i.depth + 1 }))];
  const r = newRoot(cur, at.x, at.y, list[0].text, measure);
  cur = r.elements;
  rootId = r.id;
  const stack: ID[] = [rootId];
  for (const it of list.slice(1)) {
    const parent = stack[Math.min(it.depth - 1, stack.length - 1)];
    const a = addChild(cur, parent, it.text, measure);
    if (!a) continue;
    cur = a.elements;
    stack.length = it.depth;
    stack.push(a.id);
  }
  return { elements: cur, id: rootId };
}

export type { BranchStyle };

// ---------- geometria de ramo (usada pelo renderer e pelo hit-test) ----------
export type GrowDir = "right" | "left" | "down";

/** Para onde crescem os filhos deste nó (define onde fica a bolinha de recolher). */
export function growDir(n: Pick<NodeElement, "x" | "w">, root: Pick<NodeElement, "x" | "w" | "layout"> | null): GrowDir {
  const layout = root?.layout ?? "both";
  if (layout === "down") return "down";
  if (layout === "right") return "right";
  if (layout === "left") return "left";
  return root && n.x + n.w / 2 < root.x + root.w / 2 ? "left" : "right";
}

/** Centro da bolinha de recolher/expandir de um nó. */
export function badgeCenter(n: NodeElement, root: NodeElement | null): { x: number; y: number } {
  const d = growDir(n, root);
  const r = 9;
  if (d === "down") return { x: n.x + n.w / 2, y: n.y + n.h + r + 3 };
  const ay = n.shape === "underline" ? n.y + n.h : n.y + n.h / 2;
  return { x: d === "right" ? n.x + n.w + r + 3 : n.x - r - 3, y: ay };
}

/** Pontos da curva do ramo pai → filho. Devolve a polilinha já amostrada (curva/cotovelo/reta). */
export function branchPath(parent: NodeElement, child: NodeElement, style: BranchStyle, vertical: boolean): { x: number; y: number }[] {
  const ay = (n: NodeElement) => (n.shape === "underline" ? n.y + n.h : n.y + n.h / 2);
  let a: { x: number; y: number }, b: { x: number; y: number };
  if (vertical) {
    a = { x: parent.x + parent.w / 2, y: parent.y + parent.h };
    b = { x: child.x + child.w / 2, y: child.y };
  } else if (child.x + child.w / 2 >= parent.x + parent.w / 2) {
    a = { x: parent.x + parent.w, y: ay(parent) };
    b = { x: child.x, y: ay(child) };
  } else {
    a = { x: parent.x, y: ay(parent) };
    b = { x: child.x + child.w, y: ay(child) };
  }
  if (style === "straight") return [a, b];
  const pts: { x: number; y: number }[] = [];
  if (style === "elbow") {
    if (vertical) {
      const my = (a.y + b.y) / 2;
      return [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
    }
    const mx = (a.x + b.x) / 2;
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
  }
  // curva: bézier cúbica com tangentes ao longo do eixo do mapa
  const N = 18;
  const c1 = vertical ? { x: a.x, y: (a.y + b.y) / 2 } : { x: (a.x + b.x) / 2, y: a.y };
  const c2 = vertical ? { x: b.x, y: (a.y + b.y) / 2 } : { x: (a.x + b.x) / 2, y: b.y };
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    pts.push({
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    });
  }
  return pts;
}
