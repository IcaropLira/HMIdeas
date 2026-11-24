import { describe, expect, it } from "vitest";
import { approxMeasure, childrenMap, mapFromOutline, parseOutline, toOutline } from "./mindmap";
import { HirakuElement, NodeElement, createPage, normalizeDoc } from "./model";
import { allLinks, applyOutline, backlinks, gridSlots, notebookGraph, selectByProperty, sortUnits } from "./organize";

const mk = () => mapFromOutline([], parseOutline("- Tema\n  - A\n    - a1\n  - B"), { x: 0, y: 0 }, approxMeasure)!;
const texts = (els: HirakuElement[]) => els.filter((e): e is NodeElement => e.type === "node").map((n) => n.text);

describe("organização (0.15)", () => {
  it("modo tópicos reaproveita nós, cria e apaga", () => {
    const a = mk();
    const before = a.elements.filter((e) => e.type === "node") as NodeElement[];
    const styled = a.elements.map((e) => (e.type === "node" && e.text === "A" ? { ...e, fill: "#ff0000" } : e));
    const out = applyOutline(styled, a.id, parseOutline("- Tema novo\n  - A\n  - C\n    - c1"), approxMeasure);
    expect(texts(out).sort()).toEqual(["A", "C", "Tema novo", "c1"].sort());
    // o nó "A" (2º na leitura) manteve id e cor
    const A = out.find((e) => e.type === "node" && e.text === "A") as NodeElement;
    expect(A.id).toBe(before[1].id);
    expect(A.fill).toBe("#ff0000");
    // a hierarquia bate com a lista
    expect(toOutline(out, a.id).trim().split("\n")).toEqual(["- Tema novo", "  - A", "  - C", "    - c1"]);
    expect(childrenMap(out).get(null)!.map((n) => n.id)).toEqual([a.id]);
  });
  it("links internos, referências e grafo", () => {
    const p1 = createPage("Um"), p2 = createPage("Dois"), p3 = createPage("Três");
    const t = { id: "t", type: "text", x: 0, y: 0, w: 50, h: 20, angle: 0, text: "Veja", fontSize: 18, fontFamily: "sans", align: "left", color: "#000000", opacity: 1, linkTo: { page: p2.id } };
    const board = { id: "b", type: "attachment", x: 0, y: 0, w: 260, h: 170, kind: "block", title: "", url: "", mime: "", opacity: 1, block: { kind: "board", title: "Sub", pageId: p3.id, note: "", color: "#2F7FD3" } };
    const doc = normalizeDoc({ version: 1, pages: [{ ...p1, elements: [t, board] }, { ...p2, elements: [{ ...t, id: "t2", linkTo: { page: "sumiu" } }] }, { ...p3, parentPage: p1.id }] });
    expect(allLinks(doc).map((l) => l.to.page)).toEqual([p2.id, p3.id]);
    expect(backlinks(doc, p2.id).map((l) => l.fromEl)).toEqual(["t"]);
    expect(doc.pages[2].parentPage).toBe(p1.id);
    const g = notebookGraph(doc);
    expect(g.edges).toHaveLength(2);
    for (const n of g.nodes) { expect(n.x).toBeGreaterThanOrEqual(30); expect(n.y).toBeLessThanOrEqual(420 - 30 + 1e-9 + 30); }
    expect(normalizeDoc({ version: 1, pages: [{ ...p1, elements: [{ ...t, linkTo: { page: 3 } }] }] }).pages[0].elements[0].linkTo).toBeUndefined();
  });
  it("organizar por cor e em grade; selecionar parecidos", () => {
    const sq = (id: string, fill: string, x: number) => ({ id, type: "rect", x, y: 0, w: 40, h: 40, angle: 0, stroke: "#000000", strokeWidth: 2, strokeStyle: "solid", fill, rounded: false, opacity: 1 });
    const page = normalizeDoc({ version: 1, pages: [{ ...createPage(), elements: [sq("b", "#0000ff", 0), sq("r", "#ff0000", 100), sq("g", "#00ff00", 200), sq("r2", "#ff0000", 300)] }] }).pages[0];
    const units = page.elements.map((e) => ({ id: e.id, els: [e] }));
    expect(sortUnits(units, "color").map((u) => u.id)).toEqual(["r", "r2", "g", "b"]);
    expect(gridSlots([{ w: 10, h: 10 }, { w: 20, h: 10 }, { w: 10, h: 30 }, { w: 10, h: 10 }], 0, 0, 5)).toEqual([{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 0, y: 15 }, { x: 15, y: 15 }]);
    expect(selectByProperty(page, page.elements, ["r"], "color").sort()).toEqual(["r", "r2"]);
    expect(selectByProperty(page, page.elements, ["r"], "brush")).toEqual([]);
  });
});
