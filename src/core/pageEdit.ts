// Bloco Página aberto no editor (UI, fora do documento e do desfazer).
import { create } from "zustand";
import { ID } from "./model";

interface PageEditState {
  /** elemento (bloco Página) aberto */
  id: ID | null;
  /** subpágina aberta dentro dele ("" = a página principal) */
  sub: string;
  open: (id: ID, sub?: string) => void;
  go: (sub: string) => void;
  close: () => void;
}
export const usePageEdit = create<PageEditState>((set) => ({
  id: null,
  sub: "",
  open: (id, sub = "") => set({ id, sub }),
  go: (sub) => set({ sub }),
  close: () => set({ id: null, sub: "" }),
}));
