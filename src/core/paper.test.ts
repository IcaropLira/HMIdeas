import { describe, expect, it } from "vitest";
import { PAPER_KINDS } from "./model";
import { autoLineColor, drawPaperPattern, paperSvgPaths } from "./paper";

const count = (kind: Parameters<typeof drawPaperPattern>[0], zoom = 1) => {
  let lines = 0, dots = 0;
  drawPaperPattern(kind, { x: 13, y: -7, zoom }, 800, 600, { line: () => lines++, dot: () => dots++ });
  return { lines, dots };
};

describe("papel", () => {
  it("linhas claras no papel escuro e escuras no claro", () => {
    expect(autoLineColor("#FFFFFF")).toBe("#1B2233");
    expect(autoLineColor("#1F3B2D")).toBe("#F2F4FA");
  });
  it("todo padrão desenha algo (menos o liso) e respeita o limite em qualquer zoom", () => {
    for (const k of PAPER_KINDS) {
      const c = count(k.id);
      if (k.id === "blank") expect(c.lines + c.dots).toBe(0);
      else expect(c.lines + c.dots).toBeGreaterThan(0);
      for (const z of [0.05, 0.3, 4, 16]) expect(count(k.id, z).lines + count(k.id, z).dots).toBeLessThan(60000);
    }
  });
  it("caderno tem a margem (camada de destaque) e o cartesiano tem os 2 eixos", () => {
    const layers = (kind: "margin" | "cartesian") => {
      const n = [0, 0, 0];
      drawPaperPattern(kind, { x: 400, y: 300, zoom: 1 }, 800, 600, { line: (_a, _b, _c, _d, l) => n[l]++, dot: () => undefined });
      return n[2];
    };
    expect(layers("margin")).toBe(1);
    expect(layers("cartesian")).toBe(2);
  });
  it("miniatura SVG sai em caminhos", () => {
    expect(paperSvgPaths("grid", 96, 64, 1).thin.startsWith("M")).toBe(true);
    expect(paperSvgPaths("dots", 96, 64, 1).dots.length).toBeGreaterThan(10);
  });
});
