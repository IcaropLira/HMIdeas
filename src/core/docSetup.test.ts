import { describe, expect, it } from "vitest";
import { DEFAULT_SPEC, DOC_PRESETS, anchorOffset, changeUnit, cleanSpec, memLabel, presetSpec, specErrors, specPx, specToDoc, swapOrientation, toPx } from "./docSetup";
import { normalizeDoc } from "./model";
import { parseDoc, serializeDoc } from "./serialize";

describe("Novo documento (0.18)", () => {
  it("converte unidades físicas em pixels pela resolução", () => {
    expect(toPx(7, "in", 300)).toBe(2100);
    expect(Math.round(toPx(210, "mm", 300))).toBe(2480);
    expect(toPx(72, "pt", 144)).toBe(144);
    expect(specPx(DEFAULT_SPEC)).toEqual({ w: 2100, h: 1500 });
  });
  it("px/cm vira ppi", () => {
    const s = { ...DEFAULT_SPEC, resolution: 118.11, resUnit: "ppcm" as const };
    expect(specPx(s).w).toBe(2100);
  });
  it("trocar a unidade mantém o tamanho em pixels", () => {
    const s = changeUnit(DEFAULT_SPEC, "cm");
    expect(s.width).toBeCloseTo(17.78, 2);
    expect(specPx(s)).toEqual(specPx(DEFAULT_SPEC));
    expect(changeUnit(s, "px").width).toBe(2100);
  });
  it("orientação troca largura e altura", () => {
    const s = swapOrientation(DEFAULT_SPEC);
    expect([s.width, s.height]).toEqual([5, 7]);
  });
  it("acusa tamanhos impossíveis", () => {
    expect(specErrors(DEFAULT_SPEC)).toEqual([]);
    expect(specErrors({ ...DEFAULT_SPEC, width: 200, unit: "in", resolution: 300 }).length).toBe(1);
    expect(specErrors({ ...DEFAULT_SPEC, width: 0 }).length).toBeGreaterThan(0);
    expect(specErrors({ ...DEFAULT_SPEC, pages: 0 }).length).toBe(1);
  });
  it("todas as predefinições são válidas", () => {
    for (const p of DOC_PRESETS) expect(specErrors(presetSpec(p)), p.id).toEqual([]);
  });
  it("gera documento com folhas em px, fundo e metadados, e sobrevive ao arquivo", () => {
    const doc = specToDoc({ ...DEFAULT_SPEC, name: "Capa", pages: 3, bg: "transparent", colorMode: "gray" });
    expect(doc.pages).toHaveLength(3);
    expect(doc.pages[0].size).toMatchObject({ w: 2100, h: 1500 });
    expect(doc.pages[0].transparent).toBe(true);
    expect(doc.meta).toMatchObject({ title: "Capa", dpi: 300, unit: "in", colorMode: "gray", bitDepth: 8 });
    const back = parseDoc(serializeDoc(doc));
    expect(back.meta).toEqual(doc.meta);
    expect(back.pages[1].transparent).toBe(true);
    expect(back.pages[2].size?.w).toBe(2100);
  });
  it("quadro infinito não tem folha nem transparência", () => {
    const doc = specToDoc({ ...DEFAULT_SPEC, infinite: true, bg: "transparent" });
    expect(doc.pages[0].size).toBeUndefined();
    expect(doc.pages[0].transparent).toBeUndefined();
  });
  it("normalizeDoc limpa metadados inválidos", () => {
    const doc = specToDoc(DEFAULT_SPEC);
    const bad = normalizeDoc({ ...doc, meta: { dpi: -3, unit: "furlong", colorMode: "cmyk", bitDepth: 12 } });
    expect(bad.meta).toBeUndefined();
    const ok = normalizeDoc({ ...doc, meta: { dpi: 600, colorMode: "gray", junk: 1 } });
    expect(ok.meta).toEqual({ dpi: 600, colorMode: "gray" });
  });
  it("cleanSpec aceita só especificações válidas", () => {
    expect(cleanSpec(DEFAULT_SPEC)).toEqual({ ...DEFAULT_SPEC, infinite: undefined });
    expect(cleanSpec({ ...DEFAULT_SPEC, width: 99999, unit: "px" })).toBeNull();
    expect(cleanSpec("lixo")).toBeNull();
  });
  it("estimativa de memória e âncora", () => {
    expect(memLabel(DEFAULT_SPEC)).toBe("9,0 MB");
    expect(anchorOffset(100, 100, 200, 300, 1, 2)).toEqual({ dx: 50, dy: 200 });
  });
});
