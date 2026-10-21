import { describe, expect, it } from "vitest";
import { PALETTES, RECENT_MAX, contrastOn, hexToHsv, hexToRgb, hsvToHex, parseHex, pushRecent, rgbToHex } from "./color";

describe("parseHex", () => {
  it("normaliza #abc, abc e #aabbcc para #AABBCC", () => {
    expect(parseHex("#abc")).toBe("#AABBCC");
    expect(parseHex("abc")).toBe("#AABBCC");
    expect(parseHex(" #aabbcc ")).toBe("#AABBCC");
  });
  it("rejeita lixo", () => {
    for (const bad of ["", "#12", "#12345", "#1234567", "#ggg", "red", "rgb(1,2,3)"]) expect(parseHex(bad)).toBeNull();
  });
});

describe("conversões", () => {
  it("hex ↔ rgb", () => {
    expect(hexToRgb("#C8372D")).toEqual({ r: 200, g: 55, b: 45 });
    expect(rgbToHex({ r: 200, g: 55, b: 45 })).toBe("#C8372D");
  });
  it("cores primárias em HSV", () => {
    expect(hexToHsv("#FF0000")).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv("#00FF00").h).toBeCloseTo(120);
    expect(hexToHsv("#0000FF").h).toBeCloseTo(240);
    expect(hexToHsv("#FFFFFF")).toEqual({ h: 0, s: 0, v: 1 });
    expect(hexToHsv("#000000").v).toBe(0);
  });
  it("hex → hsv → hex é estável para todas as paletas", () => {
    for (const p of PALETTES) for (const c of p.colors) expect(hsvToHex(hexToHsv(c))).toBe(c);
  });
  it("hsv → hex nos extremos do matiz", () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe("#FF0000");
    expect(hsvToHex({ h: 359.99, s: 1, v: 1 })).toBe("#FF0000");
    expect(hsvToHex({ h: 60, s: 1, v: 1 })).toBe("#FFFF00");
  });
});

describe("contrastOn", () => {
  it("escolhe escuro sobre claro e claro sobre escuro", () => {
    expect(contrastOn("#FFFFFF")).toBe("#1B2233");
    expect(contrastOn("#F2C14E")).toBe("#1B2233");
    expect(contrastOn("#1B2233")).toBe("#FFFFFF");
    expect(contrastOn("#2F4B8F")).toBe("#FFFFFF");
  });
});

describe("pushRecent", () => {
  it("põe no início, sem repetir (ignora maiúsculas)", () => {
    expect(pushRecent(["#111111", "#222222"], "#222222")).toEqual(["#222222", "#111111"]);
    expect(pushRecent(["#AAAAAA"], "#aaa")).toEqual(["#AAAAAA"]);
  });
  it("limita o tamanho e ignora cor inválida", () => {
    let list: string[] = [];
    for (let i = 0; i < RECENT_MAX + 5; i++) list = pushRecent(list, rgbToHex({ r: i, g: 0, b: 0 }));
    expect(list).toHaveLength(RECENT_MAX);
    expect(pushRecent(list, "não é cor")).toBe(list);
  });
});

describe("paletas", () => {
  it("só têm hex válido em maiúsculas, sem repetição", () => {
    for (const p of PALETTES) {
      expect(new Set(p.colors).size).toBe(p.colors.length);
      for (const c of p.colors) expect(parseHex(c)).toBe(c);
    }
  });
});
