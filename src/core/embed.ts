// Incorporados do caderno: reconhecimento de links do YouTube e montagem das URLs (puro, sem DOM).

export interface YouTubeRef { id: string; /** segundo inicial (0 = começo) */ start: number }

const VIDEO_ID = /^[\w-]{11}$/;

/** "90", "90s", "1m30s", "1h2m3s" → segundos. */
export function parseStart(v: string | null | undefined): number {
  if (!v) return 0;
  if (/^\d+$/.test(v)) return Number(v);
  const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Reconhece watch?v=, youtu.be/, /shorts/, /embed/, /live/ e músicas; devolve null para qualquer outra coisa. */
export function parseYouTube(input: string): YouTubeRef | null {
  let u: URL;
  try { u = new URL(input.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0] || null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else { const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/); if (m) id = m[1]; }
  }
  if (!id || !VIDEO_ID.test(id)) return null;
  return { id, start: parseStart(u.searchParams.get("t") ?? u.searchParams.get("start")) };
}

/** Miniatura (16:9 com tarjas pretas em cima e embaixo; o renderer corta). */
export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** Player embutido (domínio sem cookies de rastreio). */
export const youtubeEmbed = (r: YouTubeRef) =>
  `https://www.youtube-nocookie.com/embed/${r.id}?autoplay=1&rel=0&playsinline=1${r.start ? `&start=${r.start}` : ""}`;

export const youtubeWatch = (r: YouTubeRef) => `https://www.youtube.com/watch?v=${r.id}${r.start ? `&t=${r.start}s` : ""}`;

// ---------------- PDF: páginas, carrossel e rolagem ----------------

export const PDF_GAP = 10;

export const clampPage = (p: number, count: number) => Math.min(Math.max(1, Math.floor(count)), Math.max(1, Math.round(p)));

/** Modo rolagem: páginas empilhadas com a largura do objeto. `slot` = altura de cada página; `step` = passo entre elas. */
export function scrollLayout(w: number, ratio: number, count: number) {
  const slot = w * ratio;
  const step = slot + PDF_GAP;
  return { slot, step, total: count * slot + Math.max(0, count - 1) * PDF_GAP };
}

export const maxScroll = (total: number, viewH: number) => Math.max(0, total - viewH);
export const clampScroll = (y: number, total: number, viewH: number) => Math.min(maxScroll(total, viewH), Math.max(0, y));

/** Páginas (1..count) que aparecem na janela [scroll, scroll + viewH]. */
export function visiblePages(scroll: number, viewH: number, step: number, count: number): number[] {
  const out: number[] = [];
  const first = Math.max(0, Math.floor(scroll / step));
  for (let i = first; i < count; i++) {
    const top = i * step;
    if (top >= scroll + viewH) break;
    out.push(i + 1);
  }
  return out;
}

/** Página sob o centro da janela (o "3 / 12" do indicador na rolagem). */
export const pageAtScroll = (scroll: number, viewH: number, step: number, count: number) =>
  clampPage(Math.floor((scroll + viewH / 2) / step) + 1, count);

/** Encaixa uma imagem w×h dentro de um quadro boxW×boxH, centralizada e sem esticar. */
export function fitContain(boxW: number, boxH: number, w: number, h: number) {
  const k = Math.min(boxW / w, boxH / h);
  const fw = w * k, fh = h * k;
  return { w: fw, h: fh, x: (boxW - fw) / 2, y: (boxH - fh) / 2 };
}
