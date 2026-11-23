import { describe, expect, it } from "vitest";
import { connectArrow, siblingFor, sideAnchor } from "./quickConnect";
import { blockAt } from "./blockElement";
import { defaultBlock } from "./blocks";
import { connectorPoints, hitConnector } from "./selection";
import { makeVertex } from "./graphEdit";

describe("conexão rápida", () => {
  const card = blockAt(defaultBlock("card"), 0, 0, 200, 100);
  it("pontos ficam fora da caixa, no meio de cada lado, e o toque acha o certo", () => {
    const cs = connectorPoints({ minX: 0, minY: 0, maxX: 200, maxY: 100 }, { x: 0, y: 0, zoom: 1 }, 20);
    expect(cs.find((c) => c.side === "e")).toMatchObject({ x: 220, y: 50 });
    expect(hitConnector(cs, 101, -19, 10)?.side).toBe("n");
    expect(hitConnector(cs, 100, 50, 10)).toBeNull();
  });
  it("seta sai do lado escolhido ligada à origem e ao destino", () => {
    const other = blockAt(defaultBlock("sticky"), 400, 0, 100, 100);
    const a = connectArrow(card, "e", { x: 450, y: 50 }, other, { color: "#000000", width: 2 }, [card, other]);
    expect(a.startBinding?.elementId).toBe(card.id);
    expect(a.endBinding?.elementId).toBe(other.id);
    expect(a.points[0].x).toBeGreaterThanOrEqual(200);
    expect(a.points[1].x).toBeLessThanOrEqual(400);
    expect(sideAnchor(card, "s")).toEqual({ x: 100, y: 100 });
  });
  it("soltar no vazio cria um irmão do mesmo tipo, sem cair em cima da origem", () => {
    const sib = siblingFor(card, "e", { x: 210, y: 50 }, [card])!;
    expect(sib.type === "attachment" && sib.block?.kind).toBe("card");
    expect(sib.type === "attachment" && sib.x).toBeGreaterThan(200);
    const v = makeVertex("A", { x: 0, y: 0 });
    const nv = siblingFor(v, "s", { x: 0, y: 300 }, [v])!;
    expect(nv.type === "node" && nv.vertex && nv.text).toBe("B");
  });
});
