import { describe, expect, it } from "vitest";
import { BoardGraph, GRAPH_PRESETS, bfs, bipartite, buildGraphElements, colorGraph, components, dfs, graphFromElements, graphToText, hasCycle, layoutGraph, mst, parseGraph, shortestPath, topoSort } from "./graph";
import { normalizeDoc } from "./model";

const board = (text: string): BoardGraph => graphFromElements(buildGraphElements(parseGraph(text), "circle"));
const name = (g: BoardGraph) => (id: string) => g.vertices.find((v) => v.id === id)!.text;
const idOf = (g: BoardGraph, t: string) => g.vertices.find((v) => v.text === t)!.id;

describe("grafos: leitura", () => {
  it("aceita vários formatos", () => {
    const g = parseGraph("A - B : 4\nB -> C 7\nC <- D\nE, F, 2\nG: H I\nBack-end -> Testes\nSolto");
    expect(g.errors).toEqual([]);
    expect(g.vertices).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "Back-end", "Testes", "Solto"]);
    expect(g.edges[0]).toMatchObject({ a: "A", b: "B", directed: false, w: 4 });
    expect(g.edges[1]).toMatchObject({ a: "B", b: "C", directed: true, w: 7 });
    expect(g.edges[2]).toMatchObject({ a: "D", b: "C", directed: true });
    expect(g.edges[3]).toMatchObject({ a: "E", b: "F", w: 2 });
    expect(g.edges.filter((e) => e.a === "G")).toHaveLength(2);
    expect(g.edges.find((e) => e.a === "Back-end")).toMatchObject({ b: "Testes", directed: true });
  });
  it("rótulo não numérico vira texto (autômatos)", () => {
    expect(parseGraph("q0 -> q1 : a").edges[0]).toMatchObject({ label: "a", directed: true });
  });
  it("todos os exemplos são lidos sem erro e montam elementos válidos", () => {
    for (const p of GRAPH_PRESETS) {
      const g = parseGraph(p.text);
      expect(g.errors, p.id).toEqual([]);
      const els = buildGraphElements(g, p.layout);
      const doc = normalizeDoc({ version: 1, pages: [{ id: "p", name: "P", paper: "blank", background: "#FFFFFF", elements: els }] });
      expect(doc.pages[0].elements.length).toBe(els.length);
    }
  });
  it("layouts devolvem posição para todo vértice, sem NaN", () => {
    const g = parseGraph(GRAPH_PRESETS.find((p) => p.id === "petersen")!.text);
    for (const k of ["circle", "force", "layers", "tree", "grid"] as const) {
      const pos = layoutGraph(g, k);
      expect(pos.size).toBe(10);
      for (const p of pos.values()) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });
});

describe("grafos: algoritmos", () => {
  it("BFS e DFS em ordem alfabética dos vizinhos", () => {
    const g = board("A-B; A-C; B-D; C-D; D-E");
    const n = name(g);
    expect(bfs(g, idOf(g, "A")).order.map(n)).toEqual(["A", "B", "C", "D", "E"]);
    expect(dfs(g, idOf(g, "A")).order.map(n)).toEqual(["A", "B", "D", "C", "E"]);
  });
  it("menor caminho com pesos", () => {
    const g = board("A - B : 4\nA - C : 1\nC - B : 1\nB - D : 5");
    const r = shortestPath(g, idOf(g, "A"), idOf(g, "D"))!;
    expect(r.dist).toBe(7);
    expect(r.path.map(name(g))).toEqual(["A", "C", "B", "D"]);
  });
  it("componentes, ciclos e ordenação topológica", () => {
    const g = graphFromElements(buildGraphElements(parseGraph("A-B; C-D"), "grid"));
    expect(components(g)).toHaveLength(2);
    const dag = board("a -> b; b -> c; a -> c");
    expect(topoSort(dag)!.map(name(dag))).toEqual(["a", "b", "c"]);
    expect(hasCycle(dag)).toBe(false);
    expect(topoSort(board("a -> b; b -> a"))).toBeNull();
    expect(hasCycle(board("1-2;2-3;3-1"))).toBe(true);
  });
  it("coloração própria, bipartição e árvore geradora mínima", () => {
    const k5 = board("A-B; A-C; A-D; A-E; B-C; B-D; B-E; C-D; C-E; D-E");
    const c = colorGraph(k5);
    expect(new Set(c.values()).size).toBe(5);
    for (const e of k5.edges) expect(c.get(e.a)).not.toBe(c.get(e.b));
    expect(bipartite(board("1-2;2-3;3-4;4-1"))).not.toBeNull();
    expect(bipartite(board("1-2;2-3;3-1"))).toBeNull();
    expect(mst(board("A - B : 1\nB - C : 2\nA - C : 5")).total).toBe(3);
  });
  it("texto de volta", () => {
    expect(graphToText(board("A -> B : 3"))).toBe("A -> B : 3");
  });
});
