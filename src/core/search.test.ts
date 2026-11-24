import { describe, expect, it } from "vitest";
import { scoreText, stem, tokens } from "./search";

describe("busca por intenção", () => {
  it("normaliza", () => {
    expect(stem("cartoes")).toBe("cartao");
    expect(tokens("Deixar dois cartões com o MESMO espaço")).toEqual(["cartao", "mesmo", "espaco"]);
  });
  it("acha Distribuir pela intenção e prefere o que bate no nome", () => {
    const dist = scoreText("deixar dois cartões com o mesmo espaço", "Distribuir na horizontal (espaços iguais)", "mesmo espaço espaçamento igual distância cartões lado a lado");
    const grupo = scoreText("deixar dois cartões com o mesmo espaço", "Agrupar", "juntar unir");
    expect(dist).toBeGreaterThan(0);
    expect(grupo).toBe(0);
    expect(scoreText("agr", "Agrupar")).toBeGreaterThan(scoreText("agr", "Desagrupar"));
    expect(scoreText("camada", "Painel Camadas")).toBeGreaterThan(0);
  });
});
