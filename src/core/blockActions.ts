// Ações de blocos ligadas ao store: transformar um bloco em outro tipo (sem perder o conteúdo), virar mapa mental e voltar.
import { rebindAfterChange } from "./binding";
import { BlockKind, BlockSpec, blockContent, convertBlock, defaultBlockSize, fitBlock } from "./blocks";
import { makeBlockElement } from "./blockElement";
import { measure } from "./mapActions";
import { addChild, childrenMap, newRoot, relayout, subtreeIds } from "./mindmap";
import { AttachmentElement, HirakuElement, ID, NodeElement } from "./model";
import { selectActivePage, useDoc, useSel } from "./store";
import { TextMeasure } from "./blocks";

const els = () => selectActivePage(useDoc.getState()).elements;
const retarget = (list: HirakuElement[], from: ID, to: ID): HirakuElement[] =>
  list.map((e) => (e.type === "arrow" || e.type === "line"
    ? { ...e, startBinding: e.startBinding?.elementId === from ? { ...e.startBinding, elementId: to } : e.startBinding, endBinding: e.endBinding?.elementId === from ? { ...e.endBinding, elementId: to } : e.endBinding }
    : e));

/** Novo spec + tamanho para transformar `el` em `kind`, mantendo o centro. Puro. */
export function transformed(el: AttachmentElement & { block: BlockSpec }, kind: BlockKind, m?: TextMeasure): AttachmentElement {
  const spec = convertBlock(el.block, kind);
  const base = defaultBlockSize(spec);
  const size = fitBlock(spec, spec, base.w, base.h, m);
  return { ...el, block: spec, title: el.title, x: el.x + el.w / 2 - size.w / 2, y: el.y + el.h / 2 - size.h / 2, w: size.w, h: size.h };
}

export function transformBlock(id: ID, kind: BlockKind, m?: TextMeasure) {
  const list = els();
  const el = list.find((e) => e.id === id);
  if (!el || el.type !== "attachment" || !el.block) return;
  const next = transformed(el as AttachmentElement & { block: BlockSpec }, kind, m);
  useDoc.getState().replaceElements(rebindAfterChange(list.map((e) => (e.id === id ? next : e)), new Set([id])));
}

/** Bloco → mapa mental: o título vira o nó central e cada item vira um ramo. */
export function blockToMap(id: ID) {
  const list = els();
  const el = list.find((e) => e.id === id);
  if (!el || el.type !== "attachment" || !el.block) return;
  const c = blockContent(el.block);
  const items = c.items?.length ? c.items : (c.text ?? "").split("\n").map((t) => t.trim()).filter(Boolean).map((text) => ({ text, sub: undefined as string | undefined }));
  let a = newRoot(list.filter((e) => e.id !== id), el.x + el.w / 2, el.y + el.h / 2, c.title || items[0]?.text || "Ideia", measure);
  const root = a.id;
  // agrupa por "sub" (coluna do kanban, dia da semana…) quando houver
  const groups = new Map<string, ID>();
  for (const it of c.title ? items : items.slice(1)) {
    let parent = root;
    if (it.sub && items.some((x) => x !== it && x.sub === it.sub) && !/^\d/.test(it.sub)) {
      if (!groups.has(it.sub)) { const g = addChild(a.elements, root, it.sub, measure); if (g) { a = g; groups.set(it.sub, g.id); } }
      parent = groups.get(it.sub) ?? root;
    }
    const n = addChild(a.elements, parent, it.sub && parent === root && !/^\d/.test(it.sub) ? `${it.text}: ${it.sub}` : it.text, measure);
    if (n) a = n;
  }
  const out = retarget(relayout(a.elements), id, root);
  useDoc.getState().replaceElements(rebindAfterChange(out, new Set([root])));
  useSel.getState().set([root]);
}

/** Nó de mapa (com o ramo) → bloco: o texto do nó vira título e os filhos viram itens. */
export function nodeToBlock(id: ID, kind: BlockKind, m?: TextMeasure) {
  const list = els();
  const node = list.find((e): e is NodeElement => e.id === id && e.type === "node");
  if (!node) return;
  const ch = childrenMap(list);
  const kids = ch.get(id) ?? [];
  const items = kids.flatMap((k) => {
    const sub = ch.get(k.id) ?? [];
    return sub.length ? sub.map((g) => ({ text: g.text, sub: k.text, done: !!g.done })) : [{ text: k.text, done: !!k.done }];
  });
  const noteItems = (node.note ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => ({ text: l.replace(/^[-*]\s*(\[[ x]\]\s*)?/i, ""), done: /\[x\]/i.test(l) }));
  const tmp = makeBlockElement({ kind: "list", title: node.text, items: [], style: "bullet", color: "#4D6FC4" }, { x: 0, y: 0 });
  const spec = convertBlock({ kind: "todo", title: node.text, items: [...items, ...noteItems].map((i) => ({ text: i.text, done: !!i.done })), color: "#4D6FC4" }, kind);
  const withGroups = items.some((i) => "sub" in i && i.sub) && (kind === "kanban" || kind === "matrix2" || kind === "compare" || kind === "week")
    ? convertBlock({ kind: "kanban", title: node.text, color: "#4D6FC4", columns: kids.map((k) => ({ title: k.text, cards: (ch.get(k.id) ?? []).map((g) => g.text) })) }, kind)
    : spec;
  const base = defaultBlockSize(withGroups);
  const size = fitBlock(withGroups, withGroups, base.w, base.h, m);
  const block: AttachmentElement = { ...tmp, block: withGroups, x: node.x + node.w / 2 - size.w / 2, y: node.y + node.h / 2 - size.h / 2, w: size.w, h: size.h, frameId: node.frameId ?? null, layerId: node.layerId };
  const gone = subtreeIds(list, id);
  const rest = list.filter((e) => !gone.has(e.id));
  const out = retarget([...relayout(rest), block], id, block.id);
  useDoc.getState().replaceElements(rebindAfterChange(out, new Set([block.id])));
  useSel.getState().set([block.id]);
}
