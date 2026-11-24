import type { ElCategory } from "./handwriting";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clearBindingsTo, rebindAfterChange, reidentify } from "./binding";
import { relayout } from "./mindmap";
import { getBrush } from "./brushes";
import { Camera, defaultCamera } from "./camera";
import { activeLayerId } from "./layers";
import type { TextFx } from "./text";
import { reorderPages, rotatePage as rotatePageFn } from "./notebook";
import { ArrowHead, FontFamily, HirakuDoc, HirakuElement, ID, LineStyle, LinearType, Page, ShapeType, TextAlign, createDoc, createPage, newId } from "./model";

export type ToolId = "pen" | "eraser" | "hand" | "select" | "lasso" | "text" | "mindmap" | "frame" | "laser" | "laserpen" | "vertex" | "edge" | "tape" | ShapeType | LinearType;

const HISTORY_LIMIT = 200;

interface DocState {
  doc: HirakuDoc;
  activePageId: ID;
  past: HirakuDoc[];
  future: HirakuDoc[];

  addElement: (el: HirakuElement) => void;
  /** Edita a página ativa inteira (camadas, ordem…) num passo de histórico. */
  editPage: (fn: (p: Page) => Page) => void;
  addElements: (els: HirakuElement[]) => void;
  /** Substitui elementos existentes (mesmo id) por novas versões, num único passo de histórico. */
  updateElements: (els: HirakuElement[]) => void;
  removeElements: (ids: ID[]) => void;
  /** Troca a lista de elementos da página ativa por `els` num único passo de histórico (operações de mapa/quadro). */
  replaceElements: (els: HirakuElement[]) => void;
  /**
   * Edição transitória da página ativa (borracha de pixel): troca a lista de elementos SEM entrar no histórico.
   * O gesto termina com `endPreview(base)` (um único passo de desfazer) ou `cancelPreview(base)`.
   */
  previewElements: (els: HirakuElement[]) => void;
  endPreview: (base: HirakuDoc) => void;
  cancelPreview: (base: HirakuDoc) => void;
  setPaper: (patch: Partial<Pick<Page, "paper" | "background" | "paperScale" | "lineColor" | "size">>) => void;
  /** Muda o papel SEM histórico (arrastar no seletor de cor); `endPreview(base)` grava como um passo só. */
  /** Aplica o papel a TODAS as páginas (um passo de desfazer). */
  setPaperAll: (patch: Partial<Pick<Page, "paper" | "background" | "paperScale" | "lineColor" | "size">>) => void;
  previewPaper: (patch: Partial<Pick<Page, "paper" | "background" | "paperScale" | "lineColor">>) => void;

  // páginas (alterações do documento → entram no desfazer), exceto setActivePage
  setActivePage: (id: ID) => void;
  addPage: () => void;
  duplicatePage: (id: ID) => void;
  deletePage: (id: ID) => void;
  movePage: (id: ID, dir: -1 | 1) => void;
  renamePage: (id: ID, name: string) => void;
  /** Leva a página para a posição `to` (arrastar na barra lateral). */
  reorderPage: (id: ID, to: number) => void;
  /** Gira a folha (retrato ↔ paisagem). */
  rotatePage: (id: ID) => void;
  /** Marcador colorido e favorita. */
  setPageMeta: (id: ID, patch: Partial<Pick<Page, "bookmark" | "starred">>) => void;
  /** Insere uma página pronta (modelo) depois da atual e vai para ela. */
  insertPage: (page: Page) => void;
  /** Mudança no caderno inteiro (várias páginas) num passo de desfazer. Devolver o mesmo doc = nada muda. */
  editDoc: (fn: (d: HirakuDoc) => HirakuDoc) => void;
  undo: () => void;
  redo: () => void;
  loadDoc: (doc: HirakuDoc) => void;
}

const initial = createDoc();

/** Elemento novo entra na camada ativa (ou mantém a sua, se ela existir nesta página). */
const stamp = (p: Page, el: HirakuElement): HirakuElement =>
  el.layerId && p.layers.some((l) => l.id === el.layerId) ? el : ({ ...el, layerId: activeLayerId(p) } as HirakuElement);

/** Documento + histórico. Só mudanças do documento entram no undo/redo. */
export const useDoc = create<DocState>((set, get) => {
  const commit = (next: HirakuDoc, activePageId?: ID) => {
    const { doc, past } = get();
    set({ doc: next, past: [...past, doc].slice(-HISTORY_LIMIT), future: [], ...(activePageId ? { activePageId } : {}) });
  };

  /** Depois de desfazer/refazer a página ativa pode ter deixado de existir: usa a vizinha. */
  const validActive = (next: HirakuDoc, prev: HirakuDoc, id: ID): ID => {
    if (next.pages.some((p) => p.id === id)) return id;
    const i = Math.max(0, prev.pages.findIndex((p) => p.id === id));
    return next.pages[Math.min(i, next.pages.length - 1)].id;
  };

  const mapActivePage = (fn: (p: Page) => Page): HirakuDoc => {
    const { doc, activePageId } = get();
    return { ...doc, pages: doc.pages.map((p) => (p.id === activePageId ? fn(p) : p)) };
  };

  return {
    doc: initial,
    activePageId: initial.pages[0].id,
    past: [],
    future: [],

    addElement: (el) => commit(mapActivePage((p) => ({ ...p, elements: [...p.elements, stamp(p, el)] }))),

    addElements: (els) => {
      if (els.length) commit(mapActivePage((p) => ({ ...p, elements: [...p.elements, ...els.map((e) => stamp(p, e))] })));
    },

    editPage: (fn) => {
      const page = selectActivePage(get());
      const next = fn(page);
      if (next !== page) commit(mapActivePage(() => next));
    },

    updateElements: (els) => {
      if (!els.length) return;
      const byId = new Map(els.map((e) => [e.id, e]));
      // Setas ligadas às formas alteradas são recalculadas no MESMO passo de histórico.
      commit(mapActivePage((p) => ({
        ...p,
        elements: rebindAfterChange(p.elements.map((e) => byId.get(e.id) ?? e), new Set(byId.keys())),
      })));
    },

    removeElements: (ids) => {
      if (!ids.length) return;
      const drop = new Set(ids);
      commit(mapActivePage((p) => {
        let els = clearBindingsTo(p.elements.filter((e) => !drop.has(e.id)), drop);
        // quadros apagados soltam os membros; nós apagados deixam filhos como raízes
        if (els.some((e) => (e.frameId && drop.has(e.frameId)) || (e.type === "node" && e.parentId && drop.has(e.parentId)))) {
          els = els.map((e) => {
            let n = e;
            if (e.frameId && drop.has(e.frameId)) n = { ...n, frameId: null } as HirakuElement;
            if (e.type === "node" && e.parentId && drop.has(e.parentId)) n = { ...(n as typeof e), parentId: null };
            return n;
          });
        }
        return { ...p, elements: p.elements.some((e) => e.type === "node" && drop.has(e.id)) ? relayout(els) : els };
      }));
    },

    replaceElements: (els) => commit(mapActivePage((p) => {
      // elementos novos (nós de mapa, quadros…) entram na camada ativa
      const had = new Set(p.elements.map((e) => e.id));
      const stamped = els.map((e) => (had.has(e.id) ? e : stamp(p, e)));
      return { ...p, elements: rebindAfterChange(stamped, new Set(stamped.map((e) => e.id))) };
    })),

    previewElements: (els) => set({ doc: mapActivePage((p) => ({ ...p, elements: els })) }),

    endPreview: (base) => {
      const { doc, past } = get();
      if (doc !== base) set({ past: [...past, base].slice(-HISTORY_LIMIT), future: [] });
    },

    cancelPreview: (base) => set({ doc: base }),

    setPaper: (patch) => {
      const page = selectActivePage(get());
      const keys = Object.keys(patch) as (keyof typeof patch)[];
      if (keys.every((k) => patch[k] === page[k])) return;
      commit(mapActivePage((p) => ({ ...p, ...patch })));
    },

    setPaperAll: (patch) => {
      const { doc } = get();
      commit({ ...doc, pages: doc.pages.map((p) => ({ ...p, ...patch })) });
    },

    previewPaper: (patch) => set({ doc: mapActivePage((p) => ({ ...p, ...patch })) }),

    setActivePage: (id) => {
      if (get().doc.pages.some((p) => p.id === id)) set({ activePageId: id });
    },

    addPage: () => {
      const { doc } = get();
      const cur = selectActivePage(get());
      // A nova página herda o papel da atual (como um caderno com o mesmo modelo).
      const page: Page = { ...createPage(`Página ${doc.pages.length + 1}`), paper: cur.paper, background: cur.background, ...(cur.size ? { size: cur.size } : {}), ...(cur.paperScale ? { paperScale: cur.paperScale } : {}), ...(cur.lineColor ? { lineColor: cur.lineColor } : {}) };
      const pages = [...doc.pages];
      pages.splice(doc.pages.findIndex((p) => p.id === cur.id) + 1, 0, page);
      commit({ ...doc, pages }, page.id);
    },

    duplicatePage: (id) => {
      const { doc } = get();
      const i = doc.pages.findIndex((p) => p.id === id);
      if (i < 0) return;
      const src = doc.pages[i];
      const copy: Page = { ...src, id: newId(), name: `${src.name} (cópia)`, elements: reidentify(src.elements) };
      const pages = [...doc.pages];
      pages.splice(i + 1, 0, copy);
      commit({ ...doc, pages }, copy.id);
    },

    deletePage: (id) => {
      const { doc, activePageId } = get();
      if (doc.pages.length <= 1) return;
      const i = doc.pages.findIndex((p) => p.id === id);
      if (i < 0) return;
      const pages = doc.pages.filter((p) => p.id !== id);
      commit({ ...doc, pages }, id === activePageId ? pages[Math.min(i, pages.length - 1)].id : undefined);
    },

    movePage: (id, dir) => {
      const { doc } = get();
      const i = doc.pages.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= doc.pages.length) return;
      const pages = [...doc.pages];
      [pages[i], pages[j]] = [pages[j], pages[i]];
      commit({ ...doc, pages });
    },

    reorderPage: (id, to) => {
      const { doc } = get();
      const pages = reorderPages(doc.pages, id, to);
      if (pages !== doc.pages) commit({ ...doc, pages });
    },

    rotatePage: (id) => {
      const { doc } = get();
      const p = doc.pages.find((x) => x.id === id);
      if (!p?.size) return;
      commit({ ...doc, pages: doc.pages.map((x) => (x.id === id ? rotatePageFn(x) : x)) });
    },

    setPageMeta: (id, patch) => {
      const { doc } = get();
      commit({ ...doc, pages: doc.pages.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...patch };
        if (!next.bookmark) delete next.bookmark;
        if (!next.starred) delete next.starred;
        return next;
      }) });
    },

    editDoc: (fn) => {
      const { doc } = get();
      const next = fn(doc);
      if (next !== doc) commit(next);
    },

    insertPage: (page) => {
      const { doc, activePageId } = get();
      const pages = [...doc.pages];
      pages.splice(doc.pages.findIndex((p) => p.id === activePageId) + 1, 0, page);
      commit({ ...doc, pages }, page.id);
    },

    renamePage: (id, name) => {
      const clean = name.trim().slice(0, 60);
      const { doc } = get();
      if (!clean || doc.pages.find((p) => p.id === id)?.name === clean) return;
      commit({ ...doc, pages: doc.pages.map((p) => (p.id === id ? { ...p, name: clean } : p)) });
    },

    undo: () => {
      const { past, doc, future, activePageId } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], activePageId: validActive(prev, doc, activePageId) });
    },

    redo: () => {
      const { past, doc, future, activePageId } = get();
      if (!future.length) return;
      const next = future[0];
      set({ doc: next, past: [...past, doc], future: future.slice(1), activePageId: validActive(next, doc, activePageId) });
    },

    loadDoc: (doc) => set({ doc, activePageId: doc.pages[0].id, past: [], future: [] }),
  };
});

export const selectActivePage = (s: Pick<DocState, "doc" | "activePageId">): Page =>
  s.doc.pages.find((p) => p.id === s.activePageId) ?? s.doc.pages[0];

interface SelState {
  ids: ID[];
  set: (ids: ID[]) => void;
  clear: () => void;
}

/** Seleção: fora do histórico. Ids de elementos removidos são podados pelo CanvasView. */
export const useSel = create<SelState>((set) => ({
  ids: [],
  set: (ids) => set({ ids: [...new Set(ids)] }),
  clear: () => set((s) => (s.ids.length ? { ids: [] } : s)),
}));

interface ViewState {
  camera: Camera;
  setCamera: (c: Camera) => void;
}

/** Câmera: fora do histórico (não é desfazível). */
export const useView = create<ViewState>((set) => ({
  camera: defaultCamera(),
  setCamera: (camera) => set({ camera }),
}));

interface ToolState {
  tool: ToolId;
  color: string;
  /** Largura da caneta / contorno das formas, em unidades do mundo. */
  width: number;
  /** Diâmetro da borracha em pixels de tela. */
  eraserSize: number;
  /** "stroke": apaga o traço inteiro (Excalidraw). "pixel": corta só o trecho tocado (Photoshop). */
  eraserMode: "stroke" | "pixel";
  /** Com caneta, a pressão aumenta/diminui o tamanho da borracha. */
  eraserPressure: boolean;
  /** 0..1: quanto a pressão afeta a espessura. */
  pressureSens: number;
  /** 0..0.9: quanto o traço "segue atrasado" para ficar mais liso. */
  smoothing: number;
  /** 0..1: afilamento das pontas do traço. */
  taper: number;
  /** Brush ativo da caneta (id de core/brushes.ts). */
  brush: string;
  /** 0.05..1: opacidade do traço (multiplica a opacidade própria do brush). */
  opacity: number;
  /** Últimas cores usadas (mais recente primeiro). */
  recent: string[];
  /** Última cor usada em cada brush: ao voltar para ele, a cor volta junto. */
  brushColors: Record<string, string>;
  /** Conta-gotas ativo: o próximo toque no canvas escolhe a cor do que estiver embaixo. Não persiste. */
  picking: boolean;
  /** Formas: estilo do contorno, preenchimento (null = nenhum) e cantos. */
  lineStyle: LineStyle;
  fill: string | null;
  rounded: boolean;
  /** Setas: pontas inicial/final; linhas e setas: reta ou curva. */
  startHead: ArrowHead;
  endHead: ArrowHead;
  curved: boolean;
  /** Texto: fonte, tamanho (mundo) e alinhamento. */
  fontFamily: FontFamily;
  fontSize: number;
  textAlign: TextAlign;
  /** Texto: negrito, itálico, sublinhado, tachado, entrelinha, espaçamento e fundo dos textos novos. */
  textFx: TextFx;
  /** Laço: "inside" = só o que está totalmente dentro; "touch" = tudo que o laço toca ou envolve. */
  lassoMode: "inside" | "touch";
  /** Se false, toque com o dedo só move a tela (estilo GoodNotes). */
  fingerDraws: boolean;
  /** Caneta transforma traços em formas perfeitas (linha, retângulo, elipse, losango, triângulo, polígono). */
  recognize: boolean;
  /** Laser: cor, quanto o ponteiro deixa de rastro (ms; 0 = só a bolinha) e em quanto tempo a caneta laser some (ms). */
  laserColor: string;
  laserTrail: number;
  laserHold: number;
  /** Seleção por caixa: "auto" = da esquerda p/ direita pega só o que está dentro; da direita p/ esquerda, o que a caixa toca. */
  boxMode: "auto" | "inside" | "touch";
  /** Encaixe ao mover: na grade, em outros objetos (guias inteligentes) e tamanho da grade (mundo). */
  snapGrid: boolean;
  smartGuides: boolean;
  gridSize: number;
  /** Mostrar a grade de encaixe na tela (só quando o encaixe na grade está ligado). */
  showGrid: boolean;
  /** Laço e caixa só pegam estas categorias (vazio = tudo). */
  selectFilter: ElCategory[];
  /** Borracha só apaga estas categorias (vazio = tudo). */
  eraserFilter: ElCategory[];
  /** Segurar parado no fim do traço vira forma perfeita (mesmo com "Reconhecer formas" desligado). */
  holdShape: boolean;
  /** Rabiscar em vai-e-vem por cima de algo apaga. */
  scribbleErase: boolean;
  /** Fita: cor e padrão das novas. */
  tapeColor: string;
  tapePattern: "stripes" | "solid" | "dots";
  setTool: (t: ToolId) => void;
  /** Troca o brush (e a cor, se o brush tiver cor própria ou já tiver sido usado com outra). */
  setBrush: (id: string) => void;
  set: (patch: Partial<Omit<ToolState, "setTool" | "set" | "setBrush">>) => void;
}

/** Preferências de ferramenta: persistidas localmente (não fazem parte do documento). */
export const useTool = create<ToolState>()(
  persist(
    (set, get) => ({
      tool: "pen",
      color: "#1B2233",
      width: 3,
      eraserSize: 28,
      eraserMode: "stroke",
      eraserPressure: true,
      pressureSens: 0.8,
      smoothing: 0.35,
      taper: 0,
      brush: "pen",
      opacity: 1,
      recent: [],
      brushColors: {},
      picking: false,
      lineStyle: "solid",
      fill: null,
      rounded: true,
      startHead: "none",
      endHead: "arrow",
      curved: false,
      fontFamily: "sans",
      fontSize: 20,
      textAlign: "left",
      textFx: {},
      lassoMode: "inside",
      fingerDraws: false,
      recognize: false,
      laserColor: "#FF3B30",
      laserTrail: 450,
      laserHold: 1500,
      boxMode: "auto",
      snapGrid: false,
      smartGuides: true,
      gridSize: 20,
      showGrid: true,
      selectFilter: [],
      eraserFilter: [],
      holdShape: true,
      scribbleErase: true,
      tapeColor: "#F2B33D",
      tapePattern: "stripes",
      setTool: (tool) => set({ tool, picking: false }),
      setBrush: (id) => {
        const s = get();
        const next = getBrush(id);
        // Guarda a cor do brush que está saindo e carrega a do que entra.
        const brushColors = { ...s.brushColors, [s.brush]: s.color };
        set({ brush: next.id, brushColors, color: brushColors[next.id] ?? next.defaultColor ?? s.color });
      },
      set: (patch) => set(patch),
    }),
    {
      name: "hmideas-tool",
      partialize: (s) => ({
        laserColor: s.laserColor,
        laserTrail: s.laserTrail,
        laserHold: s.laserHold,
        boxMode: s.boxMode,
        snapGrid: s.snapGrid,
        smartGuides: s.smartGuides,
        gridSize: s.gridSize,
        showGrid: s.showGrid,
        color: s.color,
        width: s.width,
        eraserSize: s.eraserSize,
        eraserMode: s.eraserMode,
        eraserPressure: s.eraserPressure,
        pressureSens: s.pressureSens,
        smoothing: s.smoothing,
        taper: s.taper,
        brush: s.brush,
        opacity: s.opacity,
        recent: s.recent,
        brushColors: s.brushColors,
        lineStyle: s.lineStyle,
        fill: s.fill,
        rounded: s.rounded,
        startHead: s.startHead,
        endHead: s.endHead,
        curved: s.curved,
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        textAlign: s.textAlign,
        textFx: s.textFx,
        lassoMode: s.lassoMode,
        fingerDraws: s.fingerDraws,
        recognize: s.recognize,
        selectFilter: s.selectFilter,
        eraserFilter: s.eraserFilter,
        holdShape: s.holdShape,
        scribbleErase: s.scribbleErase,
        tapeColor: s.tapeColor,
        tapePattern: s.tapePattern,
      }),
    },
  ),
);
