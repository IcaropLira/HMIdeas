import { describe, expect, it } from "vitest";
import { BLOCKS, DEFAULT_LAYOUT, LAYOUT_KEY, blocksOn, clampPosition, loadLayout, moveBlock, normalizeLayout, placeBlock, saveLayout, snapPosition } from "./layout";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("layout das barras", () => {
  it("o padrão tem só o essencial embaixo, cor/espessura/pincéis na direita e o resto na esquerda", () => {
    expect(blocksOn(DEFAULT_LAYOUT, "bottom")).toEqual(["tools", "shapes", "history"]);
    expect(blocksOn(DEFAULT_LAYOUT, "right")).toEqual(["brush", "colors", "size"]);
    expect(blocksOn(DEFAULT_LAYOUT, "left")).toEqual(["map", "page"]);
    expect(blocksOn(DEFAULT_LAYOUT, "hidden")).toEqual([]);
  });

  it("todo bloco tem nome e aparece uma única vez na ordem", () => {
    expect(new Set(DEFAULT_LAYOUT.order).size).toBe(BLOCKS.length);
    for (const b of BLOCKS) expect(b.label.length).toBeGreaterThan(0);
  });

  it("placeBlock leva o bloco para o fim do outro lado, sem mexer no resto", () => {
    const l = placeBlock(DEFAULT_LAYOUT, "tools", "right");
    expect(blocksOn(l, "right")).toEqual(["brush", "colors", "size", "tools"]);
    expect(blocksOn(l, "bottom")).toEqual(["shapes", "history"]);
    expect(placeBlock(DEFAULT_LAYOUT, "tools", "bottom")).toBe(DEFAULT_LAYOUT); // nada a fazer
  });

  it("placeBlock para um lado vazio funciona (e oculto tira da tela)", () => {
    const l = placeBlock(DEFAULT_LAYOUT, "colors", "hidden");
    expect(blocksOn(l, "hidden")).toEqual(["colors"]);
    expect(blocksOn(l, "right")).toEqual(["brush", "size"]);
  });

  it("moveBlock troca com o vizinho do MESMO lado e para nas pontas", () => {
    expect(blocksOn(moveBlock(DEFAULT_LAYOUT, "colors", -1), "right")).toEqual(["colors", "brush", "size"]);
    expect(blocksOn(moveBlock(DEFAULT_LAYOUT, "colors", 1), "right")).toEqual(["brush", "size", "colors"]);
    expect(moveBlock(DEFAULT_LAYOUT, "tools", -1)).toBe(DEFAULT_LAYOUT);
    expect(moveBlock(DEFAULT_LAYOUT, "history", 1)).toBe(DEFAULT_LAYOUT);
  });

  it("não muda o layout original (imutável)", () => {
    const before = JSON.stringify(DEFAULT_LAYOUT);
    placeBlock(DEFAULT_LAYOUT, "tools", "left");
    moveBlock(DEFAULT_LAYOUT, "colors", -1);
    expect(JSON.stringify(DEFAULT_LAYOUT)).toBe(before);
  });
});

describe("normalizeLayout / persistência", () => {
  it("lixo ou vazio vira o padrão", () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout("oi")).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout({ order: 3, side: [] })).toEqual(DEFAULT_LAYOUT);
  });

  it("descarta ids e lados inválidos, tira repetidos e devolve os blocos que faltam", () => {
    const l = normalizeLayout({ order: ["colors", "colors", "fantasma", "tools"], side: { colors: "left", tools: "cima", fantasma: "left" } });
    expect(l.order.slice(0, 2)).toEqual(["colors", "tools"]);
    expect(new Set(l.order).size).toBe(BLOCKS.length);
    expect(l.side.colors).toBe("left");
    expect(l.side.tools).toBe("bottom"); // lado inválido volta ao padrão
    expect("fantasma" in l.side).toBe(false);
  });

  it("salva e carrega; JSON quebrado ou storage ausente caem no padrão sem lançar erro", () => {
    const s = memory();
    const l = placeBlock(DEFAULT_LAYOUT, "tools", "left");
    saveLayout(l, s);
    expect(loadLayout(s)).toEqual(l);
    s.setItem(LAYOUT_KEY, "{quebrado");
    expect(loadLayout(s)).toEqual(DEFAULT_LAYOUT);
    expect(loadLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(() => saveLayout(l, null)).not.toThrow();
    const cheio = { ...memory(), setItem: () => { throw new Error("cota"); } };
    expect(() => saveLayout(l, cheio)).not.toThrow();
  });
});

describe("blocos flutuantes", () => {
  it("placeBlock para 'float' guarda a posição pedida; sem posição usa uma padrão escalonada", () => {
    const a = placeBlock(DEFAULT_LAYOUT, "tools", "float", { x: 200, y: 90, vertical: true });
    expect(a.side.tools).toBe("float");
    expect(a.floats.tools).toEqual({ x: 200, y: 90, vertical: true });
    expect(blocksOn(a, "bottom")).toEqual(["shapes", "history"]);
    const b = placeBlock(a, "shapes", "float");
    expect(b.floats.shapes).toBeDefined();
    expect(b.floats.shapes).not.toEqual(b.floats.tools); // não empilha um sobre o outro
  });

  it("mover um bloco que já flutua só muda a posição (e não mexe na ordem)", () => {
    const a = placeBlock(DEFAULT_LAYOUT, "tools", "float", { x: 10, y: 10, vertical: false });
    const b = placeBlock(a, "tools", "float", { x: 300, y: 50, vertical: true });
    expect(b.floats.tools).toEqual({ x: 300, y: 50, vertical: true });
    expect(b.order).toEqual(a.order);
  });

  it("sair do modo flutuante apaga a posição guardada", () => {
    const a = placeBlock(DEFAULT_LAYOUT, "tools", "float", { x: 10, y: 10, vertical: false });
    const b = placeBlock(a, "tools", "bottom");
    expect(b.floats.tools).toBeUndefined();
    expect(b.side.tools).toBe("bottom");
  });

  it("layout da versão 1 (sem floats/locked) continua valendo", () => {
    const v1 = { version: 1, order: DEFAULT_LAYOUT.order, side: { ...DEFAULT_LAYOUT.side, colors: "left" } };
    const l = normalizeLayout(v1);
    expect(l.version).toBe(2);
    expect(l.side.colors).toBe("left");
    expect(l.floats).toEqual({});
    expect(l.locked).toBe(false);
  });

  it("flutuante sem posição válida volta ao lado padrão; posição inválida é descartada", () => {
    const l = normalizeLayout({ side: { tools: "float", colors: "float" }, floats: { colors: { x: "a", y: 3, vertical: true }, tools: { x: 5, y: 6, vertical: false } } });
    expect(l.side.tools).toBe("float");
    expect(l.floats.tools).toEqual({ x: 5, y: 6, vertical: false });
    expect(l.side.colors).toBe("right"); // padrão do bloco
    expect(l.floats.colors).toBeUndefined();
    expect(normalizeLayout({ side: { tools: "float" }, floats: { tools: { x: Infinity, y: 1, vertical: false } } }).side.tools).toBe("bottom");
  });

  it("'locked' só vale se for exatamente true", () => {
    expect(normalizeLayout({ locked: true }).locked).toBe(true);
    expect(normalizeLayout({ locked: "sim" }).locked).toBe(false);
  });

  it("salva e recarrega posição e trava", () => {
    const s = memory();
    const l = { ...placeBlock(DEFAULT_LAYOUT, "colors", "float", { x: 33, y: 44, vertical: true }), locked: true };
    saveLayout(l, s);
    expect(loadLayout(s)).toEqual(l);
  });
});

describe("clampPosition (nunca sai da tela)", () => {
  const vp = { w: 1000, h: 700 };
  const size = { w: 300, h: 60 };

  it("mantém o que já está dentro", () => {
    expect(clampPosition({ x: 100, y: 100 }, size, vp)).toEqual({ x: 100, y: 100 });
  });

  it("puxa de volta o que passou de qualquer borda, respeitando a margem", () => {
    expect(clampPosition({ x: -50, y: -9 }, size, vp)).toEqual({ x: 8, y: 8 });
    expect(clampPosition({ x: 900, y: 690 }, size, vp)).toEqual({ x: 1000 - 300 - 8, y: 700 - 60 - 8 });
  });

  it("bloco maior que a janela fica colado no canto de cima/esquerda (e continua alcançável)", () => {
    expect(clampPosition({ x: 400, y: 400 }, { w: 2000, h: 2000 }, vp)).toEqual({ x: 8, y: 8 });
  });

  it("janela encolhida (rotação, redimensionar) reposiciona o que ficou para fora", () => {
    expect(clampPosition({ x: 700, y: 500 }, size, { w: 500, h: 400 })).toEqual({ x: 500 - 300 - 8, y: 400 - 60 - 8 });
  });
});

describe("snapPosition (ímã nas bordas)", () => {
  const vp = { w: 1000, h: 700 };
  const horiz = { w: 300, h: 60 };
  const vert = { w: 60, h: 300 };

  it("longe de tudo: não gruda nem muda a orientação", () => {
    const r = snapPosition({ x: 200, y: 150 }, horiz, vp, false);
    expect(r).toMatchObject({ x: 200, y: 150, vertical: false, edgeX: null, edgeY: null });
  });

  it("perto da borda esquerda gruda nela e vira vertical", () => {
    const r = snapPosition({ x: 20, y: 150 }, vert, vp, false);
    expect(r).toMatchObject({ x: 8, y: 150, vertical: true, edgeX: "start" });
  });

  it("perto da borda direita gruda e vira vertical", () => {
    const r = snapPosition({ x: 1000 - 60 - 8 - 10, y: 150 }, vert, vp, false);
    expect(r).toMatchObject({ x: 1000 - 60 - 8, vertical: true, edgeX: "end" });
  });

  it("perto de cima/embaixo gruda e vira horizontal", () => {
    expect(snapPosition({ x: 200, y: 14 }, horiz, vp, true)).toMatchObject({ y: 8, vertical: false, edgeY: "start" });
    expect(snapPosition({ x: 200, y: 700 - 60 - 8 - 12 }, horiz, vp, true)).toMatchObject({ y: 700 - 60 - 8, vertical: false, edgeY: "end" });
  });

  it("num canto (duas bordas) mantém a orientação que tinha", () => {
    expect(snapPosition({ x: 10, y: 10 }, horiz, vp, false)).toMatchObject({ x: 8, y: 8, vertical: false });
    expect(snapPosition({ x: 10, y: 10 }, vert, vp, true)).toMatchObject({ x: 8, y: 8, vertical: true });
  });

  it("o centro da tela também atrai (barra centralizada)", () => {
    const r = snapPosition({ x: (1000 - 300) / 2 + 9, y: 300 }, horiz, vp, false);
    expect(r.x).toBe(350);
    expect(r.edgeX).toBe("center");
    expect(r.vertical).toBe(false); // centro não muda orientação
  });

  it("fora do alcance do ímã não gruda", () => {
    expect(snapPosition({ x: 60, y: 150 }, horiz, vp, false).edgeX).toBeNull();
  });

  it("soltar fora da tela sempre acaba dentro dela", () => {
    const r = snapPosition({ x: -500, y: 5000 }, horiz, vp, false);
    expect(r.x).toBeGreaterThanOrEqual(8);
    expect(r.y).toBeLessThanOrEqual(700 - 60 - 8);
    expect(r.x + 300).toBeLessThanOrEqual(1000);
  });

  it("a barra de páginas aberta (insetLeft) reserva espaço: o ímã da esquerda cola depois dela", () => {
    expect(snapPosition({ x: 250, y: 150 }, vert, vp, false, { insetLeft: 256 })).toMatchObject({ x: 264, vertical: true, edgeX: "start" });
  });

  it("janela minúscula (bloco não cabe) não gera posição negativa nem NaN", () => {
    const r = snapPosition({ x: 50, y: 50 }, { w: 800, h: 900 }, { w: 400, h: 300 }, false);
    expect(Number.isFinite(r.x) && Number.isFinite(r.y)).toBe(true);
    expect(r.x).toBeGreaterThanOrEqual(8);
    expect(r.y).toBeGreaterThanOrEqual(8);
  });
});
