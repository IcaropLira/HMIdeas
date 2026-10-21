// Utilidades de cor. Puro: sem Pixi, sem React. Cores do documento são sempre "#RRGGBB".

export interface RGB { r: number; g: number; b: number }
/** h em graus (0..360), s e v em 0..1. */
export interface HSV { h: number; s: number; v: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hex2 = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");

/** Aceita "#abc", "abc", "#aabbcc" (maiúsculas ou minúsculas) e devolve "#AABBCC", ou null se inválido. */
export function parseHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return "#" + h.toUpperCase();
}

export function hexToRgb(hex: string): RGB {
  const h = parseHex(hex) ?? "#000000";
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
}

export const rgbToHex = ({ r, g, b }: RGB): string => ("#" + hex2(r) + hex2(g) + hex2(b)).toUpperCase();

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  let h = 0;
  if (d > 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export const hexToHsv = (hex: string): HSV => rgbToHsv(hexToRgb(hex));
export const hsvToHex = (hsv: HSV): string => rgbToHex(hsvToRgb(hsv));

/** Preto ou branco, o que contrastar mais com a cor (para desenhar aros e ícones sobre ela). */
export function contrastOn(hex: string): "#1B2233" | "#FFFFFF" {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#1B2233" : "#FFFFFF";
}

export const RECENT_MAX = 12;

/** Põe a cor no início da lista de recentes (sem repetir, no máximo RECENT_MAX). */
export function pushRecent(list: string[], color: string): string[] {
  const c = parseHex(color);
  if (!c) return list;
  return [c, ...list.filter((x) => x.toUpperCase() !== c)].slice(0, RECENT_MAX);
}

export interface Palette { id: string; label: string; colors: string[] }

export const PALETTES: Palette[] = [
  { id: "classic", label: "Clássicas", colors: ["#1B2233", "#4B5468", "#8A93A6", "#FFFFFF", "#C8372D", "#E4572E", "#D98A1F", "#F2C14E", "#2F7D5B", "#2F4B8F", "#6B4FA0", "#B5517A"] },
  { id: "pastel", label: "Pastel", colors: ["#F6D5D2", "#F7E3BD", "#FBF1B5", "#CFE8DB", "#C9D6F2", "#DDD0F0", "#F3D1E4", "#D9E4EA", "#E8DCCB", "#EDEDED", "#FFE0C2", "#C9ECE6"] },
  { id: "vivid", label: "Vivas", colors: ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#00C7BE", "#32ADE6", "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E", "#000000"] },
  { id: "earth", label: "Terra", colors: ["#3B2A20", "#6B4A2F", "#8C6239", "#B8864B", "#D9B382", "#EAD7B7", "#5B6B3A", "#8A9A5B", "#4F6D7A", "#2E4057", "#7A3E3E", "#A65E2E"] },
];
