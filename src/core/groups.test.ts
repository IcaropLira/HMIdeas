import { describe, expect, it } from "vitest";
import {
  chainOf, cloneGroups, exactGroup, expandToUnits, groupUnits, hiddenIds, idsForHit, isLockedEl, leavesOf, objectTree, placeUnits, prune,
  releaseUnits, selectionUnits, setFlag, ungroup, unitOf,
} from "./groups";
import { HirakuElement, Page, createPage, normalizeDoc } from "./model";
import { interactiveElements } from "./layers";

const rect = (id: string, x = 0): HirakuElement => ({ id, type: "rect", x, y: 0, w: 10, h: 10, angle: 0, stroke: "#000000", strokeWidth: 1, strokeStyle: "solid", fill: null, rounded: false, opacity: 1 });
const pageWith = (...ids: string[]): Page => ({ ...createPage(), elements: ids.map((id, i) => rect(id, i * 20)) });

describe("grupos hierárquicos", () => {
  it("agrupa, agrupa grupos (aninhado) e o clique pega o grupo de fora", () => {
    let p = pageWith("a", "b", "c", "d");
    const g1 = groupUnits(p, ["a", "b"], null);
    p = g1.page;
    const g2 = groupUnits(p, ["a", "b", "c"], null); // grupo de fora: [g1, c]
    p = g2.page;
    expect(chainOf(p, p.elements.find((e) => e.id === "a")!.groupId)).toEqual([g1.id, g2.id]);
    const a = p.elements.find((e) => e.id === "a")!;
    expect(unitOf(p, a, null)).toEqual({ kind: "group", id: g2.id });
    expect(unitOf(p, a, g2.id)).toEqual({ kind: "group", id: g1.id });
    expect(unitOf(p, a, g1.id)).toEqual({ kind: "el", id: "a" });
    expect(unitOf(p, p.elements.find((e) => e.id === "d")!, g1.id)).toBeNull();
    expect(idsForHit(p, a, null).sort()).toEqual(["a", "b", "c"]);
    expect(exactGroup(p, ["a", "b", "c"])).toBe(g2.id);
    expect(exactGroup(p, ["a", "b"])).toBe(g1.id);
    expect(exactGroup(p, ["a"])).toBeNull();
  });

  it("agrupar junta os membros na pilha sem mudar a ordem entre eles", () => {
    const p = groupUnits(pageWith("a", "x", "b", "y"), ["a", "b"], null).page;
    expect(p.elements.map((e) => e.id)).toEqual(["x", "a", "b", "y"]);
  });

  it("desagrupar sobe só um nível (desagrupar parcial) e tirar do grupo mantém o resto", () => {
    let p = pageWith("a", "b", "c");
    const g1 = groupUnits(p, ["a", "b"], null); p = g1.page;
    const g2 = groupUnits(p, ["a", "b", "c"], null); p = g2.page;
    const u = ungroup(p, [g2.id!]);
    expect(u.groups!.map((g) => g.id)).toEqual([g1.id]);
    expect(u.groups![0].parentId).toBeNull();
    expect(u.elements.find((e) => e.id === "c")!.groupId).toBeNull();
    const r = releaseUnits(p, ["a"], g1.id!);
    expect(r.elements.find((e) => e.id === "a")!.groupId).toBe(g2.id);
    expect(r.elements.find((e) => e.id === "b")!.groupId).toBe(g1.id);
  });

  it("grupo vazio some (em cascata) e ciclos de arquivo estragado são desfeitos", () => {
    const p: Page = { ...pageWith("a"), groups: [{ id: "g1", name: "G", parentId: "g2" }, { id: "g2", name: "H", parentId: "g1" }], elements: [{ ...rect("a"), groupId: "g1" }] };
    const n = prune(p);
    expect(chainOf(n, "g1").length).toBeLessThanOrEqual(2);
    expect(prune({ ...pageWith("a"), groups: [{ id: "g", name: "G", parentId: null }] }).groups).toBeUndefined();
  });

  it("travar/ocultar valem pelo grupo e saem da interação", () => {
    let p = pageWith("a", "b", "c");
    const g = groupUnits(p, ["a", "b"], null); p = g.page;
    p = setFlag(p, [{ kind: "group", id: g.id! }], "locked", true);
    expect(isLockedEl(p, p.elements[0])).toBe(true);
    expect(interactiveElements(p).map((e) => e.id)).toEqual(["c"]);
    p = setFlag(p, [{ kind: "el", id: "c" }], "hidden", true);
    expect([...hiddenIds(p)]).toEqual(["c"]);
  });

  it("seleção por área: grupo só entra inteiro no modo 'dentro'; no 'tocando' entra se tocar", () => {
    const p = groupUnits(pageWith("a", "b", "c"), ["a", "b"], null).page;
    expect(expandToUnits(p, ["a"], null, true)).toEqual([]);
    expect(expandToUnits(p, ["a"], null, false).sort()).toEqual(["a", "b"]);
    expect(expandToUnits(p, ["a", "b", "c"], null, true).sort()).toEqual(["a", "b", "c"]);
    expect(selectionUnits(p, ["a", "b", "c"], null).length).toBe(2);
  });

  it("copiar um grupo inteiro cria grupo novo; copiar parte dele deixa a cópia no mesmo grupo", () => {
    const g = groupUnits(pageWith("a", "b"), ["a", "b"], null);
    const p = g.page;
    const whole = cloneGroups(p, p.elements, p.elements.map((e) => ({ ...e, id: e.id + "2" })), p);
    expect(whole.groups.length).toBe(1);
    expect(whole.copies.every((c) => c.groupId === whole.groups[0].id)).toBe(true);
    const part = cloneGroups(p, [p.elements[0]], [{ ...p.elements[0], id: "a2" }], p);
    expect(part.groups.length).toBe(0);
    expect(part.copies[0].groupId).toBe(g.id);
  });

  it("árvore de objetos da frente para trás, e arrastar para dentro de um grupo", () => {
    let p = pageWith("a", "b", "c");
    const g = groupUnits(p, ["a", "b"], null); p = g.page;
    const tree = objectTree(p, (e) => e.id);
    expect(tree.map((t) => t.unit.kind === "group" ? "G" : t.unit.id)).toEqual(["c", "G"]);
    expect(tree[1].children.map((t) => t.unit.id)).toEqual(["b", "a"]);
    const q = placeUnits(p, [{ kind: "el", id: "c" }], { kind: "group", id: g.id! }, "inside");
    expect(leavesOf(q, g.id!).map((e) => e.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("o arquivo guarda grupos e campos novos (e limpa lixo)", () => {
    const doc = normalizeDoc({ version: 1, pages: [{ id: "p", name: "P", elements: [{ ...rect("a"), groupId: "g", locked: true, invisible: "sim", name: "  Logo  " }], groups: [{ id: "g", name: "Topo", parentId: "nada", hidden: true }, { id: 3 }] }] });
    const p = doc.pages[0];
    expect(p.groups).toEqual([{ id: "g", name: "Topo", parentId: null, hidden: true }]);
    expect(p.elements[0]).toMatchObject({ groupId: "g", locked: true, name: "Logo" });
    expect("invisible" in p.elements[0]).toBe(false);
  });
});
