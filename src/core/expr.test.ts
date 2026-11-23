import { describe, expect, it } from "vitest";
import { calc, compile, fmt } from "./expr";

const v = (s: string) => { const r = calc(s); if (!r.ok) throw new Error(r.error); return r.value; };

describe("expressões", () => {
  it("precedência, potência à direita e unário", () => {
    expect(v("2+3*4")).toBe(14);
    expect(v("2^3^2")).toBe(512);
    expect(v("-2^2")).toBe(-4);
    expect(v("(1+2)*(3+4)")).toBe(21);
    expect(v("10 % 4")).toBe(2);
    expect(v("5!")).toBe(120);
  });
  it("multiplicação implícita, constantes e funções", () => {
    expect(v("2pi")).toBeCloseTo(2 * Math.PI);
    expect(v("2(3+1)")).toBe(8);
    expect(v("sqrt(16) + abs(-3)")).toBe(7);
    expect(v("sen(pi/2)")).toBeCloseTo(1);
    expect(v("log(1000)")).toBeCloseTo(3);
    expect(v("ln e")).toBeCloseTo(1);
    expect(v("max(2,3)")).toBe(3);
    expect(v("1,5 * 2")).toBe(3);
    expect(v("3²")).toBe(9);
    expect(v("2e3")).toBe(2000);
  });
  it("funções de x", () => {
    const f = compile("y = x^2 - 2x + 1");
    expect(f(1)).toBe(0);
    expect(f(3)).toBe(4);
    expect(compile("f(x) = sin x")(Math.PI / 2)).toBeCloseTo(1);
    expect(compile("x sin x")(Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(compile("2x(x+1)")(2)).toBe(12);
  });
  it("erros em português, sem lançar", () => {
    expect(calc("2+").ok).toBe(false);
    expect(calc("foo(2)").ok).toBe(false);
    expect(calc("alert(1)").ok).toBe(false);
    expect(calc("").ok).toBe(false);
  });
  it("formatação", () => {
    expect(fmt(0.1 + 0.2)).toBe("0,3");
    expect(fmt(-2.5)).toBe("−2,5");
    expect(fmt(1 / 0)).toBe("∞");
  });
});
