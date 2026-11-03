import { describe, expect, it } from "vitest";
import { normalizeAppearance, resolveMode } from "./theme";

describe("tema", () => {
  it("normaliza qualquer coisa para um valor válido", () => {
    expect(normalizeAppearance(null)).toEqual({ mode: "auto", density: "normal" });
    expect(normalizeAppearance({ mode: "dark", density: "large" })).toEqual({ mode: "dark", density: "large" });
    expect(normalizeAppearance({ mode: "roxo", density: 3 })).toEqual({ mode: "auto", density: "normal" });
  });
  it("auto segue o sistema; escolha explícita vence", () => {
    expect(resolveMode("auto", true)).toBe("dark");
    expect(resolveMode("auto", false)).toBe("light");
    expect(resolveMode("light", true)).toBe("light");
  });
});
