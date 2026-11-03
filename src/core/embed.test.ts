import { describe, expect, it } from "vitest";
import { normalizeDoc } from "./model";
import { clampPage, clampScroll, fitContain, maxScroll, pageAtScroll, parseStart, parseYouTube, scrollLayout, visiblePages, youtubeEmbed, youtubeThumb, youtubeWatch } from "./embed";

describe("YouTube", () => {
  const ID = "dQw4w9WgXcQ";
  it("reconhece os formatos comuns de link", () => {
    for (const u of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}&list=PL1`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?si=abc`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `  https://youtu.be/${ID}  `,
    ]) expect(parseYouTube(u)?.id, u).toBe(ID);
  });
  it("rejeita o que não é vídeo", () => {
    for (const u of [
      "https://www.youtube.com/", "https://www.youtube.com/watch?v=curto", "https://www.youtube.com/@canal",
      "https://vimeo.com/123456789", "https://exemplo.com/watch?v=dQw4w9WgXcQ", "https://evil-youtube.com/watch?v=dQw4w9WgXcQ",
      "javascript:alert(1)", "texto qualquer", "",
    ]) expect(parseYouTube(u), u).toBeNull();
  });
  it("lê o tempo inicial", () => {
    expect(parseStart("90")).toBe(90);
    expect(parseStart("1m30s")).toBe(90);
    expect(parseStart("1h2m3s")).toBe(3723);
    expect(parseStart("lixo")).toBe(0);
    expect(parseYouTube("https://youtu.be/dQw4w9WgXcQ?t=42")?.start).toBe(42);
    expect(parseYouTube("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m5s")?.start).toBe(65);
  });
  it("monta as URLs", () => {
    const r = { id: ID, start: 0 };
    expect(youtubeThumb(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
    expect(youtubeEmbed(r)).toContain(`youtube-nocookie.com/embed/${ID}?autoplay=1`);
    expect(youtubeEmbed(r)).not.toContain("start=");
    expect(youtubeEmbed({ ...r, start: 30 })).toContain("&start=30");
    expect(youtubeWatch({ ...r, start: 30 })).toBe(`https://www.youtube.com/watch?v=${ID}&t=30s`);
  });
});

describe("anexo de vídeo no arquivo", () => {
  const doc = (att: Record<string, unknown>) => ({
    version: 1, id: "d", title: "t",
    pages: [{ id: "p", name: "1", paper: "blank", background: "#ffffff", elements: [{ id: "a", type: "attachment", x: 0, y: 0, w: 480, h: 270, mime: "x", opacity: 1, ...att }] }],
  });
  const kindOf = (att: Record<string, unknown>) => {
    const el = normalizeDoc(doc(att)).pages[0].elements[0];
    return el && el.type === "attachment" ? el.kind : null;
  };
  it("mantém vídeo válido", () => expect(kindOf({ kind: "video", title: "v", url: "https://youtu.be/dQw4w9WgXcQ" })).toBe("video"));
  it("vídeo com link inválido vira cartão de link", () => expect(kindOf({ kind: "video", title: "v", url: "https://exemplo.com" })).toBe("link"));
  it("PDF sem conteúdo embutido vira arquivo", () => expect(kindOf({ kind: "pdf", title: "p", url: "p.pdf" })).toBe("file"));
  it("tipo desconhecido vira arquivo", () => expect(kindOf({ kind: "zzz", title: "p", url: "x" })).toBe("file"));
});


describe("PDF: páginas e rolagem", () => {
  it("clampPage fica entre 1 e o total", () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(11, 10)).toBe(10);
    expect(clampPage(3.4, 10)).toBe(3);
    expect(clampPage(5, 0)).toBe(1);
  });
  it("layout de rolagem soma páginas e espaços", () => {
    const L = scrollLayout(400, 1.5, 3); // páginas de 600 px, vão de 10
    expect(L.slot).toBe(600);
    expect(L.step).toBe(610);
    expect(L.total).toBe(3 * 600 + 2 * 10);
    expect(scrollLayout(400, 1.5, 1).total).toBe(600);
  });
  it("limita a rolagem ao conteúdo", () => {
    expect(maxScroll(1820, 600)).toBe(1220);
    expect(maxScroll(300, 600)).toBe(0);
    expect(clampScroll(-5, 1820, 600)).toBe(0);
    expect(clampScroll(5000, 1820, 600)).toBe(1220);
  });
  it("lista só as páginas visíveis", () => {
    // passo 610, janela de 600 px
    expect(visiblePages(0, 600, 610, 10)).toEqual([1]);
    expect(visiblePages(300, 600, 610, 10)).toEqual([1, 2]);
    expect(visiblePages(610, 600, 610, 10)).toEqual([2]);
    expect(visiblePages(5000, 600, 610, 3)).toEqual([]);
    expect(visiblePages(0, 2000, 610, 3)).toEqual([1, 2, 3]);
  });
  it("página sob o centro da janela", () => {
    expect(pageAtScroll(0, 600, 610, 10)).toBe(1);
    expect(pageAtScroll(400, 600, 610, 10)).toBe(2); // centro em 700 → 2ª página
    expect(pageAtScroll(99999, 600, 610, 10)).toBe(10);
  });
  it("fitContain centraliza sem esticar", () => {
    const f = fitContain(200, 100, 50, 100); // página em pé num quadro largo
    expect(f).toEqual({ w: 50, h: 100, x: 75, y: 0 });
    const g = fitContain(100, 100, 200, 100);
    expect(g).toEqual({ w: 100, h: 50, x: 0, y: 25 });
  });
});

describe("anexo PDF no arquivo", () => {
  it("mantém PDF com conteúdo e sanitiza páginas, proporção e modo", () => {
    const d = normalizeDoc({
      version: 1,
      pages: [{ id: "p", name: "1", paper: "blank", background: "#ffffff", elements: [
        { id: "a", type: "attachment", x: 0, y: 0, w: 420, h: 594, mime: "application/pdf", opacity: 1, kind: "pdf", title: "t", url: "t.pdf", data: "data:application/pdf;base64,AAAA", pages: -3, ratio: 99, mode: "zzz" },
      ] }],
    });
    const el = d.pages[0].elements[0];
    expect(el.type === "attachment" && el.kind).toBe("pdf");
    expect(el.type === "attachment" && el.pages).toBe(1);
    expect(el.type === "attachment" && el.ratio).toBe(4);
    expect(el.type === "attachment" && el.mode).toBe("carousel");
  });
});
