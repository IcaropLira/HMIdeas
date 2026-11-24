// Áreas de trabalho (workspaces): layout dos painéis acopláveis + barras de ferramentas + quais barras da janela
// aparecem (menu, opções, status). Trocar de área de trabalho NUNCA mexe no documento. O estado é salvo em
// localStorage; as áreas prontas podem ser alteradas e restauradas ao padrão.
import { create } from "zustand";
import { DEFAULT_LAYOUT, Layout, makeLayout, normalizeLayout, useLayout } from "./layout";
import { DockLayout, PanelId, clampFloats, dockOf, normalizeDock, openPanel, removePanel, togglePanel } from "./docking";

export interface Chrome {
  /** Barra de menus (Arquivo, Editar…). */
  menubar: boolean;
  /** Barra de opções da ferramenta/seleção (embaixo do menu). */
  optionsbar: boolean;
  /** Barra de status (zoom, coordenadas, página, estado do documento). */
  statusbar: boolean;
  /** Pílulas flutuantes do topo (caderno/páginas e zoom/salvar) — o visual clássico. */
  pills: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  /** Área pronta de onde veio (para "Restaurar"). */
  preset?: PresetId;
  dock: DockLayout;
  toolbar: Layout;
  chrome: Chrome;
}

export type PresetId = "geral" | "desenho" | "mapas" | "escrita" | "estudos" | "organizacao" | "minimalista";

const FULL: Chrome = { menubar: true, optionsbar: true, statusbar: true, pills: false };

export const PRESETS: { id: PresetId; name: string; hint: string; make: () => Omit<Workspace, "id" | "name" | "preset"> }[] = [
  {
    id: "geral", name: "Geral", hint: "Menus, opções da ferramenta, propriedades e objetos à direita",
    make: () => ({
      chrome: FULL,
      toolbar: makeLayout({ left: [["select", "pen", "text", "eraser", "laser", "hand"], ["shape", "line", "options", "quick"], ["blocks", "insert", "templates"]], bottom: [["mindmap", "frame", "vertex", "edge"], ["colors", "size"]] }),
      dock: dockOf({ right: { size: 300, stacks: [{ panels: ["props", "transform", "align"], size: 1.1 }, { panels: ["objects", "layers", "history"], size: 1 }] } }),
    }),
  },
  {
    id: "desenho", name: "Desenho", hint: "Caneta, pincéis, cores e camadas à mão",
    make: () => ({
      chrome: FULL,
      toolbar: makeLayout({ left: [["select", "pen", "eraser", "hand"], ["shape", "line", "text"], ["options"]], bottom: [["size"]] }),
      dock: dockOf({ right: { size: 300, stacks: [{ panels: ["colors"], size: 1.1 }, { panels: ["brushes", "props"], size: 1.2 }, { panels: ["layers", "navigator"], size: 0.9 }] } }),
    }),
  },
  {
    id: "mapas", name: "Mapas mentais", hint: "Mapa & quadros, objetos e conexões",
    make: () => ({
      chrome: FULL,
      toolbar: makeLayout({ left: [["select", "mindmap", "frame", "text"], ["shape", "line", "pen"], ["blocks", "insert", "templates"]], bottom: [["colors"]] }),
      dock: dockOf({ right: { size: 320, stacks: [{ panels: ["map", "props"], size: 1.3 }, { panels: ["objects", "navigator"], size: 1 }] } }),
    }),
  },
  {
    id: "escrita", name: "Escrita", hint: "Texto em destaque, pouca coisa na tela",
    make: () => ({
      chrome: { menubar: true, optionsbar: true, statusbar: true, pills: false },
      toolbar: makeLayout({ bottom: [["select", "text", "pen", "eraser", "tape", "hand"], ["pens"], ["blocks", "insert"]] }),
      dock: dockOf({ right: { size: 300, iconic: false, stacks: [{ panels: ["text", "props"], size: 1 }, { panels: ["library"], size: 1 }] } }),
    }),
  },
  {
    id: "estudos", name: "Estudos", hint: "Biblioteca de blocos, grafos, matemática e modelos",
    make: () => ({
      chrome: FULL,
      toolbar: makeLayout({ left: [["select", "pen", "text", "eraser", "tape", "laser", "hand"], ["shape", "line", "options", "quick"]], bottom: [["vertex", "edge", "science", "mindmap"], ["blocks", "insert", "templates"], ["colors", "size"]] }),
      dock: dockOf({ right: { size: 330, stacks: [{ panels: ["study", "library", "materials"], size: 1.3 }, { panels: ["science", "props"], size: 1 }] } }),
    }),
  },
  {
    id: "organizacao", name: "Organização", hint: "Objetos e camadas à esquerda; alinhar e transformar à direita",
    make: () => ({
      chrome: FULL,
      toolbar: makeLayout({ bottom: [["select", "pen", "text", "eraser", "hand"], ["shape", "line", "options", "quick"], ["blocks", "insert"]] }),
      dock: dockOf({
        left: { size: 280, stacks: [{ panels: ["objects", "layers"], size: 1 }] },
        right: { size: 290, stacks: [{ panels: ["organize", "align"], size: 1.2 }, { panels: ["transform", "props"], size: 1 }] },
      }),
    }),
  },
  {
    id: "minimalista", name: "Minimalista", hint: "Só o quadro e as barras flutuantes (o visual clássico)",
    make: () => ({
      chrome: { menubar: false, optionsbar: false, statusbar: false, pills: true },
      toolbar: normalizeLayout(DEFAULT_LAYOUT),
      dock: dockOf({}),
    }),
  },
];

export const presetWorkspace = (id: PresetId): Workspace => {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
  return { id: p.id, name: p.name, preset: p.id, ...p.make() };
};

const cleanChrome = (raw: unknown, d: Chrome): Chrome => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const b = (k: keyof Chrome) => (typeof r[k] === "boolean" ? (r[k] as boolean) : d[k]);
  return { menubar: b("menubar"), optionsbar: b("optionsbar"), statusbar: b("statusbar"), pills: b("pills") };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeWorkspace(raw: any, fallbackId: string): Workspace | null {
  if (!raw || typeof raw !== "object") return null;
  const preset = PRESETS.some((p) => p.id === raw.preset) ? (raw.preset as PresetId) : undefined;
  const base = preset ? presetWorkspace(preset) : presetWorkspace("geral");
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 60) : fallbackId,
    name: (typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : base.name).slice(0, 40),
    ...(preset ? { preset } : {}),
    dock: raw.dock ? normalizeDock(raw.dock) : base.dock,
    toolbar: raw.toolbar ? normalizeLayout(raw.toolbar) : base.toolbar,
    chrome: cleanChrome(raw.chrome, base.chrome),
  };
}

/** Lista válida: as áreas prontas sempre existem (na ordem), as do usuário vêm depois. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeList(raw: any): Workspace[] {
  const list: Workspace[] = [];
  const seen = new Set<string>();
  for (const w of Array.isArray(raw) ? raw : []) {
    const n = normalizeWorkspace(w, `ws-${list.length}`);
    if (n && !seen.has(n.id)) { seen.add(n.id); list.push(n); }
  }
  const out = PRESETS.map((p) => list.find((w) => w.id === p.id) ?? presetWorkspace(p.id));
  return [...out, ...list.filter((w) => !PRESETS.some((p) => p.id === w.id))];
}

export const WORKSPACE_KEY = "hm-ideas:workspaces-v1";

interface Saved { active: string; list: Workspace[] }

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? "null");
    const list = normalizeList(raw?.list);
    const active = list.some((w) => w.id === raw?.active) ? raw.active : defaultActive();
    return { active, list };
  } catch {
    return { active: defaultActive(), list: normalizeList([]) };
  }
}

/** Primeira vez: tela larga começa na área "Geral"; celular/tablet em pé, na "Minimalista" (painéis ocupariam o desenho). */
const defaultActive = (): PresetId => (typeof window !== "undefined" && window.innerWidth < 1000 ? "minimalista" : "geral");

interface WorkspaceState {
  list: Workspace[];
  activeId: string;
  dock: DockLayout;
  chrome: Chrome;
  setDock: (L: DockLayout, persist?: boolean) => void;
  updateDock: (fn: (L: DockLayout) => DockLayout) => void;
  setChrome: (patch: Partial<Chrome>) => void;
  switchTo: (id: string) => void;
  /** Nova área a partir da atual. */
  create: (name: string) => string;
  duplicate: (id: string) => string;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  restore: (id: string) => void;
  importJson: (text: string) => string | null;
  exportJson: (id: string) => string;
}

const store = () => (typeof localStorage !== "undefined" ? localStorage : null);

export const useWorkspace = create<WorkspaceState>((set, get) => {
  const initial = typeof localStorage !== "undefined" ? load() : { active: "geral", list: normalizeList([]) };
  const cur = initial.list.find((w) => w.id === initial.active)!;

  const save = () => {
    const { list, activeId } = get();
    try { store()?.setItem(WORKSPACE_KEY, JSON.stringify({ active: activeId, list })); } catch { /* sem armazenamento */ }
  };
  /** Grava o estado vivo dentro da área ativa. */
  const sync = (patch: Partial<Workspace>) => {
    const { list, activeId } = get();
    set({ list: list.map((w) => (w.id === activeId ? { ...w, ...patch } : w)) });
    save();
  };
  const apply = (w: Workspace) => {
    set({ activeId: w.id, dock: w.dock, chrome: w.chrome });
    useLayout.getState().setLayout(w.toolbar);
    save();
  };
  const freshId = () => `ws-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  return {
    list: initial.list,
    activeId: initial.active,
    dock: cur.dock,
    chrome: cur.chrome,
    setDock: (dock, persist = true) => { set({ dock }); if (persist) sync({ dock }); },
    updateDock: (fn) => { const dock = fn(get().dock); if (dock !== get().dock) { set({ dock }); sync({ dock }); } },
    setChrome: (patch) => { const chrome = { ...get().chrome, ...patch }; set({ chrome }); sync({ chrome }); },
    switchTo: (id) => {
      const w = get().list.find((x) => x.id === id);
      if (w) apply(w);
    },
    create: (name) => {
      const { dock, chrome } = get();
      const w: Workspace = { id: freshId(), name: name.trim().slice(0, 40) || "Minha área", dock, chrome, toolbar: useLayout.getState().layout };
      set({ list: [...get().list, w] });
      apply(w);
      return w.id;
    },
    duplicate: (id) => {
      const src = get().list.find((x) => x.id === id);
      if (!src) return id;
      const w: Workspace = { ...src, id: freshId(), name: `${src.name} (cópia)`.slice(0, 40), preset: undefined };
      delete w.preset;
      set({ list: [...get().list, w] });
      save();
      return w.id;
    },
    rename: (id, name) => {
      const n = name.trim().slice(0, 40);
      if (!n) return;
      set({ list: get().list.map((w) => (w.id === id ? { ...w, name: n } : w)) });
      save();
    },
    remove: (id) => {
      if (PRESETS.some((p) => p.id === id)) return; // as prontas só se restauram
      const list = get().list.filter((w) => w.id !== id);
      set({ list });
      if (get().activeId === id) apply(list[0]);
      else save();
    },
    restore: (id) => {
      const w = get().list.find((x) => x.id === id);
      if (!w) return;
      const fresh: Workspace = w.preset ? { ...presetWorkspace(w.preset), id: w.id, name: w.preset === w.id ? presetWorkspace(w.preset).name : w.name } : w;
      set({ list: get().list.map((x) => (x.id === id ? fresh : x)) });
      if (get().activeId === id) apply(fresh);
      else save();
    },
    importJson: (text) => {
      try {
        const raw = JSON.parse(text);
        const w = normalizeWorkspace(raw?.workspace ?? raw, freshId());
        if (!w) return null;
        const id = freshId();
        const n: Workspace = { ...w, id, preset: undefined };
        delete n.preset;
        set({ list: [...get().list, n] });
        apply(n);
        return id;
      } catch {
        return null;
      }
    },
    exportJson: (id) => {
      const w = get().list.find((x) => x.id === id) ?? get().list[0];
      return JSON.stringify({ app: "hm-ideas", kind: "workspace", version: 1, workspace: w }, null, 2);
    },
  };
});

/** Liga a barra de ferramentas (useLayout) à área ativa e recupera janelas fora da tela. */
export function initWorkspaces(): () => void {
  const st = useWorkspace.getState();
  const w = st.list.find((x) => x.id === st.activeId);
  if (w) useLayout.getState().setLayout(w.toolbar);
  const unsub = useLayout.subscribe((s, prev) => {
    if (s.layout === prev.layout) return;
    const { list, activeId } = useWorkspace.getState();
    useWorkspace.setState({ list: list.map((x) => (x.id === activeId ? { ...x, toolbar: s.layout } : x)) });
    try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ active: activeId, list: useWorkspace.getState().list })); } catch { /* */ }
  });
  const fix = () => useWorkspace.getState().updateDock((L) => clampFloats(L, window.innerWidth, window.innerHeight));
  fix();
  window.addEventListener("resize", fix);
  return () => { unsub(); window.removeEventListener("resize", fix); };
}

// atalhos usados pelos comandos e menus
export const togglePanelCmd = (id: PanelId) => useWorkspace.getState().updateDock((L) => togglePanel(L, id));
export const showPanel = (id: PanelId) => useWorkspace.getState().updateDock((L) => openPanel(L, id));
export const hidePanel = (id: PanelId) => useWorkspace.getState().updateDock((L) => removePanel(L, id));
