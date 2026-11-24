// Importar PDF como páginas (0.16): cada página do PDF vira uma página do caderno, do mesmo tamanho, com a imagem da
// página numa camada travada "PDF" e uma camada "Anotações" por cima para escrever. Carregado sob demanda.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { AttachmentElement, Page, createPage, makeLayer, newId } from "../core/model";

interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void> };
}
interface PdfDocument { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> }

(pdfjs as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerUrl;

/** Lê o PDF e devolve as páginas prontas (a resolução segue `quality`: 1.5 ≈ 144 dpi). */
export async function pdfToPages(bytes: Uint8Array, name: string, onProgress?: (done: number, total: number) => void, quality = 1.6, maxPages = 300): Promise<Page[]> {
  const doc = await (pdfjs as unknown as { getDocument: (o: { data: Uint8Array }) => { promise: Promise<PdfDocument> } }).getDocument({ data: bytes }).promise;
  const total = Math.min(doc.numPages, maxPages);
  const out: Page[] = [];
  try {
    for (let i = 1; i <= total; i++) {
      const pg = await doc.getPage(i);
      const base = pg.getViewport({ scale: 1 }); // pontos
      const w = Math.round((base.width * 96) / 72), h = Math.round((base.height * 96) / 72);
      const vp = pg.getViewport({ scale: quality * (96 / 72) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      const data = canvas.toDataURL("image/jpeg", 0.86);
      const pdfLayer = { ...makeLayer("PDF"), locked: true }, ink = makeLayer("Anotações");
      const img: AttachmentElement = { id: newId(), type: "attachment", layerId: pdfLayer.id, frameId: null, x: 0, y: 0, w, h, kind: "image", title: `${name} · p. ${i}`, url: "", mime: "image/jpeg", data, opacity: 1, locked: true };
      out.push({ ...createPage(`${name} ${i}`), paper: "blank", background: "#FFFFFF", size: { w, h, name: "PDF" }, layers: [pdfLayer, ink], elements: [img] });
      onProgress?.(i, total);
      canvas.width = canvas.height = 0;
    }
  } finally { void doc.destroy(); }
  return out;
}
