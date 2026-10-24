import { describe, expect, it } from "vitest";
import { isInsideAny, isInsideDock } from "./outside";

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

describe("isInsideAny", () => {
  const a = node("botão da barra de baixo");
  const b = node("botão da barra lateral");
  const baixo = { contains: (n: Node) => n === a };
  const lateral = { contains: (n: Node) => n === b };

  it("é 'dentro' se estiver em qualquer uma das áreas", () => {
    expect(isInsideAny(a, [baixo, lateral])).toBe(true);
    expect(isInsideAny(b, [baixo, lateral])).toBe(true);
  });

  it("é 'fora' se não estiver em nenhuma, ou se as áreas nem existirem", () => {
    expect(isInsideAny(node("canvas"), [baixo, lateral])).toBe(false);
    expect(isInsideAny(a, [null, null])).toBe(false);
    expect(isInsideAny(a, [])).toBe(false);
  });
});
