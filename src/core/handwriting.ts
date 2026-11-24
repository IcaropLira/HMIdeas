// Escrita à mão (0.12), parte pura: categorias para filtrar laço/caixa/borracha, rabisco que apaga e a janela de zoom
// (caixa-alvo que avança pela linha). Sem React e sem Pixi.
import { elementHit } from "./geometry";
import { HirakuElement, InkPoint } from "./model";
import { elementBounds } from "./selection";

// ---------- categorias ----------

export type ElCategory = "ink" | "highlighter" | "shapes" | "text" | "maps" | "media";
export const CATEGORIES: { id: ElCategory; label: string; hint: string }[] = [
  { id: "ink", label: "Tinta", hint: "Traços de caneta, lápis, pincel…" },
  { id: "highlighter", label: "Marca-texto", hint: "Traços de marca-texto" },
  { id: "shapes", label: "Formas", hint: "Retângulos, elipses, linhas e setas" },
  { id: "text", label: "Texto", hint: "Caixas de texto" },
  { id: "maps", label: "Mapas", hint: "Nós de mapa mental, vértices e quadros" },
  { id: "media", label: "Mídia e blocos", hint: "Imagens, PDFs, vídeos, blocos e fitas" },
];

export function categoryOf(el: HirakuElement): ElCategory {
  switch (el.type) {
    case "stroke": return el.brush === "highlighter" ? "highlighter" : "ink";
    case "text": return "text";
    case "node": case "frame": return "maps";
    case "attachment": return "media";
    default: return "shapes";
  }
}

/** Filtro vazio = tudo passa. */
export const passes = (el: HirakuElement, filter: readonly ElCategory[]): boolean => !filter.length || filter.includes(categoryOf(el));

/** Mantém só os ids cujo elemento passa no filtro. */
export function filterIds(ids: string[], els: HirakuElement[], filter: readonly ElCategory[]): string[] {
  if (!filter.length) return ids;
  const byId = new Map(els.map((e) => [e.id, e]));
  return ids.filter((id) => { const e = byId.get(id); return !!e && passes(e, filter); });
}

export const cleanFilter = (v: unknown): ElCategory[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is ElCategory => CATEGORIES.some((c) => c.id === x)))] : [];

// ---------- rabisco que apaga ----------

/**
 * Rabisco = vai-e-volta ao longo da direção principal do traço (pelo menos `minTurns` inversões), com o caminho
 * bem mais longo que a extensão. Um zigue-zague "W" desenhado de propósito avança sempre ao longo do eixo principal,
 * então não conta.
 */
export function isScribble(pts: { x: number; y: number }[], minTurns = 5): boolean {
  if (pts.length < 12) return false;
  let mx = 0, my = 0;
  for (const p of pts) { mx += p.x; my += p.y; }
  mx /= pts.length; my /= pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const proj = pts.map((p) => (p.x - mx) * ux + (p.y - my) * uy);
  const extent = Math.max(...proj) - Math.min(...proj);
  if (extent < 6) return false;
  let path = 0;
  for (let i = 1; i < pts.length; i++) path += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (path < extent * 3.2) return false;
  // inversões com histerese (18% da extensão) para o tremor da mão não contar
  const hyst = extent * 0.18;
  let turns = 0, dir = 0, anchor = proj[0];
  for (const v of proj) {
    if (dir >= 0 && v < anchor - hyst) { if (dir > 0) turns++; dir = -1; anchor = v; }
    else if (dir <= 0 && v > anchor + hyst) { if (dir < 0) turns++; dir = 1; anchor = v; }
    else if ((dir > 0 && v > anchor) || (dir < 0 && v < anchor)) anchor = v;
  }
  return turns >= minTurns;
}

/** O que o rabisco apaga: elementos tocados por várias amostras (estrutura de mapa fica de fora). */
export function scribbleTargets(pts: InkPoint[], els: HirakuElement[], r: number): string[] {
  const out: string[] = [];
  const step = Math.max(1, Math.floor(pts.length / 80));
  for (const el of els) {
    if (el.type === "node" || el.type === "frame" || el.locked) continue;
    const b = elementBounds(el);
    let hits = 0;
    for (let i = 0; i < pts.length && hits < 2; i += step) {
      const p = pts[i];
      if (p.x < b.minX - r || p.x > b.maxX + r || p.y < b.minY - r || p.y > b.maxY + r) continue;
      if (elementHit(el, p.x, p.y, r)) hits++;
    }
    if (hits >= 2) out.push(el.id);
  }
  return out;
}

// ---------- janela de zoom ----------

export interface ZoomTarget { x: number; y: number; w: number; h: number }

/** Próxima posição da caixa: avança na linha; passou da margem direita (`right`), desce uma linha e volta à esquerda. */
export function advanceTarget(t: ZoomTarget, left: number, right: number, step = 0.7): ZoomTarget {
  const nx = t.x + t.w * step;
  if (nx + t.w > right + t.w * 0.3) return { ...t, x: left, y: t.y + t.h };
  return { ...t, x: nx };
}

/** Nova linha manual (↵). */
export const newLine = (t: ZoomTarget, left: number): ZoomTarget => ({ ...t, x: left, y: t.y + t.h });

/** Ponto do bloco de escrita (px) → mundo. */
export const padToWorld = (t: ZoomTarget, padW: number, x: number, y: number) => ({ x: t.x + (x / padW) * t.w, y: t.y + (y / padW) * t.w });
