// Salvar e abrir de novo um caderno com tudo o que é novo (camadas, papel, figuras, grafos, rótulos) não perde nada.
import { describe, expect, it } from "vitest";
import { buildGraphElements, parseGraph } from "./graph";
import { defaultFigure } from "./figures";
import { addLayer } from "./layers";
import { HirakuDoc, createPage } from "./model";
import { parseDoc, serializeDoc } from "./serialize";

describe("arquivo .hiraku", () => {
  it("ida e volta preserva camadas, papel, figuras e arestas com peso", () => {
    const base = createPage();
    const { page, id: layer2 } = addLayer(base);
    const graph = buildGraphElements(parseGraph("A - B : 3"), "circle").map((e) => ({ ...e, layerId: layer2 }));
    const fig = { id: "fig", type: "attachment" as const, x: 0, y: 0, w: 300, h: 260, kind: "figure" as const, title: "Cubo", url: "", mime: "application/x-hm-figure", figure: defaultFigure("cube"), opacity: 1 };
    const doc: HirakuDoc = {
      version: 1,
      pages: [{ ...page, paper: "iso", background: "#1F3B2D", paperScale: 1.5, lineColor: "#F2F4FA", layers: page.layers.map((l, i) => (i ? { ...l, locked: true, opacity: 0.5 } : { ...l, visible: false })), elements: [fig, ...graph] }],
    };
    const back = parseDoc(serializeDoc(doc));
    const p = back.pages[0];
    expect(p).toMatchObject({ paper: "iso", background: "#1F3B2D", paperScale: 1.5, lineColor: "#F2F4FA" });
    expect(p.layers.map((l) => [l.visible, l.locked, l.opacity])).toEqual([[false, false, 1], [true, true, 0.5]]);
    const f = p.elements.find((e) => e.id === "fig");
    expect(f && f.type === "attachment" && f.figure).toEqual(defaultFigure("cube"));
    const arrow = p.elements.find((e) => e.type === "arrow");
    expect(arrow && arrow.type === "arrow" && arrow.label).toBe("3");
    expect(p.elements.filter((e) => e.layerId === layer2)).toHaveLength(graph.length);
  });
});
