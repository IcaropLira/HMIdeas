// Modelo de dados do HM Ideas. Puro: sem Pixi, sem React.
// Tudo aqui é serializável em JSON e tratado como IMUTÁVEL.

export type ID = string;

/** Ponto de tinta em coordenadas do MUNDO (não da tela). */
export interface InkPoint {
  x: number;
  y: number;
  /** Pressão normalizada 0..1 (mouse = 0.5). */
  p: number;
}

/**
 * "Fotografia" da dinâmica do brush no momento em que o traço foi feito. Fica guardada no traço para que
 * editar (ou apagar) um brush depois não mude o que já foi desenhado.
 */
export interface StrokeDyn {
  /** Resposta à pressão da caneta (0 = largura constante). */
  thinning: number;
  /** Resposta à velocidade para mouse/dedo, que não têm pressão (0 = largura constante). */
  simThinning: number;
  /** Fração da largura que sobra com pressão zero / velocidade máxima (0..1). */
  minSize: number;
  /** Suavização geométrica do caminho (0..1). */
  smoothing: number;
  /** Pontas arredondadas (true) ou retas (false). */
  round: boolean;
  /** Quanto do afilamento vale para o INÍCIO do traço (0..1; o fim usa 1). */
  taperStart: number;
  /** Curva da pressão: p^gamma (1 = linear; >1 exige mais força para engrossar). */
  gamma: number;
  blend: "normal" | "multiply";
}

export interface StrokeElement {
  id: ID;
  type: "stroke";
  points: InkPoint[];
  color: string;
  /** Largura base em unidades do mundo. */
  width: number;
  /** Sensibilidade à pressão usada ao desenhar (0 = largura constante, 1 = máxima). */
  sens: number;
  /** Afilamento das pontas, 0..1 (0 = ponta cega). */
  taper: number;
  /** Id do brush (core/brushes.ts). Arquivos antigos não têm: viram "pen" em normalizeDoc. */
  brush: string;
  /** Opacidade final do traço (brush × controle de opacidade). */
  opacity: number;
  /** Dinâmica do brush no momento do traço. Arquivos antigos não têm: usam o brush registrado. */
  dyn?: StrokeDyn;
  /** Pedaços criados pela borracha de pixel: a ponta cortada fica reta, sem afilar. */
  openStart?: boolean;
  openEnd?: boolean;
}

export type ShapeType = "rect" | "ellipse" | "diamond";
export const SHAPE_TYPES: ShapeType[] = ["rect", "ellipse", "diamond"];
export type LineStyle = "solid" | "dashed" | "dotted";

export interface ShapeElement {
  id: ID;
  type: ShapeType;
  /** Caixa em coordenadas do mundo (x, y = canto superior esquerdo). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotação em radianos em torno do centro (usada a partir do M1b). */
  angle: number;
  stroke: string;
  strokeWidth: number;
  strokeStyle: LineStyle;
  /** Cor de preenchimento ou null (sem preenchimento). */
  fill: string | null;
  /** Só retângulos: cantos arredondados. */
  rounded: boolean;
  opacity: number;
}

export type ArrowHead = "none" | "arrow" | "triangle" | "dot" | "bar";
export const ARROW_HEADS: { id: ArrowHead; label: string }[] = [
  { id: "none", label: "Nenhuma" },
  { id: "arrow", label: "Seta" },
  { id: "triangle", label: "Triângulo" },
  { id: "dot", label: "Ponto" },
  { id: "bar", label: "Barra" },
];

export type LinearType = "line" | "arrow";

/** Ponta de seta ligada a uma forma: (u, v) = foco em coordenadas normalizadas da forma (−1..1). */
export interface ArrowBinding {
  elementId: ID;
  u: number;
  v: number;
}

/** Linha ou seta com 2+ pontos (retos ou suavizados). */
export interface LinearElement {
  id: ID;
  type: LinearType;
  points: { x: number; y: number }[];
  stroke: string;
  strokeWidth: number;
  strokeStyle: LineStyle;
  startHead: ArrowHead;
  endHead: ArrowHead;
  /** true = curva suave passando pelos pontos. */
  curved: boolean;
  /** Só setas: ligações das pontas a formas (a posição das pontas é recalculada a partir delas). */
  startBinding?: ArrowBinding | null;
  endBinding?: ArrowBinding | null;
  opacity: number;
}

export type FontFamily = "sans" | "serif" | "mono" | "hand";
export const FONT_IDS: FontFamily[] = ["sans", "serif", "mono", "hand"];
export type TextAlign = "left" | "center" | "right";

/** Texto de bloco único (sem quebra automática): w/h são medidos ao confirmar a edição. */
export interface TextElement {
  id: ID;
  type: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  text: string;
  /** Tamanho da fonte em unidades do mundo. */
  fontSize: number;
  fontFamily: FontFamily;
  align: TextAlign;
  color: string;
  opacity: number;
}

// M2+ adiciona: image
export type HirakuElement = StrokeElement | ShapeElement | LinearElement | TextElement;

/** Guardas de tipo: `type` de forma/linha é uma união de literais, então só `===` não separa as duas no TS. */
export const isLinear = (el: HirakuElement): el is LinearElement => el.type === "line" || el.type === "arrow";
export const isShape = (el: HirakuElement): el is ShapeElement => (SHAPE_TYPES as string[]).includes(el.type);

export type PaperKind = "blank" | "ruled" | "grid" | "dots";

export const PAPER_KINDS: { id: PaperKind; label: string }[] = [
  { id: "blank", label: "Liso" },
  { id: "ruled", label: "Pautado" },
  { id: "grid", label: "Quadriculado" },
  { id: "dots", label: "Pontilhado" },
];

export const DEFAULT_BACKGROUND = "#EDF0F4";

export const PAPER_COLORS: { value: string; label: string }[] = [
  { value: "#EDF0F4", label: "Cinza-azulado" },
  { value: "#FFFFFF", label: "Branco" },
  { value: "#FAF1C7", label: "Amarelo" },
];

export interface Page {
  id: ID;
  name: string;
  paper: PaperKind;
  background: string;
  /** Ordem de empilhamento (último = por cima). */
  elements: HirakuElement[];
}

export interface HirakuDoc {
  version: 1;
  pages: Page[];
}

export const newId = (): ID => crypto.randomUUID();

export function createPage(name = "Página 1"): Page {
  return { id: newId(), name, paper: "blank", background: DEFAULT_BACKGROUND, elements: [] };
}

export function createDoc(): HirakuDoc {
  return { version: 1, pages: [createPage()] };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cleanBinding = (b: any): ArrowBinding | null =>
  b && typeof b.elementId === "string" && Number.isFinite(b.u) && Number.isFinite(b.v)
    ? { elementId: b.elementId, u: b.u, v: b.v }
    : null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cleanText = (e: any): TextElement => {
  const size = Number.isFinite(e.fontSize) && e.fontSize > 0 ? e.fontSize : 20;
  const lines = String(e.text).split("\n");
  return {
    ...e,
    fontSize: size,
    fontFamily: FONT_IDS.includes(e.fontFamily) ? e.fontFamily : "sans",
    align: e.align === "center" || e.align === "right" ? e.align : "left",
    angle: Number.isFinite(e.angle) ? e.angle : 0,
    w: Number.isFinite(e.w) && e.w > 0 ? e.w : Math.max(...lines.map((l) => l.length), 1) * size * 0.6,
    h: Number.isFinite(e.h) && e.h > 0 ? e.h : lines.length * size * 1.25,
  };
};

const KNOWN_TYPES = ["stroke", "rect", "ellipse", "diamond", "line", "arrow", "text"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validElement = (e: any): boolean =>
  !!e &&
  KNOWN_TYPES.includes(e.type) &&
  (!(e.type === "line" || e.type === "arrow") || (Array.isArray(e.points) && e.points.length >= 2)) &&
  (e.type !== "text" || typeof e.text === "string");

/** Valida e completa campos novos de arquivos antigos (migração leve, ainda versão 1). */
export function normalizeDoc(raw: unknown): HirakuDoc {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = raw as any;
  if (d?.version !== 1 || !Array.isArray(d.pages) || d.pages.length === 0) {
    throw new Error("Arquivo não é um desenho do HM Ideas (versão 1).");
  }
  const kinds = PAPER_KINDS.map((k) => k.id);
  return {
    version: 1,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pages: d.pages.map((p: any, i: number): Page => ({
      id: typeof p.id === "string" ? p.id : newId(),
      name: typeof p.name === "string" ? p.name : `Página ${i + 1}`,
      paper: kinds.includes(p.paper) ? p.paper : "blank",
      background: typeof p.background === "string" ? p.background : DEFAULT_BACKGROUND,
      elements: Array.isArray(p.elements)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? p.elements.filter(validElement).map((e: any) =>
            e.type === "stroke"
              ? {
                  ...e,
                  sens: typeof e.sens === "number" ? e.sens : 1,
                  taper: typeof e.taper === "number" ? e.taper : 0,
                  brush: typeof e.brush === "string" && e.brush ? e.brush : "pen",
                }
              : e.type === "arrow"
                ? { ...e, startBinding: cleanBinding(e.startBinding), endBinding: cleanBinding(e.endBinding) }
                : e.type === "text"
                  ? cleanText(e)
                  : e,
          )
        : [],
    })),
  };
}
