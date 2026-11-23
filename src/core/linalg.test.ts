import { describe, expect, it } from "vitest";
import { angle, cross, det, dot, eigenvalues, eigenvector, formatMatrix, inverse, multiply, parseMatrix, parseVector, pointLineDistance, projection, rref, solve, transpose } from "./linalg";

describe("álgebra linear", () => {
  it("lê matrizes em vários formatos", () => {
    expect(parseMatrix("1 2; 3 4")).toEqual([[1, 2], [3, 4]]);
    expect(parseMatrix("[[1,2],[3,4]]")).toEqual([[1, 2], [3, 4]]);
    expect(parseMatrix("1 2\n3 4")).toEqual([[1, 2], [3, 4]]);
    expect(parseMatrix("sqrt(4) pi/pi")).toEqual([[2, 1]]);
    expect(() => parseMatrix("1 2; 3")).toThrow();
    expect(parseVector("(1, 2, 3)")).toEqual([1, 2, 3]);
  });
  it("determinante, inversa, produto, transposta", () => {
    const A = [[2, 1], [5, 3]];
    expect(det(A)).toBeCloseTo(1);
    expect(multiply(A, inverse(A)).flat().map((v) => Math.round(v * 1e9) / 1e9 + 0)).toEqual([1, 0, 0, 1]);
    expect(transpose([[1, 2, 3]])).toEqual([[1], [2], [3]]);
    expect(det([[1, 2, 3], [4, 5, 6], [7, 8, 10]])).toBeCloseTo(-3);
    expect(() => inverse([[1, 2], [2, 4]])).toThrow(/singular/);
  });
  it("escalonamento, posto e sistemas", () => {
    expect(rref([[1, 2], [2, 4]]).rank).toBe(1);
    const s = solve([[2, 1], [1, -1]], [3, 0]);
    expect(s.kind).toBe("unique");
    if (s.kind === "unique") { expect(s.x[0]).toBeCloseTo(1); expect(s.x[1]).toBeCloseTo(1); }
    expect(solve([[1, 1], [1, 1]], [1, 2]).kind).toBe("none");
    expect(solve([[1, 1], [2, 2]], [1, 2]).kind).toBe("infinite");
  });
  it("autovalores reais, complexos e 3×3", () => {
    expect(eigenvalues([[2, 0], [0, 3]]).map((e) => e.re)).toEqual([3, 2]);
    const rot = eigenvalues([[0, -1], [1, 0]]);
    expect(rot[0].im).toBeCloseTo(1);
    const e3 = eigenvalues([[2, 1, 0], [1, 2, 0], [0, 0, 5]]).map((e) => Math.round(e.re * 1e6) / 1e6);
    expect(e3).toEqual([5, 3, 1]);
    const v = eigenvector([[2, 1], [1, 2]], 3)!;
    expect(Math.abs(v[0])).toBeCloseTo(Math.abs(v[1]));
  });
  it("vetores", () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(angle([1, 0], [0, 1])).toBeCloseTo(Math.PI / 2);
    expect(projection([2, 2], [1, 0])).toEqual([2, 0]);
    expect(pointLineDistance([0, 1], [-1, 0], [1, 0])).toBeCloseTo(1);
    expect(formatMatrix([[1, -0.5]])).toBe("[ 1  −0,5 ]");
  });
});
