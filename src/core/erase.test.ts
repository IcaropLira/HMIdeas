import { describe, expect, it } from "vitest";
import { cutStroke, eraseStep, segmentInCircle } from "./erase";
import { InkPoint, StrokeElement } from "./model";

const line = (n = 21, step = 10): StrokeElement => ({
  id: "s", type: "stroke", color: "#000", width: 4, sens: 1, taper: 0.5, brush: "pen", opacity: 1,
  points: Array.from({ length: n }, (_, i): InkPoint => ({ x: i * step, y: 0, p: 0.5 })),
});

describe("segmentInCircle", () => {
  it("acha o trecho dentro do círculo", () => {
    const iv = segmentInCircle({ x: -10, y: 0, p: 0.5 }, { x: 10, y: 0, p: 0.5 }, 0, 0, 5)!;
    expect(iv[0]).toBeCloseTo(0.25);
    expect(iv[1]).toBeCloseTo(0.75);
  });
  it("null quando não entra", () => {
    expect(segmentInCircle({ x: -10, y: 20, p: 0.5 }, { x: 10, y: 20, p: 0.5 }, 0, 0, 5)).toBeNull();
  });
});

describe("cutStroke", () => {
  it("não toca → null", () => {
    expect(cutStroke(line(), 100, 80, 10)).toBeNull();
  });
  it("corta no meio em dois pedaços com pontas retas", () => {
    const res = cutStroke(line(), 100, 0, 10)!;
    expect(res).toHaveLength(2);
    expect(res[0].id).toBe("s");
    expect(res[1].id).not.toBe("s");
    expect(res[0].openEnd).toBe(true);
    expect(res[1].openStart).toBe(true);
    const gap = res[1].points[0].x - res[0].points[res[0].points.length - 1].x;
    expect(gap).toBeGreaterThan(18); // 2 × (10 + 4×0.25)
    expect(gap).toBeLessThan(23);
  });
  it("cortar a ponta deixa um pedaço só", () => {
    const res = cutStroke(line(), 0, 0, 12)!;
    expect(res).toHaveLength(1);
    expect(res[0].openStart).toBe(true);
    expect(res[0].openEnd).toBeUndefined();
  });
  it("apaga por inteiro se o círculo cobre tudo", () => {
    expect(cutStroke(line(3, 2), 2, 0, 50)).toEqual([]);
  });
  it("ponto solitário", () => {
    const dot = { ...line(1) };
    expect(cutStroke(dot, 0, 0, 5)).toEqual([]);
    expect(cutStroke(dot, 40, 0, 5)).toBeNull();
  });
});

describe("eraseStep", () => {
  it("devolve a mesma lista se nada mudou", () => {
    const els = [line()];
    expect(eraseStep(els, 100, 90, 5).elements).toBe(els);
  });
  it("apaga formas inteiras e corta traços", () => {
    const rect = { id: "r", type: "rect", x: 90, y: -10, w: 20, h: 20, angle: 0, stroke: "#000", strokeWidth: 2, strokeStyle: "solid", fill: null, rounded: false, opacity: 1 } as const;
    const res = eraseStep([line(), rect], 100, 0, 10);
    expect(res.removedIds.has("r")).toBe(true);
    expect(res.elements.filter((e) => e.type === "stroke")).toHaveLength(2);
  });
});
