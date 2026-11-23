// Tema, cor de destaque, densidade e opções de espaço da interface. Preferência de UI (localStorage), nunca parte do
// documento. O papel do caderno (cor da folha) é do documento e não muda com o tema; só barras, painéis e janelas mudam.
import { create } from "zustand";

export type ThemeMode = "auto" | "light" | "dark" | "sepia" | "graphite" | "midnight" | "forest" | "contrast";
export type Density = "compact" | "normal" | "large";
export type AccentId = "violet" | "blue" | "teal" | "green" | "orange" | "pink" | "red" | "graphite";
export type Grips = "subtle" | "normal";

export const THEME_KEY = "hm-ideas-theme-v1";

/** Temas: cores para as miniaturas das Configurações (o resto mora no CSS, em :root[data-theme]). */
export const THEMES: { id: ThemeMode; label: string; dark: boolean; paper: string; chrome: string; ink: string; line: string }[] = [
  { id: "auto", label: "Automático", dark: false, paper: "#eef0f5", chrome: "#ffffff", ink: "#1b1a2e", line: "#d9d8e3" },
  { id: "light", label: "Claro", dark: false, paper: "#eef0f5", chrome: "#ffffff", ink: "#1b1a2e", line: "#d9d8e3" },
  { id: "dark", label: "Escuro", dark: true, paper: "#0f0d1f", chrome: "#1a1632", ink: "#eeebfa", line: "#37325a" },
  { id: "sepia", label: "Sépia", dark: false, paper: "#f3ebdd", chrome: "#fbf5ea", ink: "#3b2f22", line: "#e1d3bb" },
  { id: "graphite", label: "Grafite", dark: false, paper: "#e9eaed", chrome: "#fafafb", ink: "#1d1f23", line: "#d3d5da" },
  { id: "midnight", label: "Meia-noite", dark: true, paper: "#0b1020", chrome: "#121a30", ink: "#e6ecff", line: "#28324f" },
  { id: "forest", label: "Floresta", dark: true, paper: "#0f1a14", chrome: "#16251d", ink: "#e5f2ea", line: "#2b4034" },
  { id: "contrast", label: "Alto contraste", dark: false, paper: "#ffffff", chrome: "#ffffff", ink: "#000000", line: "#000000" },
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

export interface Appearance { mode: ThemeMode; density: Density; accent: AccentId; grips: Grips }
export const DEFAULT_APPEARANCE: Appearance = { mode: "auto", density: "normal", accent: "violet", grips: "subtle" };

export function normalizeAppearance(raw: unknown): Appearance {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Appearance>;
  return {
    mode: THEMES.some((t) => t.id === r.mode) ? (r.mode as ThemeMode) : DEFAULT_APPEARANCE.mode,
    density: r.density === "compact" || r.density === "large" || r.density === "normal" ? r.density : DEFAULT_APPEARANCE.density,
    accent: ACCENTS.some((a) => a.id === r.accent) ? (r.accent as AccentId) : DEFAULT_APPEARANCE.accent,
    grips: r.grips === "normal" || r.grips === "subtle" ? r.grips : DEFAULT_APPEARANCE.grips,
  };
}

const read = (): Appearance => {
  try { return normalizeAppearance(JSON.parse(localStorage.getItem(THEME_KEY) ?? "null")); } catch { return DEFAULT_APPEARANCE; }
};

/** Resolve "auto" pela preferência do sistema; os outros temas valem como estão. */
export const resolveMode = (mode: ThemeMode, prefersDark: boolean): Exclude<ThemeMode, "auto"> => (mode === "auto" ? (prefersDark ? "dark" : "light") : mode);
export const isDarkTheme = (t: Exclude<ThemeMode, "auto">) => THEMES.find((x) => x.id === t)?.dark ?? false;

const prefersDark = () => { try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; } };

export function applyAppearance(a: Appearance) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  const theme = resolveMode(a.mode, prefersDark());
  const dark = isDarkTheme(theme);
  el.dataset.theme = theme;
  el.dataset.density = a.density;
  el.dataset.grips = a.grips;
  el.style.colorScheme = dark ? "dark" : "light";
  const ac = ACCENTS.find((x) => x.id === a.accent) ?? ACCENTS[0];
  const main = dark ? ac.dark : ac.light;
  el.style.setProperty("--accent", main);
  el.style.setProperty("--accent-2", ac.second);
  el.style.setProperty("--accent-strong", ac.strong);
  el.style.setProperty("--accent-soft", `color-mix(in srgb, ${main} ${dark ? 20 : 13}%, transparent)`);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", THEMES.find((t) => t.id === theme)?.paper ?? "#EDF0F4");
}

interface ThemeState extends Appearance {
  /** Modo foco: esconde barras e painéis (volta com o botão flutuante ou Ctrl+.). Não persiste. */
  focus: boolean;
  setMode: (mode: ThemeMode) => void;
  setDensity: (density: Density) => void;
  setAccent: (accent: AccentId) => void;
  setGrips: (grips: Grips) => void;
  setFocus: (focus: boolean) => void;
}

export const useTheme = create<ThemeState>((set, get) => {
  const save = () => {
    const { mode, density, accent, grips } = get();
    try { localStorage.setItem(THEME_KEY, JSON.stringify({ mode, density, accent, grips })); } catch { /* sem armazenamento */ }
    applyAppearance({ mode, density, accent, grips });
  };
  return {
    ...read(),
    focus: false,
    setMode: (mode) => { set({ mode }); save(); },
    setDensity: (density) => { set({ density }); save(); },
    setAccent: (accent) => { set({ accent }); save(); },
    setGrips: (grips) => { set({ grips }); save(); },
    setFocus: (focus) => {
      set({ focus });
      if (typeof document !== "undefined") document.documentElement.classList.toggle("focus-mode", focus);
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
