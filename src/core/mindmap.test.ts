import { describe, expect, it } from "vitest";
import { makeFrame, settleFrames, ungroupFrame, wrapInFrame } from "./frames";
import { HirakuElement, NodeElement } from "./model";
import {
  addChild, addSibling, approxMeasure, childrenMap, mapFromOutline, newRoot, nodesOf, parseOutline, relayout, reparent,
  setAllCollapsed, subtreeIds, toOutline, toggleCollapse, rootOf,
} from "./mindmap";
import { reidentify } from "./binding";
import { normalizeDoc } from "./model";

const M = approxMeasure;
const overlap = (a: NodeElement, b: NodeElement) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function build() {
  let els: HirakuElement[] = [];
  const r = newRoot(els, 0, 0, "Centro", M);
  els = r.elements;
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) {
    const a = addChild(els, r.id, "Ramo " + i, M)!;
    els = a.elements;
    ids.push(a.id);
    for (let j = 0; j < 3; j++) {
      const b = addChild(els, a.id, "Sub " + i + j, M)!;
      els = b.elements;
    }
  }
  return { els, root: r.id, ids };
}

describe("mapa mental", () => {
  it("layout sem sobreposição de nós visíveis", () => {
    const { els } = build();
    const ns = nodesOf(els);
    expect(ns.length).toBe(1 + 4 + 12);
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) expect(overlap(ns[i], ns[j])).toBe(false);
  });

  it("dois lados: ramos de cada lado da raiz", () => {
    const { els, root } = build();
    const r = nodesOf(els).find((n) => n.id === root)!;
    const kids = childrenMap(els).get(root)!;
    const left = kids.filter((k) => k.x + k.w / 2 < r.x + r.w / 2).length;
    expect(left).toBe(2);
  });

  it("recolher esconde descendentes e libera o espaço", () => {
    const { els, ids } = build();
    const col = toggleCollapse(els, ids[0], true);
    const hid = nodesOf(col).filter((n) => n.hidden).length;
    expect(hid).toBe(3);
    expect(nodesOf(toggleCollapse(col, ids[0], false)).some((n) => n.hidden)).toBe(false);
  });

  it("recolher/expandir tudo", () => {
    const { els, root } = build();
    const all = setAllCollapsed(els, root, true, 1);
    expect(nodesOf(all).filter((n) => n.hidden).length).toBe(12);
    const open = setAllCollapsed(all, root, false);
    expect(nodesOf(open).some((n) => n.hidden || n.collapsed)).toBe(false);
  });

  it("irmão e reparentar (sem ciclos)", () => {
    const { els, ids } = build();
    const s = addSibling(els, ids[1], "Novo", M)!;
    const n = nodesOf(s.elements).find((x) => x.id === s.id)!;
    expect(n.parentId).toBe(nodesOf(els).find((x) => x.id === ids[1])!.parentId);
    const sub = [...subtreeIds(els, ids[0])];
    expect(reparent(els, ids[0], sub[1])).toBe(els); // pai dentro do próprio ramo: recusa
    const moved = reparent(els, ids[0], ids[1]);
    expect(rootOf(moved, ids[0])!.text).toBe("Centro");
    expect(nodesOf(moved).find((x) => x.id === ids[0])!.parentId).toBe(ids[1]);
  });

  it("relayout é idempotente", () => {
    const { els } = build();
    expect(relayout(els)).toBe(els);
  });

  it("outline: ida e volta", () => {
    const { els, root } = build();
    const txt = toOutline(els, root);
    const items = parseOutline(txt);
    expect(items.length).toBe(17);
    expect(items[0]).toEqual({ text: "Centro", depth: 0 });
    const m = mapFromOutline([], items, { x: 0, y: 0 }, M)!;
    expect(nodesOf(m.elements).length).toBe(17);
  });

  it("outline com tabs, números e saltos de nível", () => {
    const it = parseOutline("Tema\n\tA\n\t\t\t\tfundo\n1. B");
    expect(it.map((i) => i.depth)).toEqual([0, 1, 2, 0]);
  });

  it("cópia remapeia pai e quadro", () => {
    const { els } = build();
    const copy = reidentify(els);
    const ids = new Set(copy.map((e) => e.id));
    for (const n of nodesOf(copy)) if (n.parentId) expect(ids.has(n.parentId)).toBe(true);
    const part = reidentify(els.filter((e) => e.type === "node" && e.text.startsWith("Sub")));
    expect(nodesOf(part).every((n) => n.parentId === null)).toBe(true);
  });

  it("normalizeDoc aceita nós/quadros e descarta lixo", () => {
    const { els } = build();
    const doc = normalizeDoc({ version: 1, pages: [{ id: "p", name: "x", elements: [...els, { type: "node", id: "bad" }, makeFrame("f", 0, 0, 10, 10)] }] });
    expect(doc.pages[0].elements.some((e) => e.type === "frame")).toBe(true);
  });
});

describe("quadros", () => {
  it("adota pelo quadro mais interno e aceita aninhamento", () => {
    const big = makeFrame("big", 0, 0, 1000, 1000);
    const small = makeFrame("small", 100, 100, 300, 300);
    const t = { id: "t", type: "text", x: 150, y: 150, w: 20, h: 20, angle: 0, text: "x", fontSize: 16, fontFamily: "sans", align: "left", color: "#000", opacity: 1 } as HirakuElement;
    let els: HirakuElement[] = [big, small, t];
    els = settleFrames(els, ["small", "t"]);
    expect(els.find((e) => e.id === "t")!.frameId).toBe("small");
    expect(els.find((e) => e.id === "small")!.frameId).toBe("big");
    expect(els.find((e) => e.id === "big")!.frameId ?? null).toBe(null);
  });

  it("quadro nunca entra num descendente", () => {
    const a = makeFrame("a", 0, 0, 500, 500);
    const b = { ...makeFrame("b", 100, 100, 100, 100), frameId: "a" };
    const out = settleFrames([a, b], ["a"]);
    expect(out.find((e) => e.id === "a")!.frameId ?? null).toBe(null);
  });

  it("envolver e desfazer", () => {
    const { els } = build();
    const ids = nodesOf(els).slice(0, 3).map((n) => n.id);
    const w = wrapInFrame(els, ids)!;
    expect(w.elements[0].type).toBe("frame");
    expect(w.elements.filter((e) => e.frameId === w.id).length).toBeGreaterThan(0);
    const u = ungroupFrame(w.elements, w.id);
    expect(u.some((e) => e.type === "frame")).toBe(false);
    expect(u.every((e) => !e.frameId)).toBe(true);
  });
});
