import { describe, expect, it } from "vitest";
import { FIGURE_KINDS, SOLIDS, cleanFigure, defaultFigure, figurePrims, niceStep, plotPrims } from "./figures";
import { normalizeDoc } from "./model";

const finite = (p: ReturnType<typeof figurePrims>) =>
  [...p.lines.flatMap((l) => l.pts), ...p.polys.flatMap((q) => q.pts), ...p.texts, ...p.dots].every((v) => Number.isFinite(v.x) && Number.isFinite(v.y));

describe("figuras", () => {
  it("todo sólido e toda figura geram primitivas finitas dentro da caixa", () => {
    for (const s of SOLIDS) {
      const p = figurePrims(defaultFigure(s.id), 300, 260);
      expect(p.lines.length, s.id).toBeGreaterThan(2);
      expect(finite(p), s.id).toBe(true);
    }
    for (const k of FIGURE_KINDS) expect(finite(figurePrims(defaultFigure(k.id), 400, 300)), k.id).toBe(true);
  });
  it("cubo de frente mostra arestas ocultas tracejadas (3) e esconde-as se pedido", () => {
    const spec = defaultFigure("cube");
    const dashed = figurePrims(spec, 300, 300).lines.filter((l) => l.dash).length;
    expect(dashed).toBe(3);
    expect(figurePrims({ ...spec, hidden: false } as typeof spec, 300, 300).lines.filter((l) => l.dash).length).toBe(0);
  });
  it("gráfico: assíntotas não viram linha vertical, erros aparecem em português", () => {
    const p = plotPrims({ kind: "plot", fns: [{ expr: "tan(x)", color: "#000000" }, { expr: "2+", color: "#ff0000" }], points: [{ x: 1, y: 1 }], xmin: -5, xmax: 5, ymin: -5, ymax: 5, grid: true }, 400, 300);
    expect(p.errors).toHaveLength(1);
    const tan = p.lines.filter((l) => l.color === "#000000");
    expect(tan.length).toBeGreaterThan(2); // vários ramos
    for (const l of tan) for (const q of l.pts) expect(q.y >= -0.01 && q.y <= 300.01).toBe(true);
    expect(p.dots).toHaveLength(1);
  });
  it("passo bonito", () => {
    expect(niceStep(10, 10)).toBe(1);
    expect(niceStep(100, 8)).toBe(10);
    expect(niceStep(7, 8)).toBe(1);
    expect(niceStep(0.3, 6)).toBe(0.05);
  });
  it("figura no arquivo é saneada; inválida vira anexo comum", () => {
    expect(cleanFigure({ kind: "solid", solid: "xyz", pitch: 9 })).toMatchObject({ solid: "cube", pitch: 1.5 });
    expect(cleanFigure({ kind: "plot", xmin: 5, xmax: 1 })).toMatchObject({ xmin: -5, xmax: 5 });
    const doc = normalizeDoc({ version: 1, pages: [{ id: "p", name: "P", paper: "blank", background: "#FFFFFF", elements: [
      { id: "a", type: "attachment", x: 0, y: 0, w: 100, h: 100, kind: "figure", url: "", figure: { kind: "nada" } },
      { id: "b", type: "attachment", x: 0, y: 0, w: 100, h: 100, kind: "figure", url: "", figure: defaultFigure("cone") },
    ] }] });
    expect(doc.pages[0].elements.map((e) => (e.type === "attachment" ? e.kind : ""))).toEqual(["file", "figure"]);
  });
});
