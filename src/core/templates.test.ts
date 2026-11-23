import { describe, expect, it } from "vitest";
import { normalizeDoc } from "./model";
import { TEMPLATES, TEMPLATE_CATEGORIES, placeAt } from "./templates";
import { elementBounds } from "./selection";

describe("modelos prontos", () => {
  it("cada modelo gera elementos válidos, dentro de um quadro, com ids únicos", () => {
    for (const t of TEMPLATES) {
      const els = t.build();
      expect(els.length, t.id).toBeGreaterThan(1);
      if (t.category === "mapas") {
        // mapa mental: uma única raiz e todos os outros nós pendurados nela
        const nodes = els.filter((e) => e.type === "node");
        expect(nodes.length, t.id).toBe(els.length);
        expect(nodes.filter((n) => n.type === "node" && !n.parentId)).toHaveLength(1);
      } else {
        const frame = els.find((e) => e.type === "frame");
        expect(frame, t.id).toBeTruthy();
        for (const e of els) if (e.type !== "frame") expect(e.frameId, `${t.id}:${e.type}`).toBe(frame!.id);
      }
      expect(new Set(els.map((e) => e.id)).size).toBe(els.length);
      const doc = normalizeDoc({ version: 1, pages: [{ id: "p", name: "P", paper: "blank", background: "#FFFFFF", elements: els }] });
      expect(doc.pages[0].elements.length, t.id).toBe(els.length);
      expect(TEMPLATE_CATEGORIES.some((c) => c.id === t.category)).toBe(true);
    }
  });

  it("setas do fluxograma ficam ligadas às formas", () => {
    const els = TEMPLATES.find((t) => t.id === "flowchart")!.build();
    const arrows = els.filter((e) => e.type === "arrow");
    expect(arrows.length).toBeGreaterThanOrEqual(6);
    const ids = new Set(els.map((e) => e.id));
    for (const a of arrows) if (a.type === "arrow") expect(ids.has(a.startBinding!.elementId) && ids.has(a.endBinding!.elementId)).toBe(true);
  });

  it("placeAt centraliza o conjunto no ponto pedido", () => {
    const els = placeAt(TEMPLATES[0].build(), 1000, -500);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const e of els) { const b = elementBounds(e); minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX); minY = Math.min(minY, b.minY); maxY = Math.max(maxY, b.maxY); }
    expect(Math.abs((minX + maxX) / 2 - 1000)).toBeLessThan(1);
    expect(Math.abs((minY + maxY) / 2 + 500)).toBeLessThan(1);
  });
});
