import { beforeEach, describe, expect, it } from "vitest";
import { getBrush, listBrushes, unregisterBrush } from "./brushes";
import { BRUSH_PACK_FORMAT, BRUSH_PRESET_FORMAT, importBrushes, loadCustomBrushes, parseBrushPack, serializeBrushPack, serializeBrushPreset } from "./brushPresets";

const preset = { ...getBrush("pen"), id: "study-pencil", label: "Lápis de estudo", hint: "Traço de estudo." };

describe("intercâmbio de presets de pincel", () => {
  beforeEach(() => unregisterBrush("study-pencil"));

  it("exporta e importa um preset individual", () => {
    const json = serializeBrushPreset(preset);
    expect(JSON.parse(json).format).toBe(BRUSH_PRESET_FORMAT);
    expect(parseBrushPack(json)[0]).toMatchObject(preset);
  });

  it("exporta e importa um pacote de presets", () => {
    const json = serializeBrushPack([preset]);
    expect(JSON.parse(json).format).toBe(BRUSH_PACK_FORMAT);
    expect(parseBrushPack(json)[0]).toMatchObject(preset);
  });

  it("rejeita JSON inválido, versão desconhecida e parâmetros inseguros", () => {
    expect(() => parseBrushPack("{")).toThrow("JSON válido");
    expect(() => parseBrushPack(JSON.stringify({ version: 999, format: BRUSH_PRESET_FORMAT, brush: preset }))).toThrow("Versão");
    expect(() => parseBrushPack(JSON.stringify({ version: 1, format: BRUSH_PRESET_FORMAT, brush: { ...preset, opacity: 8 } }))).toThrow("Preset inválido");
  });

  it("não permite que preset importado sobrescreva pincel nativo", () => {
    const added = importBrushes([{ ...preset, id: "pen", label: "Caneta falsa" }], listBrushes());
    expect(added[0].id).not.toBe("pen");
    expect(getBrush("pen").label).toBe("Caneta");
    unregisterBrush(added[0].id);
  });

  it("ignora entradas locais corrompidas e mantém apenas presets válidos", () => {
    expect(loadCustomBrushes(JSON.stringify([preset, { id: "bad" }]))[0]).toMatchObject(preset);
    expect(loadCustomBrushes("isso não é JSON")).toEqual([]);
  });
});
