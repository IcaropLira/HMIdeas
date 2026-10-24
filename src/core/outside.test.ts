import { describe, expect, it } from "vitest";
import { isInsideDock } from "./outside";

const node = (name: string) => ({ name }) as unknown as Node;

describe("isInsideDock", () => {
  const panelBtn = node("botão dentro do painel");
  const outside = node("canvas");
  const dock = { contains: (n: Node) => n === panelBtn || (n as unknown) === dock };

  it("clicar num elemento dentro do dock é 'dentro'", () => {
    expect(isInsideDock(panelBtn, dock)).toBe(true);
  });

  it("clicar no canvas (fora do dock) é 'fora'", () => {
    expect(isInsideDock(outside, dock)).toBe(false);
  });

  it("clicar no espaço vazio do próprio dock (ao lado do painel) é 'fora', mesmo o dock se contendo", () => {
    expect(isInsideDock(dock as unknown as Node, dock)).toBe(false);
  });

  it("sem alvo ou sem dock montado conta como 'fora'", () => {
    expect(isInsideDock(null, dock)).toBe(false);
    expect(isInsideDock(panelBtn, null)).toBe(false);
  });
});
