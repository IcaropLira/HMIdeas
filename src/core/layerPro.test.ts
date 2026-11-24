import { describe, expect, it } from "vitest";
import { clipBase, clipUnits, cssBlend, cycleBlend, filterLayers, flatten, layerViaCopy, layerViaCut, mergeVisible, soloLayer } from "./layerPro";
import { HirakuElement, LAYER_BLENDS, Layer, Page, createPage, makeLayer, normalizeDoc } from "./model";

const L = (id: string, extra: Partial<Layer> = {}): Layer => ({ ...makeLayer(id, id), ...extra });
const rect = (id: string, layerId: string, opacity = 1) => ({ id, type: "rectangle", x: 0, y: 0, w: 10, h: 10, angle: 0, stroke: "#000", fill: "transparent", strokeWidth: 2, strokeStyle: "solid", opacity, layerId } as unknown as HirakuElement);
const pageOf = (layers: Layer[], elements: HirakuElement[]): Page => ({ ...createPage("P"), layers, elements });

describe("camadas profissionais (0.19)", () => {
  const layers = [L("a"), L("b", { clip: true }), L("c", { clip: true }), L("d"), L("e", { clip: true })];
  it("acha a base do recorte e agrupa as unidades", () => {
    expect(clipBase(layers, 1)).toBe(0);
    expect(clipBase(layers, 2)).toBe(0);
    expect(clipBase(layers, 3)).toBeNull();
    expect(clipBase(layers, 4)).toBe(3);
    expect(clipBase([L("x", { clip: true })], 0)).toBeNull();
    expect(clipUnits(layers).map((u) => [u.base.id, u.clipped.map((c) => c.id)])).toEqual([["a", ["b", "c"]], ["d", ["e"]]]);
    expect(clipUnits([L("x", { clip: true }), L("y")]).map((u) => u.base.id)).toEqual(["x", "y"]);
  });
  it("solo mostra só uma e volta tudo no segundo toque", () => {
    const p = pageOf([L("a"), L("b"), L("c", { visible: false })], []);
    const s = soloLayer(p, "b");
    expect(s.layers.map((l) => l.visible)).toEqual([false, true, false]);
    expect(soloLayer(s, "b").layers.every((l) => l.visible)).toBe(true);
  });
  it("mesclar visíveis leva a opacidade da camada para os elementos e mantém as ocultas", () => {
    const p = pageOf([L("a"), L("h", { visible: false }), L("b", { opacity: 0.5, blend: "multiply" })], [rect("1", "b"), rect("2", "a"), rect("3", "h")]);
    const m = mergeVisible(p);
    expect(m.layers.map((l) => l.id)).toEqual(["a", "h"]);
    expect(m.elements.map((e) => [e.id, e.layerId])).toEqual([["2", "a"], ["3", "h"], ["1", "a"]]);
    expect((m.elements.find((e) => e.id === "1") as { opacity: number }).opacity).toBe(0.5);
  });
  it("achatar descarta o que está oculto", () => {
    const p = pageOf([L("a"), L("h", { visible: false }), L("b")], [rect("1", "b"), rect("2", "a"), rect("3", "h")]);
    const r = flatten(p);
    expect(r.dropped).toBe(1);
    expect(r.page.layers).toHaveLength(1);
    expect(r.page.elements.map((e) => e.id)).toEqual(["2", "1"]);
  });
  it("camada via recorte e via cópia", () => {
    const p = pageOf([L("a"), L("b")], [rect("1", "a"), rect("2", "a")]);
    const cut = layerViaCut(p, ["1"])!;
    expect(cut.page.layers.map((l) => l.id)[1]).toBe(cut.id);
    expect(cut.page.elements.find((e) => e.id === "1")!.layerId).toBe(cut.id);
    const copy = layerViaCopy(p, ["2"], (els) => els.map((e) => ({ ...e, id: e.id + "c" })))!;
    expect(copy.copies).toEqual(["2c"]);
    expect(copy.page.elements).toHaveLength(3);
    expect(layerViaCut(p, [])).toBeNull();
  });
  it("modos de mesclagem: ciclo, CSS e arquivo", () => {
    expect(LAYER_BLENDS.length).toBe(27);
    expect(cycleBlend(undefined, 1)).toBe("dissolve");
    expect(cycleBlend("normal", -1)).toBe("luminosity");
    expect(cssBlend("multiply")).toBe("multiply");
    expect(cssBlend("add")).toBe("plus-lighter");
    expect(cssBlend("normal")).toBeNull();
    const page = { ...createPage("P"), layers: [L("a"), { ...L("b"), clip: true, blend: "vivid-light", color: "red" } as Layer, { ...L("c"), blend: "bogus", color: "pink", opacity: 0 } as unknown as Layer] };
    const d = normalizeDoc({ version: 1, pages: [page] });
    expect(d.pages[0].layers[1]).toMatchObject({ clip: true, blend: "vivid-light", color: "red" });
    expect(d.pages[0].layers[2].blend).toBeUndefined();
    expect(d.pages[0].layers[2].color).toBeUndefined();
    expect(d.pages[0].layers[2].opacity).toBe(0);
  });
  it("filtra por nome sem acento, modo e estado", () => {
    const ls = [L("a", { name: "Sombras" }), L("b", { name: "Luz", blend: "screen" }), L("c", { name: "Fundo", visible: false })];
    expect(filterLayers(ls, { text: "sombra", kind: "all" }).map((l) => l.id)).toEqual(["a"]);
    expect(filterLayers(ls, { text: "divisao", kind: "all" }).map((l) => l.id)).toEqual(["b"]);
    expect(filterLayers(ls, { text: "", kind: "hidden" }).map((l) => l.id)).toEqual(["c"]);
    expect(filterLayers(ls, { text: "", kind: "blend" }).map((l) => l.id)).toEqual(["b"]);
  });
});
