// Novo documento (0.18), parte pura: como o "Novo documento" do Photoshop / "Nova tela" do Clip Studio e do Krita.
// Tamanho em px, polegadas, cm, mm, pontos ou paicas + resolução (ppi ou px/cm) → folha em PIXELS do documento
// (1 unidade do mundo = 1 px do arquivo), modo de cor, profundidade, fundo e várias páginas (pranchetas).
import { DEFAULT_BACKGROUND, DocMeta, HirakuDoc, Page, PaperKind, createPage } from "./model";

export type Unit = "px" | "in" | "cm" | "mm" | "pt" | "pica";
export type ResUnit = "ppi" | "ppcm";
export type ColorMode = "rgb" | "gray";
export type BgKind = "white" | "black" | "transparent" | "custom";

export const UNITS: { id: Unit; label: string }[] = [
  { id: "px", label: "Pixels" }, { id: "in", label: "Polegadas" }, { id: "cm", label: "Centímetros" },
  { id: "mm", label: "Milímetros" }, { id: "pt", label: "Pontos" }, { id: "pica", label: "Paicas" },
];
export const MAX_PX = 30000;
export const MAX_PAGES = 200;

/** Polegadas por unidade (px depende da resolução). */
const INCH: Record<Exclude<Unit, "px">, number> = { in: 1, cm: 1 / 2.54, mm: 1 / 25.4, pt: 1 / 72, pica: 1 / 6 };

/** ppi a partir do valor e da unidade da resolução. */
export const ppi = (res: number, unit: ResUnit) => (unit === "ppcm" ? res * 2.54 : res);

export function toPx(v: number, unit: Unit, dpi: number): number {
  if (!Number.isFinite(v)) return 0;
  return unit === "px" ? v : v * INCH[unit] * dpi;
}
export function fromPx(px: number, unit: Unit, dpi: number): number {
  return unit === "px" ? px : px / (INCH[unit] * dpi);
}
/** Arredonda para mostrar no campo (px inteiro; outras unidades com até 3 casas). */
export const tidy = (v: number, unit: Unit) => (unit === "px" ? Math.round(v) : Math.round(v * 1000) / 1000);

export interface DocSpec {
  name: string;
  width: number;
  height: number;
  unit: Unit;
  resolution: number;
  resUnit: ResUnit;
  colorMode: ColorMode;
  bitDepth: 8 | 16 | 32;
  bg: BgKind;
  bgColor: string;
  /** Pranchetas: quantas páginas do mesmo tamanho. */
  pages: number;
  paper: PaperKind;
  /** Quadro infinito (sem folha). */
  infinite?: boolean;
}

export type DocCat = "recent" | "saved" | "photo" | "print" | "art" | "web" | "mobile" | "film" | "notes";
export const DOC_CATS: { id: DocCat; label: string }[] = [
  { id: "recent", label: "Recentes" }, { id: "saved", label: "Salvos" }, { id: "photo", label: "Foto" }, { id: "print", label: "Impressão" },
  { id: "art", label: "Arte e ilustração" }, { id: "web", label: "Web" }, { id: "mobile", label: "Celular" }, { id: "film", label: "Filme e vídeo" },
  { id: "notes", label: "Caderno" },
];

export interface DocPreset { id: string; cat: DocCat; label: string; w: number; h: number; unit: Unit; dpi: number; bg?: BgKind; paper?: PaperKind; pages?: number; infinite?: boolean }

const P = (cat: DocCat, id: string, label: string, w: number, h: number, unit: Unit, dpi: number, extra: Partial<DocPreset> = {}): DocPreset => ({ id, cat, label, w, h, unit, dpi, ...extra });

export const DOC_PRESETS: DocPreset[] = [
  P("photo", "photo-default", "Padrão do Photoshop", 7, 5, "in", 300),
  P("photo", "photo-2x3", "Paisagem 2 × 3", 3, 2, "in", 300),
  P("photo", "photo-4x6", "Paisagem 4 × 6", 6, 4, "in", 300),
  P("photo", "photo-5x7", "Paisagem 5 × 7", 7, 5, "in", 300),
  P("photo", "photo-8x10", "Paisagem 8 × 10", 10, 8, "in", 300),
  P("photo", "photo-10x15", "Foto 10 × 15 cm", 15, 10, "cm", 300),
  P("photo", "photo-square", "Quadrado 8 × 8", 8, 8, "in", 300),
  P("print", "print-a4", "A4", 210, 297, "mm", 300),
  P("print", "print-a3", "A3", 297, 420, "mm", 300),
  P("print", "print-a5", "A5", 148, 210, "mm", 300),
  P("print", "print-b5", "B5", 176, 250, "mm", 300),
  P("print", "print-letter", "Carta", 8.5, 11, "in", 300),
  P("print", "print-legal", "Ofício (Legal)", 8.5, 14, "in", 300),
  P("print", "print-tabloid", "Tabloide", 11, 17, "in", 300),
  P("print", "print-card", "Cartão de visita", 90, 50, "mm", 300),
  P("print", "print-poster", "Pôster 18 × 24", 18, 24, "in", 300),
  P("art", "art-a4-350", "Ilustração A4 (350 ppi)", 210, 297, "mm", 350),
  P("art", "art-hd", "Tela 1920 × 1080", 1920, 1080, "px", 72),
  P("art", "art-4k", "Tela 4K", 3840, 2160, "px", 144),
  P("art", "art-manga", "Página de mangá B4 (600 ppi)", 257, 364, "mm", 600),
  P("art", "art-comic", "Página de HQ americana", 6.625, 10.25, "in", 600),
  P("art", "art-webtoon", "Webtoon (episódio)", 800, 12800, "px", 72),
  P("art", "art-square", "Quadrado 3000 px", 3000, 3000, "px", 300),
  P("art", "art-poster", "Pôster A2", 420, 594, "mm", 300),
  P("web", "web-common", "Web mais comum", 1366, 768, "px", 72),
  P("web", "web-fhd", "Web grande 1920 × 1080", 1920, 1080, "px", 72),
  P("web", "web-mac", "MacBook Pro 14\"", 1512, 982, "px", 72),
  P("web", "web-min", "Web mínima", 1024, 768, "px", 72),
  P("web", "web-ig", "Post Instagram", 1080, 1080, "px", 72),
  P("web", "web-ig45", "Instagram retrato 4:5", 1080, 1350, "px", 72),
  P("web", "web-story", "Story / Reels", 1080, 1920, "px", 72),
  P("web", "web-yt", "Miniatura do YouTube", 1280, 720, "px", 72),
  P("web", "web-banner", "Banner 728 × 90", 728, 90, "px", 72),
  P("mobile", "mob-iphone", "iPhone 15 Pro", 1179, 2556, "px", 460),
  P("mobile", "mob-iphonemax", "iPhone 15 Pro Max", 1290, 2796, "px", 460),
  P("mobile", "mob-android", "Android (1080 × 2400)", 1080, 2400, "px", 420),
  P("mobile", "mob-ipad", "iPad Pro 12.9\"", 2048, 2732, "px", 264),
  P("mobile", "mob-tab", "Tablet Android", 1600, 2560, "px", 320),
  P("mobile", "mob-watch", "Apple Watch 45 mm", 396, 484, "px", 326),
  P("film", "film-1080", "HDTV 1080p", 1920, 1080, "px", 72),
  P("film", "film-720", "HDTV 720p", 1280, 720, "px", 72),
  P("film", "film-4k", "UHD 4K", 3840, 2160, "px", 72),
  P("film", "film-8k", "UHD 8K", 7680, 4320, "px", 72),
  P("film", "film-2k", "Cinema DCI 2K", 2048, 1080, "px", 72),
  P("film", "film-vertical", "Vertical 9:16", 1080, 1920, "px", 72),
  P("film", "film-storyboard", "Storyboard 16:9 (6 quadros)", 1920, 1080, "px", 72, { pages: 6 }),
  P("notes", "notes-a4", "Caderno A4 pautado", 794, 1123, "px", 96, { paper: "ruled" }),
  P("notes", "notes-cornell", "Cornell A4", 794, 1123, "px", 96, { paper: "cornell" }),
  P("notes", "notes-grid", "Quadriculado A4", 794, 1123, "px", 96, { paper: "grid" }),
  P("notes", "notes-dots", "Bullet journal A5", 559, 794, "px", 96, { paper: "dots" }),
  P("notes", "notes-slides", "Apresentação 16:9", 1280, 720, "px", 96),
  P("notes", "notes-infinite", "Quadro infinito", 1920, 1080, "px", 96, { infinite: true }),
];

/** Especificação a partir de um modelo. */
export function presetSpec(p: DocPreset, name = "Sem título"): DocSpec {
  return {
    name, width: p.w, height: p.h, unit: p.unit, resolution: p.dpi, resUnit: "ppi", colorMode: "rgb", bitDepth: 8,
    bg: p.bg ?? "white", bgColor: "#FFFFFF", pages: p.pages ?? 1, paper: p.paper ?? "blank", infinite: p.infinite,
  };
}
export const DEFAULT_SPEC = presetSpec(DOC_PRESETS[0], "Sem título-1");

/** Tamanho em pixels (inteiros, limitados). */
export function specPx(s: DocSpec): { w: number; h: number } {
  const dpi = ppi(s.resolution, s.resUnit);
  const c = (v: number) => Math.max(1, Math.min(MAX_PX, Math.round(v)));
  return { w: c(toPx(s.width, s.unit, dpi)), h: c(toPx(s.height, s.unit, dpi)) };
}

/** Problemas que impedem criar (mensagens em português). */
export function specErrors(s: DocSpec): string[] {
  const out: string[] = [];
  const dpi = ppi(s.resolution, s.resUnit);
  if (!(s.width > 0) || !(s.height > 0)) out.push("Largura e altura precisam ser maiores que zero.");
  if (!(dpi >= 1 && dpi <= 9999)) out.push("A resolução precisa estar entre 1 e 9999 ppi.");
  const w = toPx(s.width, s.unit, dpi), h = toPx(s.height, s.unit, dpi);
  if (w > MAX_PX || h > MAX_PX) out.push(`Cada lado pode ter no máximo ${MAX_PX.toLocaleString("pt-BR")} px (este teria ${Math.round(Math.max(w, h)).toLocaleString("pt-BR")} px).`);
  if (!(s.pages >= 1 && s.pages <= MAX_PAGES)) out.push(`Entre 1 e ${MAX_PAGES} páginas.`);
  return out;
}

/** Texto curto do tamanho ("7 × 5 pol @ 300 ppi"). */
export function sizeLabel(p: { w: number; h: number; unit: Unit; dpi: number; infinite?: boolean }): string {
  if (p.infinite) return "sem bordas";
  const u = { px: "px", in: "pol", cm: "cm", mm: "mm", pt: "pt", pica: "pc" }[p.unit];
  const n = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000).replace(".", ","));
  return p.unit === "px" ? `${n(p.w)} × ${n(p.h)} px` : `${n(p.w)} × ${n(p.h)} ${u} @ ${p.dpi} ppi`;
}

/** Tamanho estimado do arquivo descomprimido (como o "Tamanho da imagem" do Photoshop). */
export function memLabel(s: DocSpec): string {
  const { w, h } = specPx(s);
  const ch = s.colorMode === "gray" ? 1 : 3, bytes = w * h * ch * (s.bitDepth / 8) * Math.max(1, s.pages);
  const K = 1024, f = (v: number) => v.toFixed(1).replace(".", ",");
  return bytes >= K ** 3 ? `${f(bytes / K ** 3)} GB` : bytes >= K ** 2 ? `${f(bytes / K ** 2)} MB` : `${Math.max(1, Math.round(bytes / K))} KB`;
}

export const swapOrientation = (s: DocSpec): DocSpec => ({ ...s, width: s.height, height: s.width });
export const isLandscape = (s: Pick<DocSpec, "width" | "height">) => s.width > s.height;

/** Troca a unidade mantendo o tamanho físico/em pixels. */
export function changeUnit(s: DocSpec, unit: Unit): DocSpec {
  const dpi = ppi(s.resolution, s.resUnit);
  return { ...s, unit, width: tidy(fromPx(toPx(s.width, s.unit, dpi), unit, dpi), unit), height: tidy(fromPx(toPx(s.height, s.unit, dpi), unit, dpi), unit) };
}

/** Documento pronto: páginas do tamanho em px, fundo, papel e metadados (dpi, unidade, modo de cor). */
export function specToDoc(s: DocSpec): HirakuDoc {
  const { w, h } = specPx(s);
  const bg = s.bg === "black" ? "#000000" : s.bg === "custom" ? s.bgColor : "#FFFFFF";
  const label = s.unit === "px" ? `${w} × ${h} px` : sizeLabel({ w: s.width, h: s.height, unit: s.unit, dpi: Math.round(ppi(s.resolution, s.resUnit)) });
  const n = Math.max(1, Math.min(MAX_PAGES, Math.round(s.pages)));
  const pages: Page[] = Array.from({ length: n }, (_, i) => ({
    ...createPage(n > 1 ? `Prancheta ${i + 1}` : "Página 1"),
    paper: s.paper,
    background: s.infinite ? (s.bg === "transparent" ? DEFAULT_BACKGROUND : bg) : bg,
    ...(s.infinite ? {} : { size: { w, h, name: label } }),
    ...(s.bg === "transparent" && !s.infinite ? { transparent: true } : {}),
  }));
  const meta: DocMeta = { title: s.name.trim().slice(0, 80) || "Sem título", dpi: Math.round(ppi(s.resolution, s.resUnit) * 100) / 100, unit: s.unit, colorMode: s.colorMode, bitDepth: s.bitDepth };
  return { version: 1, pages, meta };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanSpec(raw: any): DocSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
  const s: DocSpec = {
    name: typeof raw.name === "string" ? raw.name.slice(0, 80) : "Sem título",
    width: num(raw.width, 1920), height: num(raw.height, 1080),
    unit: UNITS.some((u) => u.id === raw.unit) ? raw.unit : "px",
    resolution: num(raw.resolution, 72), resUnit: raw.resUnit === "ppcm" ? "ppcm" : "ppi",
    colorMode: raw.colorMode === "gray" ? "gray" : "rgb", bitDepth: raw.bitDepth === 16 || raw.bitDepth === 32 ? raw.bitDepth : 8,
    bg: ["white", "black", "transparent", "custom"].includes(raw.bg) ? raw.bg : "white",
    bgColor: typeof raw.bgColor === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.bgColor) ? raw.bgColor : "#FFFFFF",
    pages: Math.max(1, Math.min(MAX_PAGES, Math.round(num(raw.pages, 1)))),
    paper: typeof raw.paper === "string" ? raw.paper : "blank", infinite: raw.infinite === true || undefined,
  };
  return specErrors(s).length ? null : s;
}

/** Tamanho da tela (Canvas Size): deslocamento dos elementos para a âncora escolhida (0..2 em x e y). */
export function anchorOffset(oldW: number, oldH: number, newW: number, newH: number, ax: 0 | 1 | 2, ay: 0 | 1 | 2) {
  return { dx: ((newW - oldW) * ax) / 2, dy: ((newH - oldH) * ay) / 2 };
}
