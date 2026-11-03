// Tema e densidade da interface. Preferência de UI (localStorage), nunca parte do documento.
// O papel do caderno (cor da folha) é do documento e não muda com o tema; só as barras, painéis e janelas mudam.
import { create } from "zustand";

export type ThemeMode = "auto" | "light" | "dark";
export type Density = "compact" | "normal" | "large";

export const THEME_KEY = "hm-ideas-theme-v1";

export interface Appearance { mode: ThemeMode; density: Density }
export const DEFAULT_APPEARANCE: Appearance = { mode: "auto", density: "normal" };

export function normalizeAppearance(raw: unknown): Appearance {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Appearance>;
  return {
    mode: r.mode === "light" || r.mode === "dark" || r.mode === "auto" ? r.mode : DEFAULT_APPEARANCE.mode,
    density: r.density === "compact" || r.density === "large" || r.density === "normal" ? r.density : DEFAULT_APPEARANCE.density,
  };
}

const read = (): Appearance => {
  try { return normalizeAppearance(JSON.parse(localStorage.getItem(THEME_KEY) ?? "null")); } catch { return DEFAULT_APPEARANCE; }
};

/** Resolve "auto" pela preferência do sistema. */
export const resolveMode = (mode: ThemeMode, prefersDark: boolean): "light" | "dark" => (mode === "auto" ? (prefersDark ? "dark" : "light") : mode);

const prefersDark = () => { try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; } };

export function applyAppearance(a: Appearance) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.dataset.theme = resolveMode(a.mode, prefersDark());
  el.dataset.density = a.density;
  el.style.colorScheme = el.dataset.theme;
}

interface ThemeState extends Appearance {
  setMode: (mode: ThemeMode) => void;
  setDensity: (density: Density) => void;
}

export const useTheme = create<ThemeState>((set, get) => {
  const save = () => {
    const { mode, density } = get();
    try { localStorage.setItem(THEME_KEY, JSON.stringify({ mode, density })); } catch { /* sem armazenamento */ }
    applyAppearance({ mode, density });
  };
  return {
    ...read(),
    setMode: (mode) => { set({ mode }); save(); },
    setDensity: (density) => { set({ density }); save(); },
  };
});

/** Aplica o tema salvo e acompanha o sistema quando o modo é "auto". Chamar uma vez, antes de renderizar. */
export function initTheme(): void {
  applyAppearance(useTheme.getState());
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyAppearance(useTheme.getState()));
  } catch { /* navegador antigo */ }
}
