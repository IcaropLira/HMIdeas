import { create } from "zustand";

interface EmbedViewState {
  /** Vídeo em reprodução (um por vez). */
  playing: string | null;
  play: (id: string | null) => void;
  /** PDF: página atual (carrossel) e deslocamento em unidades do mundo (rolagem), por elemento. */
  page: Record<string, number>;
  scroll: Record<string, number>;
  setPage: (id: string, page: number) => void;
  setScroll: (id: string, y: number) => void;
}

/** Estado de leitura dos incorporados: não persiste e não entra no desfazer (virar página não é edição). */
export const useEmbedView = create<EmbedViewState>((set) => ({
  playing: null,
  play: (playing) => set({ playing }),
  page: {},
  scroll: {},
  setPage: (id, p) => set((s) => (s.page[id] === p ? s : { page: { ...s.page, [id]: p } })),
  setScroll: (id, y) => set((s) => (s.scroll[id] === y ? s : { scroll: { ...s.scroll, [id]: y } })),
}));
