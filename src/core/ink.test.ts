import { describe, expect, it } from "vitest";
import { brushDyn, getBrush, listBrushes } from "./brushes";
import { InkStyle, buildStrokeMesh, decimateForPreview, meshToSvgPath, styleOf } from "./ink";
import { InkPoint, StrokeElement } from "./model";

const wave = (pressure: boolean, n = 30): InkPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i * 4, y: Math.sin(i / 4) * 10, p: pressure ? 0.2 + 0.7 * Math.sin((Math.PI * i) / (n - 1)) : 0.5 }));

const style = (over: Partial<InkStyle> = {}): InkStyle => ({ color: "#000000", width: 3, sens: 0.8, taper: 0, brush: "pen", opacity: 1, ...over });

const bounds = (m: NonNullable<ReturnType<typeof buildStrokeMesh>>) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < m.positions.length; i += 2) {
    x0 = Math.min(x0, m.positions[i] + m.ox); x1 = Math.max(x1, m.positions[i] + m.ox);
    y0 = Math.min(y0, m.positions[i + 1] + m.oy); y1 = Math.max(y1, m.positions[i + 1] + m.oy);
  }
  return { x0, y0, x1, y1 };
};

describe("buildStrokeMesh", () => {
  it("é determinística e finita", () => {
    const a = buildStrokeMesh(wave(false), style())!;
    const b = buildStrokeMesh(wave(false), style())!;
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(a.indices.length % 3).toBe(0);
    expect(Array.from(a.positions).every(Number.isFinite)).toBe(true);
    expect(Math.max(...a.indices)).toBeLessThan(a.positions.length / 2);
  });

  it("todo brush gera malha válida, com e sem pressão", () => {
    for (const b of listBrushes()) {
      for (const pressure of [true, false]) {
        const m = buildStrokeMesh(wave(pressure), style({ brush: b.id, width: 3 * b.size, taper: b.taper ?? 0.4, dyn: brushDyn(b) }));
        expect(m, b.id).not.toBeNull();
        expect(m!.indices.length, b.id).toBeGreaterThanOrEqual(3);
        expect(Array.from(m!.positions).every(Number.isFinite), b.id).toBe(true);
      }
    }
  });

  it("um toque sem arrastar vira um pontinho", () => {
    const m = buildStrokeMesh([{ x: 5, y: 5, p: 0.5 }], style())!;
    const b = bounds(m);
    expect(b.x1 - b.x0).toBeGreaterThan(2.5);
    expect(b.x1 - b.x0).toBeLessThan(3.5);
  });

  it("pontas são redondas: a malha passa do último ponto em meia espessura (sem agulha)", () => {
    const pts: InkPoint[] = [{ x: 0, y: 0, p: 0.5 }, { x: 50, y: 0, p: 0.5 }];
    const b = bounds(buildStrokeMesh(pts, style({ width: 10 }))!);
    expect(b.x0).toBeCloseTo(-5, 0);
    expect(b.x1).toBeCloseTo(55, 0);
  });

  it("pontas retas (marca-texto) não passam do primeiro/último ponto", () => {
    const pts: InkPoint[] = [{ x: 0, y: 0, p: 0.5 }, { x: 50, y: 0, p: 0.5 }];
    const hl = getBrush("highlighter");
    const b = bounds(buildStrokeMesh(pts, style({ width: 10, brush: hl.id, dyn: brushDyn(hl) }))!);
    expect(b.x0).toBeCloseTo(0, 1);
    expect(b.x1).toBeCloseTo(50, 1);
  });

  it("espirais e círculos rápidos (o glitch do preenchimento) são lineares e não preenchem o miolo", () => {
    const pts: InkPoint[] = Array.from({ length: 6000 }, (_, i) => ({ x: 200 + 80 * Math.cos(i * 0.4) + i * 0.01, y: 200 + 80 * Math.sin(i * 0.4), p: 0.5 }));
    const hl = getBrush("highlighter");
    const t0 = performance.now();
    const m = buildStrokeMesh(pts, style({ width: 15, brush: hl.id, dyn: brushDyn(hl) }))!;
    expect(performance.now() - t0).toBeLessThan(500);
    // nenhum triângulo cobre o centro do círculo (raio 80, espessura 15): o miolo fica vazio
    const p = m.positions;
    const cx = 200 - m.ox, cy = 200 - m.oy;
    const sign = (ax: number, ay: number, bx: number, by: number) => (cx - bx) * (ay - by) - (ax - bx) * (cy - by);
    let covered = false;
    for (let i = 0; i < m.indices.length && !covered; i += 3) {
      const a = m.indices[i], b = m.indices[i + 1], c = m.indices[i + 2];
      const d1 = sign(p[a * 2], p[a * 2 + 1], p[b * 2], p[b * 2 + 1]);
      const d2 = sign(p[b * 2], p[b * 2 + 1], p[c * 2], p[c * 2 + 1]);
      const d3 = sign(p[c * 2], p[c * 2 + 1], p[a * 2], p[a * 2 + 1]);
      covered = !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    }
    expect(covered).toBe(false);
  });

  it("pressão engrossa o traço; largura é constante com mouse", () => {
    const mouse = bounds(buildStrokeMesh(wave(false).map((p) => ({ ...p, y: 0 })), style({ width: 6 }))!);
    expect(mouse.y1 - mouse.y0).toBeCloseTo(6, 0);
    const pen = (p: number) => bounds(buildStrokeMesh([0, 1, 2, 3, 4].map((i) => ({ x: i * 10, y: 0, p })), style({ width: 6, sens: 1 }))!);
    expect(pen(0.9).y1 - pen(0.9).y0).toBeGreaterThan(pen(0.2).y1 - pen(0.2).y0);
  });

  it("afilamento afina a ponta, mas nunca vira agulha, e pontas cortadas (open*) não afilam", () => {
    const pts: InkPoint[] = Array.from({ length: 40 }, (_, i) => ({ x: i * 3, y: 0, p: 0.5 }));
    const tip = (extra: Partial<InkStyle>) => {
      const m = buildStrokeMesh(pts, style({ width: 10, taper: 0.8, ...extra }))!;
      let h = 0;
      for (let i = 0; i < m.positions.length; i += 2) if (m.positions[i] + m.ox > 115) h = Math.max(h, Math.abs(m.positions[i + 1] + m.oy));
      return h * 2;
    };
    expect(tip({})).toBeLessThan(6);
    expect(tip({})).toBeGreaterThan(1);
    expect(tip({ openEnd: true })).toBeGreaterThan(9);
  });

  it("amostras inválidas e repetidas são ignoradas", () => {
    const pts: InkPoint[] = [{ x: 0, y: 0, p: 0.5 }, { x: NaN, y: 1, p: 0.5 }, { x: 0, y: 0, p: 0.5 }, { x: 20, y: 0, p: Infinity }];
    const m = buildStrokeMesh(pts, style())!;
    expect(Array.from(m.positions).every(Number.isFinite)).toBe(true);
  });

  it("mesh vazia para nenhum ponto; caminho SVG com triângulos de mesma orientação", () => {
    expect(buildStrokeMesh([], style())).toBeNull();
    const d = meshToSvgPath(buildStrokeMesh(wave(true), style())!);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });
});

describe("styleOf", () => {
  const base: StrokeElement = { id: "a", type: "stroke", points: wave(false), color: "#111111", width: 4, sens: 1, taper: 0, brush: "ink", opacity: 1 };
  it("traço antigo (sem dyn) usa o afilamento fixo e a dinâmica do brush registrado", () => {
    const st = styleOf(base);
    expect(st.taper).toBe(getBrush("ink").taper);
    expect(st.dyn).toEqual(brushDyn(getBrush("ink")));
  });
  it("traço novo usa a dinâmica gravada, mesmo que o brush mude depois", () => {
    const dyn = { ...brushDyn(getBrush("pen")), thinning: 0.123 };
    expect(styleOf({ ...base, dyn, taper: 0.2 })).toMatchObject({ taper: 0.2, dyn: { thinning: 0.123 } });
  });
});

describe("decimateForPreview", () => {
  it("não mexe em traços pequenos e limita os grandes, mantendo primeiro, último e a cauda", () => {
    const small = Array.from({ length: 100 }, (_, i) => i);
    expect(decimateForPreview(small)).toBe(small);
    const big = Array.from({ length: 9000 }, (_, i) => i);
    const out = decimateForPreview(big);
    expect(out.length).toBeLessThan(1600);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(8999);
    expect(out.slice(-24)).toEqual(big.slice(-24));
  });
});
