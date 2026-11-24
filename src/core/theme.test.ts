import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, PRESETS, cleanThemeDef, inkOn, mixHex, normalizeAppearance, resolveMode, themeVars } from "./theme";

describe("tema", () => {
  it("normaliza qualquer coisa para um valor válido", () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    const a = normalizeAppearance({ mode: "dark", density: "large", accent: "teal", grips: "normal" });
    expect([a.mode, a.density, a.accent, a.grips]).toEqual(["dark", "large", "teal", "normal"]);
    const b = normalizeAppearance({ mode: "roxo", density: 3, accent: "x", radius: 9, opacity: 0.1, texture: "lixo", desk: "azul" });
    expect([b.mode, b.density, b.accent, b.radius, b.opacity, b.texture, b.desk]).toEqual(["auto", "normal", "violet", 1.6, 0.7, "none", null]);
    expect(normalizeAppearance({ mode: "sepia" }).mode).toBe("sepia");
  });
  it("auto segue o sistema; escolha explícita vence", () => {
    expect(resolveMode("auto", true)).toBe("dark");
    expect(resolveMode("auto", false)).toBe("light");
    expect(resolveMode("light", true)).toBe("light");
    expect(resolveMode("midnight", false)).toBe("midnight");
  });
  it("tem 16+ temas prontos com ids únicos", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(16);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });
  it("tema do usuário: saneia, mantém o modo e gera variáveis por região", () => {
    const def = cleanThemeDef({ label: "Meu", dark: false, t: { paper: "#ffffff", ink: "#000000", chrome: "zzz" }, regions: { tools: "#112233", lixo: "#fff" } })!;
    expect(def.id.startsWith("custom:")).toBe(true);
    expect(def.t.chrome).toBe(PRESETS[0].t.chrome);
    expect(def.regions).toEqual({ tools: "#112233" });
    const a = normalizeAppearance({ mode: def.id, custom: [def] });
    expect(a.mode).toBe(def.id);
    const v = themeVars(def, { opacity: 0.9, contrast: false, radius: 1.2 });
    expect(v["--r-tools-ink"]).toBe("#f4f2fb");
    expect(v["--rs"]).toBe("1.2");
    expect(v["--chrome"]).toContain("0.9");
    expect(cleanThemeDef({ t: null })).toBeNull();
  });
  it("cores auxiliares", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(inkOn("#ffffff")).toBe("#1b1a2e");
    expect(inkOn("#101010")).toBe("#f4f2fb");
  });
});
