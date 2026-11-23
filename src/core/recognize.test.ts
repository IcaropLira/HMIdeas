import { describe, expect, it } from "vitest";
import { recognize } from "./recognize";

const jitter = (pts: { x: number; y: number }[], k = 1.5) => pts.map((p, i) => ({ x: p.x + Math.sin(i * 7.3) * k, y: p.y + Math.cos(i * 5.1) * k }));
const along = (corners: { x: number; y: number }[], per = 20) => {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i], b = corners[(i + 1) % corners.length];
    for (let t = 0; t < per; t++) out.push({ x: a.x + ((b.x - a.x) * t) / per, y: a.y + ((b.y - a.y) * t) / per });
  }
  out.push(corners[0]);
  return out;
};

describe("reconhecer formas", () => {
  it("linha reta", () => {
    expect(recognize(jitter(Array.from({ length: 40 }, (_, i) => ({ x: i * 5, y: i * 2 }))))?.kind).toBe("line");
  });
  it("rabisco aberto não vira nada", () => {
    expect(recognize(Array.from({ length: 40 }, (_, i) => ({ x: i * 5, y: Math.sin(i / 3) * 40 })))).toBeNull();
  });
  it("círculo", () => {
    expect(recognize(jitter(Array.from({ length: 60 }, (_, i) => ({ x: 100 + Math.cos((i / 59) * Math.PI * 2) * 80, y: 100 + Math.sin((i / 59) * Math.PI * 2) * 50 }))))?.kind).toBe("ellipse");
  });
  it("retângulo, losango e triângulo", () => {
    expect(recognize(jitter(along([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }])))?.kind).toBe("rect");
    expect(recognize(jitter(along([{ x: 100, y: 0 }, { x: 200, y: 80 }, { x: 100, y: 160 }, { x: 0, y: 80 }])))?.kind).toBe("diamond");
    const t = recognize(jitter(along([{ x: 0, y: 100 }, { x: 60, y: 0 }, { x: 130, y: 100 }])));
    expect(t?.kind).toBe("polygon");
    if (t?.kind === "polygon") expect(t.points).toHaveLength(3);
  });
});
