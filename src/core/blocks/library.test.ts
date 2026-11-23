import { describe, expect, it } from "vitest";
import { BLOCK_KINDS, blockContent, blockFields, blockHitAt, blockPrims, blockTap, cleanBlock, convertBlock, defaultBlock, fieldAt, fieldValue, removeFieldItem, splitField, withField } from "./index";
import { prettyMath } from "./defs/text";
import { LIBRARY, LIB_CATEGORIES, libSize, libSpec, searchLibrary } from "./library";
import { transformed } from "../blockActions";
import { makeBlockElement } from "../blockElement";

describe("biblioteca de blocos", () => {
  it("toda variação é um bloco válido que sobrevive ao saneamento e desenha algo", () => {
    expect(LIBRARY.length).toBeGreaterThan(100);
    const ids = new Set<string>();
    for (const it of LIBRARY) {
      expect(ids.has(it.id), it.id).toBe(false);
      ids.add(it.id);
      const s = libSpec(it), { w, h } = libSize(it);
      expect(cleanBlock(s), it.id).toEqual(s);
      const p = blockPrims(s, w, h);
      expect(p.rects.length + p.texts.length + p.lines.length + p.circles.length, it.id).toBeGreaterThan(0);
    }
    for (const c of LIB_CATEGORIES) expect(LIBRARY.some((i) => i.cat === c.id), c.id).toBe(true);
  });
  it("busca ignora acentos e usa as palavras-chave", () => {
    expect(searchLibrary("habitos").some((i) => i.kind === "habit")).toBe(true);
    expect(searchLibrary("notion").some((i) => i.kind === "page")).toBe(true);
    expect(searchLibrary("", "adesivos").every((i) => i.kind === "sticker")).toBe(true);
  });
});

describe("comportamentos", () => {
  it("flashcard vira, alternativa confere, estrelas dão nota, hábito marca, meta avança, dia do calendário marca", () => {
    const tapAll = (kind: Parameters<typeof defaultBlock>[0], action: string, pick = 0) => {
      const s = defaultBlock(kind), p = blockPrims(s, 400, 400);
      const h = p.hits.filter((x) => x.action === action)[pick];
      expect(h, `${kind}/${action}`).toBeTruthy();
      expect(blockHitAt(p, h.x + h.w / 2, h.y + h.h / 2)?.action).toBe(action);
      return blockTap(s, h);
    };
    expect((tapAll("flashcard", "flip") as { flipped: boolean }).flipped).toBe(true);
    expect((tapAll("quiz", "pick", 1) as { picked: number }).picked).toBe(1);
    expect((tapAll("media", "rate", 1) as { rating: number }).rating).toBe(2);
    const hb = tapAll("habit", "habit", 13) as { checks: boolean[][] };
    expect(hb.checks.flat().filter(Boolean).length).not.toBe((defaultBlock("habit") as { checks: boolean[][] }).checks.flat().filter(Boolean).length);
    expect((tapAll("progress", "inc") as { items: { value: number }[] }).items[0].value).toBe(8);
    const cal = tapAll("calendar", "day", 2) as { marks: { day: number }[] };
    expect(cal.marks.some((m) => m.day === 3)).toBe(true);
    expect((tapAll("project", "status") as { status: string }).status).toBe("Pausado");
  });
});

describe("transformar sem perder conteúdo", () => {
  it("tarefas → kanban mantém o que estava feito; kanban → tarefas volta", () => {
    const todo = defaultBlock("todo");
    const k = convertBlock(todo, "kanban");
    expect(k.kind).toBe("kanban");
    const cols = (k as { columns: { title: string; cards: string[] }[] }).columns;
    expect(cols.find((c) => c.title === "Feito")?.cards).toEqual(["Primeira tarefa"]);
    const back = convertBlock(k, "todo") as { items: { text: string; done: boolean }[] };
    expect(back.items.find((i) => i.text === "Primeira tarefa")?.done).toBe(true);
  });
  it("qualquer bloco vira qualquer outro sem quebrar (e o texto principal sobrevive quando faz sentido)", () => {
    for (const a of BLOCK_KINDS) for (const b of BLOCK_KINDS) {
      const out = convertBlock(defaultBlock(a.id), b.id);
      expect(out.kind).toBe(b.id);
      expect(cleanBlock(out)).toEqual(out);
    }
    const card = convertBlock(defaultBlock("sticky"), "card") as { body: string };
    expect(card.body + JSON.stringify(card)).toContain("Escreva aqui");
    const list = convertBlock(defaultBlock("steps"), "list") as { items: string[] };
    expect(list.items).toEqual((defaultBlock("steps") as { items: string[] }).items);
  });
  it("transformar mantém o centro do bloco", () => {
    const el = makeBlockElement(defaultBlock("card"), { x: 500, y: 300 }) as Parameters<typeof transformed>[0];
    const t = transformed(el, "flashcard");
    expect(t.x + t.w / 2).toBeCloseTo(500);
    expect(t.y + t.h / 2).toBeCloseTo(300);
    expect(blockContent(t.block!).title).toBe("Título do cartão");
  });
});

describe("edição direto no bloco", () => {
  it("campos têm caminhos válidos e o toque encontra o campo certo", () => {
    for (const k of BLOCK_KINDS) {
      const s = defaultBlock(k.id);
      for (const f of blockFields(s, 400, 400)) {
        expect(typeof fieldValue(s, f.key), `${k.id}:${f.key}`).toBe("string");
        expect(withField(s, f.key, "x").kind).toBe(s.kind);
      }
    }
    const todo = defaultBlock("todo");
    const fs = blockFields(todo, 300, 200);
    const item = fs.find((f) => f.key === "items.1.text")!;
    expect(fieldAt(fs, item.x + 5, item.y + 5)?.key).toBe("items.1.text");
  });
  it("Enter divide o item e Backspace num item vazio apaga", () => {
    const todo = defaultBlock("todo");
    const r = splitField(todo, "items.0.text", "Prim", "eira tarefa")!;
    expect(r.focus).toBe("items.1.text");
    expect((r.spec as { items: { text: string }[] }).items.map((i) => i.text).slice(0, 2)).toEqual(["Prim", "eira tarefa"]);
    const emptied = withField(r.spec, "items.1.text", "");
    const del = removeFieldItem(emptied, "items.1.text")!;
    expect(del.focus).toBe("items.0.text");
    expect((del.spec as { items: unknown[] }).items).toHaveLength(3);
    expect(removeFieldItem(defaultBlock("table"), "rows.1.1")).toBeNull();
    expect(removeFieldItem(defaultBlock("week"), "days.2")).toBeNull();
  });
});

describe("fórmulas", () => {
  it("deixa a expressão com cara de matemática", () => {
    expect(prettyMath("x^2 + y^2 = r^2")).toBe("x² + y² = r²");
    expect(prettyMath("a_1 + a_n")).toBe("a₁ + aₙ");
    expect(prettyMath("sqrt(2) * pi >= 4")).toBe("√(2) · π ≥ 4");
    expect(prettyMath("int_0^1 x dx")).toBe("∫₀¹ x dx");
    expect(prettyMath("sum_(i=1)^n i")).toBe("Σᵢ₌₁ⁿ i");
    expect(prettyMath("x^(n-1)")).toBe("xⁿ⁻¹");
    expect(prettyMath("simples")).toBe("simples");
    expect(prettyMath("e^{iπ}")).toBe("e^{iπ}"); // π não tem sobrescrito: fica como está
  });
});
