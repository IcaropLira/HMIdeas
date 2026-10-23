import { describe, expect, it, vi } from "vitest";
import { detectWebGL } from "./webgl";

describe("detectWebGL", () => {
  it("é verdadeiro com WebGL2 e devolve o contexto ao navegador", () => {
    const loseContext = vi.fn();
    const gl = { getExtension: () => ({ loseContext }) };
    expect(detectWebGL(() => ({ getContext: (id) => (id === "webgl2" ? gl : null) }))).toBe(true);
    expect(loseContext).toHaveBeenCalled();
  });

  it("cai para WebGL1 quando não há WebGL2", () => {
    const gl = { getExtension: () => null };
    expect(detectWebGL(() => ({ getContext: (id) => (id === "webgl" ? gl : null) }))).toBe(true);
  });

  it("é falso quando o navegador não cria contexto (aceleração desligada)", () => {
    expect(detectWebGL(() => ({ getContext: () => null }))).toBe(false);
  });

  it("é falso (e não quebra) se criar o canvas ou o contexto lançar erro", () => {
    expect(detectWebGL(() => { throw new Error("sem canvas"); })).toBe(false);
    expect(detectWebGL(() => ({ getContext: () => { throw new Error("bloqueado"); } }))).toBe(false);
  });
});
