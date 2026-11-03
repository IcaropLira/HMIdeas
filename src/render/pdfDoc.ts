// PDF no canvas: abre o documento com o pdf.js (carregado sob demanda, fora do pacote principal) e
// transforma cada página em textura do Pixi, só quando ela aparece, com limite de páginas na memória.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { Texture } from "pixi.js";
import { createLoaderCache } from "../core/loaderCache";

interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void> };
}
interface PdfDocument { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> }

(pdfjs as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerUrl;

/** Largura em pixels em que cada página é rasterizada (nítido até ~2× de zoom num objeto de 560 px). */
const PAGE_PX = 1400;
/** Texturas de página mantidas por documento (as mais antigas são destruídas). */
const MAX_PAGES = 14;

const toBytes = (dataUrl: string): Uint8Array => {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const docs = createLoaderCache<PdfDocument>(async (src) => {
  const task = (pdfjs as { getDocument: (o: { data: Uint8Array }) => { promise: Promise<PdfDocument> } }).getDocument({ data: toBytes(src) });
  return task.promise;
});

interface PageStore { cache: ReturnType<typeof createLoaderCache<Texture>>; lru: number[]; failed: Set<number> }
const stores = new Map<string, PageStore>();

function store(src: string): PageStore {
  let s = stores.get(src);
  if (!s) {
    s = {
      cache: createLoaderCache<Texture>(async (k) => {
        const doc = await docs.get(src);
        if (!doc) return null;
        const page = await doc.getPage(Number(k));
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: Math.min(3, PAGE_PX / base.width) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(vp.width));
        canvas.height = Math.max(1, Math.ceil(vp.height));
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.fillStyle = "#ffffff"; // páginas de PDF costumam ser transparentes
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        return Texture.from(canvas);
      }),
      lru: [],
      failed: new Set(),
    };
    stores.set(src, s);
  }
  return s;
}

/** Página 1: quantas páginas tem e a proporção altura/largura (null se o PDF não abre). */
export async function probePdf(src: string): Promise<{ pages: number; ratio: number } | null> {
  const doc = await docs.get(src);
  if (!doc) return null;
  try {
    const vp = (await doc.getPage(1)).getViewport({ scale: 1 });
    return { pages: doc.numPages, ratio: vp.height / vp.width };
  } catch { return null; }
}

const touch = (s: PageStore, n: number) => { const i = s.lru.indexOf(n); if (i >= 0) s.lru.splice(i, 1); s.lru.push(n); };

/** Textura da página se já está pronta (e marca como usada agora). */
export function peekPage(src: string, n: number): Texture | undefined {
  const s = stores.get(src);
  const t = s?.cache.peek(String(n));
  if (s && t) touch(s, n);
  return t;
}

export const pageFailed = (src: string, n: number) => !!stores.get(src)?.failed.has(n);

/** Carrega a página (uma vez só). Falha fica registrada para não ficar tentando em loop. */
export async function loadPage(src: string, n: number): Promise<Texture | null> {
  const s = store(src);
  if (s.failed.has(n)) return null;
  const t = await s.cache.get(String(n));
  if (!t) { s.failed.add(n); return null; }
  touch(s, n);
  while (s.lru.length > MAX_PAGES) {
    const old = s.lru.shift();
    if (old !== undefined) { try { s.cache.take(String(old))?.destroy(true); } catch { /* já destruída */ } }
  }
  return t;
}

/** Libera tudo (ao destruir o renderer). */
export function clearPdf() {
  for (const s of stores.values()) for (const t of s.cache.values()) { try { t.destroy(true); } catch { /* já destruída */ } }
  stores.clear();
  for (const d of docs.values()) void d.destroy().catch(() => undefined);
  docs.clear();
}
