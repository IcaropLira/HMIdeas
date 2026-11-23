import { describe, expect, it } from "vitest";
import { ALGORITHMS, GENERATORS, adjacencyMatrix, bstEdges, generate, matrixToEdges, runAlgorithm } from "./graphAlgo";
import { buildGraphElements, graphFromElements, parseGraph } from "./graph";

const board = (t: string) => graphFromElements(buildGraphElements(parseGraph(t), "circle"));
const id = (g: ReturnType<typeof board>, t: string) => g.vertices.find((v) => v.text === t)!.id;
const nm = (g: ReturnType<typeof board>) => (x: string) => g.vertices.find((v) => v.id === x)!.text;

describe("algoritmos passo a passo", () => {
  it("todo algoritmo roda e termina com uma frase", () => {
    const g = board("A - B : 2\nB - C : 1\nA - C : 5\nC - D : 3");
    for (const a of ALGORITHMS) {
      const st = runAlgorithm(g, a.id, id(g, "A"), id(g, "D"));
      expect(st.length, a.id).toBeGreaterThan(1);
      expect(st[st.length - 1].note.length).toBeGreaterThan(5);
    }
  });
  it("Dijkstra destaca o menor caminho", () => {
    const g = board("A - B : 2\nB - C : 1\nA - C : 5\nC - D : 3");
    const st = runAlgorithm(g, "dijkstra", id(g, "A"), id(g, "D"));
    expect(st[st.length - 1].highlight!.vertices!.map(nm(g))).toEqual(["A", "B", "C", "D"]);
  });
  it("pontes e articulações", () => {
    const g = board("A-B; B-C; C-A; C-D; D-E; E-F; F-D");
    const last = runAlgorithm(g, "bridges").at(-1)!;
    expect(last.highlight!.edges!.length).toBe(1);
    expect(last.highlight!.vertices!.map(nm(g)).sort()).toEqual(["C", "D"]);
  });
  it("em ordem numa BST sai ordenado", () => {
    const g = board(bstEdges([50, 30, 70, 20, 40, 60, 80]));
    const last = runAlgorithm(g, "inorder", id(g, "50")).at(-1)!;
    expect(last.done.map(nm(g))).toEqual(["20", "30", "40", "50", "60", "70", "80"]);
  });
  it("Kruskal pega o peso mínimo", () => {
    const g = board("A - B : 1\nB - C : 2\nA - C : 5");
    expect(runAlgorithm(g, "kruskal").at(-1)!.note).toContain("peso 3");
  });
});

describe("geradores e matriz", () => {
  it("todo gerador produz texto que vira grafo", () => {
    for (const gen of GENERATORS) {
      const p = parseGraph(generate(gen.id, gen.def, 7));
      expect(p.errors, gen.id).toEqual([]);
      expect(p.vertices.length, gen.id).toBeGreaterThan(1);
    }
    expect(parseGraph(generate("complete", 5)).edges).toHaveLength(10);
    expect(parseGraph(generate("hypercube", 3)).edges).toHaveLength(12);
    expect(generate("random", 8, 3)).toBe(generate("random", 8, 3));
  });
  it("matriz de adjacência ida e volta", () => {
    const g = board("A - B : 2\nB - C");
    const m = adjacencyMatrix(g);
    expect(m.rows[0][1]).toBe(2);
    const back = parseGraph(matrixToEdges(m.text));
    expect(back.edges).toHaveLength(2);
    expect(parseGraph(matrixToEdges("0 1 0\n1 0 1\n0 1 0")).edges).toHaveLength(2);
  });
});
