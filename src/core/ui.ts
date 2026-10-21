import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  toast: { id: number; msg: string } | null;
  setSidebar: (open: boolean) => void;
  showToast: (msg: string) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Estado de interface (não persiste, não entra no desfazer). */
export const useUI = create<UIState>((set) => ({
  sidebarOpen: typeof window !== "undefined" ? window.innerWidth >= 900 : false,
  toast: null,
  setSidebar: (sidebarOpen) => set({ sidebarOpen }),
  showToast: (msg) => {
    clearTimeout(toastTimer);
    set({ toast: { id: Date.now(), msg } });
    toastTimer = setTimeout(() => set({ toast: null }), 4000);
  },
}));
