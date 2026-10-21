// Fumaça: os painéis novos montam sem erro e mostram o que devem.
// Renderização no servidor (sem DOM): no servidor o zustand lê o estado INICIAL, então aqui valem os padrões.
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { listBrushes } from "../core/brushes";
import { PALETTES } from "../core/color";
import { BrushPanel } from "./BrushPanel";
import { ColorPicker } from "./ColorPicker";

describe("BrushPanel", () => {
  const html = renderToString(<BrushPanel />);

  it("lista todos os brushes, cada um com pré-visualização", () => {
    for (const b of listBrushes()) expect(html).toContain(b.label);
    expect((html.match(/class="bprev"/g) ?? []).length).toBe(listBrushes().length);
    expect((html.match(/<path d="M/g) ?? []).length).toBe(listBrushes().length); // contorno de verdade, não vazio
  });

  it("marca a caneta como ativa por padrão e tem o controle de opacidade", () => {
    expect(html).toMatch(/aria-checked="true" class="brush on"[^>]*>(?:(?!<\/button>).)*Caneta/s);
    expect(html).toContain("Opacidade");
  });
});

describe("ColorPicker", () => {
  const html = renderToString(<ColorPicker onEyedropper={() => {}} />);

  it("mostra quadrado SV, matiz, hex atual, conta-gotas e paletas", () => {
    expect(html).toContain("cp-sv");
    expect(html).toContain("cp-hue");
    expect(html).toContain('value="#1B2233"');
    expect(html).toContain("Conta-gotas");
    for (const p of PALETTES) expect(html).toContain(p.label);
  });

  it("não mostra 'Recentes' enquanto não há cores recentes", () => {
    expect(html).not.toContain("Recentes");
  });
});
