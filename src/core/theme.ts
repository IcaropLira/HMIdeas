// Tema, cor de destaque, densidade e opções de espaço da interface. Preferência de UI (localStorage), nunca parte do
// documento. O papel do caderno (cor da folha) é do documento e não muda com o tema; só barras, painéis e janelas mudam.
// 0.13: temas são DADOS (tokens de cor + cores por região da interface) aplicados como variáveis CSS no <html>; o usuário
// cria/edita/importa/exporta os seus. Também: cantos, transparência, contraste, animações, textura, mesa, cursor do pincel
// e cores de seleção/guias.
import { create } from "zustand";

export type ThemeMode = string; // "auto" | id de tema pronto | "custom:<id>"
export type Density = "compact" | "normal" | "large";
export type AccentId = "violet" | "blue" | "teal" | "green" | "orange" | "pink" | "red" | "graphite";
export type Grips = "subtle" | "normal";
export type Texture = "none" | "grain" | "linen" | "kraft" | "dots";

export const THEME_KEY = "hm-ideas-theme-v1";

// ---------- cores ----------
const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/** Mistura a → b (k = 0..1). */
export function mixHex(a: string, b: string, k: number): string {
  const A = rgb(a), B = rgb(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, "0")).join("");
}
export const luminance = (h: string) => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
/** Texto legível sobre um fundo. */
export const inkOn = (bg: string) => (luminance(bg) > 0.55 ? "#1b1a2e" : "#f4f2fb");
const rgba = (h: string, a: number) => { const [r, g, b] = rgb(h); return `rgba(${r}, ${g}, ${b}, ${+a.toFixed(3)})`; };


/** Cores de um tema (o resto — linhas, sombra — sai delas). */
export interface ThemeTokens { paper: string; ink: string; soft: string; chrome: string; surface: string; surface2: string; danger: string }
/** Cores por região (opcionais: ausente = a do tema). */
export type Region = "menu" | "tools" | "panels" | "pages" | "status" | "home";
export const REGIONS: { id: Region; label: string; hint: string }[] = [
  { id: "menu", label: "Menu e barra de opções", hint: "Faixa do topo" },
  { id: "tools", label: "Barras de ferramentas", hint: "Bloquinhos das ferramentas" },
  { id: "panels", label: "Painéis e janelas", hint: "Propriedades, objetos, camadas…" },
  { id: "pages", label: "Barra de páginas", hint: "Miniaturas e índice" },
  { id: "status", label: "Barra de status", hint: "Rodapé" },
  { id: "home", label: "Tela inicial", hint: "Fundo da Home" },
];
export interface ThemeDef { id: string; label: string; dark: boolean; t: ThemeTokens; regions?: Partial<Record<Region, string>>; contrast?: boolean }

const T = (paper: string, ink: string, soft: string, chrome: string, surface: string, surface2: string, danger = ""): ThemeTokens =>
  ({ paper, ink, soft, chrome, surface, surface2, danger });

/** Temas prontos (16 + automático). */
export const PRESETS: ThemeDef[] = [
  { id: "light", label: "Claro", dark: false, t: T("#eef0f5", "#1b1a2e", "#62627a", "#ffffff", "#ffffff", "#f3f1fa", "#c4264f") },
  { id: "dark", label: "Escuro", dark: true, t: T("#0f0d1f", "#eeebfa", "#a29fbd", "#1a1632", "#221d42", "#2a2450", "#ff7a98") },
  { id: "sepia", label: "Sépia", dark: false, t: T("#f3ebdd", "#3b2f22", "#7a6a55", "#fbf5ea", "#fffaf1", "#f1e6d2", "#b3412f") },
  { id: "graphite", label: "Grafite", dark: false, t: T("#e9eaed", "#1d1f23", "#5d636e", "#fafafb", "#ffffff", "#f1f2f4", "#c4264f") },
  { id: "midnight", label: "Meia-noite", dark: true, t: T("#0b1020", "#e6ecff", "#93a0c4", "#121a30", "#141c33", "#1b2542", "#ff7a98") },
  { id: "forest", label: "Floresta", dark: true, t: T("#0f1a14", "#e5f2ea", "#9db8a8", "#16251d", "#18291f", "#1f3428", "#ff8a80") },
  { id: "contrast", label: "Alto contraste", dark: false, contrast: true, t: T("#ffffff", "#000000", "#1f1f1f", "#ffffff", "#ffffff", "#eeeeee", "#b00020") },
  { id: "ocean", label: "Oceano", dark: false, t: T("#e6f0f7", "#0f2a3d", "#4d6b80", "#f7fbfe", "#ffffff", "#e9f2f9", "#c4264f") },
  { id: "lavender", label: "Lavanda", dark: false, t: T("#efeaf8", "#2a2140", "#6d6385", "#fbf9ff", "#ffffff", "#f1ecfb", "#c4264f") },
  { id: "rose", label: "Rosé", dark: false, t: T("#f7ecef", "#3a1f28", "#86636e", "#fffafb", "#ffffff", "#f8eef1", "#b8233f") },
  { id: "mint", label: "Menta", dark: false, t: T("#e8f4ee", "#16302a", "#55736a", "#f8fdfa", "#ffffff", "#eaf5ef", "#c4264f") },
  { id: "kraft", label: "Kraft", dark: false, t: T("#e6d9c2", "#33281a", "#6e5f48", "#f4ecdd", "#fbf6ec", "#ede2cd", "#a63b2a") },
  { id: "solar-light", label: "Solar claro", dark: false, t: T("#eee8d5", "#073642", "#586e75", "#fdf6e3", "#fffbee", "#f3ecd7", "#dc322f") },
  { id: "solar-dark", label: "Solar escuro", dark: true, t: T("#002b36", "#eee8d5", "#93a1a1", "#073642", "#0a3f4c", "#0d4a59", "#ff6b5e") },
  { id: "nord", label: "Nórdico", dark: true, t: T("#242933", "#eceff4", "#a3adbf", "#2e3440", "#3b4252", "#434c5e", "#ef8a92") },
  { id: "coffee", label: "Café", dark: true, t: T("#1c1512", "#f2e6dc", "#bba89a", "#271d18", "#30241e", "#3a2c24", "#ff8a7a") },
  { id: "neon", label: "Neon", dark: true, t: T("#0c0b12", "#f4f1ff", "#a9a3c7", "#15131f", "#1c1929", "#252136", "#ff5fa2"), regions: { tools: "#1f1335" } },
];

/** Temas para as miniaturas (compatível com a lista antiga). */
export const THEMES: { id: ThemeMode; label: string; dark: boolean; paper: string; chrome: string; ink: string; line: string }[] = [
  { id: "auto", label: "Automático", dark: false, paper: "#eef0f5", chrome: "#ffffff", ink: "#1b1a2e", line: "#d9d8e3" },
  ...PRESETS.map((p) => ({ id: p.id, label: p.label, dark: p.dark, paper: p.t.paper, chrome: p.t.chrome, ink: p.t.ink, line: mixHex(p.t.chrome, p.t.ink, 0.16) })),
];

/** Cores de destaque: tom para tema claro, tom para tema escuro e a segunda cor do degradê. */
export const ACCENTS: { id: AccentId; label: string; light: string; dark: string; second: string; strong: string }[] = [
  { id: "violet", label: "Violeta", light: "#6a3fd1", dark: "#b69cff", second: "#e0197d", strong: "#5b2fb8" },
  { id: "blue", label: "Azul", light: "#2f5bd3", dark: "#8fb0ff", second: "#1aa3d9", strong: "#2546a8" },
  { id: "teal", label: "Turquesa", light: "#0e8a9b", dark: "#5fd6e2", second: "#17b897", strong: "#0b6e7c" },
  { id: "green", label: "Verde", light: "#2e8b57", dark: "#7fd8a4", second: "#8bbf2a", strong: "#22704a" },
  { id: "orange", label: "Laranja", light: "#d0620e", dark: "#ffb070", second: "#e8a317", strong: "#b04f08" },
  { id: "pink", label: "Rosa", light: "#d1307a", dark: "#ff8fc0", second: "#a83fd1", strong: "#a9205f" },
  { id: "red", label: "Vermelho", light: "#c8372d", dark: "#ff8a80", second: "#e8670e", strong: "#a32b22" },
  { id: "graphite", label: "Grafite", light: "#3d4557", dark: "#c4cad8", second: "#6b7890", strong: "#2a3040" },
];

export const TEXTURES: { id: Texture; label: string }[] = [
  { id: "none", label: "Nenhuma" }, { id: "grain", label: "Grão" }, { id: "linen", label: "Linho" }, { id: "kraft", label: "Fibra" }, { id: "dots", label: "Pontilhada" },
];

export interface Appearance {
  mode: ThemeMode; density: Density; accent: AccentId; grips: Grips;
  /** 0.13 */
  radius: number;      // escala dos cantos (0 = quadrado … 1.6 = bem redondo)
  opacity: number;     // opacidade das barras e painéis (0.7 … 1)
  contrast: boolean;   // reforça linhas, contornos e foco
  anim: boolean;       // animações e transições
  texture: Texture;    // textura sobre a folha
  textureStrength: number;
  desk: string | null; // cor da mesa (caderno com páginas); null = automática
  brushCursor: boolean;
  selColor: string;
  guideColor: string;
  custom: ThemeDef[];  // temas do usuário (id "custom:…")
}
export const DEFAULT_APPEARANCE: Appearance = {
  mode: "auto", density: "normal", accent: "violet", grips: "subtle",
  radius: 1, opacity: 0.96, contrast: false, anim: true, texture: "none", textureStrength: 0.5, desk: null, brushCursor: true,
  selColor: "#2F4B8F", guideColor: "#E0197D", custom: [],
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : d);
const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

/** Saneia um tema vindo de arquivo/armazenamento (null se não der para aproveitar). */
export function cleanThemeDef(raw: unknown, idPrefix = "custom:"): ThemeDef | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as any;
  if (!r || typeof r !== "object" || !r.t || typeof r.t !== "object") return null;
  const base = r.dark ? PRESETS[1].t : PRESETS[0].t;
  const t: ThemeTokens = {
    paper: hex(r.t.paper, base.paper), ink: hex(r.t.ink, base.ink), soft: hex(r.t.soft, base.soft), chrome: hex(r.t.chrome, base.chrome),
    surface: hex(r.t.surface, base.surface), surface2: hex(r.t.surface2, base.surface2), danger: hex(r.t.danger, base.danger),
  };
  const regions: Partial<Record<Region, string>> = {};
  if (r.regions && typeof r.regions === "object") for (const g of REGIONS) if (typeof r.regions[g.id] === "string" && HEX.test(r.regions[g.id])) regions[g.id] = r.regions[g.id].toLowerCase();
  const id = typeof r.id === "string" && r.id.startsWith(idPrefix) ? r.id.slice(0, 60) : `${idPrefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { id, label: typeof r.label === "string" && r.label.trim() ? r.label.trim().slice(0, 40) : "Meu tema", dark: !!r.dark, t, regions, contrast: r.contrast === true || undefined };
}

export function normalizeAppearance(raw: unknown): Appearance {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Appearance>;
  const custom = (Array.isArray(r.custom) ? r.custom : []).map((c) => cleanThemeDef(c)).filter((c): c is ThemeDef => !!c).slice(0, 40);
  const validMode = r.mode === "auto" || PRESETS.some((p) => p.id === r.mode) || custom.some((c) => c.id === r.mode);
  return {
    mode: validMode ? (r.mode as ThemeMode) : DEFAULT_APPEARANCE.mode,
    density: r.density === "compact" || r.density === "large" || r.density === "normal" ? r.density : DEFAULT_APPEARANCE.density,
    accent: ACCENTS.some((a) => a.id === r.accent) ? (r.accent as AccentId) : DEFAULT_APPEARANCE.accent,
    grips: r.grips === "normal" || r.grips === "subtle" ? r.grips : DEFAULT_APPEARANCE.grips,
    radius: clamp(r.radius, 0, 1.6, 1),
    opacity: clamp(r.opacity, 0.7, 1, 0.96),
    contrast: r.contrast === true,
    anim: r.anim !== false,
    texture: TEXTURES.some((x) => x.id === r.texture) ? (r.texture as Texture) : "none",
    textureStrength: clamp(r.textureStrength, 0.1, 1, 0.5),
    desk: typeof r.desk === "string" && HEX.test(r.desk) ? r.desk : null,
    brushCursor: r.brushCursor !== false,
    selColor: hex(r.selColor, DEFAULT_APPEARANCE.selColor),
    guideColor: hex(r.guideColor, DEFAULT_APPEARANCE.guideColor),
    custom,
  };
}

const read = (): Appearance => {
  try { return normalizeAppearance(JSON.parse(localStorage.getItem(THEME_KEY) ?? "null")); } catch { return DEFAULT_APPEARANCE; }
};

/** Resolve "auto" pela preferência do sistema; os outros temas valem como estão. */
export const resolveMode = (mode: ThemeMode, prefersDark: boolean): ThemeMode => (mode === "auto" ? (prefersDark ? "dark" : "light") : mode);
export const isDarkTheme = (t: ThemeMode, custom: ThemeDef[] = []) => findTheme(t, custom)?.dark ?? false;
export const findTheme = (id: ThemeMode, custom: ThemeDef[] = []): ThemeDef | undefined => PRESETS.find((p) => p.id === id) ?? custom.find((c) => c.id === id);

/** Variáveis CSS de um tema já resolvido (puro: testável). */
export function themeVars(def: ThemeDef, a: Pick<Appearance, "opacity" | "contrast" | "radius">): Record<string, string> {
  const { t } = def, hc = a.contrast || !!def.contrast;
  const v: Record<string, string> = {
    "--paper": t.paper, "--ink": t.ink, "--ink-soft": hc ? mixHex(t.soft, t.ink, 0.5) : t.soft,
    "--chrome": def.contrast ? t.chrome : rgba(t.chrome, a.opacity),
    "--surface": t.surface, "--surface-2": t.surface2, "--panel": t.surface,
    "--line": def.contrast ? "rgba(0, 0, 0, 0.75)" : rgba(t.ink, hc ? 0.42 : def.dark ? 0.14 : 0.13),
    "--shadow": def.contrast ? "0 0 0 1.5px #000" : def.dark ? "0 10px 32px rgba(0, 0, 0, 0.5)" : `0 8px 28px ${rgba(mixHex(t.ink, "#1e1446", 0.5), 0.14)}`,
    "--danger": t.danger || (def.dark ? "#ff7a98" : "#c4264f"),
    "--rs": String(a.radius),
  };
  for (const g of REGIONS) {
    const c = def.regions?.[g.id];
    if (c) { v[`--r-${g.id}`] = g.id === "home" ? c : rgba(c, Math.max(a.opacity, 0.9)); v[`--r-${g.id}-ink`] = inkOn(c); }
  }
  return v;
}

const prefersDark = () => { try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; } };
let applied: string[] = [];

export function applyAppearance(a: Appearance) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  const id = resolveMode(a.mode, prefersDark());
  const def = findTheme(id, a.custom) ?? PRESETS[0];
  const dark = def.dark;
  el.dataset.theme = def.id.startsWith("custom:") ? "custom" : def.id;
  el.dataset.density = a.density;
  el.dataset.grips = a.grips;
  el.dataset.texture = a.texture;
  el.style.colorScheme = dark ? "dark" : "light";
  el.classList.toggle("hc", a.contrast || !!def.contrast);
  el.classList.toggle("no-anim", !a.anim);
  for (const k of applied) el.style.removeProperty(k);
  const vars = themeVars(def, a);
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  applied = Object.keys(vars);
  for (const g of REGIONS) el.classList.toggle(`r-${g.id}`, !!def.regions?.[g.id]);
  el.style.setProperty("--tex-a", String(a.textureStrength));
  const ac = ACCENTS.find((x) => x.id === a.accent) ?? ACCENTS[0];
  const main = dark ? ac.dark : ac.light;
  el.style.setProperty("--accent", main);
  el.style.setProperty("--accent-2", ac.second);
  el.style.setProperty("--accent-strong", ac.strong);
  el.style.setProperty("--accent-soft", `color-mix(in srgb, ${main} ${dark ? 20 : 13}%, transparent)`);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", def.t.paper);
}

interface ThemeState extends Appearance {
  /** Modo foco: esconde barras e painéis (volta com o botão flutuante ou Ctrl+.). Não persiste. */
  focus: boolean;
  setMode: (mode: ThemeMode) => void;
  setDensity: (density: Density) => void;
  setAccent: (accent: AccentId) => void;
  setGrips: (grips: Grips) => void;
  setFocus: (focus: boolean) => void;
  /** Qualquer outro ajuste (0.13). */
  patch: (p: Partial<Appearance>) => void;
  /** Cria um tema do usuário a partir de outro (ou do atual) e já o ativa. */
  duplicateTheme: (from?: ThemeMode) => ThemeDef;
  saveTheme: (def: ThemeDef) => void;
  deleteTheme: (id: string) => void;
  importThemes: (json: string) => number;
  exportThemes: (ids?: string[]) => string;
}

const PERSIST_KEYS = Object.keys(DEFAULT_APPEARANCE) as (keyof Appearance)[];

export const useTheme = create<ThemeState>((set, get) => {
  const save = () => {
    const s = get();
    const a = Object.fromEntries(PERSIST_KEYS.map((k) => [k, s[k]])) as unknown as Appearance;
    try { localStorage.setItem(THEME_KEY, JSON.stringify(a)); } catch { /* sem armazenamento */ }
    applyAppearance(a);
  };
  return {
    ...read(),
    focus: false,
    setMode: (mode) => { set({ mode }); save(); },
    setDensity: (density) => { set({ density }); save(); },
    setAccent: (accent) => { set({ accent }); save(); },
    setGrips: (grips) => { set({ grips }); save(); },
    patch: (p) => { set(normalizeAppearance({ ...get(), ...p })); save(); },
    setFocus: (focus) => {
      set({ focus });
      if (typeof document !== "undefined") document.documentElement.classList.toggle("focus-mode", focus);
    },
    duplicateTheme: (from) => {
      const s = get();
      const src = findTheme(resolveMode(from ?? s.mode, prefersDark()), s.custom) ?? PRESETS[0];
      const def = cleanThemeDef({ ...src, id: undefined, label: `${src.label} (meu)`, regions: { ...src.regions } })!;
      set({ custom: [...s.custom, def], mode: def.id });
      save();
      return def;
    },
    saveTheme: (def) => {
      const clean = cleanThemeDef(def);
      if (!clean) return;
      set({ custom: get().custom.map((c) => (c.id === def.id ? { ...clean, id: def.id } : c)) });
      save();
    },
    deleteTheme: (id) => {
      const s = get();
      set({ custom: s.custom.filter((c) => c.id !== id), mode: s.mode === id ? "auto" : s.mode });
      save();
    },
    importThemes: (json) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let raw: any;
      try { raw = JSON.parse(json); } catch { return 0; }
      const list = (Array.isArray(raw?.themes) ? raw.themes : Array.isArray(raw) ? raw : [raw]).map((x: unknown) => cleanThemeDef({ ...(x as object), id: undefined })).filter(Boolean) as ThemeDef[];
      if (!list.length) return 0;
      set({ custom: [...get().custom, ...list].slice(-40), mode: list[0].id });
      save();
      return list.length;
    },
    exportThemes: (ids) => {
      const s = get();
      const list = ids ? s.custom.filter((c) => ids.includes(c.id)) : s.custom;
      return JSON.stringify({ app: "hm-ideas", kind: "themes", version: 1, themes: list.map(({ id: _id, ...rest }) => rest) }, null, 2);
    },
  };
});

/** Aplica o tema salvo e acompanha o sistema quando o modo é "auto". Chamar uma vez, antes de renderizar. */
export function initTheme(): void {
  applyAppearance(useTheme.getState());
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyAppearance(useTheme.getState()));
  } catch { /* navegador antigo */ }
}
