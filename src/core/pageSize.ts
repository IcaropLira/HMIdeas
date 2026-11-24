// Cadernos com páginas de tamanho fixo (como o GoodNotes), além do quadro infinito (padrão do app). Puro.
import type { Camera } from "./camera";

export interface PageSize { w: number; h: number; name: string }

/** Tamanhos em "pixels" do mundo a 96 dpi (A4 = 794 × 1123). */
export const PAGE_SIZES: { id: string; label: string; size: PageSize | null }[] = [
  { id: "infinite", label: "Quadro infinito", size: null },
  { id: "a4", label: "A4 retrato", size: { w: 794, h: 1123, name: "A4" } },
  { id: "a4l", label: "A4 paisagem", size: { w: 1123, h: 794, name: "A4 paisagem" } },
  { id: "letter", label: "Carta", size: { w: 816, h: 1056, name: "Carta" } },
  { id: "a5", label: "A5", size: { w: 559, h: 794, name: "A5" } },
  { id: "wide", label: "16:9 (slides)", size: { w: 1280, h: 720, name: "16:9" } },
  { id: "square", label: "Quadrado", size: { w: 1000, h: 1000, name: "Quadrado" } },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanPageSize(v: any): PageSize | undefined {
  if (!v || typeof v !== "object") return undefined;
  const w = Number(v.w), h = Number(v.h);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 16 || h < 16 || w > 30000 || h > 30000) return undefined;
  return { w: Math.round(w), h: Math.round(h), name: typeof v.name === "string" ? v.name.slice(0, 40) : "" };
}

/** Câmera que mostra a folha inteira com margem (`top` alinha o topo da folha em vez de centralizar). */
export function fitSheet(size: PageSize, viewW: number, viewH: number, pad = 48, top = false): Camera {
  const zoom = Math.max(0.05, Math.min(4, Math.min((viewW - 2 * pad) / size.w, (viewH - 2 * pad) / size.h)));
  const fitW = Math.max(0.05, Math.min(4, (viewW - 2 * pad) / size.w));
  const z = top ? Math.min(fitW, Math.max(zoom, Math.min(1, fitW))) : zoom;
  return { zoom: z, x: (viewW - size.w * z) / 2, y: top ? pad : (viewH - size.h * z) / 2 };
}

/** Mantém a folha à vista: não deixa ela sair inteira da tela (sobra ao menos `keep` px dela visível). */
export function clampToSheet(cam: Camera, size: PageSize, viewW: number, viewH: number, keep = 120): Camera {
  const w = size.w * cam.zoom, h = size.h * cam.zoom;
  // se a folha cabe na direção, centraliza ali; senão limita para não mostrar mais que `slack` de mesa
  const slackX = Math.max(keep, viewW * 0.35), slackY = Math.max(keep, viewH * 0.35);
  const x = w <= viewW - 2 * 24 ? Math.min(Math.max(cam.x, Math.min(24, (viewW - w) / 2)), Math.max(viewW - w - 24, (viewW - w) / 2)) : Math.min(slackX, Math.max(viewW - w - slackX, cam.x));
  const y = h <= viewH - 2 * 24 ? Math.min(Math.max(cam.y, Math.min(24, (viewH - h) / 2)), Math.max(viewH - h - 24, (viewH - h) / 2)) : Math.min(slackY, Math.max(viewH - h - slackY, cam.y));
  return x === cam.x && y === cam.y ? cam : { ...cam, x, y };
}

/** Quanto passou do fim/início da folha (para virar a página rolando). >0 = passou do fim, <0 = do começo. */
export function sheetOverscroll(cam: Camera, size: PageSize, viewH: number): number {
  const h = size.h * cam.zoom;
  if (h <= viewH) return 0;
  const bottom = cam.y + h; // onde a folha termina na tela
  if (bottom < viewH * 0.7) return viewH * 0.7 - bottom;
  if (cam.y > viewH * 0.3) return -(cam.y - viewH * 0.3);
  return 0;
}
