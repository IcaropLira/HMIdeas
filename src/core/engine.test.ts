import { describe, expect, it } from "vitest";
import { ENGINES, EngineId, cleanEngineCfg, dabsAlong, engineDef, makeStabilizer, pressureCurve, rampFactors, DEFAULT_TIP } from "./engine";
import { brushDyn, getBrush } from "./brushes";
import { buildStrokeDabs, buildStrokeMesh } from "./strokeMesh";
import { InkPoint } from "./model";

const st = (brush: string, engine: EngineId = "fluid", width = 4) => {
  const b = getBrush(brush);
  return { color: "#000000", width: width * b.size, sens: 1, taper: b.taper ?? 0, brush: b.id, opacity: 1, dyn: brushDyn(b, engineDef(engine).cfg) };
};

describe("motores de pincel (0.17)", () => {
  it("4 perfis prontos com ids únicos e cfg saneada", () => {
    expect(ENGINES.map((e) => e.id)).toEqual(["fluid", "krita", "photoshop", "csp"]);
    const c = cleanEngineCfg({ render: "x", stabilizer: "string", rampIn: 99, speedSize: -5 });
    expect([c.render, c.stabilizer, c.rampIn, c.speedSize]).toEqual(["ribbon", "string", 6, -1]);
  });
  it("curvas de pressão vão de 0 a 1 e mudam o meio", () => {
    for (const c of ["linear", "soft", "firm", "s"] as const) { expect(pressureCurve(0, c)).toBe(0); expect(pressureCurve(1, c)).toBe(1); }
    expect(pressureCurve(0.5, "soft")).toBeGreaterThan(0.5);
    expect(pressureCurve(0.5, "firm")).toBeLessThan(0.5);
  });
  it("entrada: parado no começo não cresce (sem bolinha)", () => {
    const pts = [...Array.from({ length: 20 }, () => ({ x: 0, y: 0 })), ...Array.from({ length: 20 }, (_, i) => ({ x: (i + 1) * 2, y: 0 }))];
    const r = rampFactors(pts, 4, 1.6);
    expect(r[19]).toBeCloseTo(0.35);
    expect(r[39]).toBe(1);
    // traço de caneta: 25 amostras paradas com pressão máxima e depois anda com pressão média
    const pen: InkPoint[] = [...Array.from({ length: 25 }, (_, i) => ({ x: i * 0.01, y: 0, p: 1 })), ...Array.from({ length: 60 }, (_, i) => ({ x: 1 + i * 1.5, y: 0, p: 0.6 }))];
    const dabs = buildStrokeDabs(pen, { ...st("ink", "krita"), dyn: { ...st("ink", "krita").dyn, render: "dab", rampIn: 1.6 } });
    const startR = Math.max(...dabs.filter((d) => d.x < 2).map((d) => d.r));
    const midR = Math.max(...dabs.filter((d) => d.x > 30 && d.x < 60).map((d) => d.r));
    expect(startR).toBeLessThan(midR);
  });
  it("estabilizadores: nenhum repassa; corda segura dentro do raio; todos alcançam ao soltar", () => {
    const none = makeStabilizer("none", 0.5);
    expect(none.push({ x: 5, y: 5, p: 0.5, t: 0 })).toHaveLength(1);
    const str = makeStabilizer("string", 0.5);
    str.push({ x: 0, y: 0, p: 0.5, t: 0 });
    expect(str.push({ x: 5, y: 0, p: 0.5, t: 16 })).toHaveLength(0);
    const moved = str.push({ x: 60, y: 0, p: 0.5, t: 32 });
    expect(moved[0].x).toBeCloseTo(60 - (2 + 38 * 0.5));
    for (const k of ["adaptive", "weighted", "window", "string"] as const) {
      const s = makeStabilizer(k, 0.8);
      let last = { x: 0, y: 0 };
      for (let i = 0; i <= 20; i++) for (const q of s.push({ x: i * 10, y: 0, p: 0.5, t: i * 8 })) last = q;
      const fin = s.finish({ x: 200, y: 0, p: 0.5, t: 200 }, true);
      const end = fin.length ? fin[fin.length - 1] : last;
      expect(end.x).toBeCloseTo(200, 0);
    }
  });
  it("carimbos: espaçamento segue o diâmetro; caligrafia é achatada e com ângulo fixo", () => {
    const line = [{ x: 0, y: 0, r: 5, a: 1 }, { x: 100, y: 0, r: 5, a: 1 }];
    const d = dabsAlong(line, { ...DEFAULT_TIP, spacing: 0.1 });
    expect(d.length).toBeGreaterThanOrEqual(100); // um a cada 1 px (10% de 10 px) + o primeiro
    expect(d.length).toBeLessThanOrEqual(101);
    const cal = brushDyn(getBrush("calligraphy"), engineDef("fluid").cfg);
    expect(cal.render).toBe("dab");
    expect(cal.tip!.roundness).toBeLessThan(0.5);
    const hl = brushDyn(getBrush("highlighter"), engineDef("krita").cfg);
    expect(hl.render).toBe("ribbon");
  });
  it("perfil Krita grava carimbos; Fluido grava fita; a malha continua funcionando", () => {
    expect(brushDyn(getBrush("pen"), engineDef("krita").cfg).render).toBe("dab");
    expect(brushDyn(getBrush("pen"), engineDef("fluid").cfg).render).toBe("ribbon");
    const pts: InkPoint[] = Array.from({ length: 30 }, (_, i) => ({ x: i * 3, y: Math.sin(i / 4) * 10, p: 0.3 + (i % 5) / 10 }));
    expect(buildStrokeMesh(pts, st("pen"))!.indices.length).toBeGreaterThan(30);
    expect(buildStrokeDabs(pts, st("pen", "krita")).length).toBeGreaterThan(20);
    // sem motor = igual ao antigo
    expect(brushDyn(getBrush("pen")).render).toBeUndefined();
  });
});
