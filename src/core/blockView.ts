// Bloco aberto no editor (UI, fora do documento e do desfazer).
import { create } from "zustand";
import { ID } from "./model";
import { selectActivePage, useDoc, useSel } from "./store";

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
  useBlockEdit.getState().open(e.id);
  return true;
}
