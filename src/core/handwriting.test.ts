import { describe, expect, it } from "vitest";
import { HirakuElement, StrokeElement } from "./model";
import { advanceTarget, categoryOf, cleanFilter, filterIds, isScribble, newLine, padToWorld, scribbleTargets } from "./handwriting";
import { blockPrims, cleanBlock } from "./blocks";

const stroke = (id: string, pts: [number, number][], brush = "pen"): StrokeElement =>
  ({ id, type: "stroke", points: pts.map(([x, y]) => ({ x, y, p: 0.5 })), color: "#000000", width: 3, sens: 1, taper: 0, brush, opacity: 1 });

const zig = (n: number, amp = 60, step = 2) => {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) for (let k = 0; k <= 10; k++) out.push({ x: (i % 2 ? amp - (k * amp) / 10 : (k * amp) / 10), y: 100 + i * step + k * 0.2 });
  return out;
};

describe("escrita à mão (0.12)", () => {
  it("categorias e filtros", () => {
    const a = stroke("a", [[0, 0], [10, 10]]), h = stroke("h", [[0, 0], [10, 10]], "highlighter");
    expect(categoryOf(a)).toBe("ink");
    expect(categoryOf(h)).toBe("highlighter");
    expect(filterIds(["a", "h"], [a, h], ["highlighter"])).toEqual(["h"]);
    expect(filterIds(["a", "h"], [a, h], [])).toEqual(["a", "h"]);
    expect(cleanFilter(["ink", "lixo", "ink"])).toEqual(["ink"]);
  });
  it("rabisco de vai-e-vem é reconhecido; traço comum e zigue-zague que avança não", () => {
    expect(isScribble(zig(8))).toBe(true);
    expect(isScribble(Array.from({ length: 40 }, (_, i) => ({ x: i * 3, y: 0 })))).toBe(false);
    // "W" avançando: sobe e desce mas sempre anda para a direita
    const w = Array.from({ length: 60 }, (_, i) => ({ x: i * 4, y: (i % 10 < 5 ? i % 10 : 10 - (i % 10)) * 12 }));
    expect(isScribble(w)).toBe(false);
  });
  it("rabisco apaga o que toca (e não nós/quadros)", () => {
    const under = stroke("u", [[0, 100], [60, 104]]), far = stroke("f", [[500, 500], [600, 600]]);
    const node = { id: "n", type: "node", x: 0, y: 90, w: 60, h: 30 } as unknown as HirakuElement;
    const ids = scribbleTargets(zig(8).map((p) => ({ ...p, p: 0.5 })), [under, far, node], 4);
    expect(ids).toEqual(["u"]);
  });
  it("janela de zoom: avança, muda de linha e converte coordenadas", () => {
    const t = { x: 100, y: 50, w: 200, h: 40 };
    expect(advanceTarget(t, 100, 1000).x).toBeCloseTo(240);
    const end = advanceTarget({ ...t, x: 900 }, 100, 1000);
    expect([end.x, end.y]).toEqual([100, 90]);
    expect(newLine(t, 100)).toEqual({ ...t, x: 100, y: 90 });
    expect(padToWorld(t, 800, 400, 80)).toEqual({ x: 200, y: 70 });
  });
  it("fita esconde e o toque revela", () => {
    const spec = cleanBlock({ kind: "tape", revealed: false, label: "resposta", pattern: "stripes", color: "#F2B33D" })!;
    const hidden = blockPrims(spec, 200, 40);
    expect(hidden.rects[0].alpha).toBeUndefined();
    expect(hidden.hits[0].action).toBe("toggle");
    const shown = blockPrims({ ...spec, revealed: true } as typeof spec, 200, 40);
    expect(shown.rects[0].alpha).toBeLessThan(0.5);
  });
});
