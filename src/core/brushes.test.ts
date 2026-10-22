import { describe, expect, it } from "vitest";
import { DEFAULT_BRUSH_ID, getBrush, hasBrush, listBrushes, registerBrush, unregisterBrush } from "./brushes";
import { parseHex } from "./color";
import { normalizeDoc } from "./model";

describe("registro de brushes", () => {
  it("tem os 7 de contorno, ids únicos, e a caneta primeiro", () => {
    const ids = listBrushes().map((b) => b.id);
    expect(ids.slice(0, 7)).toEqual(["pen", "writer", "ballpoint", "ink", "marker", "highlighter", "brushpen"]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe(DEFAULT_BRUSH_ID);
  });

  it("parâmetros dentro das faixas", () => {
    for (const b of listBrushes()) {
      if (b.kind !== "outline") continue;
      expect(b.size, b.id).toBeGreaterThan(0);
      for (const v of [b.thinning, b.simThinning, b.smoothing, b.streamline, b.opacity]) {
        expect(v, b.id).toBeGreaterThanOrEqual(0);
        expect(v, b.id).toBeLessThanOrEqual(1);
      }
      if (b.taper !== null) expect(b.taper, b.id).toBeLessThanOrEqual(1);
      if (b.defaultColor) expect(parseHex(b.defaultColor), b.id).toBe(b.defaultColor);
    }
  });

  it("marca-texto é translúcido, multiplica e tem cor própria", () => {
    const h = getBrush("highlighter");
    expect(h.opacity).toBeLessThan(0.6);
    expect(h.blend).toBe("multiply");
    expect(h.defaultColor).toBeDefined();
  });

  it("id desconhecido → caneta; nativos não saem do registro", () => {
    expect(getBrush("xyz").id).toBe("pen");
    expect(getBrush(null).id).toBe("pen");
    unregisterBrush("pen");
    expect(hasBrush("pen")).toBe(true);
  });

  it("registra e remove um brush extra", () => {
    registerBrush({ ...getBrush("pen"), id: "teste-extra", label: "Extra" });
    expect(hasBrush("teste-extra")).toBe(true);
    expect(listBrushes().at(-1)!.id).toBe("teste-extra");
    unregisterBrush("teste-extra");
    expect(hasBrush("teste-extra")).toBe(false);
  });
});

describe("compatibilidade do arquivo", () => {
  const doc = (stroke: object) => ({ version: 1, pages: [{ id: "p", name: "P", paper: "blank", background: "#FFFFFF", elements: [stroke] }] });
  const base = { id: "s1", type: "stroke", points: [{ x: 0, y: 0, p: 0.5 }], color: "#000000", width: 3, opacity: 1 };

  it("traço antigo (sem brush) vira caneta", () => {
    const el = normalizeDoc(doc(base)).pages[0].elements[0];
    expect(el.type === "stroke" && el.brush).toBe("pen");
  });
  it("mantém o brush gravado", () => {
    const el = normalizeDoc(doc({ ...base, brush: "ink" })).pages[0].elements[0];
    expect(el.type === "stroke" && el.brush).toBe("ink");
  });
  it("brush inválido (não texto) vira caneta", () => {
    const el = normalizeDoc(doc({ ...base, brush: 42 })).pages[0].elements[0];
    expect(el.type === "stroke" && el.brush).toBe("pen");
  });
});
