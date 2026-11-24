import { describe, expect, it } from "vitest";
import { createPage, normalizeDoc, Page } from "./model";
import { buildIndex, cleanCover, cleanTemplates, coverCss, filterIndex, pageFromTemplate, pageToTemplate, reorderPages, rotatePage } from "./notebook";
import { drawPaperPattern } from "./paper";

const pages = (n: number) => Array.from({ length: n }, (_, i) => createPage(`P${i + 1}`));
const text = (id: string, t: string, fontSize: number, y: number) => ({ id, type: "text", x: 0, y, w: 100, h: 30, angle: 0, text: t, fontSize, fontFamily: "sans", align: "left", color: "#000000", opacity: 1 });

describe("cadernos (0.11)", () => {
  it("reordena páginas arrastando", () => {
    const ps = pages(4);
    expect(reorderPages(ps, ps[0].id, 3).map((p) => p.name)).toEqual(["P2", "P3", "P4", "P1"]);
    expect(reorderPages(ps, ps[3].id, 0).map((p) => p.name)).toEqual(["P4", "P1", "P2", "P3"]);
    expect(reorderPages(ps, ps[1].id, 1)).toBe(ps);
  });
  it("gira a folha e não mexe no quadro infinito", () => {
    const p: Page = { ...createPage(), size: { w: 794, h: 1123, name: "A4" } };
    const r = rotatePage(p);
    expect(r.size).toEqual({ w: 1123, h: 794, name: "A4 paisagem" });
    expect(rotatePage(r).size).toEqual({ w: 794, h: 1123, name: "A4" });
    const inf = createPage();
    expect(rotatePage(inf)).toBe(inf);
  });
  it("índice automático pega títulos em ordem e filtra", () => {
    const doc = normalizeDoc({ version: 1, pages: [
      { ...createPage("Aula 1"), bookmark: "#E0565B", elements: [text("b", "Sub", 24, 200), text("a", "Introdução", 36, 10), text("c", "corpo", 14, 300)] },
      { ...createPage("Aula 2"), starred: true, elements: [] },
    ] });
    const idx = buildIndex(doc);
    expect(idx[0].headings.map((h) => [h.text, h.level])).toEqual([["Introdução", 1], ["Sub", 2]]);
    expect(idx[0].bookmark).toBe("#E0565B");
    expect(filterIndex(idx, "introducao").map((e) => e.n)).toEqual([1]);
    expect(filterIndex(idx, "", "starred").map((e) => e.n)).toEqual([2]);
    expect(filterIndex(idx, "", "marked").map((e) => e.n)).toEqual([1, 2]);
  });
  it("normalizeDoc saneia marcador e favorita", () => {
    const d = normalizeDoc({ version: 1, pages: [{ ...createPage(), bookmark: "vermelho", starred: "sim" }] });
    expect(d.pages[0].bookmark).toBeUndefined();
    expect(d.pages[0].starred).toBeUndefined();
  });
  it("modelo de página gera ids novos a cada uso e sobrevive ao armazenamento", () => {
    const src = normalizeDoc({ version: 1, pages: [{ ...createPage("Semana"), paper: "cornell", elements: [text("t1", "Meta", 30, 0)] }] }).pages[0];
    const t = pageToTemplate(src, "Planner");
    const a = pageFromTemplate(t), b = pageFromTemplate(t);
    expect(a.paper).toBe("cornell");
    expect(a.id).not.toBe(b.id);
    expect(a.elements[0].id).not.toBe(b.elements[0].id);
    expect(a.layers[0].id).not.toBe(b.layers[0].id);
    const back = cleanTemplates(JSON.parse(JSON.stringify([t, { lixo: 1 }])));
    expect(back).toHaveLength(1);
    expect(back[0].name).toBe("Planner");
  });
  it("capas: saneia e gera CSS", () => {
    expect(cleanCover({ style: "xyz" })).toBeUndefined();
    expect(cleanCover({ style: "pattern", pattern: "waves", title: true })).toEqual({ style: "pattern", pattern: "waves", title: true, color2: undefined });
    expect(coverCss({ style: "gradient" }, "#6A3FD1")).toContain("linear-gradient");
    expect(coverCss({ style: "solid" }, "#6A3FD1")).toBe("#6A3FD1");
  });
  it("Cornell põe cabeçalho, coluna e resumo (com a altura da folha)", () => {
    let accents = 0;
    drawPaperPattern("cornell", { x: 0, y: 0, zoom: 1 }, 800, 1200, { line: (_a, _b, _c, _d, l) => { if (l === 2) accents++; }, dot: () => undefined }, { scale: 1, sheetH: 1123 });
    expect(accents).toBe(3);
  });
});
