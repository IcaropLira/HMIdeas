// Registro de brushes (pincéis). Puro: sem Pixi, sem React. Só DESCREVE como cada brush se comporta;
// quem calcula a malha é core/strokeMesh.ts e quem pinta é render/strokeDraw.ts.
//
// Um traço guarda o `brush` (id) E uma fotografia da dinâmica (`dyn`, ver StrokeDyn em model.ts), então
// ajustar ou apagar um brush aqui não reescreve o que já foi desenhado. Arquivos antigos (sem `brush`/`dyn`)
// abrem como "pen" e usam os valores atuais do brush registrado.
import { StrokeDyn } from "./model";

/** Brush de contorno: o traço vira uma malha de triângulos de largura variável (sem triangulação de polígono). */
export interface OutlineBrush {
  kind: "outline";
  id: string;
  label: string;
  /** Multiplica a espessura escolhida no controle (marca-texto é bem mais largo que a caneta). */
  size: number;
  /** Resposta à pressão com caneta real: 0 = largura constante. */
  thinning: number;
  /** Idem, para mouse/dedo, onde a "pressão" vem da velocidade do traço (rápido = fino). */
  simThinning: number;
  /** Suavização geométrica do caminho (tira o serrilhado do mouse sem atrasar a ponta). */
  smoothing: number;
  /** Estabilizador: quanto a ponta "segue de longe" o cursor (filtro adaptativo; 0 = cola no cursor). */
  streamline: number;
  /** Afilamento fixo das pontas (0..1). null = usa o controle "Afilamento" do usuário. */
  taper: number | null;
  /** Pontas arredondadas (true) ou retas, como um marca-texto chanfrado (false). */
  round: boolean;
  /** Opacidade própria do brush; é multiplicada pelo controle de opacidade do usuário. */
  opacity: number;
  /** "multiply" escurece o que está embaixo (marca-texto de verdade, não tampa o texto). */
  blend: "normal" | "multiply";
  /** Cor sugerida ao escolher o brush (marca-texto → amarelo). Sem isso, mantém a cor atual. */
  defaultColor?: string;
  /** Texto curto para a dica do painel. */
  hint: string;
  /** Fração da largura que sobra com pressão zero (0..1). Padrão 0.35. */
  minSize?: number;
  /** Quanto do afilamento vale no início do traço (0..1). Padrão 0.5. */
  taperStart?: number;
  /** Curva de pressão (p^gamma). Padrão 1. */
  pressureCurve?: number;
}

export type Brush = OutlineBrush;

export const DEFAULT_MIN_SIZE = 0.35;
export const DEFAULT_TAPER_START = 0.5;
export const DEFAULT_PRESSURE_CURVE = 1;

/** Dinâmica "congelada" de um brush, para gravar no traço. */
export const brushDyn = (b: Brush): StrokeDyn => ({
  thinning: b.thinning,
  simThinning: b.simThinning,
  minSize: b.minSize ?? DEFAULT_MIN_SIZE,
  smoothing: b.smoothing,
  round: b.round,
  taperStart: b.taperStart ?? DEFAULT_TAPER_START,
  gamma: b.pressureCurve ?? DEFAULT_PRESSURE_CURVE,
  blend: b.blend,
});

export const DEFAULT_BRUSH_ID = "pen";

const OUTLINE: OutlineBrush[] = [
  {
    kind: "outline", id: "pen", label: "Caneta",
    size: 1, thinning: 0.55, simThinning: 0, smoothing: 0.45, streamline: 0.1, taper: null,
    round: true, opacity: 1, blend: "normal",
    hint: "Caneta equilibrada: pressão da mesa digitalizadora engrossa o traço; com mouse a linha é firme e de largura constante.",
  },
  {
    kind: "outline", id: "writer", label: "Escrita",
    size: 0.8, thinning: 0.3, simThinning: 0.25, smoothing: 0.6, streamline: 0.35, taper: 0.12,
    round: true, opacity: 1, blend: "normal", taperStart: 0,
    hint: "Feita para escrever com mouse ou dedo: suaviza o tremido e afina de leve com a velocidade, como letra de mão.",
  },
  {
    kind: "outline", id: "ballpoint", label: "Esferográfica",
    size: 0.9, thinning: 0.2, simThinning: 0, smoothing: 0.45, streamline: 0.15, taper: 0,
    round: true, opacity: 1, blend: "normal",
    hint: "Linha firme e quase constante, como uma esferográfica.",
  },
  {
    kind: "outline", id: "ink", label: "Nanquim",
    size: 1.1, thinning: 0.9, simThinning: 0.6, smoothing: 0.55, streamline: 0.2, taper: 0.6,
    round: true, opacity: 1, blend: "normal", minSize: 0.2,
    hint: "Pena de nanquim: grossa e fina conforme a pressão, com pontas afiladas.",
  },
  {
    kind: "outline", id: "marker", label: "Marcador",
    size: 2.2, thinning: 0, simThinning: 0, smoothing: 0.5, streamline: 0.2, taper: 0,
    round: true, opacity: 0.9, blend: "normal",
    hint: "Ponta de feltro: traço grosso, de largura constante.",
  },
  {
    kind: "outline", id: "highlighter", label: "Marca-texto",
    size: 5, thinning: 0, simThinning: 0, smoothing: 0.6, streamline: 0.3, taper: 0,
    round: false, opacity: 0.4, blend: "multiply", defaultColor: "#F2C14E",
    hint: "Translúcido e sem tapar o que está por baixo. Girar ou cruzar o próprio traço não escurece nem preenche.",
  },
  {
    kind: "outline", id: "brushpen", label: "Pincel",
    size: 1.8, thinning: 0.9, simThinning: 0.6, smoothing: 0.6, streamline: 0.3, taper: 0.7,
    round: true, opacity: 1, blend: "normal", minSize: 0.2, taperStart: 0.6,
    hint: "Caneta-pincel: bem sensível à pressão, com final longo e fino.",
  },
];

/** Ids dos brushes nativos (não podem ser removidos nem substituídos por importação). */
export const NATIVE_BRUSH_IDS: readonly string[] = OUTLINE.map((b) => b.id);
export const isNativeBrush = (id: string): boolean => NATIVE_BRUSH_IDS.includes(id);

const registry = new Map<string, Brush>(OUTLINE.map((b) => [b.id, b]));
/** Ordem de exibição no painel. */
let order: string[] = OUTLINE.map((b) => b.id);

/** Brush pelo id; id desconhecido (arquivo de outra máquina, brush removido) cai na caneta. */
export const getBrush = (id: string | null | undefined): Brush => registry.get(id ?? "") ?? registry.get(DEFAULT_BRUSH_ID)!;

export const hasBrush = (id: string): boolean => registry.has(id);

export const listBrushes = (): Brush[] => order.map((id) => registry.get(id)!);

/** Registra (ou substitui) um brush. Usado por brushes importados. */
export function registerBrush(b: Brush) {
  registry.set(b.id, b);
  if (!order.includes(b.id)) order = [...order, b.id];
}

export function unregisterBrush(id: string) {
  if (OUTLINE.some((b) => b.id === id)) return; // os nativos não saem
  registry.delete(id);
  order = order.filter((x) => x !== id);
}
