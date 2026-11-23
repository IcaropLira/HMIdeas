import { describe, expect, it } from "vitest";
import { cleanWeight, connectedVertex, freeSpotNear, incidentEdges, isVertex, makeEdge, makeVertex, nextVertexName, vertexAt } from "./graphEdit";
import { graphFromElements } from "./graph";
import { HirakuElement } from "./model";
import { makeNode } from "./mindmap";

describe("edição de grafos", () => {
  it("nomes seguem A…Z e depois A1…", () => {
    expect(nextVertexName([])).toBe("A");
    const els: HirakuElement[] = [makeVertex("A", { x: 0, y: 0 }), makeVertex("C", { x: 100, y: 0 })];
    expect(nextVertexName(els)).toBe("B");
    const all = Array.from({ length: 26 }, (_, i) => makeVertex(String.fromCharCode(65 + i), { x: i * 60, y: 0 }));
    expect(nextVertexName(all)).toBe("A1");
  });

  it("aresta ligada vira grafo lido pelos algoritmos, com peso e direção", () => {
    const a = makeVertex("A", { x: 0, y: 0 }), b = makeVertex("B", { x: 200, y: 0 });
    const e = makeEdge(a, b, { directed: true, label: "2,5" });
    expect(e.startBinding?.elementId).toBe(a.id);
    expect(e.points[0].x).toBeGreaterThan(a.x + a.w - 1); // grudada no contorno
    const g = graphFromElements([a, b, e]);
    expect(g.vertices).toHaveLength(2);
    expect(g.edges[0]).toMatchObject({ a: a.id, b: b.id, directed: true, w: 2.5 });
  });

  it("Tab: vizinho novo ligado, longe das arestas que já existem", () => {
    const a = makeVertex("A", { x: 0, y: 0 }), b = makeVertex("B", { x: 150, y: 0 });
    const ab = makeEdge(a, b, { directed: false });
    const r = connectedVertex([a, b, ab], a.id, { directed: false })!;
    expect(r.vertex.text).toBe("C");
    expect(r.edge.startBinding?.elementId).toBe(a.id);
    expect(r.edge.endBinding?.elementId).toBe(r.vertex.id);
    const c = { x: r.vertex.x + r.vertex.w / 2, y: r.vertex.y + r.vertex.h / 2 };
    expect(c.x).toBeLessThan(0); // B está à direita, então o novo vai para o outro lado
    const spot = freeSpotNear([a], a);
    expect(Math.hypot(spot.x, spot.y)).toBeCloseTo(150, 0);
  });

  it("apagar vértice leva as arestas; arestas paralelas não se sobrepõem", () => {
    const a = makeVertex("A", { x: 0, y: 0 }), b = makeVertex("B", { x: 200, y: 0 }), c = makeVertex("C", { x: 0, y: 200 });
    const e1 = makeEdge(a, b, { directed: true }), e3 = makeEdge(b, c, { directed: false });
    const e2 = makeEdge(b, a, { directed: true }, [a, b, e1]);
    expect(e2.startBinding?.u).not.toBe(0);
    expect(incidentEdges([a, b, c, e1, e2, e3], new Set([a.id])).sort()).toEqual([e1.id, e2.id].sort());
    expect(vertexAt([a, b, c], { x: 200, y: 0 }, 2)?.id).toBe(b.id);
    expect(vertexAt([a, b, c], { x: 100, y: 100 }, 2)).toBeNull();
  });

  it("reconhece vértices antigos (elipse solta ligada) e não confunde com nó de mapa", () => {
    const old = makeNode("o", 0, 0, "X", { shape: "ellipse" });
    const other = makeVertex("Y", { x: 200, y: 0 });
    const e = makeEdge(old, other, { directed: false });
    expect(isVertex(old, [old, other, e])).toBe(true);
    const root = makeNode("r", 0, 0, "Mapa", { shape: "ellipse" });
    const child = makeNode("c", 100, 0, "filho", { parentId: "r" });
    expect(isVertex(root, [root, child])).toBe(false);
    expect(cleanWeight("  3,5 ")).toBe("3,5");
    expect(cleanWeight("   ")).toBeUndefined();
  });
});
