// Registro de brushes (pincéis). Puro: sem Pixi, sem React. Só DESCREVE como cada brush se comporta;
// quem desenha é render/strokeDraw.ts.
//
// Um traço guarda só o `brush` (id) além de cor/largura/pressão/afilamento/opacidade, então trocar ou
// ajustar um brush aqui não reescreve o documento: arquivos antigos (sem `brush`) abrem como "pen".

/** Brush de contorno: o traço vira UM polígono variável (perfect-freehand). */
export interface OutlineBrush {
  kind: "outline";
  id: string;
  label: string;
  /** Multiplica a espessura escolhida no controle (marca-texto é bem mais largo que a caneta). */
  size: number;
  /** Resposta à pressão com caneta real (perfect-freehand `thinning`): 0 = largura constante. */
  thinning: number;
  /** Idem, para mouse/dedo, onde a pressão é simulada pela velocidade do traço. */
  simThinning: number;
  /** perfect-freehand: suavização do contorno e "streamline" (quanto o traço segue atrasado). */
  smoothing: number;
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
}

export type Brush = OutlineBrush;

export const DEFAULT_BRUSH_ID = "pen";

const OUTLINE: OutlineBrush[] = [
  {
    kind: "outline", id: "pen", label: "Caneta",
    size: 1, thinning: 0.8, simThinning: 0.5, smoothing: 0.5, streamline: 0.15, taper: null,
    round: true, opacity: 1, blend: "normal",
    hint: "A caneta padrão: varia com a pressão e afila nas pontas.",
  },
  {
    kind: "outline", id: "ballpoint", label: "Esferográfica",
    size: 0.9, thinning: 0.25, simThinning: 0.12, smoothing: 0.5, streamline: 0.3, taper: 0.08,
    round: true, opacity: 1, blend: "normal",
    hint: "Linha firme e quase constante, como uma esferográfica.",
  },
  {
    kind: "outline", id: "ink", label: "Nanquim",
    size: 1.1, thinning: 0.9, simThinning: 0.75, smoothing: 0.55, streamline: 0.2, taper: 0.7,
    round: true, opacity: 1, blend: "normal",
    hint: "Pena de nanquim: grossa e fina conforme a pressão, pontas bem afiladas.",
  },
  {
    kind: "outline", id: "marker", label: "Marcador",
    size: 2.2, thinning: 0, simThinning: 0, smoothing: 0.5, streamline: 0.25, taper: 0,
    round: true, opacity: 0.9, blend: "normal",
    hint: "Ponta de feltro: traço grosso, de largura constante.",
  },
  {
    kind: "outline", id: "highlighter", label: "Marca-texto",
    size: 5, thinning: 0, simThinning: 0, smoothing: 0.6, streamline: 0.4, taper: 0,
    round: false, opacity: 0.4, blend: "multiply", defaultColor: "#F2C14E",
    hint: "Translúcido e sem tapar o que está por baixo.",
  },
  {
    kind: "outline", id: "brushpen", label: "Pincel",
    size: 1.8, thinning: 0.9, simThinning: 0.7, smoothing: 0.6, streamline: 0.4, taper: 0.8,
    round: true, opacity: 1, blend: "normal",
    hint: "Caneta-pincel: bem sensível à pressão, com final longo e fino.",
  },
];

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
