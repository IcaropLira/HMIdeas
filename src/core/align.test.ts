import { describe, expect, it } from "vitest";
import { alignDeltas, distributeCenters, distributeDeltas, equalizeScales, gridDeltas, snapMove } from "./align";

const b = (x: number, y: number, w: number, h: number) => ({ minX: x, minY: y, maxX: x + w, maxY: y + h });

describe("alinhar e distribuir", () => {
  const boxes = [b(0, 0, 10, 10), b(30, 5, 20, 10), b(100, 40, 10, 30)];
  it("alinha pelas bordas e centros da caixa que envolve todas", () => {
    expect(alignDeltas(boxes, "left").map((d) => d.dx)).toEqual([0, -30, -100]);
    expect(alignDeltas(boxes, "right").map((d) => d.dx)).toEqual([100, 60, 0]);
    expect(alignDeltas(boxes, "top").map((d) => d.dy)).toEqual([0, -5, -40]);
    expect(alignDeltas(boxes, "vcenter").map((d) => d.dy)).toEqual([30, 25, -20]);
  });
  it("espaços iguais mantêm as pontas", () => {
    const d = distributeDeltas(boxes, "h");
    // total 110, ocupado 40 → espaço 35
    expect(d.map((x) => x.dx)).toEqual([0, 15, 0]);
    expect(distributeDeltas(boxes, "h", 5).map((x) => x.dx)).toEqual([0, -15, -60]);
    expect(distributeCenters(boxes, "h").map((x) => x.dx)).toEqual([0, 15, 0]);
  });
  it("grade e igualar tamanhos", () => {
    const g = gridDeltas([b(0, 0, 10, 10), b(50, 0, 10, 10), b(0, 50, 10, 10), b(50, 50, 10, 10)], 2, 5);
    expect(g.map((d) => [d.dx, d.dy])).toEqual([[0, 0], [-35, 0], [0, -35], [-35, -35]]);
    expect(equalizeScales([b(0, 0, 10, 10), b(0, 0, 20, 5)], "both")).toEqual([{ sx: 2, sy: 1 }, { sx: 1, sy: 2 }]);
  });
});

describe("encaixe ao arrastar", () => {
  it("gruda na borda/centro mais perto e devolve a guia", () => {
    const r = snapMove(b(103, 0, 10, 10), [b(0, 50, 100, 10)], 6);
    expect(r.dx).toBe(-3);
    expect(r.guides[0].a.x).toBe(100);
  });
  it("espaço igual entre dois vizinhos da mesma linha", () => {
    const r = snapMove(b(42, 0, 10, 10), [b(0, 0, 20, 10), b(80, 0, 20, 10)], 6);
    expect(r.dx).toBe(3); // 20..45 = 25, 55..80 = 25
    expect(r.guides.some((g) => g.kind === "gap")).toBe(true);
  });
  it("sem nada perto, a grade decide", () => {
    expect(snapMove(b(23, 47, 10, 10), [], 4, 20)).toMatchObject({ dx: -3, dy: -7 });
  });
});
