// PDF mínimo (0.16), sem dependências: uma imagem JPEG por página (DCTDecode), do tamanho da página. Puro.
// É o formato mais compatível para "imprimir/compartilhar" o caderno: o que se vê é o que sai.

export interface PdfPage {
  /** Tamanho da página em pontos (1/72"). */
  w: number;
  h: number;
  /** Bytes do JPEG e tamanho em pixels. */
  jpeg: Uint8Array;
  iw: number;
  ih: number;
}

const enc = new TextEncoder();

/** Monta o arquivo PDF 1.4 (objetos + tabela xref). */
export function makePdf(pages: PdfPage[], title = "HM Ideas"): Uint8Array {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const push = (b: Uint8Array | string) => { const u = typeof b === "string" ? enc.encode(b) : b; parts.push(u); len += u.length; };
  const obj = (n: number, body: (Uint8Array | string)[]) => { offsets[n] = len; push(`${n} 0 obj\n`); body.forEach(push); push("\nendobj\n"); };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const n = pages.length;
  // 1 catálogo, 2 páginas, 3 info; por página: página, conteúdo, imagem
  const pageObj = (i: number) => 4 + i * 3;
  obj(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  obj(2, [`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(" ")}] >>`]);
  const safeTitle = title.replace(/[()\\\r\n]/g, " ").replace(/[^\x20-\x7E]/g, "?");
  obj(3, [`<< /Title (${safeTitle}) /Producer (HM Ideas) >>`]);
  pages.forEach((p, i) => {
    const po = pageObj(i), co = po + 1, io = po + 2;
    const w = +p.w.toFixed(2), h = +p.h.toFixed(2);
    obj(po, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i} ${io} 0 R >> >> /Contents ${co} 0 R >>`]);
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q`;
    obj(co, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    obj(io, [`<< /Type /XObject /Subtype /Image /Width ${p.iw} /Height ${p.ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, "\nendstream"]);
  });
  const total = 4 + n * 3;
  const xref = len;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += `${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`;
  push(x);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let o = 0;
  for (const u of parts) { out.set(u, o); o += u.length; }
  return out;
}

/** Pixels do mundo (96 dpi) → pontos do PDF (72 dpi). */
/** Pixels → pontos do PDF. `dpi` = resolução do documento (0.18); sem ela, 96 (CSS). */
export const pxToPt = (px: number, dpi = 96) => (px * 72) / (dpi > 0 ? dpi : 96);
