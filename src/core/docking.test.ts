import { describe, expect, it } from "vitest";
import {
  clampFloats, closePanel, dockOf, dropPanels, emptyDock, findPanel, isShowing, normalizeDock, openPanel, openPanels, resizeArea, resizeStacks, togglePanel,
} from "./docking";
import { PRESETS, normalizeList, presetWorkspace } from "./workspace";

describe("gerenciador de janelas acopláveis", () => {
  const base = () => dockOf({ right: { stacks: [["props", "transform"], ["objects"]] } });

  it("fechar guarda o lugar e reabrir volta para ele", () => {
    let L = closePanel(base(), "transform");
    expect(findPanel(L, "transform")).toBeNull();
    L = openPanel(L, "transform");
    expect(findPanel(L, "transform")).toMatchObject({ where: "dock", side: "right", stack: 0 });
    L = closePanel(L, "objects");
    expect(L.areas.right.stacks.length).toBe(1);
    L = openPanel(L, "objects");
    expect(L.areas.right.stacks.length).toBe(2);
  });

  it("juntar como aba, dividir, encostar numa borda e flutuar", () => {
    let L = dropPanels(base(), ["objects"], { kind: "tab", side: "right", stack: 0 });
    expect(L.areas.right.stacks.length).toBe(1);
    expect(L.areas.right.stacks[0].panels).toEqual(["props", "transform", "objects"]);
    expect(L.areas.right.stacks[0].active).toBe("objects");
    L = dropPanels(L, ["props"], { kind: "split", side: "right", stack: 0, where: "after" });
    expect(L.areas.right.stacks.map((s) => s.panels)).toEqual([["transform", "objects"], ["props"]]);
    L = dropPanels(L, ["layers"], { kind: "edge", side: "left" });
    expect(L.areas.left.stacks[0].panels).toEqual(["layers"]);
    L = dropPanels(L, ["transform", "objects"], { kind: "float", x: 10, y: 20, w: 300, h: 300 });
    expect(L.floats[0].panels).toEqual(["transform", "objects"]);
    expect(openPanels(L).sort()).toEqual(["layers", "objects", "props", "transform"]);
  });

  it("alternar: painel escondido atrás de outra aba vira ativo; visível fecha", () => {
    let L = base();
    expect(isShowing(L, "transform")).toBe(false);
    L = togglePanel(L, "transform");
    expect(isShowing(L, "transform")).toBe(true);
    L = togglePanel(L, "transform");
    expect(findPanel(L, "transform")).toBeNull();
  });

  it("limites de tamanho, divisória e janelas fora da tela", () => {
    expect(resizeArea(base(), "right", 10).areas.right.size).toBe(200);
    const s = resizeStacks(base(), "right", 0, 0.75).areas.right.stacks;
    expect(s[0].size / (s[0].size + s[1].size)).toBeCloseTo(0.75);
    let L = dropPanels(base(), ["layers"], { kind: "float", x: 5000, y: -300, w: 900, h: 900 });
    L = clampFloats(L, 800, 600);
    expect(L.floats[0].x).toBeLessThanOrEqual(720);
    expect(L.floats[0].y).toBeGreaterThanOrEqual(8);
    expect(L.floats[0].h).toBeLessThanOrEqual(584);
  });

  it("aceita qualquer JSON e nunca duplica um painel", () => {
    const L = normalizeDock({ areas: { right: { stacks: [{ panels: ["props", "props", "xyz"] }, { panels: ["props"] }] } }, floats: [{ panels: ["objects"], x: "a" }] });
    expect(openPanels(L)).toEqual(["props", "objects"]);
    expect(normalizeDock(null)).toEqual(emptyDock());
  });
});

describe("áreas de trabalho", () => {
  it("as prontas sempre existem e as do usuário são mantidas", () => {
    const list = normalizeList([{ id: "minha", name: "Minha", dock: { areas: {} }, chrome: { menubar: false } }, { id: "geral", name: "Geral mexida" }]);
    expect(list.slice(0, PRESETS.length).map((w) => w.id)).toEqual(PRESETS.map((p) => p.id));
    expect(list.find((w) => w.id === "geral")!.name).toBe("Geral mexida");
    const mine = list.find((w) => w.id === "minha")!;
    expect(mine.chrome.menubar).toBe(false);
    expect(mine.chrome.statusbar).toBe(true);
  });
  it("cada área pronta é válida", () => {
    for (const p of PRESETS) {
      const w = presetWorkspace(p.id);
      expect(normalizeDock(w.dock)).toEqual(w.dock);
    }
    expect(presetWorkspace("minimalista").chrome).toMatchObject({ menubar: false, pills: true });
  });
});
