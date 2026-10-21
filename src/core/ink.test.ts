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
  it("a caneta padrão mantém um contorno estável para mouse, sem simular pressão por velocidade", () => {
    const pts = wave(false);
    const st = style({ taper: 0 });
    const first = strokeOutline(pts, st, true);
    const second = strokeOutline(pts, st, true);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(6);
    expect(first.every(Number.isFinite)).toBe(true);
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

  it("ignora amostras inválidas e limita a pressão ao intervalo 0..1", () => {
    const pts: InkPoint[] = [
      { x: 0, y: 0, p: 0.5 },
      { x: 0, y: 0, p: 0.5 },
      { x: Number.NaN, y: 2, p: 0.5 },
      { x: 4, y: 0, p: 4 },
      { x: 8, y: 1, p: -3 },
    ];
    const flat = strokeOutline(pts, style({ taper: 0 }), true);
    expect(flat.length).toBeGreaterThanOrEqual(6);
    expect(flat.every(Number.isFinite)).toBe(true);
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
