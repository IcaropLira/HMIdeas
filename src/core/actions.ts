// Ações de edição sobre a seleção. Usadas pelo teclado e pela barra de ações (toque).
import { incidentEdges, isVertex } from "./graphEdit";
import { detachForeign, reidentify } from "./binding";
import { parseHex, pushRecent } from "./color";
import { HirakuElement, TextElement, isLinear } from "./model";
import { subtreeIds, tint, withDependents } from "./mindmap";
import { applyXform, moveXform } from "./selection";
import { selectActivePage, useDoc, useSel, useTool } from "./store";
import { beginEditText, useEdit } from "./textEdit";
import { TextFx, measureBlock } from "./text";
import { activeLayerId, interactiveElements } from "./layers";
import { cloneGroups } from "./groups";
import { Page } from "./model";

let clipboard: HirakuElement[] = [];
/** Página de onde veio a cópia (para recriar os grupos dela). */
let clipboardSrc: Pick<Page, "groups" | "elements"> = { elements: [] };
let pasteCount = 0;

export const selectedElements = (): HirakuElement[] => {
  const ids = new Set(useSel.getState().ids);
  return selectActivePage(useDoc.getState()).elements.filter((e) => ids.has(e.id));
};

/** Seleção + o que anda junto: ramos dos nós e membros dos quadros (copiar/duplicar/mover). */
export const selectedWithDependents = (): HirakuElement[] => {
  const all = selectActivePage(useDoc.getState()).elements;
  const set = withDependents(all, useSel.getState().ids);
  return all.filter((e) => set.has(e.id));
};

const cloneAt = (els: HirakuElement[], dx: number, dy: number): HirakuElement[] =>
  reidentify(els.map((e) => applyXform(e, moveXform(dx, dy))));

/**
 * Acrescenta cópias à página ativa num passo só, recriando os grupos copiados inteiros (`src` = página de origem).
 * Devolve os ids das cópias.
 */
export function addCopies(originals: HirakuElement[], copies: HirakuElement[], src: Pick<Page, "groups" | "elements">): string[] {
  const st = useDoc.getState();
  const page = selectActivePage(st);
  const { groups, copies: out } = cloneGroups(src as Page, originals, copies, page);
  const layerIds = new Set(page.layers.map((l) => l.id));
  const layer = activeLayerId(page);
  const fixed = out.map((e) => (e.layerId && layerIds.has(e.layerId) ? e : ({ ...e, layerId: layer } as HirakuElement)));
  st.editPage((p) => ({ ...p, groups: groups.length ? [...(p.groups ?? []), ...groups] : p.groups, elements: [...p.elements, ...fixed] }));
  return fixed.map((e) => e.id);
}

export function selectAll() {
  useSel.getState().set(interactiveElements(selectActivePage(useDoc.getState())).map((e) => e.id));
}

/** Página ativa (atalho para as ações). */
const activePage = () => selectActivePage(useDoc.getState());

export function deleteSelection() {
  const sel = useSel.getState().ids;
  if (!sel.length) return;
  // apagar um nó apaga o ramo inteiro; apagar um quadro solta o conteúdo
  const all = selectActivePage(useDoc.getState()).elements;
  const ids = new Set(sel);
  for (const e of all) if (e.type === "node" && ids.has(e.id)) subtreeIds(all, e.id).forEach((i) => ids.add(i));
  // apagar um vértice de grafo apaga as arestas dele
  const vs = new Set(all.filter((e) => ids.has(e.id) && isVertex(e, all)).map((e) => e.id));
  if (vs.size) incidentEdges(all, vs).forEach((i) => ids.add(i));
  useDoc.getState().removeElements([...ids]);
  useSel.getState().clear();
}

export function duplicateSelection() {
  const els = selectedWithDependents();
  if (!els.length) return;
  const ids = addCopies(els, cloneAt(els, 16, 16), activePage());
  useSel.getState().set(ids);
}

export function copySelection() {
  const els = selectedWithDependents();
  if (!els.length) return;
  clipboard = els;
  const p = activePage();
  clipboardSrc = { groups: p.groups, elements: p.elements };
  pasteCount = 0;
}

export function cutSelection() {
  copySelection();
  deleteSelection();
}

export function pasteClipboard() {
  if (!clipboard.length) return;
  pasteCount++;
  const ids = addCopies(clipboard, cloneAt(clipboard, 16 * pasteCount, 16 * pasteCount), clipboardSrc);
  useSel.getState().set(ids);
}

export function nudgeSelection(dx: number, dy: number) {
  const els = selectedWithDependents();
  if (!els.length) return;
  const x = moveXform(dx, dy);
  useDoc.getState().updateElements(detachForeign(els.map((e) => applyXform(e, x))));
}

export function recolorSelection(color: string) {
  const els = selectedElements();
  if (!els.length) return;
  useDoc.getState().updateElements(els.map((e) => {
    if (e.type === "stroke" || e.type === "text" || e.type === "frame") return { ...e, color };
    if (e.type === "node") return { ...e, stroke: e.stroke ? color : e.stroke, fill: e.fill ? tint(color, 0.85) : e.fill, branchColor: color };
    if (e.type === "attachment") return e;
    return { ...e, stroke: color };
  }));
}

/**
 * Escolhe a cor ativa. `commit: false` serve para arrastes (só muda a cor da ferramenta, sem encher o
 * histórico); `commit: true` (padrão) também recolore a seleção/o texto e vale como um passo de desfazer.
 * `remember: false` não põe a cor nos recentes (usado pelas cores fixas da barra).
 */
export function applyColor(color: string, opts: { commit?: boolean; remember?: boolean } = {}) {
  const c = parseHex(color);
  if (!c) return;
  const t = useTool.getState();
  useEdit.getState().patch({ color: c }); // muda a cor do texto em edição
  if (opts.commit === false) {
    t.set({ color: c });
    return;
  }
  t.set(opts.remember === false ? { color: c } : { color: c, recent: pushRecent(t.recent, c) });
  if (useSel.getState().ids.length > 0 && (t.tool === "select" || t.tool === "lasso")) recolorSelection(c);
  else if (t.tool === "eraser" || t.tool === "hand") t.setTool("pen");
}

/** Cor "principal" de um elemento, para o conta-gotas (forma preenchida → preenchimento). */
export function elementColor(el: HirakuElement): string {
  if (el.type === "stroke" || el.type === "text") return el.color;
  if (el.type === "node") return el.stroke ?? el.branchColor;
  if (el.type === "frame") return el.color;
  if (el.type === "attachment") return "#1B2233";
  if (isLinear(el)) return el.stroke;
  return el.fill ?? el.stroke;
}

/** Vai para a página anterior (-1) ou próxima (+1). */
export function goPage(dir: -1 | 1) {
  const { doc, activePageId, setActivePage } = useDoc.getState();
  const j = doc.pages.findIndex((p) => p.id === activePageId) + dir;
  if (j >= 0 && j < doc.pages.length) setActivePage(doc.pages[j].id);
}

/** Enter com um único texto selecionado: edita. */
export function editSelectedText(): boolean {
  const els = selectedElements();
  if (els.length !== 1 || els[0].type !== "text") return false;
  beginEditText(els[0]);
  return true;
}

/** Fonte/tamanho/alinhamento: aplica à edição em curso ou, senão, aos textos selecionados. */
export type TextPatch = Partial<Pick<TextElement, "fontFamily" | "fontSize" | "align" | "color">> & TextFx;
const FX_KEYS: (keyof TextFx)[] = ["bold", "italic", "underline", "strike", "lineHeight", "letterSpacing", "bg"];

/** Fonte/tamanho/alinhamento/estilo: aplica à edição em curso ou, senão, aos textos selecionados (e vira o padrão dos novos). */
export function restyleText(patch: TextPatch) {
  const fxPatch: TextFx = {};
  const base: Partial<Pick<TextElement, "fontFamily" | "fontSize" | "align" | "color">> = {};
  for (const [k, v] of Object.entries(patch)) {
    if ((FX_KEYS as string[]).includes(k)) (fxPatch as Record<string, unknown>)[k] = v;
    else (base as Record<string, unknown>)[k] = v;
  }
  const ses = useEdit.getState().session;
  if (ses) {
    useEdit.getState().patch({ ...base, fx: { ...ses.fx, ...fxPatch } });
    return;
  }
  const els = selectedElements().filter((e): e is TextElement => e.type === "text");
  if (!els.length) return;
  useDoc.getState().updateElements(
    els.map((e) => {
      const n = { ...e, ...base, ...fxPatch } as TextElement;
      for (const k of FX_KEYS) if (n[k] === undefined || n[k] === false) delete n[k];
      const m = measureBlock(n.text, n.fontFamily, n.fontSize, n);
      return { ...n, w: m.w, h: m.h };
    }),
  );
}
