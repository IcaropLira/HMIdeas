import { describe, expect, it } from "vitest";
import { BLOCK_KINDS, blockHitAt, blockPrims, blockTap, cleanBlock, defaultBlock, defaultBlockSize, fitBlock, wrap, approxTextMeasure } from "./index";
import { blockAt } from "../blockElement";
import { normalizeDoc } from "../model";
import { TEMPLATES } from "../templates";
import { isBindable, makeBinding, solveArrow } from "../binding";
import { HirakuElement, LinearElement } from "../model";

describe("blocos", () => {
  it("todo tipo tem padrão válido, sobrevive ao saneamento e gera primitivas dentro da caixa", () => {
    for (const k of BLOCK_KINDS) {
      const spec = defaultBlock(k.id);
      expect(cleanBlock(spec)).toEqual(spec);
      const { w, h } = defaultBlockSize(spec);
      const p = blockPrims(spec, w, h);
      expect(p.texts.length + p.rects.length).toBeGreaterThan(0);
      for (const t of p.texts) { expect(t.y).toBeGreaterThanOrEqual(-10); expect(t.y).toBeLessThan(h); }
    }
  });

  it("saneia lixo: tipo desconhecido some, cor inválida volta ao padrão, tabela fica retangular", () => {
    expect(cleanBlock({ kind: "nada" })).toBeNull();
    expect(cleanBlock(null)).toBeNull();
    const s = cleanBlock({ kind: "sticky", text: 3, color: "red" });
    expect(s).toEqual({ kind: "sticky", text: "", color: defaultBlock("sticky").kind === "sticky" ? (defaultBlock("sticky") as { color: string }).color : "" });
    const t = cleanBlock({ kind: "table", rows: [["a", "b", "c"], ["d"]] });
    expect(t && t.kind === "table" && t.rows.map((r) => r.length)).toEqual([3, 3]);
  });

  it("lista de tarefas: tocar na caixinha marca e desmarca", () => {
    const spec = defaultBlock("todo");
    if (spec.kind !== "todo") throw 0;
    const { w, h } = defaultBlockSize(spec);
    const p = blockPrims(spec, w, h);
    const box = p.hits[1];
    const hit = blockHitAt(p, box.x + 10, box.y + 10)!;
    expect(hit.index).toBe(1);
    const once = blockTap(spec, hit);
    expect(once.kind === "todo" && once.items[1].done).toBe(true);
    const twice = blockTap(once, hit);
    expect(twice).toEqual(spec);
    expect(blockHitAt(p, w - 5, 5)).toBeNull();
  });

  it("quebra de linha respeita a largura e corta palavra gigante", () => {
    const lines = wrap("um dois três quatro cinco seis sete", 60, 10, approxTextMeasure);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(approxTextMeasure(l, 10, "sans")).toBeLessThanOrEqual(60);
    const long = wrap("a".repeat(100), 50, 10, approxTextMeasure);
    expect(long.length).toBeGreaterThan(5);
  });

  it("tabela cresce por coluna; lista cresce com os itens", () => {
    const t = defaultBlock("table");
    if (t.kind !== "table") throw 0;
    const more = { ...t, rows: t.rows.map((r) => [...r, ""]) };
    expect(fitBlock(t, more, 300, 120).w).toBe(400);
    const td = defaultBlock("todo");
    if (td.kind !== "todo") throw 0;
    const big = { ...td, items: [...td.items, ...Array.from({ length: 6 }, () => ({ text: "x", done: false }))] };
    expect(fitBlock(td, big, 300, 160).h).toBeGreaterThan(300);
  });

  it("bloco vai e volta pelo arquivo e aceita setas ligadas", () => {
    const a = blockAt(defaultBlock("sticky"), 0, 0);
    const b = blockAt(defaultBlock("card"), 400, 0);
    expect(isBindable(a)).toBe(true);
    const doc = normalizeDoc({ version: 1, pages: [{ id: "p", name: "P", paper: "blank", background: "#FFFFFF", elements: [a, b] }], activePageId: "p" });
    const back = doc.pages[0].elements[0];
    expect(back.type === "attachment" && back.block).toEqual(a.block);
    const arrow: LinearElement = { id: "ar", type: "arrow", points: [{ x: 100, y: 100 }, { x: 500, y: 80 }], stroke: "#000", strokeWidth: 2, strokeStyle: "solid", startHead: "none", endHead: "triangle", curved: false, opacity: 1, startBinding: makeBinding(a, { x: 110, y: 110 }), endBinding: makeBinding(b, { x: 540, y: 80 }) };
    const solved = solveArrow(arrow, new Map<string, HirakuElement>([[a.id, a], [b.id, b]]));
    expect(solved.points[0].x).toBeGreaterThan(a.x + a.w - 1); // grudou na borda direita do post-it
    expect(solved.points[1].x).toBeLessThan(b.x + 1);
  });

  it("modelos de organização/estudo são feitos de blocos dentro de um quadro que os envolve", () => {
    for (const id of ["brainstorm", "todo", "kanban", "week", "timeline", "table", "cornell", "swot", "slides", "doc", "project"]) {
      const els = TEMPLATES.find((t) => t.id === id)!.build();
      const frame = els.find((e) => e.type === "frame")!;
      if (frame.type !== "frame") throw 0;
      const blocks = els.filter((e) => e.type === "attachment" && e.kind === "block");
      expect(blocks.length, id).toBeGreaterThan(0);
      for (const b of blocks) {
        if (b.type !== "attachment") throw 0;
        expect(b.frameId).toBe(frame.id);
        expect(b.x).toBeGreaterThanOrEqual(frame.x);
        expect(b.x + b.w).toBeLessThanOrEqual(frame.x + frame.w + 0.5);
      }
    }
  });
});
