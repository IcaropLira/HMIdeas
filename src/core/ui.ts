import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  toast: { id: number; msg: string } | null;
  /** Pedido para abrir um painel de configurações da barra (botão direito no canvas). */
  panelRequest: { panel: string; n: number } | null;
  requestPanel: (panel: string) => void;
  setSidebar: (open: boolean) => void;
  showToast: (msg: string) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Estado de interface (não persiste, não entra no desfazer). */
export const useUI = create<UIState>((set) => ({
  sidebarOpen: typeof window !== "undefined" ? window.innerWidth >= 900 : false,
  toast: null,
  panelRequest: null,
  requestPanel: (panel) => set((s) => ({ panelRequest: { panel, n: (s.panelRequest?.n ?? 0) + 1 } })),
  setSidebar: (sidebarOpen) => set({ sidebarOpen }),
  showToast: (msg) => {
    clearTimeout(toastTimer);
    set({ toast: { id: Date.now(), msg } });
    toastTimer = setTimeout(() => set({ toast: null }), 4000);
  },
}));
