// Kit de ferramentas (0.10): presets, favoritas, recentes, histórico de ajustes, macros e ferramentas temporárias.
// Tudo aqui é preferência local (localStorage), nunca o documento. Favoritas/recentes/passos de macro são IDS DE
// COMANDO (components/commands.ts): "tool.pen", "brush.marker", "preset.<id>", "align.left"… — o mesmo registro
// que o teclado, os menus e a paleta usam.
import { create } from "zustand";
import { ToolId, useTool } from "./store";
import { getBrush } from "./brushes";

type ToolSettings = Partial<Omit<ReturnType<typeof useTool.getState>, "setTool" | "setBrush" | "set" | "recent" | "brushColors" | "picking">>;

/** Ajustes que cada família de ferramenta guarda num preset / no histórico de ajustes. */
const KEYS: Record<string, (keyof ToolSettings)[]> = {
  pen: ["brush", "color", "width", "opacity", "smoothing", "pressureSens", "taper", "recognize"],
  eraser: ["eraserMode", "eraserSize", "eraserPressure"],
  shape: ["color", "width", "lineStyle", "fill", "rounded"],
  line: ["color", "width", "lineStyle", "startHead", "endHead", "curved"],
  text: ["fontFamily", "fontSize", "textAlign", "textFx", "color"],
  laser: ["laserColor", "laserTrail", "laserHold"],
  select: ["boxMode", "lassoMode", "smartGuides", "snapGrid", "gridSize"],
};

export function familyOf(tool: ToolId): keyof typeof KEYS | null {
  if (tool === "pen") return "pen";
  if (tool === "eraser") return "eraser";
  if (tool === "rect" || tool === "ellipse" || tool === "diamond") return "shape";
  if (tool === "arrow" || tool === "line") return "line";
  if (tool === "text") return "text";
  if (tool === "laser" || tool === "laserpen") return "laser";
  if (tool === "select" || tool === "lasso") return "select";
  return null;
}

/** Fotografia dos ajustes da ferramenta (só as chaves da família dela). */
export function snapshot(tool: ToolId = useTool.getState().tool): ToolSettings {
  const fam = familyOf(tool);
  const t = useTool.getState() as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of fam ? KEYS[fam] : []) out[k] = structuredCloneSafe(t[k]);
  return out as ToolSettings;
}
const structuredCloneSafe = <T,>(v: T): T => (v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v);

const TOOL_LABEL: Record<string, string> = {
  pen: "Caneta", eraser: "Borracha", rect: "Retângulo", ellipse: "Elipse", diamond: "Losango", arrow: "Seta", line: "Linha",
  text: "Texto", laser: "Laser", laserpen: "Caneta laser", select: "Selecionar", lasso: "Laço",
};
/** Resumo legível de ajustes ("Marcador · 6 · 80% · #2F4B8F"). */
export function describe(tool: ToolId, s: ToolSettings): string {
  const parts: string[] = [TOOL_LABEL[tool] ?? tool];
  if (s.brush && tool === "pen") parts[0] = getBrush(String(s.brush)).label;
  if (s.width != null) parts.push(`${s.width}`);
  if (s.eraserSize != null) parts.push(`${s.eraserSize}px`);
  if (s.opacity != null && s.opacity < 1) parts.push(`${Math.round(s.opacity * 100)}%`);
  if (s.fontSize != null) parts.push(`${s.fontSize}pt`);
  if (s.color) parts.push(String(s.color));
  if (s.laserColor) parts.push(String(s.laserColor));
  return parts.join(" · ");
}

export interface Preset { id: string; name: string; tool: ToolId; settings: ToolSettings }
export interface Macro { id: string; name: string; steps: string[] }
export interface SettingsStep { tool: ToolId; before: ToolSettings; after: ToolSettings; at: number }

export interface FavPen { id: string; brush: string; color: string; width: number; opacity: number }

interface KitState {
  presets: Preset[];
  favorites: string[];
  recent: string[];
  /** Comandos executados (mais recente primeiro), para a paleta e o painel. */
  commandLog: { id: string; at: number }[];
  /** Histórico de AJUSTES (não de desenho): voltar a espessura/cor/estabilização de antes. */
  history: SettingsStep[];
  macros: Macro[];
  /** Gravando uma macro: passos até agora. */
  recording: string[] | null;
  /** Segurar a tecla de uma ferramenta = temporária; Ctrl segurado = Selecionar; Alt segurado = conta-gotas. */
  tempTools: boolean;
  ctrlSelect: boolean;
  altPick: boolean;
  /** Canetas favoritas (0.12): pincel + cor + espessura + opacidade, num toque. */
  pens: FavPen[];
  set: (p: Partial<KitState>) => void;
}

const KEY = "hm-ideas:toolkit-v1";
const PERSIST: (keyof KitState)[] = ["presets", "favorites", "recent", "commandLog", "macros", "tempTools", "ctrlSelect", "altPick", "pens"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanKit(raw: any): Partial<KitState> {
  const r = raw && typeof raw === "object" ? raw : {};
  const strs = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length < 120).slice(0, max) : []);
  return {
    presets: (Array.isArray(r.presets) ? r.presets : [])
      .filter((p: Preset) => p && typeof p.id === "string" && typeof p.name === "string" && typeof p.tool === "string" && p.settings && typeof p.settings === "object")
      .slice(0, 200),
    favorites: strs(r.favorites, 40),
    recent: strs(r.recent, 12),
    commandLog: (Array.isArray(r.commandLog) ? r.commandLog : []).filter((c: { id: unknown; at: unknown }) => c && typeof c.id === "string" && typeof c.at === "number").slice(0, 60),
    macros: (Array.isArray(r.macros) ? r.macros : [])
      .filter((m: Macro) => m && typeof m.id === "string" && typeof m.name === "string" && Array.isArray(m.steps))
      .map((m: Macro) => ({ id: m.id, name: m.name.slice(0, 60), steps: strs(m.steps, 100) })),
    tempTools: r.tempTools !== false,
    ctrlSelect: r.ctrlSelect !== false,
    altPick: r.altPick !== false,
    pens: (Array.isArray(r.pens) ? r.pens : [])
      .filter((p: FavPen) => p && typeof p.id === "string" && typeof p.brush === "string" && /^#[0-9a-fA-F]{6}$/.test(p.color) && Number.isFinite(p.width))
      .slice(0, 24)
      .map((p: FavPen) => ({ id: p.id, brush: p.brush, color: p.color, width: Math.max(0.5, Math.min(40, p.width)), opacity: Number.isFinite(p.opacity) ? Math.max(0.05, Math.min(1, p.opacity)) : 1 })),
  };
}

const load = (): Partial<KitState> => {
  try { return cleanKit(JSON.parse(localStorage.getItem(KEY) ?? "{}")); } catch { return cleanKit({}); }
};

export const useToolKit = create<KitState>((set, get) => ({
  presets: [], favorites: [], recent: [], commandLog: [], history: [], macros: [], recording: null,
  tempTools: true, ctrlSelect: true, altPick: true, pens: [],
  ...(typeof localStorage !== "undefined" ? load() : {}),
  set: (p) => {
    set(p);
    if (PERSIST.some((k) => k in p)) {
      const s = get();
      try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(PERSIST.map((k) => [k, s[k]])))); } catch { /* */ }
    }
  },
}));

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- presets ----------

export function savePreset(name?: string): Preset {
  const t = useTool.getState();
  const settings = snapshot(t.tool);
  const p: Preset = { id: uid("p"), name: (name?.trim() || describe(t.tool, settings)).slice(0, 60), tool: t.tool, settings };
  useToolKit.getState().set({ presets: [...useToolKit.getState().presets, p] });
  return p;
}

export function applyPreset(id: string): boolean {
  const p = useToolKit.getState().presets.find((x) => x.id === id);
  if (!p) return false;
  const t = useTool.getState();
  t.setTool(p.tool);
  if (p.settings.brush) t.setBrush(p.settings.brush);
  t.set(p.settings);
  return true;
}

export const renamePreset = (id: string, name: string) =>
  useToolKit.getState().set({ presets: useToolKit.getState().presets.map((p) => (p.id === id ? { ...p, name: name.trim().slice(0, 60) || p.name } : p)) });
export const deletePreset = (id: string) => {
  const k = useToolKit.getState();
  k.set({ presets: k.presets.filter((p) => p.id !== id), favorites: k.favorites.filter((f) => f !== `preset.${id}`) });
};
/** Atualiza o preset com os ajustes atuais da ferramenta dele. */
export const updatePreset = (id: string) =>
  useToolKit.getState().set({ presets: useToolKit.getState().presets.map((p) => (p.id === id ? { ...p, settings: snapshot(p.tool) } : p)) });

// ---------- favoritas / recentes / registro ----------

export function toggleFavorite(cmd: string) {
  const k = useToolKit.getState();
  k.set({ favorites: k.favorites.includes(cmd) ? k.favorites.filter((f) => f !== cmd) : [...k.favorites, cmd] });
}

/** Ferramenta atual como id de comando (caneta = o pincel). */
export const currentToolCmd = (): string => {
  const t = useTool.getState();
  return t.tool === "pen" ? `brush.${t.brush}` : `tool.${t.tool}`;
};

export function pushRecent(cmd: string) {
  const k = useToolKit.getState();
  if (k.recent[0] === cmd) return;
  k.set({ recent: [cmd, ...k.recent.filter((r) => r !== cmd)].slice(0, 10) });
}

/** Chamado pelo registro de comandos a cada execução: registro + gravação de macro. */
export function noteCommand(id: string) {
  const k = useToolKit.getState();
  if (id.startsWith("help.") || id.startsWith("macro.")) return;
  k.set({ commandLog: [{ id, at: Date.now() }, ...k.commandLog.filter((c) => c.id !== id)].slice(0, 60) });
  if (k.recording) k.set({ recording: [...k.recording, id] });
}

// ---------- macros ----------

export function startRecording() { useToolKit.getState().set({ recording: [] }); }
export function stopRecording(name?: string): Macro | null {
  const k = useToolKit.getState();
  const steps = k.recording ?? [];
  k.set({ recording: null });
  if (!steps.length) return null;
  const m: Macro = { id: uid("m"), name: (name?.trim() || `Macro ${k.macros.length + 1}`).slice(0, 60), steps };
  k.set({ macros: [...k.macros, m] });
  return m;
}
export const saveMacro = (m: Macro) => {
  const k = useToolKit.getState();
  k.set({ macros: k.macros.some((x) => x.id === m.id) ? k.macros.map((x) => (x.id === m.id ? m : x)) : [...k.macros, m] });
};
export const newMacro = (): Macro => ({ id: uid("m"), name: `Sequência ${useToolKit.getState().macros.length + 1}`, steps: [] });
export const deleteMacro = (id: string) => {
  const k = useToolKit.getState();
  k.set({ macros: k.macros.filter((m) => m.id !== id), favorites: k.favorites.filter((f) => f !== `macro.${id}`) });
};

// ---------- histórico de ajustes e recentes (acompanha o useTool) ----------

export function initToolKit(): () => void {
  let burst: { tool: ToolId; before: ToolSettings } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsub = useTool.subscribe((s, prev) => {
    if (s.tool !== prev.tool || (s.tool === "pen" && s.brush !== prev.brush)) {
      pushRecent(s.tool === "pen" ? `brush.${s.brush}` : `tool.${s.tool}`);
      return;
    }
    const fam = familyOf(s.tool);
    if (!fam) return;
    const changed = KEYS[fam].some((k) => JSON.stringify((s as never)[k]) !== JSON.stringify((prev as never)[k]));
    if (!changed) return;
    if (!burst) {
      const before: Record<string, unknown> = {};
      for (const k of KEYS[fam]) before[k] = structuredCloneSafe((prev as never)[k]);
      burst = { tool: s.tool, before: before as ToolSettings };
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!burst) return;
      const step: SettingsStep = { tool: burst.tool, before: burst.before, after: snapshot(burst.tool), at: Date.now() };
      burst = null;
      if (JSON.stringify(step.before) === JSON.stringify(step.after)) return;
      useToolKit.getState().set({ history: [step, ...useToolKit.getState().history].slice(0, 40) });
    }, 900);
  });
  return () => { unsub(); if (timer) clearTimeout(timer); };
}

/** Volta os ajustes de um passo do histórico (vira um passo novo, dá para voltar de novo). */
export function restoreSettings(step: SettingsStep, which: "before" | "after" = "before") {
  const t = useTool.getState();
  if (t.tool !== step.tool) t.setTool(step.tool);
  t.set(step[which]);
}

// ---------- canetas favoritas (0.12) ----------
export function addFavPen(): FavPen | null {
  const t = useTool.getState(), k = useToolKit.getState();
  const pen: FavPen = { id: uid("pen"), brush: t.brush, color: t.color, width: t.width, opacity: t.opacity };
  if (k.pens.some((p) => p.brush === pen.brush && p.color.toLowerCase() === pen.color.toLowerCase() && p.width === pen.width && p.opacity === pen.opacity)) return null;
  k.set({ pens: [...k.pens, pen].slice(-24) });
  return pen;
}
export function applyFavPen(id: string) {
  const p = useToolKit.getState().pens.find((x) => x.id === id);
  if (!p) return;
  const t = useTool.getState();
  t.setTool("pen");
  t.setBrush(p.brush);
  t.set({ color: p.color, width: p.width, opacity: p.opacity });
}
export const removeFavPen = (id: string) => useToolKit.getState().set({ pens: useToolKit.getState().pens.filter((p) => p.id !== id) });
/** A caneta favorita que bate com o ajuste atual (para marcar como ativa). */
export function activeFavPen(): string | null {
  const t = useTool.getState();
  if (t.tool !== "pen") return null;
  return useToolKit.getState().pens.find((p) => p.brush === t.brush && p.color.toLowerCase() === t.color.toLowerCase() && p.width === t.width && p.opacity === t.opacity)?.id ?? null;
}
