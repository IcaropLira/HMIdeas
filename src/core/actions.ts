// Ações de edição sobre a seleção. Usadas pelo teclado e pela barra de ações (toque).
import { detachForeign, reidentify } from "./binding";
import { parseHex, pushRecent } from "./color";
import { HirakuElement, TextElement, isLinear } from "./model";
import { applyXform, moveXform } from "./selection";
import { selectActivePage, useDoc, useSel, useTool } from "./store";
import { beginEditText, useEdit } from "./textEdit";
import { measureBlock } from "./text";

let clipboard: HirakuElement[] = [];
let pasteCount = 0;

export const selectedElements = (): HirakuElement[] => {
  const ids = new Set(useSel.getState().ids);
  return selectActivePage(useDoc.getState()).elements.filter((e) => ids.has(e.id));
};

const cloneAt = (els: HirakuElement[], dx: number, dy: number): HirakuElement[] =>
  reidentify(els.map((e) => applyXform(e, moveXform(dx, dy))));

export function selectAll() {
  useSel.getState().set(selectActivePage(useDoc.getState()).elements.map((e) => e.id));
}

export function deleteSelection() {
  const ids = useSel.getState().ids;
  if (!ids.length) return;
  useDoc.getState().removeElements(ids);
  useSel.getState().clear();
}

export function duplicateSelection() {
  const els = selectedElements();
  if (!els.length) return;
  const copies = cloneAt(els, 16, 16);
  useDoc.getState().addElements(copies);
  useSel.getState().set(copies.map((c) => c.id));
}

export function copySelection() {
  const els = selectedElements();
  if (!els.length) return;
  clipboard = els;
  pasteCount = 0;
}

export function cutSelection() {
  copySelection();
  deleteSelection();
}

export function pasteClipboard() {
  if (!clipboard.length) return;
  pasteCount++;
  const copies = cloneAt(clipboard, 16 * pasteCount, 16 * pasteCount);
  useDoc.getState().addElements(copies);
  useSel.getState().set(copies.map((c) => c.id));
}

export function nudgeSelection(dx: number, dy: number) {
  const els = selectedElements();
  if (!els.length) return;
  const x = moveXform(dx, dy);
  useDoc.getState().updateElements(detachForeign(els.map((e) => applyXform(e, x))));
}

export function recolorSelection(color: string) {
  const els = selectedElements();
  if (!els.length) return;
  useDoc.getState().updateElements(els.map((e) => (e.type === "stroke" || e.type === "text" ? { ...e, color } : { ...e, stroke: color })));
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
export function restyleText(patch: Partial<Pick<TextElement, "fontFamily" | "fontSize" | "align">>) {
  if (useEdit.getState().session) {
    useEdit.getState().patch(patch);
    return;
  }
  const els = selectedElements().filter((e): e is TextElement => e.type === "text");
  if (!els.length) return;
  useDoc.getState().updateElements(
    els.map((e) => {
      const n = { ...e, ...patch };
      const m = measureBlock(n.text, n.fontFamily, n.fontSize);
      return { ...n, w: m.w, h: m.h };
    }),
  );
}
