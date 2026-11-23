import { describe, expect, it } from "vitest";
import { normalizeAppearance, resolveMode } from "./theme";

describe("tema", () => {
  it("normaliza qualquer coisa para um valor válido", () => {
    expect(normalizeAppearance(null)).toEqual({ mode: "auto", density: "normal", accent: "violet", grips: "subtle" });
    expect(normalizeAppearance({ mode: "dark", density: "large", accent: "teal", grips: "normal" })).toEqual({ mode: "dark", density: "large", accent: "teal", grips: "normal" });
    expect(normalizeAppearance({ mode: "roxo", density: 3, accent: "x" })).toEqual({ mode: "auto", density: "normal", accent: "violet", grips: "subtle" });
    expect(normalizeAppearance({ mode: "sepia" }).mode).toBe("sepia");
  });
  it("auto segue o sistema; escolha explícita vence", () => {
    expect(resolveMode("auto", true)).toBe("dark");
    expect(resolveMode("auto", false)).toBe("light");
    expect(resolveMode("light", true)).toBe("light");
    expect(resolveMode("midnight", false)).toBe("midnight");
  });
});
