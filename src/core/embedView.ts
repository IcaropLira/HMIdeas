import { create } from "zustand";

interface EmbedViewState {
  /** Vídeo em reprodução (um por vez). */
  playing: string | null;
  play: (id: string | null) => void;
  /** Player que recebe o mouse (controlar dentro do YouTube). Fora desse modo o iframe deixa roda/pinça/arrastar irem para o quadro. */
  interact: string | null;
  setInteract: (id: string | null) => void;
  /** Player pausado pelos nossos botões (só para mostrar o ícone certo). */
  paused: Record<string, boolean>;
  setPaused: (id: string, paused: boolean) => void;
  /** PDF: página atual (carrossel) e deslocamento em unidades do mundo (rolagem), por elemento. */
  page: Record<string, number>;
  scroll: Record<string, number>;
  setPage: (id: string, page: number) => void;
  setScroll: (id: string, y: number) => void;
}

/** Estado de leitura dos incorporados: não persiste e não entra no desfazer (virar página não é edição). */
export const useEmbedView = create<EmbedViewState>((set) => ({
  playing: null,
  play: (playing) => set((s) => ({ playing, interact: playing === s.interact ? s.interact : null, paused: {} })),
  interact: null,
  setInteract: (interact) => set((s) => (s.interact === interact ? s : { interact })),
  paused: {},
  setPaused: (id, p) => set((s) => (s.paused[id] === p ? s : { paused: { ...s.paused, [id]: p } })),
  page: {},
  scroll: {},
  setPage: (id, p) => set((s) => (s.page[id] === p ? s : { page: { ...s.page, [id]: p } })),
  setScroll: (id, y) => set((s) => (s.scroll[id] === y ? s : { scroll: { ...s.scroll, [id]: y } })),
}));
