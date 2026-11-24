// Organização visual (0.15), parte pura: mapa ↔ tópicos sem perder estilos, links internos e referências de volta,
// grafo do caderno, organizar automaticamente por propriedade e selecionar por propriedade.
import { HirakuDoc, HirakuElement, ID, NodeElement, Page } from "./model";
import { BRANCH_PALETTE, Measure, OutlineItem, childrenMap, defaultNodeStyle, makeNode, refit, relayout, subtreeIds } from "./mindmap";
import { elementBounds } from "./selection";
import { newId } from "./model";

// ---------- modo tópicos (outline) ----------

/**
 * Reescreve o ramo de `rootId` a partir de uma lista indentada, REAPROVEITANDO os nós existentes na mesma posição da
 * leitura em profundidade (cores, formas, notas e ligações continuam). Itens a mais viram nós novos com o estilo do nível;
 * nós que sobram são apagados. A raiz fica onde está.
 */
export function applyOutline(els: HirakuElement[], rootId: ID, items: OutlineItem[], measure: Measure): HirakuElement[] {
  const root = els.find((e): e is NodeElement => e.id === rootId && e.type === "node");
  if (!root || !items.length) return els;
  const ch = childrenMap(els);
  const old: NodeElement[] = [];
  const walk = (n: NodeElement) => { old.push(n); for (const c of ch.get(n.id) ?? []) walk(c); };
  walk(root);
  // a lista sempre tem UMA raiz: itens extras no nível 0 viram filhos dela
  const list: OutlineItem[] = items[0].depth === 0 ? [items[0], ...items.slice(1).map((i) => ({ ...i, depth: Math.max(1, i.depth) }))] : [{ text: root.text, depth: 0 }, ...items.map((i) => ({ ...i, depth: i.depth + 1 }))];
  const stack: NodeElement[] = [];
  const out: NodeElement[] = [];
  let firstLevel = 0;
  list.forEach((it, i) => {
    const depth = Math.min(it.depth, stack.length);
    stack.length = depth;
    const parent = stack[depth - 1] ?? null;
    const prev = old[i];
    let n: NodeElement;
    if (i === 0) n = { ...root, text: it.text };
    else if (prev && prev.id !== rootId) n = { ...prev, text: it.text, parentId: parent!.id, collapsed: false, frameId: root.frameId ?? null, layerId: root.layerId };
    else {
      const branch = depth === 1 ? BRANCH_PALETTE[firstLevel % BRANCH_PALETTE.length] : parent!.branchColor;
      n = makeNode(newId(), root.x, root.y, it.text, { ...defaultNodeStyle(depth, branch), branchColor: branch, parentId: parent!.id, frameId: root.frameId ?? null, layerId: root.layerId });
    }
    if (depth === 1) firstLevel++;
    n = n.text === (prev?.text ?? "") && i > 0 && prev ? n : refit(n, measure);
    out.push(n);
    stack.push(n);
  });
  const gone = subtreeIds(els, rootId);
  const kept = new Set(out.map((n) => n.id));
  const rest = els.filter((e) => !gone.has(e.id));
  // setas ligadas a nós apagados perdem a ligação (o resto do app já sabe soltar pontas)
  const dropped = [...gone].filter((id) => !kept.has(id));
  const fixed = dropped.length ? rest.map((e) => (e.type === "arrow" && (dropped.includes(e.startBinding?.elementId ?? "") || dropped.includes(e.endBinding?.elementId ?? ""))
    ? { ...e, startBinding: dropped.includes(e.startBinding?.elementId ?? "") ? null : e.startBinding, endBinding: dropped.includes(e.endBinding?.elementId ?? "") ? null : e.endBinding } : e)) : rest;
  const at = els.findIndex((e) => e.id === rootId);
  const before = fixed.filter((e) => els.indexOf(e) < at && els.indexOf(e) >= 0);
  const after = fixed.filter((e) => !before.includes(e));
  return relayout([...before, ...out, ...after]);
}

// ---------- links internos ----------

export interface LinkTarget { page: ID; el?: ID }
export interface LinkRef { fromPage: ID; fromEl: ID; label: string; to: LinkTarget }

/** Texto curto que representa um elemento (para listas de links). */
export function elementLabel(e: HirakuElement): string {
  const t = e.name ?? (e.type === "text" || e.type === "node" ? e.text : e.type === "frame" ? e.title : e.type === "attachment" ? e.title : "");
  const clean = (t || "").replace(/\s+/g, " ").trim();
  if (clean) return clean.slice(0, 60);
  return { stroke: "Traço", rect: "Retângulo", ellipse: "Elipse", diamond: "Losango", line: "Linha", arrow: "Seta", text: "Texto", node: "Nó", frame: "Quadro", attachment: "Anexo" }[e.type];
}

/** Todos os links internos do caderno (elementos com `linkTo` + blocos "quadro aninhado"). */
export function allLinks(doc: HirakuDoc): LinkRef[] {
  const out: LinkRef[] = [];
  const pages = new Set(doc.pages.map((p) => p.id));
  for (const p of doc.pages) for (const e of p.elements) {
    if (e.linkTo && pages.has(e.linkTo.page)) out.push({ fromPage: p.id, fromEl: e.id, label: elementLabel(e), to: e.linkTo });
    if (e.type === "attachment" && e.block?.kind === "board" && pages.has(e.block.pageId)) out.push({ fromPage: p.id, fromEl: e.id, label: e.block.title || "Quadro", to: { page: e.block.pageId } });
  }
  return out;
}

/** Quem aponta para esta página (ou para este elemento dela). */
export const backlinks = (doc: HirakuDoc, page: ID, el?: ID) => allLinks(doc).filter((l) => l.to.page === page && (!el || l.to.el === el) && !(l.fromPage === page && l.fromEl === el));

export { cleanLinkTo } from "./model";

// ---------- grafo do caderno ----------

export interface GNode { id: ID; label: string; n: number; x: number; y: number; links: number; bookmark?: string }
export interface GEdge { a: ID; b: ID; w: number }

/** Páginas como nós e links (internos e quadros aninhados) como arestas, posicionados por forças (determinístico). */
export function notebookGraph(doc: HirakuDoc, W = 600, H = 420): { nodes: GNode[]; edges: GEdge[] } {
  const idx = new Map(doc.pages.map((p, i) => [p.id, i]));
  const key = (a: ID, b: ID) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const em = new Map<string, GEdge>();
  for (const l of allLinks(doc)) {
    if (l.fromPage === l.to.page) continue;
    const k = key(l.fromPage, l.to.page);
    const e = em.get(k);
    if (e) e.w++; else em.set(k, { a: l.fromPage, b: l.to.page, w: 1 });
  }
  const edges = [...em.values()];
  const deg = new Map<ID, number>();
  for (const e of edges) { deg.set(e.a, (deg.get(e.a) ?? 0) + 1); deg.set(e.b, (deg.get(e.b) ?? 0) + 1); }
  const n = doc.pages.length;
  const pos = doc.pages.map((_, i) => ({ x: W / 2 + Math.cos((i / Math.max(1, n)) * Math.PI * 2) * W * 0.35, y: H / 2 + Math.sin((i / Math.max(1, n)) * Math.PI * 2) * H * 0.35 }));
  const k = Math.sqrt((W * H) / Math.max(1, n)) * 0.6;
  for (let it = 0; it < 220; it++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y, d = Math.max(1, Math.hypot(dx, dy)), f = (k * k) / d;
      disp[i].x += (dx / d) * f; disp[i].y += (dy / d) * f; disp[j].x -= (dx / d) * f; disp[j].y -= (dy / d) * f;
    }
    for (const e of edges) {
      const i = idx.get(e.a)!, j = idx.get(e.b)!;
      const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y, d = Math.max(1, Math.hypot(dx, dy)), f = (d * d) / k;
      disp[i].x -= (dx / d) * f; disp[i].y -= (dy / d) * f; disp[j].x += (dx / d) * f; disp[j].y += (dy / d) * f;
    }
    const temp = 30 * (1 - it / 220) + 1;
    pos.forEach((p, i) => {
      const d = Math.max(1, Math.hypot(disp[i].x, disp[i].y));
      p.x = Math.max(30, Math.min(W - 30, p.x + (disp[i].x / d) * Math.min(d, temp) + (W / 2 - p.x) * 0.01));
      p.y = Math.max(30, Math.min(H - 30, p.y + (disp[i].y / d) * Math.min(d, temp) + (H / 2 - p.y) * 0.01));
    });
  }
  return { nodes: doc.pages.map((p, i) => ({ id: p.id, label: p.name, n: i + 1, x: pos[i].x, y: pos[i].y, links: deg.get(p.id) ?? 0, bookmark: p.bookmark })), edges };
}

// ---------- organizar e selecionar por propriedade ----------

export type SortKey = "position" | "name" | "color" | "type" | "size";
export const SORT_KEYS: { id: SortKey; label: string }[] = [
  { id: "position", label: "Posição" }, { id: "name", label: "Nome/texto" }, { id: "color", label: "Cor" }, { id: "type", label: "Tipo" }, { id: "size", label: "Tamanho" },
];

export function elementColorKey(e: HirakuElement): string {
  switch (e.type) {
    case "stroke": case "text": case "node": return e.type === "node" ? (e.fill ?? e.color) : e.color;
    case "frame": return e.color;
    case "attachment": return e.block && "color" in e.block ? String(e.block.color) : "";
    default: return "fill" in e && e.fill ? e.fill : e.stroke;
  }
}
/** Matiz (0–360) para ordenar por cor de forma natural (arco-íris; cinzas no fim). */
const hue = (hex: string) => {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return 999;
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.08) return 400 + (1 - mx) * 100;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

/** Ordem dos itens (ids) pela propriedade. */
export function sortUnits<T extends { id: ID; els: HirakuElement[] }>(units: T[], key: SortKey): T[] {
  const box = (u: T) => { const bs = u.els.map(elementBounds); return { x: Math.min(...bs.map((b) => b.minX)), y: Math.min(...bs.map((b) => b.minY)), a: (Math.max(...bs.map((b) => b.maxX)) - Math.min(...bs.map((b) => b.minX))) * (Math.max(...bs.map((b) => b.maxY)) - Math.min(...bs.map((b) => b.minY))) }; };
  const k = (u: T): [number | string, number | string] => {
    const e = u.els[0], b = box(u);
    switch (key) {
      case "name": return [elementLabel(e).toLocaleLowerCase("pt"), 0];
      case "color": return [hue(elementColorKey(e)), elementColorKey(e)];
      case "type": return [e.type === "attachment" ? `attachment:${e.block?.kind ?? e.kind}` : e.type, elementLabel(e).toLocaleLowerCase("pt")];
      case "size": return [-b.a, 0];
      default: return [Math.round(b.y / 40), b.x];
    }
  };
  return [...units].sort((a, b) => {
    const ka = k(a), kb = k(b);
    for (let i = 0; i < 2; i++) { if (ka[i] < kb[i]) return -1; if (ka[i] > kb[i]) return 1; }
    return 0;
  });
}

/** Grade: posições (cantos) para unidades na ordem dada, começando em (x0, y0). Colunas ≈ √n. */
export function gridSlots(sizes: { w: number; h: number }[], x0: number, y0: number, gap = 24, cols = Math.max(1, Math.ceil(Math.sqrt(sizes.length)))): { x: number; y: number }[] {
  const colW: number[] = [], rowH: number[] = [];
  sizes.forEach((s, i) => { const c = i % cols, r = Math.floor(i / cols); colW[c] = Math.max(colW[c] ?? 0, s.w); rowH[r] = Math.max(rowH[r] ?? 0, s.h); });
  return sizes.map((_, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    return { x: x0 + colW.slice(0, c).reduce((a, b) => a + b + gap, 0), y: y0 + rowH.slice(0, r).reduce((a, b) => a + b + gap, 0) };
  });
}

export type PropKey = "type" | "color" | "width" | "brush" | "layer" | "font" | "group";
export const PROP_KEYS: { id: PropKey; label: string }[] = [
  { id: "type", label: "Mesmo tipo" }, { id: "color", label: "Mesma cor" }, { id: "width", label: "Mesma espessura" }, { id: "brush", label: "Mesmo pincel" },
  { id: "layer", label: "Mesma camada" }, { id: "font", label: "Mesma fonte" }, { id: "group", label: "Mesmo grupo" },
];

const propOf = (p: Page, e: HirakuElement, key: PropKey): string | number | null => {
  switch (key) {
    case "type": return e.type === "attachment" ? `att:${e.block?.kind ?? e.kind}` : e.type;
    case "color": return elementColorKey(e).toLowerCase() || null;
    case "width": return e.type === "stroke" ? e.width : "strokeWidth" in e ? e.strokeWidth : null;
    case "brush": return e.type === "stroke" ? e.brush : null;
    case "layer": return e.layerId && p.layers.some((l) => l.id === e.layerId) ? e.layerId : p.layers[0]?.id ?? null;
    case "font": return e.type === "text" || e.type === "node" ? `${e.fontFamily}|${e.fontSize}` : null;
    case "group": return e.groupId ?? null;
  }
};

/** Ids com o mesmo valor de propriedade que os de `refIds` (entre `pool`). */
export function selectByProperty(p: Page, pool: HirakuElement[], refIds: ID[], key: PropKey): ID[] {
  const refs = p.elements.filter((e) => refIds.includes(e.id));
  const vals = new Set(refs.map((e) => propOf(p, e, key)).filter((v) => v !== null));
  if (!vals.size) return [];
  return pool.filter((e) => { const v = propOf(p, e, key); return v !== null && vals.has(v); }).map((e) => e.id);
}
