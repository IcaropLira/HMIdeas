import { describe, expect, it } from "vitest";
import { createPage, normalizeDoc } from "./model";
import { makePdf, pxToPt } from "./pdfWrite";
import { hashText, pruneList } from "./backups";
import { collectSettings, parseSettings } from "./settingsBundle";
import { contentBounds, exportSvg } from "../render/exportSvg";

describe("exportar/importar (0.16)", () => {
  it("SVG com texto escapado, papel e caixa certa", () => {
    const page = normalizeDoc({ version: 1, pages: [{ ...createPage(), paper: "ruled", background: "#FFFFFF", elements: [
      { id: "t", type: "text", x: 10, y: 20, w: 120, h: 30, angle: 0, text: "a < b & \"c\"", fontSize: 20, fontFamily: "sans", align: "left", color: "#000000", opacity: 1 },
      { id: "s", type: "stroke", points: [{ x: 0, y: 0, p: 0.5 }, { x: 50, y: 50, p: 0.5 }], color: "#ff0000", width: 3, sens: 0, taper: 0, brush: "pen", opacity: 1 },
    ] }] }).pages[0];
    const b = contentBounds(page.elements)!;
    expect(b.minX).toBeLessThanOrEqual(0);
    const svg = exportSvg(page.elements, { box: b, background: "#FFFFFF", paper: page, scale: 2 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("a &lt; b &amp; &quot;c&quot;");
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toMatch(/width="\d+/);
    expect(svg).not.toContain("NaN");
  });
  it("PDF bem formado (cabeçalho, páginas, xref, fim)", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = makePdf([{ w: pxToPt(794), h: pxToPt(1123), jpeg, iw: 2, ih: 2 }, { w: 100, h: 100, jpeg, iw: 1, ih: 1 }], "Teste (1)");
    const txt = new TextDecoder("latin1").decode(pdf);
    expect(txt.startsWith("%PDF-1.4")).toBe(true);
    expect(txt).toContain("/Count 2");
    expect(txt).toContain("/MediaBox [0 0 595.5 842.25]");
    expect(txt.trimEnd().endsWith("%%EOF")).toBe(true);
    const start = +/startxref\n(\d+)/.exec(txt)![1];
    expect(txt.slice(start, start + 4)).toBe("xref");
  });
  it("cópias: hash estável e poda por caderno", () => {
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
    const list = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, notebookId: "a", name: "", at: i, size: 1, pages: 1, hash: i }));
    const gone = pruneList([...list, { id: "b0", notebookId: "b", name: "", at: 0, size: 1, pages: 1, hash: 0 }], 15);
    expect(gone.sort()).toEqual(["a0", "a1", "a2", "a3", "a4"].sort());
  });
  it("pacote de configurações: só preferências, valida na volta", () => {
    const data: Record<string, string> = { "hm-ideas-theme-v1": "{}", "hmideas-tool": "{}", "hm-ideas:notebooks:active": "x", outro: "y" };
    const store = { length: 4, key: (i: number) => Object.keys(data)[i] ?? null, getItem: (k: string) => data[k] ?? null };
    const b = collectSettings(store, 1);
    expect(Object.keys(b.data).sort()).toEqual(["hm-ideas-theme-v1", "hmideas-tool"]);
    expect(parseSettings(JSON.stringify(b))).toEqual(b.data);
    expect(parseSettings("{}")).toBeNull();
    expect(parseSettings(JSON.stringify({ ...b, data: { outro: "z" } }))).toBeNull();
  });
});
