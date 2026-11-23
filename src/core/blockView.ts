// Bloco aberto no editor (UI, fora do documento e do desfazer).
import { create } from "zustand";
import { ID } from "./model";
import { selectActivePage, useDoc, useSel } from "./store";
import { usePageEdit } from "./pageEdit";

interface BlockEditState {
  id: ID | null;
  open: (id: ID) => void;
  close: () => void;
}

export const useBlockEdit = create<BlockEditState>((set) => ({
  id: null,
  open: (id) => set({ id }),
  close: () => set({ id: null }),
}));

/** Enter / "Editar" com um bloco selecionado abre o editor dele. */
export function editSelectedBlock(): boolean {
  const ids = useSel.getState().ids;
  if (ids.length !== 1) return false;
  const e = selectActivePage(useDoc.getState()).elements.find((x) => x.id === ids[0]);
  if (!e || e.type !== "attachment" || e.kind !== "block") return false;
  if (e.block?.kind === "page") usePageEdit.getState().open(e.id);
  else useBlockEdit.getState().open(e.id);
  return true;
}

/** Campo de um bloco sendo editado direto no quadro (duplo toque num texto do bloco). */
interface InlineState { id: ID | null; key: string; caret: number | null; open: (id: ID, key: string, caret?: number | null) => void; close: () => void }
export const useBlockInline = create<InlineState>((set) => ({
  id: null, key: "", caret: null,
  open: (id, key, caret = null) => set({ id, key, caret }),
  close: () => set({ id: null, key: "", caret: null }),
}));
