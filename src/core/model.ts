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
  /** Quadro (FrameElement) a que pertence; null/ausente = solto na página. */
  frameId?: ID | null;
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
  /** Quadro (FrameElement) a que pertence; null/ausente = solto na página. */
  frameId?: ID | null;
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
  /** Quadro (FrameElement) a que pertence; null/ausente = solto na página. */
  frameId?: ID | null;
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
  /** Quadro (FrameElement) a que pertence; null/ausente = solto na página. */
  frameId?: ID | null;
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


// ---------- mapa mental e quadros ----------

export type NodeShape = "pill" | "rounded" | "rect" | "ellipse" | "underline" | "none";
export const NODE_SHAPES: { id: NodeShape; label: string }[] = [
  { id: "pill", label: "Pílula" },
  { id: "rounded", label: "Arredondado" },
  { id: "rect", label: "Retângulo" },
  { id: "ellipse", label: "Elipse" },
  { id: "underline", label: "Sublinhado" },
  { id: "none", label: "Só texto" },
];

export type MapLayout = "both" | "right" | "left" | "down";
export const MAP_LAYOUTS: { id: MapLayout; label: string }[] = [
  { id: "both", label: "Dos dois lados" },
  { id: "right", label: "Para a direita" },
  { id: "left", label: "Para a esquerda" },
  { id: "down", label: "Para baixo" },
];

export type BranchStyle = "curve" | "elbow" | "straight";
export const BRANCH_STYLES: { id: BranchStyle; label: string }[] = [
  { id: "curve", label: "Curva" },
  { id: "elbow", label: "Em cotovelo" },
  { id: "straight", label: "Reta" },
];

/**
 * Nó de mapa mental. É uma caixa (x, y, w, h) como as formas, então seleção, mover, setas ligadas e
 * miniaturas funcionam sem caso especial. A árvore vem de `parentId`; posições e `hidden` são DERIVADOS
 * por core/mindmap.ts (layout automático) e ficam gravados para o desenho ser rápido.
 */
export interface NodeElement {
  id: ID;
  type: "node";
  frameId?: ID | null;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Sempre 0 (nós não giram); existe para serem "ligáveis" como as formas. */
  angle: number;
  /** Largura do contorno (e da ligação com o pai, na raiz). */
  strokeWidth: number;
  text: string;
  fontSize: number;
  fontFamily: FontFamily;
  /** Cor do texto. */
  color: string;
  shape: NodeShape;
  fill: string | null;
  stroke: string | null;
  /** Cor do ramo que liga ESTE nó ao pai. */
  branchColor: string;
  /** Marcador (emoji/símbolo) mostrado antes do texto; null = nenhum. */
  icon: string | null;
  /** Tarefa concluída: texto riscado e esmaecido. */
  done: boolean;
  /** Pai na árvore; null/ausente = raiz do mapa. Pai inexistente também vale como raiz. */
  parentId?: ID | null;
  /** Filhos escondidos. */
  collapsed: boolean;
  /** Em mapas "dos dois lados": lado fixo deste ramo (só filhos diretos da raiz). */
  side: "auto" | "left" | "right";
  /** Só na raiz: direção do mapa e estilo dos ramos. */
  layout: MapLayout;
  branchStyle: BranchStyle;
  /** Derivado: dentro de um ramo recolhido. */
  hidden?: boolean;
  opacity: number;
}

/** Quadro (como o do Figma/Miro): contém outros elementos — inclusive outros quadros. */
export interface FrameElement {
  id: ID;
  type: "frame";
  /** Quadro pai (quadros aninhados). */
  frameId?: ID | null;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  strokeWidth: number;
  title: string;
  /** Cor do contorno, do título e do véu de fundo. */
  color: string;
  /** Opacidade do véu de fundo (0..0.5). */
  tint: number;
  rounded: boolean;
  opacity: number;
}

// M2+ adiciona: image
export type HirakuElement = StrokeElement | ShapeElement | LinearElement | TextElement | NodeElement | FrameElement;

/** Elementos "de caixa" com contorno próprio: formas, nós e quadros. */
export type BoxElement = ShapeElement | NodeElement | FrameElement;

/** Guardas de tipo: `type` de forma/linha é uma união de literais, então só `===` não separa as duas no TS. */
export const isLinear = (el: HirakuElement): el is LinearElement => el.type === "line" || el.type === "arrow";
export const isShape = (el: HirakuElement): el is ShapeElement => (SHAPE_TYPES as string[]).includes(el.type);
export const isNode = (el: HirakuElement): el is NodeElement => el.type === "node";
export const isFrame = (el: HirakuElement): el is FrameElement => el.type === "frame";

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

const KNOWN_TYPES = ["stroke", "rect", "ellipse", "diamond", "line", "arrow", "text", "node", "frame"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validElement = (e: any): boolean =>
  !!e &&
  KNOWN_TYPES.includes(e.type) &&
  (!(e.type === "line" || e.type === "arrow") || (Array.isArray(e.points) && e.points.length >= 2)) &&
  (e.type !== "text" || typeof e.text === "string") &&
  (e.type !== "node" || (typeof e.text === "string" && Number.isFinite(e.x) && Number.isFinite(e.y))) &&
  (e.type !== "frame" || (Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.w) && Number.isFinite(e.h)));

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cleanNode = (e: any): NodeElement => ({
  ...e,
  w: Math.max(10, num(e.w, 80)),
  h: Math.max(10, num(e.h, 36)),
  angle: 0,
  strokeWidth: num(e.strokeWidth, 1.5),
  fontSize: Math.max(6, Math.min(200, num(e.fontSize, 18))),
  fontFamily: FONT_IDS.includes(e.fontFamily) ? e.fontFamily : "sans",
  color: hex(e.color, "#1B2233"),
  shape: NODE_SHAPES.some((x) => x.id === e.shape) ? e.shape : "pill",
  fill: e.fill === null ? null : hex(e.fill, "#FFFFFF"),
  stroke: e.stroke === null || e.stroke === undefined ? null : hex(e.stroke, "#1B2233"),
  branchColor: hex(e.branchColor, "#2F4B8F"),
  icon: typeof e.icon === "string" && e.icon ? e.icon.slice(0, 8) : null,
  done: e.done === true,
  parentId: typeof e.parentId === "string" ? e.parentId : null,
  frameId: typeof e.frameId === "string" ? e.frameId : null,
  collapsed: e.collapsed === true,
  side: e.side === "left" || e.side === "right" ? e.side : "auto",
  layout: MAP_LAYOUTS.some((x) => x.id === e.layout) ? e.layout : "both",
  branchStyle: BRANCH_STYLES.some((x) => x.id === e.branchStyle) ? e.branchStyle : "curve",
  hidden: e.hidden === true,
  opacity: num(e.opacity, 1),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cleanFrame = (e: any): FrameElement => ({
  ...e,
  w: Math.max(10, num(e.w, 200)),
  h: Math.max(10, num(e.h, 150)),
  angle: 0,
  strokeWidth: num(e.strokeWidth, 1.5),
  title: str(e.title, "Quadro").slice(0, 120),
  color: hex(e.color, "#2F4B8F"),
  tint: Math.max(0, Math.min(0.5, num(e.tint, 0.06))),
  rounded: e.rounded !== false,
  frameId: typeof e.frameId === "string" ? e.frameId : null,
  opacity: num(e.opacity, 1),
});

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
                  : e.type === "node"
                    ? cleanNode(e)
                    : e.type === "frame"
                      ? cleanFrame(e)
                      : e,
          )
        : [],
    })),
  };
}
