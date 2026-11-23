import { describe, expect, it } from "vitest";
import { parsePage, serializePage, sheetEval, numberOf } from "./pageMd";
import { flattenPage, moveSubpage, removeSubpages } from "./pageTree";
import { defaultBlock, SpecOf } from "./blocks";

const MD = `# Título
Texto com **negrito** e [[np:abc|link]]
## Seção
#### Sub
- item
  - filho
1. um
2. dois
- [ ] tarefa
- [x] feita
<details open><summary>Toggle</summary>
dentro do toggle
</details>
> citação
> [!tip] 💡 uma dica
\`\`\`python
print(1)
\`\`\`
$$
x^2
$$
| A | B |
| --- | --- |
| 1 | 2 |
<!--sheet-->
| x | y |
| --- | --- |
| 2 | =A1*3 |
[toc]
---
▤ [[np:sub1]]
![](data:image/png;base64,AAA)`;

describe("Markdown das páginas (compatível com o Hiraku Comic Manager)", () => {
  it("lê todos os tipos de bloco", () => {
    const B = parsePage(MD);
    expect(B.map((b) => b.t)).toEqual(["h1", "text", "h2", "h3", "bul", "bul", "num", "num", "todo", "todo", "toggle", "text", "quote", "callout", "code", "eq", "tbl", "sheet", "toc", "div", "subpg", "img"]);
    expect(B[5].ind).toBe(1);
    expect(B[9].chk).toBe(true);
    expect(B[11].ind).toBe(1); // dentro do toggle
    expect(B[13]).toMatchObject({ kind: "tip", ico: "💡", txt: "uma dica" });
    expect(B[14]).toMatchObject({ lang: "python", txt: "print(1)" });
    expect(B[16].rows).toEqual([["A", "B"], ["1", "2"]]);
    expect(numberOf(B, 7)).toBe(2);
  });
  it("escreve de volta o mesmo Markdown (ida e volta estável)", () => {
    const once = serializePage(parsePage(MD));
    expect(serializePage(parsePage(once))).toBe(once);
    expect(once).toContain("<details open><summary>Toggle</summary>\ndentro do toggle\n</details>");
    expect(once).toContain("<!--sheet-->\n| x | y |");
    expect(once).toContain("▤ [[np:sub1]]");
  });
  it("planilha calcula fórmulas sem eval", () => {
    const R = [["Item", "Valor"], ["a", "10"], ["b", "20,5"], ["Total", "=SOMA(B2:B3)"], ["Média", "=MÉDIA(B2:B3)"], ["x", "=B4*2-1"], ["ruim", "=alert(1)"], ["ciclo", "=B8"], ["pot", "=2^3^2"], ["cont", "=CONT(B2:B3)"]];
    expect(sheetEval(R, 3, 1)).toBe("30.5");
    expect(sheetEval(R, 4, 1)).toBe("15.25");
    expect(sheetEval(R, 5, 1)).toBe("60");
    expect(sheetEval(R, 6, 1)).toBe("#ERRO");
    expect(sheetEval(R, 7, 1)).toBe("#ERRO");
    expect(sheetEval(R, 8, 1)).toBe("512");
    expect(sheetEval(R, 9, 1)).toBe("2");
    expect(sheetEval(R, 1, 0)).toBe("a");
  });
});

describe("subpáginas", () => {
  const base = (): SpecOf<"page"> => ({
    ...(defaultBlock("page") as SpecOf<"page">), md: "Início\n▤ [[np:a]]",
    pages: [{ id: "a", parentId: "", title: "A", icon: "", md: "▤ [[np:b]]" }, { id: "b", parentId: "a", title: "B", icon: "", md: "fundo" }, { id: "c", parentId: "", title: "C", icon: "", md: "" }],
  });
  it("lista em árvore e exporta tudo em toggles", () => {
    const f = flattenPage(base(), true);
    expect(f.rows.map((r) => `${r.depth}:${r.title}`)).toEqual(["0:" + base().title, "1:A", "2:B", "1:C"]);
    expect(f.md).toContain("<details><summary>A</summary>\n<details><summary>B</summary>\nfundo\n</details>\n</details>");
  });
  it("mover não cria ciclo e atualiza os links; apagar leva as filhas", () => {
    const s = base();
    expect(moveSubpage(s, "a", "b")).toBe(s);
    const m = moveSubpage(s, "b", "c");
    expect(m.pages.find((p) => p.id === "b")!.parentId).toBe("c");
    expect(m.pages.find((p) => p.id === "a")!.md).not.toContain("np:b");
    expect(m.pages.find((p) => p.id === "c")!.md).toContain("▤ [[np:b]]");
    const r = removeSubpages(s, "a");
    expect([...r.removed].sort()).toEqual(["a", "b"]);
    expect(r.spec.md).toBe("Início");
    expect(r.spec.pages.map((p) => p.id)).toEqual(["c"]);
  });
});
