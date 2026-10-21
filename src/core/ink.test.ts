import { getStroke } from "perfect-freehand";
import { describe, expect, it } from "vitest";
import { listBrushes } from "./brushes";
import { InkStyle, strokeOutline } from "./ink";
import { InkPoint } from "./model";

const wave = (pressure: boolean): InkPoint[] =>
  Array.from({ length: 30 }, (_, i) => ({ x: i * 4, y: Math.sin(i / 4) * 10, p: pressure ? 0.2 + 0.7 * Math.sin((Math.PI * i) / 29) : 0.5 }));

const style = (over: Partial<InkStyle> = {}): InkStyle => ({ color: "#000000", width: 3, sens: 0.8, taper: 0.5, brush: "pen", opacity: 1, ...over });

const bbox = (flat: number[]) => {
  const ys = flat.filter((_, i) => i % 2);
  return Math.max(...ys) - Math.min(...ys);
};

describe("strokeOutline", () => {
  it("a caneta gera o MESMO contorno de antes dos brushes (compatibilidade com arquivos antigos)", () => {
    for (const pressure of [true, false]) {
      const pts = wave(pressure);
      const st = style();
      const simulate = !pressure;
      const taper = st.taper * st.width * 6;
      const old = getStroke(
        pts.map((p) => [p.x, p.y, p.p]),
        {
          size: st.width, thinning: (simulate ? 0.5 : 0.8) * st.sens, smoothing: 0.5, streamline: 0.15, simulatePressure: simulate,
          start: { taper, cap: true }, end: { taper, cap: true }, last: true,
        },
      ).flat();
      expect(strokeOutline(pts, st, true)).toEqual(old);
    }
  });

  it("todo brush produz um polígono válido, com e sem pressão", () => {
    for (const b of listBrushes()) {
      for (const pressure of [true, false]) {
        const flat = strokeOutline(wave(pressure), style({ brush: b.id, width: 3 * b.size }), true);
        expect(flat.length, b.id).toBeGreaterThanOrEqual(6);
        expect(flat.every(Number.isFinite), b.id).toBe(true);
      }
    }
  });

  it("um único ponto (toque sem arrastar) ainda gera um pontinho", () => {
    const flat = strokeOutline([{ x: 5, y: 5, p: 0.5 }], style(), true);
    expect(flat.length).toBeGreaterThanOrEqual(6);
  });

  it("brush de afilamento fixo ignora o controle do usuário; o da caneta obedece", () => {
    const pts = wave(true);
    const fixedA = strokeOutline(pts, style({ brush: "ballpoint", taper: 0 }), true);
    const fixedB = strokeOutline(pts, style({ brush: "ballpoint", taper: 1 }), true);
    expect(fixedA).toEqual(fixedB);
    expect(strokeOutline(pts, style({ taper: 0 }), true)).not.toEqual(strokeOutline(pts, style({ taper: 1 }), true));
  });

  it("marcador/marca-texto são mais largos que a caneta na mesma espessura escolhida", () => {
    const pts = wave(false).map((p) => ({ ...p, y: 0 }));
    const w = (id: string, size: number) => bbox(strokeOutline(pts, style({ brush: id, width: 3 * size }), true));
    expect(w("marker", 2.2)).toBeGreaterThan(w("pen", 1));
    expect(w("highlighter", 5)).toBeGreaterThan(w("marker", 2.2));
  });

  it("brush desconhecido cai na caneta", () => {
    const pts = wave(true);
    expect(strokeOutline(pts, style({ brush: "não-existe" }), true)).toEqual(strokeOutline(pts, style({ brush: "pen" }), true));
  });
});
