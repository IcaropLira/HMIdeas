import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT, ITEMS, clampPosition, findItem, hiddenItems, hideItem, isVertical, makeLayout, moveBar, moveItems, normalizeLayout, showItem,
} from "./layout";

const items = (L: ReturnType<typeof makeLayout>) => L.bars.map((b) => b.items.join(","));

describe("barras de bloquinhos", () => {
  it("o padrão tem cada item uma vez só", () => {
    const all = DEFAULT_LAYOUT.bars.flatMap((b) => b.items);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length + hiddenItems(DEFAULT_LAYOUT).length).toBe(ITEMS.length);
  });

  it("arrastar para fora desacopla; soltar embaixo de outro solto forma uma coluna", () => {
    let L = makeLayout({ bottom: [["select", "pen", "text"]] });
    L = moveItems(L, ["text"], { kind: "float", x: 100, y: 100, vertical: true });
    expect(items(L)).toEqual(["select,pen", "text"]);
    const solo = L.bars[1].id;
    L = moveItems(L, ["pen"], { kind: "into", bar: solo, index: 1, vertical: true });
    expect(items(L)).toEqual(["select", "text,pen"]);
    expect(isVertical(L.bars[1])).toBe(true);
    // ao lado (horizontal) de um item só: vira linha
    let H = makeLayout({}, [{ items: ["undo"], x: 0, y: 0 }]);
    H = moveItems(makeLayout({ bottom: [["redo"]] }), [], { kind: "dock", side: "left" });
    H = moveItems({ ...H, bars: [...H.bars, { id: "x", items: ["undo"], dock: null, x: 0, y: 0, vertical: true }] }, ["redo"], { kind: "into", bar: "x", index: 0, vertical: false });
    expect(H.bars[0]).toMatchObject({ items: ["redo", "undo"], vertical: false });
  });

  it("reordenar dentro da mesma barra; barra vazia some", () => {
    let L = makeLayout({ left: [["select", "pen", "text"], ["layers"]] });
    L = moveItems(L, ["select"], { kind: "into", bar: L.bars[0].id, index: 3 });
    expect(items(L)).toEqual(["pen,text,select", "layers"]);
    L = moveItems(L, ["layers"], { kind: "into", bar: L.bars[0].id, index: 0 });
    expect(items(L)).toEqual(["layers,pen,text,select"]);
  });

  it("borda da tela encaixa numa barra nova; barra inteira se move e funde", () => {
    let L = makeLayout({ bottom: [["select", "pen"]] });
    L = moveItems(L, ["pen"], { kind: "dock", side: "right" });
    expect(L.bars[1]).toMatchObject({ items: ["pen"], dock: "right", vertical: true });
    L = moveBar(L, L.bars[1].id, { kind: "float", x: 10, y: 20, vertical: true });
    expect(L.bars[1]).toMatchObject({ dock: null, x: 10, y: 20 });
    L = moveBar(L, L.bars[1].id, { kind: "into", bar: L.bars[0].id, index: 0 });
    expect(items(L)).toEqual(["pen,select"]);
  });

  it("ocultar e mostrar", () => {
    let L = hideItem(DEFAULT_LAYOUT, "paper");
    expect(findItem(L, "paper")).toBeNull();
    L = showItem(L, "paper");
    expect(findItem(L, "paper")).not.toBeNull();
  });

  it("migra o formato antigo (blocos por lado e grupos soltos)", () => {
    const L = normalizeLayout({
      version: 2, order: ["tools", "history", "colors", "size"], locked: true,
      side: { tools: "left", shapes: "hidden", history: "float", insert: "hidden", brush: "hidden", colors: "float", size: "right", map: "hidden", science: "hidden", layers: "hidden", page: "hidden" },
      floats: { history: { x: 50, y: 60, vertical: true } }, group: { colors: "history" },
    });
    expect(L.locked).toBe(true);
    expect(L.bars.find((b) => b.dock === "left")!.items).toEqual(["select", "pen", "text", "eraser", "laser", "hand"]);
    expect(L.bars.find((b) => !b.dock)).toMatchObject({ items: ["undo", "redo", "colors"], x: 50, y: 60, vertical: true });
  });

  it("aceita lixo sem quebrar e não repete itens", () => {
    expect(normalizeLayout(null).bars.length).toBeGreaterThan(0);
    const L = normalizeLayout({ version: 3, bars: [{ items: ["pen", "pen", "nada"], dock: "top" }, { items: ["pen"] }] });
    expect(L.bars).toHaveLength(1);
    expect(L.bars[0]).toMatchObject({ items: ["pen"], dock: null });
  });

  it("barra solta nunca sai da janela", () => {
    expect(clampPosition({ x: 2000, y: -40 }, { w: 100, h: 50 }, { w: 800, h: 600 })).toEqual({ x: 692, y: 8 });
  });
});
