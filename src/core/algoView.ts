// Execução de algoritmo em andamento (UI): passos, passo atual, tocando ou não, velocidade e o desenho por cima do
// quadro. Fora do documento e do desfazer — ver a execução não muda o grafo.
import { create } from "zustand";
import { Step } from "./graphAlgo";
import { ID } from "./model";

export interface AlgoOverlay {
  rings: { cx: number; cy: number; rx: number; ry: number; color: string; width: number; fill?: string }[];
  edges: { pts: { x: number; y: number }[]; color: string; width: number; alpha: number }[];
  badges: { x: number; y: number; text: string; color: string }[];
}

interface AlgoState {
  title: string;
  steps: Step[] | null;
  /** Vértices (ids dos nós) e arestas (ids das setas, na ordem de g.edges) do grafo executado. */
  vertexIds: ID[];
  edgeIds: ID[];
  index: number;
  playing: boolean;
  /** Passos por segundo. */
  speed: number;
  overlay: AlgoOverlay | null;
  start: (title: string, steps: Step[], vertexIds: ID[], edgeIds: ID[]) => void;
  go: (i: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  setOverlay: (o: AlgoOverlay | null) => void;
  stop: () => void;
}

export const useAlgo = create<AlgoState>((set, get) => ({
  title: "",
  steps: null,
  vertexIds: [],
  edgeIds: [],
  index: 0,
  playing: false,
  speed: 1.5,
  overlay: null,
  start: (title, steps, vertexIds, edgeIds) => set({ title, steps, vertexIds, edgeIds, index: 0, playing: true }),
  go: (i) => { const n = get().steps?.length ?? 0; set({ index: Math.max(0, Math.min(n - 1, i)) }); },
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setOverlay: (overlay) => set({ overlay }),
  stop: () => set({ steps: null, playing: false, overlay: null, index: 0 }),
}));
