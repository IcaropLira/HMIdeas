import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clearBindingsTo, rebindAfterChange, reidentify } from "./binding";
import { getBrush } from "./brushes";
import { Camera, defaultCamera } from "./camera";
import { ArrowHead, FontFamily, HirakuDoc, HirakuElement, ID, LineStyle, LinearType, Page, ShapeType, TextAlign, createDoc, createPage, newId } from "./model";

export type ToolId = "pen" | "eraser" | "hand" | "select" | "lasso" | "text" | ShapeType | LinearType;

const HISTORY_LIMIT = 200;

interface DocState {
  doc: HirakuDoc;
  activePageId: ID;
  past: HirakuDoc[];
  future: HirakuDoc[];

  addElement: (el: HirakuElement) => void;
  addElements: (els: HirakuElement[]) => void;
  /** Substitui elementos existentes (mesmo id) por novas versões, num único passo de histórico. */
  updateElements: (els: HirakuElement[]) => void;
  removeElements: (ids: ID[]) => void;
  setPaper: (patch: Partial<Pick<Page, "paper" | "background">>) => void;

  // páginas (alterações do documento → entram no desfazer), exceto setActivePage
  setActivePage: (id: ID) => void;
  addPage: () => void;
  duplicatePage: (id: ID) => void;
  deletePage: (id: ID) => void;
  movePage: (id: ID, dir: -1 | 1) => void;
  renamePage: (id: ID, name: string) => void;
  undo: () => void;
  redo: () => void;
  loadDoc: (doc: HirakuDoc) => void;
}

const initial = createDoc();

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

    addElement: (el) => commit(mapActivePage((p) => ({ ...p, elements: [...p.elements, el] }))),

    addElements: (els) => {
      if (els.length) commit(mapActivePage((p) => ({ ...p, elements: [...p.elements, ...els] })));
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
      commit(mapActivePage((p) => ({ ...p, elements: clearBindingsTo(p.elements.filter((e) => !drop.has(e.id)), drop) })));
    },

    setPaper: (patch) => {
      const page = selectActivePage(get());
      if ((patch.paper ?? page.paper) === page.paper && (patch.background ?? page.background) === page.background) return;
      commit(mapActivePage((p) => ({ ...p, ...patch })));
    },

    setActivePage: (id) => {
      if (get().doc.pages.some((p) => p.id === id)) set({ activePageId: id });
    },

    addPage: () => {
      const { doc } = get();
      const cur = selectActivePage(get());
      // A nova página herda o papel da atual (como um caderno com o mesmo modelo).
      const page: Page = { ...createPage(`Página ${doc.pages.length + 1}`), paper: cur.paper, background: cur.background };
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
  /** Laço: "inside" = só o que está totalmente dentro; "touch" = tudo que o laço toca ou envolve. */
  lassoMode: "inside" | "touch";
  /** Se false, toque com o dedo só move a tela (estilo GoodNotes). */
  fingerDraws: boolean;
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
      pressureSens: 0.8,
      smoothing: 0.35,
      taper: 0.5,
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
      lassoMode: "inside",
      fingerDraws: false,
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
        color: s.color,
        width: s.width,
        eraserSize: s.eraserSize,
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
        lassoMode: s.lassoMode,
        fingerDraws: s.fingerDraws,
      }),
    },
  ),
);
