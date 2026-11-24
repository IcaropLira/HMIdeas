// Cadernos (0.11), parte pura: ordem e orientação das páginas, índice automático, modelos de página do usuário,
// pastas e capas da tela inicial. Sem React, sem armazenamento: quem guarda é a UI.
import { reidentify } from "./binding";
import { HirakuDoc, HirakuElement, ID, Page, PaperKind, newId, normalizeDoc } from "./model";
import { elementBounds } from "./selection";

// ---------- páginas ----------

/** Leva a página `id` para a posição `to` (índice final na lista). */
export function reorderPages(pages: Page[], id: ID, to: number): Page[] {
  const i = pages.findIndex((p) => p.id === id);
  if (i < 0) return pages;
  const j = Math.max(0, Math.min(pages.length - 1, Math.round(to)));
  if (i === j) return pages;
  const out = pages.slice();
  const [p] = out.splice(i, 1);
  out.splice(j, 0, p);
  return out;
}

/** Gira a folha 90° (retrato ↔ paisagem). Quadro infinito não tem orientação: volta igual. */
export function rotatePage(p: Page): Page {
  if (!p.size) return p;
  const name = p.size.name.replace(/ paisagem$/, "");
  const landscape = p.size.h > p.size.w; // vai virar paisagem
  return { ...p, size: { w: p.size.h, h: p.size.w, name: landscape ? `${name} paisagem` : name } };
}

export const BOOKMARK_COLORS = ["#E0565B", "#F08A24", "#E2B714", "#2E9B5F", "#2F7FD3", "#7A4FD6", "#D2459A"];

// ---------- índice automático ----------

export interface IndexHeading { id: ID; text: string; level: 1 | 2; y: number }
export interface IndexEntry { pageId: ID; n: number; name: string; bookmark?: string; starred?: boolean; headings: IndexHeading[] }

const clip = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 80);

/** Títulos de uma página: textos grandes (ou negrito grande), títulos de quadros e raízes de mapas, de cima para baixo. */
export function pageHeadings(p: Page): IndexHeading[] {
  const out: IndexHeading[] = [];
  const add = (el: HirakuElement, text: string, level: 1 | 2) => {
    const t = clip(text.split("\n")[0] ?? "");
    if (t) out.push({ id: el.id, text: t, level, y: elementBounds(el).minY });
  };
  for (const el of p.elements) {
    if (el.invisible) continue;
    if (el.type === "text") {
      if (el.fontSize >= 30) add(el, el.text, 1);
      else if (el.fontSize >= 22 || (el.bold && el.fontSize >= 18)) add(el, el.text, 2);
    } else if (el.type === "frame" && !el.frameId) add(el, el.title, 1);
    else if (el.type === "frame") add(el, el.title, 2);
    else if (el.type === "node" && !el.parentId && !el.vertex) add(el, el.text, 2);
  }
  return out.sort((a, b) => a.y - b.y).slice(0, 40);
}

export function buildIndex(doc: HirakuDoc): IndexEntry[] {
  return doc.pages.map((p, i) => ({ pageId: p.id, n: i + 1, name: p.name, bookmark: p.bookmark, starred: p.starred, headings: pageHeadings(p) }));
}

/** Filtra o índice por texto (nome da página ou títulos) e/ou só marcadas/favoritas. */
export function filterIndex(entries: IndexEntry[], q: string, only: "all" | "marked" | "starred" = "all"): IndexEntry[] {
  const f = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const fq = f(q.trim());
  return entries
    .filter((e) => only === "all" || (only === "marked" ? !!e.bookmark || !!e.starred : !!e.starred))
    .map((e) => {
      if (!fq || f(e.name).includes(fq)) return e;
      const hs = e.headings.filter((h) => f(h.text).includes(fq));
      return hs.length ? { ...e, headings: hs } : null;
    })
    .filter((e): e is IndexEntry => !!e);
}

// ---------- modelos de página ----------

export interface PageTemplate {
  id: ID;
  name: string;
  createdAt: number;
  page: Page;
}

/** Guarda a página (papel, tamanho e conteúdo) como modelo. */
export function pageToTemplate(p: Page, name: string): PageTemplate {
  const page: Page = { ...p, id: "tpl", name: name.trim().slice(0, 60) || p.name, bookmark: undefined, starred: undefined };
  return { id: newId(), name: page.name, createdAt: Date.now(), page: normalizeDoc({ version: 1, pages: [page] }).pages[0] };
}

/** Página nova a partir do modelo (ids novos para tudo, então dá para usar o mesmo modelo várias vezes). */
export function pageFromTemplate(t: PageTemplate, name?: string): Page {
  const layerIds = new Map(t.page.layers.map((l) => [l.id, newId()]));
  const groupIds = new Map((t.page.groups ?? []).map((g) => [g.id, newId()]));
  const elements = reidentify(t.page.elements).map((e) => ({
    ...e,
    ...(e.layerId && layerIds.has(e.layerId) ? { layerId: layerIds.get(e.layerId)! } : {}),
    ...(e.groupId && groupIds.has(e.groupId) ? { groupId: groupIds.get(e.groupId)! } : {}),
  })) as HirakuElement[];
  return {
    ...t.page,
    id: newId(),
    name: name ?? t.name,
    layers: t.page.layers.map((l) => ({ ...l, id: layerIds.get(l.id)! })),
    groups: t.page.groups?.map((g) => ({ ...g, id: groupIds.get(g.id)!, parentId: g.parentId ? groupIds.get(g.parentId) ?? null : null })),
    elements,
  };
}

/** Lê a lista guardada (descarta o que não for um modelo válido). */
export function cleanTemplates(raw: unknown): PageTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: PageTemplate[] = [];
  for (const t of raw) {
    try {
      if (!t || typeof t.id !== "string" || typeof t.name !== "string") continue;
      const page = normalizeDoc({ version: 1, pages: [t.page] }).pages[0];
      out.push({ id: t.id, name: t.name.slice(0, 60), createdAt: Number(t.createdAt) || 0, page });
    } catch { /* modelo ilegível */ }
  }
  return out;
}

// ---------- pastas e capas (tela inicial) ----------

export interface Folder { id: ID; name: string; color: string }

export type CoverStyle = "page" | "solid" | "gradient" | "pattern";
export type CoverPattern = "dots" | "stripes" | "grid" | "waves" | "diag";
export interface Cover { style: CoverStyle; pattern?: CoverPattern; title?: boolean; color2?: string }

export const COVER_STYLES: { id: CoverStyle; label: string }[] = [
  { id: "page", label: "Primeira página" },
  { id: "solid", label: "Cor" },
  { id: "gradient", label: "Degradê" },
  { id: "pattern", label: "Padrão" },
];
export const COVER_PATTERNS: { id: CoverPattern; label: string }[] = [
  { id: "dots", label: "Bolinhas" },
  { id: "stripes", label: "Listras" },
  { id: "grid", label: "Xadrez" },
  { id: "waves", label: "Ondas" },
  { id: "diag", label: "Diagonais" },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
export function cleanCover(v: unknown): Cover | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = v as any;
  if (!c || !COVER_STYLES.some((s) => s.id === c.style)) return undefined;
  return {
    style: c.style,
    pattern: COVER_PATTERNS.some((p) => p.id === c.pattern) ? c.pattern : undefined,
    title: c.title === true || undefined,
    color2: typeof c.color2 === "string" && HEX.test(c.color2) ? c.color2 : undefined,
  };
}

export function cleanFolders(v: unknown): Folder[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.filter((f) => f && typeof f.id === "string" && typeof f.name === "string" && !seen.has(f.id) && seen.add(f.id))
    .map((f) => ({ id: f.id, name: f.name.slice(0, 40) || "Pasta", color: typeof f.color === "string" && HEX.test(f.color) ? f.color : "#6A3FD1" }));
}

/** Clareia/escurece uma cor #rrggbb (k > 0 clareia). */
export function shade(hex: string, k: number): string {
  if (!HEX.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Fundo CSS da capa (para os estilos que não mostram a primeira página). */
export function coverCss(c: Cover, color: string): string {
  const c2 = c.color2 ?? shade(color, -0.45);
  if (c.style === "solid") return color;
  if (c.style === "gradient") return `linear-gradient(145deg, ${shade(color, 0.25)} 0%, ${color} 45%, ${c2} 100%)`;
  const light = "rgba(255,255,255,.22)";
  switch (c.pattern ?? "dots") {
    case "stripes": return `repeating-linear-gradient(90deg, ${light} 0 10px, transparent 10px 22px), ${color}`;
    case "grid": return `repeating-linear-gradient(0deg, ${light} 0 2px, transparent 2px 18px), repeating-linear-gradient(90deg, ${light} 0 2px, transparent 2px 18px), ${color}`;
    case "waves": return `radial-gradient(circle at 50% 0, transparent 12px, ${light} 13px 15px, transparent 16px) 0 0/32px 16px, ${color}`;
    case "diag": return `repeating-linear-gradient(45deg, ${light} 0 6px, transparent 6px 16px), ${color}`;
    default: return `radial-gradient(${light} 2.5px, transparent 3px) 0 0/16px 16px, ${color}`;
  }
}

/** Papéis novos (0.11) usados pela tela inicial. */
export const STUDY_PAPERS: { kind: PaperKind; bg: string; label: string }[] = [
  { kind: "cornell", bg: "#FFFFFF", label: "Cornell" },
  { kind: "header", bg: "#FFFFFF", label: "Cabeçalho" },
  { kind: "music", bg: "#FFFFFF", label: "Partitura" },
  { kind: "calligraphy", bg: "#F6EEDF", label: "Caligrafia" },
];
