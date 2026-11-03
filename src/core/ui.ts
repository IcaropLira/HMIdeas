import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  /** Menu de configurações aberto (personalizar as barras). */
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  /** Aba aberta nas configurações. */
  settingsTab: string;
  setSettingsTab: (tab: string) => void;
  /** Bloco sendo arrastado e o destino sob o ponteiro ("zone:bottom", "block:colors"), para destacar. */
  dragging: string | null;
  dropHint: string | null;
  setDrag: (dragging: string | null, dropHint?: string | null) => void;
  /** Cadernos (gerenciador): janela aberta e nome do caderno atual (mostrado no topo). */
  notebooksOpen: boolean;
  setNotebooksOpen: (open: boolean) => void;
  notebookName: string;
  setNotebookName: (name: string) => void;
  toast: { id: number; msg: string } | null;
  /** Pedido para abrir um painel de configurações da barra (botão direito no canvas). */
  panelRequest: { panel: string; x: number; y: number; n: number } | null;
  requestPanel: (panel: string, x: number, y: number) => void;
  setSidebar: (open: boolean) => void;
  showToast: (msg: string) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Estado de interface (não persiste, não entra no desfazer). */
export const useUI = create<UIState>((set) => ({
  sidebarOpen: typeof window !== "undefined" ? window.innerWidth >= 900 : false,
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  settingsTab: "aparencia",
  setSettingsTab: (settingsTab) => set({ settingsTab, settingsOpen: true }),
  dragging: null,
  dropHint: null,
  setDrag: (dragging, dropHint = null) => set({ dragging, dropHint }),
  notebooksOpen: false,
  setNotebooksOpen: (notebooksOpen) => set({ notebooksOpen }),
  notebookName: "",
  setNotebookName: (notebookName) => set({ notebookName }),
  toast: null,
  panelRequest: null,
  requestPanel: (panel, x, y) => set((s) => ({ panelRequest: { panel, x, y, n: (s.panelRequest?.n ?? 0) + 1 } })),
  setSidebar: (sidebarOpen) => set({ sidebarOpen }),
  showToast: (msg) => {
    clearTimeout(toastTimer);
    set({ toast: { id: Date.now(), msg } });
    toastTimer = setTimeout(() => set({ toast: null }), 4000);
  },
}));
