import { describe, expect, it } from "vitest";
import { addLayer, duplicateLayer, elementsOfLayer, interactiveElements, layerIdOf, mergeDown, moveLayer, moveToLayer, patchLayer, removeLayer, reorder, visibleElements } from "./layers";
import { HirakuElement, Page, createPage, normalizeDoc } from "./model";

const rect = (id: string, layerId?: string): HirakuElement => ({
  id, layerId, type: "rect", x: 0, y: 0, w: 10, h: 10, angle: 0, stroke: "#000000", strokeWidth: 1, strokeStyle: "solid", fill: null, rounded: false, opacity: 1,
});

function twoLayers(): Page {
  const p = createPage();
  const { page } = addLayer(p);
  const [a, b] = page.layers;
  return { ...page, elements: [rect("x"), rect("y", b.id), rect("z", a.id)] };
}

describe("camadas", () => {
  it("página nova e arquivo antigo têm uma camada; elemento sem camada fica na primeira", () => {
    expect(createPage().layers).toHaveLength(1);
    const doc = normalizeDoc({ version: 1, pages: [{ id: "p", name: "P", paper: "blank", background: "#FFFFFF", elements: [rect("a")] }] });
    const page = doc.pages[0];
    expect(page.layers).toHaveLength(1);
    expect(layerIdOf(page, page.elements[0])).toBe(page.layers[0].id);
  });

  it("camada oculta some do desenho visível; oculta ou travada não é interativa", () => {
    let p = twoLayers();
    const [a, b] = p.layers;
    p = patchLayer(p, b.id, { visible: false });
    expect(visibleElements(p).map((e) => e.id)).toEqual(["x", "z"]);
    p = patchLayer(patchLayer(p, b.id, { visible: true }), a.id, { locked: true });
    expect(interactiveElements(p).map((e) => e.id)).toEqual(["y"]);
  });

  it("apagar camada leva o conteúdo junto, mas nunca apaga a última", () => {
    const p = twoLayers();
    const r = removeLayer(p, p.layers[1].id);
    expect(r.layers).toHaveLength(1);
    expect(r.elements.map((e) => e.id)).toEqual(["x", "z"]);
    expect(removeLayer(r, r.layers[0].id)).toBe(r);
  });

  it("mesclar com a de baixo move os elementos e remove a camada", () => {
    const p = twoLayers();
    const m = mergeDown(p, p.layers[1].id);
    expect(m.layers).toHaveLength(1);
    expect(elementsOfLayer(m, m.layers[0].id).map((e) => e.id).sort()).toEqual(["x", "y", "z"]);
  });

  it("duplicar copia os elementos com ids novos na camada nova", () => {
    const p = twoLayers();
    const { page, id } = duplicateLayer(p, p.layers[1].id);
    expect(page.layers.map((l) => l.id)).toEqual([p.layers[0].id, p.layers[1].id, id]);
    const copies = elementsOfLayer(page, id);
    expect(copies).toHaveLength(1);
    expect(copies[0].id).not.toBe("y");
  });

  it("subir/descer troca a ordem e para nas pontas", () => {
    const p = twoLayers();
    const up = moveLayer(p, p.layers[0].id, 1);
    expect(up.layers[1].id).toBe(p.layers[0].id);
    expect(moveLayer(p, p.layers[1].id, 1)).toBe(p);
  });

  it("mover a seleção para outra camada", () => {
    const p = twoLayers();
    const m = moveToLayer(p, ["x"], p.layers[1].id);
    expect(layerIdOf(m, m.elements.find((e) => e.id === "x")!)).toBe(p.layers[1].id);
  });

  it("ordem: frente, trás, um passo", () => {
    const els = ["a", "b", "c", "d"].map((i) => rect(i));
    const ids = (l: HirakuElement[]) => l.map((e) => e.id).join("");
    expect(ids(reorder(els, ["b"], "front"))).toBe("acdb");
    expect(ids(reorder(els, ["c"], "back"))).toBe("cabd");
    expect(ids(reorder(els, ["b"], "forward"))).toBe("acbd");
    expect(ids(reorder(els, ["c"], "backward"))).toBe("acbd");
    expect(ids(reorder(els, ["d"], "forward"))).toBe("abcd");
  });

  it("renomear ignora nome vazio", () => {
    const p = twoLayers();
    expect(patchLayer(p, p.layers[0].id, { name: "   " }).layers[0].name).toBe(p.layers[0].name);
    expect(patchLayer(p, p.layers[0].id, { name: "Fundo" }).layers[0].name).toBe("Fundo");
  });
});
