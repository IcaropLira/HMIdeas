// Organização visual (0.15), ações com o store: quadros aninhados, links internos, isolamento, mapa ↔ tópicos/lista
// e selecionar por propriedade. Cada ação que muda o documento é UM passo de desfazer.
import { create } from "zustand";
import { makeBlockElement } from "./blockElement";
import { BlockKind } from "./blocks";
import { blockToMap, nodeToBlock } from "./blockActions";
import { currentCtx } from "./groupActions";
import { insideCtx } from "./groups";
import { interactiveElements, isolation, setIsolation } from "./layers";
import { viewCenter, measure } from "./mapActions";
import { mapFromOutline, parseOutline, rootOf, toOutline, withDependents } from "./mindmap";
import { AttachmentElement, HirakuElement, ID, Page, TextElement, createPage } from "./model";
import { LinkTarget, PropKey, applyOutline, elementLabel, selectByProperty } from "./organize";
import { elementBounds } from "./selection";
import { selectActivePage, useDoc, useSel, useView } from "./store";
import { useUI } from "./ui";

const toast = (m: string) => useUI.getState().showToast(m);
const page = (): Page => selectActivePage(useDoc.getState());
const selected = (): HirakuElement[] => { const ids = new Set(useSel.getState().ids); return page().elements.filter((e) => ids.has(e.id)); };

/** Vai até a página (e centraliza o elemento, se houver) sem mudar o zoom. */
export function goTo(t: LinkTarget) {
  const d = useDoc.getState();
  if (!d.doc.pages.some((p) => p.id === t.page)) { toast("O destino do link não existe mais."); return; }
  d.setActivePage(t.page);
  const el = t.el && d.doc.pages.find((p) => p.id === t.page)?.elements.find((e) => e.id === t.el);
  if (!el) return;
  const b = elementBounds(el), cam = useView.getState().camera;
  useView.getState().setCamera({ ...cam, x: window.innerWidth / 2 - ((b.minX + b.maxX) / 2) * cam.zoom, y: window.innerHeight / 2 - ((b.minY + b.maxY) / 2) * cam.zoom });
  useSel.getState().set([el.id]);
}

// ---------- quadros aninhados ----------

/** Cria a página do quadro aninhado (mesmo papel e formato) e liga o bloco a ela, num passo só. */
function createBoardPage(blockEl: AttachmentElement): ID | null {
  const cur = page();
  if (blockEl.block?.kind !== "board") return null;
  const title = blockEl.block.title || "Quadro";
  const child: Page = { ...createPage(title), paper: cur.paper, background: cur.background, ...(cur.size ? { size: cur.size } : {}), parentPage: cur.id };
  useDoc.getState().editDoc((d) => {
    const pages = d.pages.map((p) => (p.id === cur.id ? { ...p, elements: p.elements.some((e) => e.id === blockEl.id) ? p.elements.map((e) => (e.id === blockEl.id && e.type === "attachment" && e.block?.kind === "board" ? { ...e, block: { ...e.block, pageId: child.id } } : e)) : [...p.elements, { ...blockEl, block: { ...blockEl.block!, pageId: child.id } } as HirakuElement] } : p));
    const at = pages.findIndex((p) => p.id === cur.id);
    pages.splice(at + 1, 0, child);
    return { ...d, pages };
  });
  return child.id;
}

/** Toque em "Abrir" num bloco quadro aninhado. */
export function openBoard(el: AttachmentElement) {
  if (el.block?.kind !== "board") return;
  const target = el.block.pageId;
  const id = target && useDoc.getState().doc.pages.some((p) => p.id === target) ? target : createBoardPage(el);
  if (id) useDoc.getState().setActivePage(id);
}

/** Insere um quadro aninhado no centro da tela (já com a página criada). */
export function insertBoard(title = "Novo quadro") {
  const el = makeBlockElement({ kind: "board", title, pageId: "", note: "", color: "#2F7FD3" }, viewCenter());
  createBoardPage(el);
  useSel.getState().set([el.id]);
  toast(`Quadro “${title}” criado. Toque em Abrir para entrar; o caminho de volta aparece no topo.`);
}

/** Transforma a seleção num quadro aninhado: os itens vão para uma página nova e no lugar fica o bloco. */
export function selectionToBoard() {
  const sel = selected();
  if (!sel.length) { toast("Selecione o que vai para dentro do quadro."); return; }
  const cur = page();
  const ids = withDependents(cur.elements, sel.map((e) => e.id));
  const moving = cur.elements.filter((e) => ids.has(e.id));
  const bs = moving.map(elementBounds);
  const box = { minX: Math.min(...bs.map((b) => b.minX)), minY: Math.min(...bs.map((b) => b.minY)), maxX: Math.max(...bs.map((b) => b.maxX)), maxY: Math.max(...bs.map((b) => b.maxY)) };
  const child: Page = { ...createPage("Quadro"), paper: cur.paper, background: cur.background, ...(cur.size ? { size: cur.size } : {}), parentPage: cur.id };
  child.elements = moving.map((e) => ({ ...e, layerId: child.layers[0].id, groupId: undefined }) as HirakuElement);
  const title = elementLabel(moving.find((e) => e.type === "frame" || e.type === "text" || e.type === "node") ?? moving[0]);
  child.name = title;
  const el = makeBlockElement({ kind: "board", title, pageId: child.id, note: `${moving.length} itens`, color: "#2F7FD3" }, { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });
  useDoc.getState().editDoc((d) => {
    const pages = d.pages.map((p) => (p.id === cur.id ? { ...p, elements: [...p.elements.filter((e) => !ids.has(e.id)), el] } : p));
    pages.splice(pages.findIndex((p) => p.id === cur.id) + 1, 0, child);
    return { ...d, pages };
  });
  useSel.getState().set([el.id]);
  toast(`${moving.length} itens foram para dentro do quadro “${title}”.`);
}

export function goUp() {
  const p = page();
  if (p.parentPage && useDoc.getState().doc.pages.some((x) => x.id === p.parentPage)) useDoc.getState().setActivePage(p.parentPage);
}

/** Caminho de páginas-mãe até esta (para a trilha no topo). */
export function breadcrumb(p: Page, pages: Page[]): Page[] {
  const out: Page[] = [];
  const seen = new Set<ID>([p.id]);
  let cur = p;
  while (cur.parentPage && !seen.has(cur.parentPage)) {
    const up = pages.find((x) => x.id === cur.parentPage);
    if (!up) break;
    out.unshift(up); seen.add(up.id); cur = up;
  }
  return out;
}

// ---------- links internos ----------

interface LinkClip { target: LinkTarget | null; label: string; set: (t: LinkTarget | null, label?: string) => void }
export const useLinkClip = create<LinkClip>((set) => ({ target: null, label: "", set: (target, label = "") => set({ target, label }) }));

/** Guarda a seleção (ou a página) como destino de link. */
export function copyLink() {
  const p = page(), sel = selected();
  const t: LinkTarget = sel.length === 1 ? { page: p.id, el: sel[0].id } : { page: p.id };
  const label = sel.length === 1 ? `${elementLabel(sel[0])} (${p.name})` : p.name;
  useLinkClip.getState().set(t, label);
  toast(`Link para “${label}” copiado. Selecione algo e use “Ligar ao link copiado”.`);
}

export function pasteLink() {
  const clip = useLinkClip.getState();
  const sel = selected();
  if (!clip.target) { toast("Copie um link antes (Copiar link para a seleção)."); return; }
  if (!sel.length) { toast("Selecione o que vai virar link."); return; }
  const t = clip.target;
  useDoc.getState().updateElements(sel.filter((e) => e.id !== t.el).map((e) => ({ ...e, linkTo: t })));
  toast(`${sel.length === 1 ? "Item ligado" : `${sel.length} itens ligados`} a “${clip.label}”.`);
}

export function linkToPage(pageId: ID) {
  const sel = selected();
  if (!sel.length) return;
  useDoc.getState().updateElements(sel.map((e) => ({ ...e, linkTo: { page: pageId } })));
}

export function removeLink() {
  const sel = selected().filter((e) => e.linkTo);
  if (!sel.length) return;
  useDoc.getState().updateElements(sel.map((e) => { const c = { ...e }; delete c.linkTo; return c; }));
}

export function followLink(): boolean {
  const el = selected().find((e) => e.linkTo || (e.type === "attachment" && e.block?.kind === "board"));
  if (!el) return false;
  if (el.type === "attachment" && el.block?.kind === "board" && !el.linkTo) { openBoard(el); return true; }
  goTo(el.linkTo!);
  return true;
}

// ---------- isolamento ----------

export const useIsolate = create<{ on: boolean; pageId: ID | null; set: (on: boolean, pageId?: ID | null) => void }>((set) => ({
  on: false, pageId: null, set: (on, pageId = null) => set({ on, pageId }),
}));

/** Isola a seleção: o resto fica apagadinho e não pode ser tocado. De novo (ou Esc/trocar de página) sai. */
export function toggleIsolate() {
  if (isolation()) { exitIsolate(); return; }
  const p = page(), sel = useSel.getState().ids;
  if (!sel.length) { toast("Selecione o que quer isolar."); return; }
  const keep = withDependents(p.elements, sel);
  setIsolation(keep);
  useIsolate.getState().set(true, p.id);
  window.dispatchEvent(new CustomEvent("hm-ghosts", { detail: new Set(p.elements.filter((e) => !keep.has(e.id)).map((e) => e.id)) }));
  toast("Modo isolamento: só a seleção responde. Ctrl+Alt+I (ou o botão no topo) volta.");
}
export function exitIsolate() {
  if (!isolation()) return;
  setIsolation(null);
  useIsolate.getState().set(false);
  window.dispatchEvent(new CustomEvent("hm-ghosts", { detail: new Set() }));
  useSel.getState().set([...useSel.getState().ids]);
}

// ---------- mapa ↔ tópicos / lista ----------

export function selectedMapRoot(): ID | null {
  const sel = selected();
  const n = sel.find((e) => e.type === "node");
  return n ? rootOf(page().elements, n.id)?.id ?? null : null;
}
export const mapOutline = (rootId: ID) => toOutline(page().elements, rootId);

export function applyMapOutline(rootId: ID, text: string): boolean {
  const items = parseOutline(text);
  if (!items.length) return false;
  useDoc.getState().replaceElements(applyOutline(page().elements, rootId, items, measure));
  return true;
}

/** Mapa selecionado → bloco (lista, tarefas, kanban…), pelo nó raiz. */
export function mapToBlock(kind: BlockKind) {
  const root = selectedMapRoot();
  if (!root) { toast("Selecione um nó do mapa."); return; }
  nodeToBlock(root, kind);
}
export function blockToMindMap() {
  const b = selected().find((e) => e.type === "attachment" && e.kind === "block");
  if (!b) { toast("Selecione um bloco (lista, tarefas, cartão…)."); return; }
  blockToMap(b.id);
}

/** Textos soltos selecionados → mapa (o primeiro de cima vira a raiz). */
export function textsToMap() {
  const texts = selected().filter((e): e is TextElement => e.type === "text").sort((a, b) => elementBounds(a).minY - elementBounds(b).minY);
  if (texts.length < 2) { toast("Selecione dois ou mais textos."); return; }
  const lines = texts.map((t, i) => `${i ? "  " : ""}- ${t.text.split("\n")[0]}`).join("\n");
  const b = elementBounds(texts[0]);
  const items = parseOutline(lines);
  const tid = new Set(texts.map((t) => t.id));
  const a = mapFromOutline(page().elements.filter((e) => !tid.has(e.id)), items, { x: b.minX, y: b.minY }, measure);
  if (!a) return;
  useDoc.getState().replaceElements(a.elements);
  useSel.getState().set([a.id]);
}

// ---------- selecionar por propriedade ----------

export function selectSame(key: PropKey) {
  const p = page(), ref = useSel.getState().ids;
  if (!ref.length) { toast("Selecione um item de referência."); return; }
  const ctx = currentCtx(p);
  const ids = selectByProperty(p, interactiveElements(p).filter((e) => insideCtx(p, e, ctx)), ref, key);
  if (!ids.length) { toast("Essa propriedade não se aplica à seleção."); return; }
  useSel.getState().set(ids);
  toast(`${ids.length} ${ids.length === 1 ? "item selecionado" : "itens selecionados"}.`);
}

