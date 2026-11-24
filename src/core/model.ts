// Modelo de dados do HM Ideas. Puro: sem Pixi, sem React.
// Tudo aqui é serializável em JSON e tratado como IMUTÁVEL.

import { cleanGroups, prune } from "./groups";
import { parseYouTube } from "./embed";
import { FigureSpec, cleanFigure } from "./figures";
import { BlockSpec, cleanBlock } from "./blocks";
import { PageSize, cleanPageSize } from "./pageSize";

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

/**
 * Campos comuns a todos os elementos (0.9, todos opcionais): grupo (hierarquia livre em `Page.groups`),
 * travado (aparece mas não seleciona), invisível (oculto pelo usuário; `NodeElement.hidden` é outra coisa:
 * nó escondido por ancestral recolhido) e nome dado no painel de objetos.
 */
export interface ElementMeta {
  groupId?: ID | null;
  locked?: boolean;
  invisible?: boolean;
  name?: string;
}

export interface StrokeElement extends ElementMeta {
  id: ID;
  /** Camada (Page.layers) a que pertence; ausente/desconhecida = primeira camada. */
  layerId?: ID | null;
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

export interface ShapeElement extends ElementMeta {
  id: ID;
  /** Camada (Page.layers) a que pertence; ausente/desconhecida = primeira camada. */
  layerId?: ID | null;
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
export interface LinearElement extends ElementMeta {
  id: ID;
  /** Camada (Page.layers) a que pertence; ausente/desconhecida = primeira camada. */
  layerId?: ID | null;
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
  /** Rótulo no meio da linha (peso de aresta de grafo, condição de fluxograma…). */
  label?: string;
  /** Só setas: ligações das pontas a formas (a posição das pontas é recalculada a partir delas). */
  startBinding?: ArrowBinding | null;
  endBinding?: ArrowBinding | null;
  opacity: number;
}

export type FontFamily =
  | "sans" | "serif" | "mono" | "hand"
  // fontes embutidas (0.9, src/fonts.ts)
  | "inter" | "nunito" | "oswald" | "robotoslab" | "lora" | "merriweather" | "playfair"
  | "caveat" | "patrick" | "kalam" | "indie" | "jetbrains";
export const FONT_IDS: FontFamily[] = [
  "sans", "serif", "mono", "hand", "inter", "nunito", "oswald", "robotoslab", "lora", "merriweather", "playfair",
  "caveat", "patrick", "kalam", "indie", "jetbrains",
];
export type TextAlign = "left" | "center" | "right";

/** Texto de bloco único (sem quebra automática): w/h são medidos ao confirmar a edição. */
export interface TextElement extends ElementMeta {
  id: ID;
  /** Camada (Page.layers) a que pertence; ausente/desconhecida = primeira camada. */
  layerId?: ID | null;
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
  /** Estilo (0.9, opcionais): negrito, itálico, sublinhado, tachado, entrelinha (× tamanho) e espaçamento entre letras (em). */
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  lineHeight?: number;
  letterSpacing?: number;
  /** Fundo do texto (marca-texto atrás das letras); ausente = sem fundo. */
  bg?: string;
}


// ---------- mapa mental e quadros ----------

export type NodeShape = "pill" | "rounded" | "rect" | "ellipse" | "underline" | "none" | "card";
export const NODE_SHAPES: { id: NodeShape; label: string }[] = [
  { id: "pill", label: "Pílula" },
  { id: "rounded", label: "Arredondado" },
  { id: "rect", label: "Retângulo" },
  { id: "ellipse", label: "Elipse" },
  { id: "underline", label: "Sublinhado" },
  { id: "none", label: "Só texto" },
  { id: "card", label: "Cartão" },
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
export interface NodeElement extends ElementMeta {
  id: ID;
  /** Camada (Page.layers) a que pertence; ausente/desconhecida = primeira camada. */
  layerId?: ID | null;
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
  // ---- conteúdo extra (Miro/Milanote): tudo opcional ----
  /** Nota longa (aparece no cartão; linhas "- [ ]" / "- [x]" viram lista de tarefas). */
  note?: string;
  /** Link aberto pelo painel. */
  link?: string;
  /** Etiquetas (chips coloridos embaixo do texto). */
  tags?: string[];
  /** Progresso 0..100 (barrinha). */
  progress?: number;
  /** Data (AAAA-MM-DD). */
  due?: string;
  /** Imagem pequena no topo do nó (data URL) e a proporção altura/largura dela. */
  image?: string;
  imageRatio?: number;
  /** Vértice de grafo (ferramenta Vértice / grafos gerados): não vira filho de mapa ao ser solto sobre outro nó. */
  vertex?: boolean;
  opacity: number;
}

/** Quadro (como o do Figma/Miro): contém outros elementos — inclusive outros quadros. */
export interface FrameElement extends ElementMeta {
  id: ID;
  /** Camada (Page.layers) a que pertence; ausente/desconhecida = primeira camada. */
  layerId?: ID | null;
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

export const ATTACHMENT_KINDS = ["image", "link", "file", "video", "pdf", "figure", "block"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** Anexo embutido no caderno: imagem, link ou arquivo. Conteúdo local pode ser data URL. */
export interface AttachmentElement extends ElementMeta {
  id: ID;
  /** Camada (Page.layers) a que pertence; ausente/desconhecida = primeira camada. */
  layerId?: ID | null;
  frameId?: ID | null;
  type: "attachment";
  x: number; y: number; w: number; h: number;
  kind: AttachmentKind;
  title: string;
  /** Para "video": o link do YouTube (a miniatura e o player saem dele). */
  url: string;
  mime: string;
  /** Imagens e PDFs colados/arrastados ficam incorporados ao arquivo .hiraku. */
  data?: string;
  /** PDF: número de páginas, proporção altura/largura da 1ª página e modo de leitura (carrossel ou rolagem). */
  pages?: number;
  ratio?: number;
  mode?: "carousel" | "scroll";
  /** "figure": sólido, gráfico de função, espaço 3D… (core/figures.ts). */
  figure?: FigureSpec;
  /** "block": bloco nativo (post-it, tarefas, tabela, linha do tempo…; core/blocks.ts). */
  block?: BlockSpec;
  opacity: number;
}

export type HirakuElement = StrokeElement | ShapeElement | LinearElement | TextElement | NodeElement | FrameElement | AttachmentElement;

/** Elementos "de caixa" com contorno próprio: formas, nós e quadros. */
export type BoxElement = ShapeElement | NodeElement | FrameElement;

/** Guardas de tipo: `type` de forma/linha é uma união de literais, então só `===` não separa as duas no TS. */
export const isLinear = (el: HirakuElement): el is LinearElement => el.type === "line" || el.type === "arrow";
export const isShape = (el: HirakuElement): el is ShapeElement => (SHAPE_TYPES as string[]).includes(el.type);
export const isNode = (el: HirakuElement): el is NodeElement => el.type === "node";
export const isFrame = (el: HirakuElement): el is FrameElement => el.type === "frame";

export type PaperKind = "blank" | "ruled" | "margin" | "grid" | "mm" | "dots" | "iso" | "isodots" | "hex" | "music" | "cartesian" | "cornell" | "header" | "calligraphy";

export const PAPER_KINDS: { id: PaperKind; label: string; hint: string }[] = [
  { id: "blank", label: "Liso", hint: "Folha sem linhas" },
  { id: "ruled", label: "Pautado", hint: "Linhas horizontais" },
  { id: "margin", label: "Caderno", hint: "Pautado com margem vermelha" },
  { id: "grid", label: "Quadriculado", hint: "Quadrados com linha forte a cada 5" },
  { id: "mm", label: "Milimetrado", hint: "Grade fina para gráficos e desenho técnico" },
  { id: "dots", label: "Pontilhado", hint: "Pontos (bullet journal)" },
  { id: "iso", label: "Isométrico", hint: "Grade triangular para perspectiva e sólidos" },
  { id: "isodots", label: "Pontos isométricos", hint: "Pontos em triângulos" },
  { id: "hex", label: "Hexagonal", hint: "Colmeia (química, jogos, mapas)" },
  { id: "music", label: "Pauta musical", hint: "Pentagramas de 5 linhas" },
  { id: "cartesian", label: "Plano cartesiano", hint: "Quadriculado com eixos x e y na origem" },
  { id: "cornell", label: "Cornell", hint: "Cabeçalho, coluna de palavras-chave e resumo no rodapé" },
  { id: "header", label: "Cabeçalho e margem", hint: "Pautado com faixa de título e margem" },
  { id: "calligraphy", label: "Caligrafia", hint: "Linhas de ascendente, altura-x, base e descendente com guias inclinadas" },
];

export const DEFAULT_BACKGROUND = "#EDF0F4";

export const PAPER_COLORS: { value: string; label: string }[] = [
  { value: "#EDF0F4", label: "Cinza-azulado" },
  { value: "#FFFFFF", label: "Branco" },
  { value: "#FAF1C7", label: "Amarelo" },
  { value: "#F6EEDF", label: "Marfim" },
  { value: "#E9DCC3", label: "Kraft" },
  { value: "#E4F1E8", label: "Menta" },
  { value: "#E3ECFA", label: "Azul-claro" },
  { value: "#F4E4EE", label: "Rosa" },
  { value: "#ECE6F8", label: "Lavanda" },
  { value: "#2B2F3A", label: "Grafite" },
  { value: "#14213D", label: "Azul-marinho" },
  { value: "#1F3B2D", label: "Lousa verde" },
  { value: "#121212", label: "Preto" },
];

/** Camada da página (como no Photoshop/Procreate): ordem = ordem do array (último = por cima). */
export interface Layer {
  id: ID;
  name: string;
  visible: boolean;
  /** Travada: aparece, mas não seleciona nem apaga. */
  locked: boolean;
  opacity: number;
  /** Mistura com o que está embaixo (como no Photoshop). Ausente = normal. */
  blend?: LayerBlend;
}

export type LayerBlend = "normal" | "multiply" | "screen" | "add";
export const LAYER_BLENDS: { id: LayerBlend; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "multiply", label: "Multiplicar" },
  { id: "screen", label: "Tela" },
  { id: "add", label: "Clarear (somar)" },
];

export const makeLayer = (name = "Camada 1", id: ID = newId()): Layer => ({ id, name, visible: true, locked: false, opacity: 1 });

/** Grupo (0.9): só estrutura — os elementos apontam para ele por `groupId`; grupos aninham por `parentId`. */
export interface Group {
  id: ID;
  name: string;
  parentId: ID | null;
  locked?: boolean;
  hidden?: boolean;
}

export interface Page {
  id: ID;
  name: string;
  paper: PaperKind;
  background: string;
  /** Espaçamento do padrão do papel (1 = padrão; 0.5..2). Ausente = 1. */
  paperScale?: number;
  /** Cor das linhas do papel; ausente/null = automática (escura no papel claro, clara no escuro). */
  lineColor?: string | null;
  /** Folha de tamanho fixo (caderno com páginas). Ausente = quadro infinito. */
  size?: PageSize;
  /** Camadas (de baixo para cima). Sempre ≥ 1 depois de normalizeDoc/createPage. */
  layers: Layer[];
  /** Ordem de empilhamento (último = por cima). Entre camadas, vale a ordem das camadas. */
  elements: HirakuElement[];
  /** Grupos (hierarquia livre). Ausente = nenhum. */
  groups?: Group[];
  /** Marcador colorido (fita na lateral da página; aparece no índice). Ausente = sem marcador. */
  bookmark?: string;
  /** Página favorita. */
  starred?: boolean;
}

export interface HirakuDoc {
  version: 1;
  pages: Page[];
}

export const newId = (): ID => crypto.randomUUID();

export function createPage(name = "Página 1"): Page {
  return { id: newId(), name, paper: "blank", background: DEFAULT_BACKGROUND, layers: [makeLayer()], elements: [] };
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
    bold: e.bold === true || undefined,
    italic: e.italic === true || undefined,
    underline: e.underline === true || undefined,
    strike: e.strike === true || undefined,
    lineHeight: Number.isFinite(e.lineHeight) ? Math.max(0.8, Math.min(3, e.lineHeight)) : undefined,
    letterSpacing: Number.isFinite(e.letterSpacing) && e.letterSpacing !== 0 ? Math.max(-0.2, Math.min(1, e.letterSpacing)) : undefined,
    bg: typeof e.bg === "string" && /^#[0-9a-fA-F]{6}$/.test(e.bg) ? e.bg : undefined,
  };
};

const KNOWN_TYPES = ["stroke", "rect", "ellipse", "diamond", "line", "arrow", "text", "node", "frame", "attachment"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validElement = (e: any): boolean =>
  !!e &&
  KNOWN_TYPES.includes(e.type) &&
  (!(e.type === "line" || e.type === "arrow") || (Array.isArray(e.points) && e.points.length >= 2)) &&
  (e.type !== "text" || typeof e.text === "string") &&
  (e.type !== "node" || (typeof e.text === "string" && Number.isFinite(e.x) && Number.isFinite(e.y))) &&
  (e.type !== "frame" || (Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.w) && Number.isFinite(e.h))) &&
  (e.type !== "attachment" || (Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.w) && Number.isFinite(e.h) && typeof e.url === "string"));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cleanAttachment = (e: any): AttachmentElement => {
  let kind: AttachmentKind = (ATTACHMENT_KINDS as readonly string[]).includes(e.kind) ? e.kind : "file";
  if (kind === "video" && !parseYouTube(str(e.url, ""))) kind = "link"; // sem link reconhecível, vira cartão de link
  if (kind === "pdf" && typeof e.data !== "string") kind = "file"; // sem o conteúdo embutido, vira arquivo comum
  const figure = kind === "figure" ? cleanFigure(e.figure) : null;
  if (kind === "figure" && !figure) kind = "file";
  const block = kind === "block" ? cleanBlock(e.block) : null;
  if (kind === "block" && !block) kind = "file";
  return {
    ...e,
    frameId: typeof e.frameId === "string" ? e.frameId : null,
    w: Math.max(80, num(e.w, 320)), h: Math.max(60, num(e.h, 220)),
    kind, title: str(e.title, "Anexo").slice(0, 300), url: str(e.url, ""), mime: str(e.mime, "application/octet-stream"),
    opacity: Math.max(0, Math.min(1, num(e.opacity, 1))),
    pages: kind === "pdf" ? Math.max(1, Math.floor(num(e.pages, 1))) : undefined,
    ratio: kind === "pdf" ? Math.min(4, Math.max(0.25, num(e.ratio, 1.414))) : undefined,
    mode: kind === "pdf" ? (e.mode === "scroll" ? "scroll" : "carousel") : undefined,
    figure: figure ?? undefined,
    block: block ?? undefined,
  };
};

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
  note: typeof e.note === "string" && e.note ? e.note.slice(0, 4000) : undefined,
  link: typeof e.link === "string" && /^(https?:|mailto:)/i.test(e.link) ? e.link.slice(0, 1000) : undefined,
  tags: Array.isArray(e.tags) ? e.tags.filter((t: unknown) => typeof t === "string" && t).slice(0, 8).map((t: string) => t.slice(0, 24)) : undefined,
  progress: Number.isFinite(e.progress) ? Math.max(0, Math.min(100, e.progress)) : undefined,
  due: typeof e.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.due) ? e.due : undefined,
  image: typeof e.image === "string" && e.image.startsWith("data:image/") ? e.image : undefined,
  imageRatio: Number.isFinite(e.imageRatio) ? Math.max(0.1, Math.min(4, e.imageRatio)) : undefined,
  vertex: e.vertex === true ? true : undefined,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cleanLayers(raw: any): Layer[] {
  const out: Layer[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const l of raw) {
      if (!l || typeof l.id !== "string" || seen.has(l.id)) continue;
      seen.add(l.id);
      out.push({
        id: l.id,
        name: str(l.name, `Camada ${out.length + 1}`).slice(0, 60),
        visible: l.visible !== false,
        locked: l.locked === true,
        opacity: Math.max(0.05, Math.min(1, num(l.opacity, 1))),
        ...(["multiply", "screen", "add"].includes(l.blend) ? { blend: l.blend } : {}),
      });
    }
  }
  return out.length ? out : [makeLayer()];
}

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
    pages: d.pages.map((p: any, i: number): Page => prune({
      id: typeof p.id === "string" ? p.id : newId(),
      name: typeof p.name === "string" ? p.name : `Página ${i + 1}`,
      paper: kinds.includes(p.paper) ? p.paper : "blank",
      background: hex(p.background, DEFAULT_BACKGROUND),
      paperScale: Number.isFinite(p.paperScale) ? Math.max(0.5, Math.min(2, p.paperScale)) : undefined,
      lineColor: typeof p.lineColor === "string" && /^#[0-9a-fA-F]{6}$/.test(p.lineColor) ? p.lineColor : undefined,
      size: cleanPageSize(p.size),
      layers: cleanLayers(p.layers),
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
                ? { ...e, startBinding: cleanBinding(e.startBinding), endBinding: cleanBinding(e.endBinding), label: typeof e.label === "string" && e.label ? e.label.slice(0, 80) : undefined }
                : e.type === "text"
                  ? cleanText(e)
                  : e.type === "node"
                    ? cleanNode(e)
                    : e.type === "frame"
                      ? cleanFrame(e)
                      : e.type === "attachment"
                        ? cleanAttachment(e)
                        : e,
          ).map(cleanMeta)
        : [],
      groups: cleanGroups(p.groups),
      bookmark: typeof p.bookmark === "string" && /^#[0-9a-fA-F]{6}$/.test(p.bookmark) ? p.bookmark : undefined,
      starred: p.starred === true ? true : undefined,
    })),
  };
}

/** Campos comuns (0.9): grupo, travado, invisível, nome. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cleanMeta = (e: any): HirakuElement => {
  const out = { ...e };
  if (typeof out.groupId !== "string" || !out.groupId) delete out.groupId;
  if (out.locked !== true) delete out.locked;
  if (out.invisible !== true) delete out.invisible;
  if (typeof out.name === "string" && out.name.trim()) out.name = out.name.trim().slice(0, 80);
  else delete out.name;
  return out;
};
