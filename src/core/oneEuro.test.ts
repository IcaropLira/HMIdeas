import { describe, expect, it } from "vitest";
import { OneEuro, stabilizerOptions } from "./oneEuro";

describe("OneEuro", () => {
  it("segura o tremido quando parado", () => {
    const f = new OneEuro(stabilizerOptions(0.8)!);
    let out = 0;
    for (let i = 0; i < 60; i++) out = f.filter(100 + (i % 2 ? 1.5 : -1.5), i * 8);
    expect(Math.abs(out - 100)).toBeLessThan(1);
  });
  it("quase não atrasa em movimento rápido, mesmo no nível máximo", () => {
    const f = new OneEuro(stabilizerOptions(1)!);
    let out = 0, x = 0;
    for (let i = 0; i < 120; i++) { x = i * 20; out = f.filter(x, i * 8); } // 2500 px/s
    expect(x - out).toBeLessThan(25);
  });
  it("nível 0 desliga o filtro", () => {
    expect(stabilizerOptions(0)).toBeNull();
  });
});
