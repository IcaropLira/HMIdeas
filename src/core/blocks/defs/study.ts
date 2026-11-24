// Blocos de estudo: flashcard (vira com um toque), múltipla escolha, passo a passo, exercício com resolução escondida,
// referência bibliográfica e quadro comparativo.
import { defineBlock } from "../def";
import { BField, BLOCK_COLORS, INK, LH, MUTED, SOFT, arr, bool, cardBg, contentBody, contentItems, cycle, linesFit, mix, num, para, str, strs, wrap, TextMeasure } from "../kit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cleanSrs = (v: any) => (v && Number.isFinite(v.due) && Number.isFinite(v.interval)
  ? { ease: num(v.ease, 2.5, 1.3, 3.5), interval: num(v.interval, 0, 0, 36500), reps: Math.round(num(v.reps, 0, 0, 9999)), due: v.due, lapses: Math.round(num(v.lapses, 0, 0, 9999)) }
  : undefined);

// ---------------- flashcard ----------------
export const flashcard = defineBlock({
  kind: "flashcard", label: "Flashcard", hint: "Frente e verso: um toque vira o cartão", behavior: "livre",
  make: () => ({ kind: "flashcard", front: "Capital da Austrália?", back: "Camberra", flipped: false, color: BLOCK_COLORS[5] }),
  size: () => ({ w: 300, h: 190 }),
  clean: (r, color) => ({ kind: "flashcard", front: str(r.front), back: str(r.back), flipped: bool(r.flipped), color, ...(cleanSrs(r.srs) ? { srs: cleanSrs(r.srs) } : {}) }),
  draw(s, w, h, m, p) {
    const back = s.flipped;
    p.rects.push({ x: 6, y: 9, w: w - 6, h: h - 6, r: 14, fill: mix(s.color, back ? 0.6 : 0.75) });
    cardBg(p, w - 6, h - 6, 14, back ? mix(s.color, 0.88) : "#FFFFFF", 0.1, back ? "" : "#DDE3EE");
    p.texts.push({ x: 16, y: 12, text: back ? "VERSO" : "FRENTE", size: 10, color: mix(s.color, -0.3), bold: true });
    const t = back ? s.back : s.front, size = back ? 18 : 20;
    const lines = wrap(t, w - 46, size, m, "sans", !back);
    const shown = Math.min(lines.length, linesFit(h - 70, size));
    para(p, lines, (w - 6) / 2, (h - 6) / 2 - (shown * size * LH) / 2, size, back ? mix(s.color, -0.55) : INK, { bold: !back, align: "center" }, shown);
    p.texts.push({ x: (w - 6) / 2, y: h - 30, text: back ? "↺ toque para voltar" : "↻ toque para virar", size: 11, color: MUTED, align: "center" });
    p.hits.push({ action: "flip", index: 0, x: 0, y: 0, w, h });
  },
  tap: (s, hit) => (hit.action === "flip" ? { ...s, flipped: !s.flipped } : s),
  fields: (s, w, h) => [{ key: s.flipped ? "back" : "front", x: 20, y: 34, w: w - 46, h: h - 76, size: s.flipped ? 18 : 20, bold: !s.flipped, color: INK, bg: s.flipped ? mix(s.color, 0.88) : "#FFFFFF", align: "center", multiline: true }],
  form: [{ t: "area", key: "front", label: "Frente (pergunta)", rows: 3 }, { t: "area", key: "back", label: "Verso (resposta)", rows: 3 }, { t: "bool", key: "flipped", label: "Mostrar o verso" }],
  text: (s) => `${s.front}\n${s.back}`,
  toContent: (s) => ({ title: s.front, text: s.back }),
  fromContent: (c, color) => ({ kind: "flashcard", front: c.title || contentItems(c)[0] || "", back: c.title ? contentBody(c) : contentItems(c).slice(1).join("\n"), flipped: false, color }),
});

// ---------------- múltipla escolha ----------------
const LETTERS = "ABCDEFGH";
const quizRows = (s: { options: string[] }, w: number, m: TextMeasure) => s.options.map((o) => Math.max(1, wrap(o || " ", w - 84, 14, m).length) * 14 * LH + 16);
const quizQ = (s: { question: string }, w: number, m: TextMeasure) => wrap(s.question, w - 36, 16, m, "sans", true).length * 16 * LH;
export const quiz = defineBlock({
  kind: "quiz", label: "Múltipla escolha", hint: "Toque numa alternativa para conferir", behavior: "estruturado",
  make: () => ({ kind: "quiz", question: "Quanto é 7 × 8?", options: ["54", "56", "64", "48"], answer: 1, picked: -1, color: BLOCK_COLORS[0] }),
  size: (s) => ({ w: 340, h: 70 + s.options.length * 44 + 40 }),
  clean(r, color) {
    const options = strs(r.options, 8, 300);
    return { kind: "quiz", question: str(r.question), options, answer: Math.round(num(r.answer, 0, 0, Math.max(0, options.length - 1))), picked: Math.round(num(r.picked, -1, -1, options.length - 1)), color };
  },
  minH: (s, w, m) => 30 + quizQ(s, w, m) + quizRows(s, w, m).reduce((a, b) => a + b + 6, 0) + 40,
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 14);
    const qh = para(p, wrap(s.question, w - 36, 16, m, "sans", true), 18, 18, 16, INK, { bold: true });
    let y = 30 + qh;
    quizRows(s, w, m).forEach((rh, i) => {
      if (y + rh > h - 30) return;
      const picked = s.picked === i, right = i === s.answer, reveal = s.picked >= 0;
      const tone = reveal && right ? "#2E9B5F" : reveal && picked ? "#D2453A" : s.color;
      p.rects.push({ x: 16, y, w: w - 32, h: rh, r: 10, fill: reveal && (right || picked) ? mix(tone, 0.85) : "#F4F6FA", stroke: picked ? tone : "", sw: 2 });
      p.circles.push({ x: 38, y: y + rh / 2, r: 12, fill: reveal && (right || picked) ? tone : mix(s.color, 0.82) });
      p.texts.push({ x: 38, y: y + rh / 2 - 7.5, text: reveal && right ? "✓" : reveal && picked ? "✕" : LETTERS[i], size: 12, color: reveal && (right || picked) ? "#FFFFFF" : mix(s.color, -0.45), bold: true, align: "center" });
      para(p, wrap(s.options[i] || " ", w - 84, 14, m), 60, y + 8, 14, INK);
      p.hits.push({ action: "pick", index: i, x: 16, y, w: w - 32, h: rh });
      y += rh + 6;
    });
    if (s.picked >= 0) {
      p.texts.push({ x: 18, y: h - 26, text: s.picked === s.answer ? "Acertou! 🎉" : `Resposta: ${LETTERS[s.answer]}`, size: 13, color: s.picked === s.answer ? "#2E9B5F" : "#D2453A", bold: true });
      p.texts.push({ x: w - 18, y: h - 26, text: "↺ refazer", size: 12, color: MUTED, align: "right" });
      p.hits.push({ action: "reset", index: 0, x: w - 100, y: h - 34, w: 90, h: 30 });
    } else p.texts.push({ x: 18, y: h - 26, text: "Toque numa alternativa", size: 12, color: MUTED });
  },
  tap: (s, hit) => (hit.action === "pick" ? { ...s, picked: hit.index } : hit.action === "reset" ? { ...s, picked: -1 } : s),
  fields(s, w, _h, m) {
    const qh = quizQ(s, w, m), out: BField[] = [{ key: "question", x: 18, y: 18, w: w - 36, h: qh, size: 16, bold: true, color: INK, bg: "#FFFFFF", multiline: true }];
    let y = 30 + qh;
    quizRows(s, w, m).forEach((rh, i) => { out.push({ key: `options.${i}`, x: 60, y: y + 6, w: w - 84, h: rh - 12, size: 14, color: INK, bg: "#F4F6FA", multiline: false }); y += rh + 6; });
    return out;
  },
  form: [{ t: "area", key: "question", label: "Pergunta", rows: 2 }, { t: "options" }],
  text: (s) => `${s.question}\n${s.options.map((o, i) => `${LETTERS[i]}) ${o}${i === s.answer ? " ✓" : ""}`).join("\n")}`,
  toContent: (s) => ({ title: s.question, items: s.options.map((o, i) => ({ text: o, done: i === s.answer })) }),
  fromContent: (c, color) => { const opts = c.items?.length ? c.items : contentItems(c).map((text) => ({ text, done: false })); return { kind: "quiz", question: c.title ?? "Pergunta", options: opts.map((o) => o.text).slice(0, 8), answer: Math.max(0, opts.findIndex((o) => o.done)), picked: -1, color }; },
});

// ---------------- passo a passo ----------------
const stepRows = (s: { items: string[] }, w: number, m: TextMeasure) => s.items.map((t) => Math.max(1, wrap(t || " ", w - 72, 14, m).length) * 14 * LH + 20);
export const steps = defineBlock({
  kind: "steps", label: "Passo a passo", hint: "Etapas numeradas ligadas por uma linha", behavior: "estruturado",
  make: () => ({ kind: "steps", title: "Como resolver", items: ["Leia o enunciado e anote os dados", "Escolha a fórmula", "Substitua e calcule", "Confira as unidades"], color: BLOCK_COLORS[4] }),
  size: (s) => ({ w: 340, h: 60 + s.items.length * 46 }),
  clean: (r, color) => ({ kind: "steps", title: str(r.title, "", 200), items: strs(r.items, 40, 1000), color }),
  minH: (s, w, m) => 56 + stepRows(s, w, m).reduce((a, b) => a + b, 0),
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 14);
    p.texts.push({ x: 18, y: 16, text: s.title, size: 17, color: INK, bold: true });
    const rows = stepRows(s, w, m);
    let y = 54;
    if (s.items.length > 1) p.lines.push({ pts: [{ x: 34, y: y + 14 }, { x: 34, y: y + rows.slice(0, -1).reduce((a, b) => a + b, 0) + 14 }], color: mix(s.color, 0.6), width: 3 });
    rows.forEach((rh, i) => {
      if (y + rh > h + 6) return;
      const c = cycle(s.color, 0);
      p.circles.push({ x: 34, y: y + 13, r: 13, fill: c, stroke: "#FFFFFF", sw: 3 });
      p.texts.push({ x: 34, y: y + 5.5, text: String(i + 1), size: 13, color: "#FFFFFF", bold: true, align: "center" });
      para(p, wrap(s.items[i] || " ", w - 72, 14, m), 58, y + 4, 14, INK);
      y += rh;
    });
  },
  fields(s, w, _h, m) {
    const out: BField[] = [{ key: "title", x: 18, y: 16, w: w - 36, h: 24, size: 17, bold: true, color: INK, bg: "#FFFFFF", multiline: false }];
    let y = 54;
    stepRows(s, w, m).forEach((rh, i) => { out.push({ key: `items.${i}`, x: 58, y: y + 2, w: w - 72, h: rh - 16, size: 14, color: INK, bg: "#FFFFFF", multiline: false }); y += rh; });
    return out;
  },
  split(s, key, before, after) {
    const mm = key.match(/^items\.(\d+)$/);
    if (!mm) return null;
    const i = +mm[1], items = [...s.items];
    items[i] = before; items.splice(i + 1, 0, after);
    return { spec: { ...s, items }, focus: `items.${i + 1}` };
  },
  form: [{ t: "text", key: "title", label: "Título" }, { t: "lines", key: "items", label: "Passos", add: "+ Passo" }],
  text: (s) => `${s.title}\n${s.items.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
  toContent: (s) => ({ title: s.title, items: s.items.map((t) => ({ text: t })) }),
  fromContent: (c, color) => ({ kind: "steps", title: c.title ?? "Passo a passo", items: contentItems(c), color }),
});

// ---------------- exercício ----------------
export const exercise = defineBlock({
  kind: "exercise", label: "Exercício", hint: "Enunciado + resolução escondida (toque para ver)", behavior: "livre",
  make: () => ({ kind: "exercise", label: "Exercício 1", statement: "Um carro percorre 150 km em 2 h. Qual a velocidade média?", solution: "v = Δs / Δt = 150 / 2 = 75 km/h", shown: false, color: BLOCK_COLORS[3] }),
  size: () => ({ w: 360, h: 220 }),
  clean: (r, color) => ({ kind: "exercise", label: str(r.label, "Exercício", 60), statement: str(r.statement), solution: str(r.solution), shown: bool(r.shown), color }),
  minH: (s, w, m) => 52 + wrap(s.statement, w - 36, 15, m).length * 15 * LH + 24 + (s.shown ? wrap(s.solution, w - 52, 14, m).length * 14 * LH + 30 : 40),
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 14);
    p.rects.push({ x: 18, y: 16, w: Math.min(w - 36, s.label.length * 8 + 26), h: 22, r: 6, fill: s.color });
    p.texts.push({ x: 30, y: 19.5, text: s.label, size: 12, color: "#FFFFFF", bold: true });
    const used = para(p, wrap(s.statement, w - 36, 15, m), 18, 50, 15, INK);
    const y = 50 + used + 14;
    if (s.shown) {
      p.rects.push({ x: 14, y, w: w - 28, h: h - y - 14, r: 10, fill: mix(s.color, 0.9) });
      p.texts.push({ x: 26, y: y + 8, text: "Resolução", size: 12, color: mix(s.color, -0.45), bold: true });
      para(p, wrap(s.solution, w - 52, 14, m), 26, y + 28, 14, INK, { font: s.solution.includes("=") ? "serif" : "sans" }, linesFit(h - y - 50, 14));
      p.hits.push({ action: "show", index: 0, x: 14, y, w: w - 28, h: 26 });
    } else {
      p.rects.push({ x: 14, y, w: w - 28, h: 36, r: 10, fill: "#F4F6FA", stroke: mix(s.color, 0.5), sw: 1.5, dash: true });
      p.texts.push({ x: w / 2, y: y + 10, text: "👁 Ver resolução", size: 13, color: mix(s.color, -0.35), bold: true, align: "center" });
      p.hits.push({ action: "show", index: 0, x: 14, y, w: w - 28, h: 36 });
    }
  },
  tap: (s, hit) => (hit.action === "show" ? { ...s, shown: !s.shown } : s),
  fields(s, w, h, m) {
    const sh = wrap(s.statement || "M", w - 36, 15, m).length * 15 * LH, y = 50 + sh + 14;
    return [
      { key: "statement", x: 18, y: 50, w: w - 36, h: sh, size: 15, color: INK, bg: "#FFFFFF", multiline: true },
      ...(s.shown ? [{ key: "solution", x: 26, y: y + 28, w: w - 52, h: h - y - 50, size: 14, color: INK, bg: mix(s.color, 0.9), multiline: true }] : []),
    ];
  },
  form: [{ t: "text", key: "label", label: "Rótulo" }, { t: "area", key: "statement", label: "Enunciado", rows: 4 }, { t: "area", key: "solution", label: "Resolução", rows: 4 }, { t: "bool", key: "shown", label: "Mostrar resolução" }],
  text: (s) => `${s.label}\n${s.statement}\nResolução: ${s.solution}`,
  toContent: (s) => ({ title: s.statement, text: s.solution }),
  fromContent: (c, color) => ({ kind: "exercise", label: "Exercício", statement: c.title || contentItems(c)[0] || "", solution: c.title ? contentBody(c) : contentItems(c).slice(1).join("\n"), shown: false, color }),
});

// ---------------- referência bibliográfica ----------------
export const reference = defineBlock({
  kind: "reference", label: "Referência", hint: "Livro, artigo ou site com autor, ano e nota", behavior: "livre",
  make: () => ({ kind: "reference", authors: "SOBRENOME, Nome", title: "Título da obra", source: "Editora / revista / site", year: "2024", note: "Ideia principal ou citação.", color: BLOCK_COLORS[7] }),
  size: () => ({ w: 360, h: 170 }),
  clean: (r, color) => ({ kind: "reference", authors: str(r.authors, "", 300), title: str(r.title, "", 300), source: str(r.source, "", 300), year: str(r.year, "", 20), note: str(r.note), color }),
  minH: (s, w, m) => 26 + wrap(s.title, w - 80, 16, m, "serif", true).length * 16 * LH + 44 + wrap(s.note, w - 80, 13, m).length * 13 * LH + 16,
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 10);
    p.rects.push({ x: 16, y: 18, w: 34, h: 46, r: 3, fill: s.color }, { x: 20, y: 18, w: 2, h: 46, r: 0, fill: "#FFFFFF", alpha: 0.4 });
    const tl = para(p, wrap(s.title, w - 80, 16, m, "serif", true), 64, 16, 16, INK, { bold: true, font: "serif" }, 2);
    p.texts.push({ x: 64, y: 20 + tl, text: [s.authors, s.year].filter(Boolean).join(" · "), size: 12, color: SOFT, bold: true });
    p.texts.push({ x: 64, y: 38 + tl, text: s.source, size: 12, color: MUTED, italic: true });
    para(p, wrap(s.note, w - 80, 13, m), 64, 62 + tl, 13, INK, { italic: true }, linesFit(h - 72 - tl, 13));
  },
  fields(s, w, h, m) {
    const tl = Math.min(2, wrap(s.title || "M", w - 80, 16, m, "serif", true).length) * 16 * LH;
    return [
      { key: "title", x: 64, y: 16, w: w - 80, h: tl, size: 16, bold: true, font: "serif", color: INK, bg: "#FFFFFF", multiline: false },
      { key: "authors", x: 64, y: 18 + tl, w: (w - 80) * 0.7, h: 18, size: 12, bold: true, color: SOFT, bg: "#FFFFFF", multiline: false },
      { key: "source", x: 64, y: 36 + tl, w: w - 80, h: 18, size: 12, italic: true, color: MUTED, bg: "#FFFFFF", multiline: false },
      { key: "note", x: 64, y: 60 + tl, w: w - 80, h: h - 70 - tl, size: 13, italic: true, color: INK, bg: "#FFFFFF", multiline: true },
    ];
  },
  form: [{ t: "text", key: "title", label: "Título" }, { t: "text", key: "authors", label: "Autor(es)" }, { t: "text", key: "year", label: "Ano" }, { t: "text", key: "source", label: "Fonte" }, { t: "area", key: "note", label: "Nota / resumo", rows: 3 }],
  text: (s) => `${s.authors}. ${s.title}. ${s.source}, ${s.year}.\n${s.note}`,
  toContent: (s) => ({ title: s.title, text: s.note }),
  fromContent: (c, color) => ({ kind: "reference", authors: "", title: c.title ?? "", source: "", year: "", note: contentBody(c), color }),
});

// ---------------- comparação ----------------
export const compare = defineBlock({
  kind: "compare", label: "Comparação", hint: "Colunas lado a lado (antes/depois, A vs B)", behavior: "estruturado",
  make: () => ({ kind: "compare", title: "Comparação", cols: [{ title: "Opção A", body: "- vantagem\n- custo" }, { title: "Opção B", body: "- vantagem\n- custo" }], color: BLOCK_COLORS[0] }),
  size: (s) => ({ w: Math.max(360, s.cols.length * 220), h: 240 }),
  clean: (r, color) => ({ kind: "compare", title: str(r.title, "", 200), color, cols: arr(r.cols, 5, (x) => ({ title: str((x as { title?: unknown })?.title, "", 100), body: str((x as { body?: unknown })?.body) })) }),
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 14);
    const top = s.title ? 48 : 12;
    if (s.title) p.texts.push({ x: 18, y: 14, text: s.title, size: 18, color: INK, bold: true });
    const n = Math.max(1, s.cols.length), cw = (w - 16) / n;
    s.cols.forEach((col, i) => {
      const x = 8 + i * cw, c = cycle(s.color, i * 3);
      p.rects.push({ x: x + 4, y: top, w: cw - 8, h: h - top - 8, r: 10, fill: mix(c, 0.92) }, { x: x + 4, y: top, w: cw - 8, h: 34, r: 10, fill: c }, { x: x + 4, y: top + 24, w: cw - 8, h: 10, r: 0, fill: c });
      p.texts.push({ x: x + cw / 2, y: top + 9, text: col.title, size: 15, color: "#FFFFFF", bold: true, align: "center" });
      if (i < n - 1 && n === 2) { p.circles.push({ x: x + cw, y: top + 17, r: 14, fill: "#FFFFFF", stroke: LINEc, sw: 1 }); p.texts.push({ x: x + cw, y: top + 10, text: "vs", size: 11, color: SOFT, bold: true, align: "center" }); }
      const lines = col.body.split("\n").flatMap((l) => (l.trim() ? wrap(l.replace(/^\s*[-*]\s+/, "• "), cw - 32, 13, m) : [""]));
      para(p, lines, x + 16, top + 46, 13, INK, {}, linesFit(h - top - 60, 13));
    });
  },
  fields(s, w, h) {
    const top = s.title ? 48 : 12, n = Math.max(1, s.cols.length), cw = (w - 16) / n;
    return [
      ...(s.title ? [{ key: "title", x: 18, y: 14, w: w - 36, h: 24, size: 18, bold: true, color: INK, bg: "#FFFFFF", multiline: false }] : []),
      ...s.cols.flatMap((_, i) => {
        const x = 8 + i * cw, c = cycle(s.color, i * 3);
        return [
          { key: `cols.${i}.title`, x: x + 10, y: top + 6, w: cw - 20, h: 22, size: 15, bold: true, color: "#FFFFFF", bg: c, align: "center", multiline: false },
          { key: `cols.${i}.body`, x: x + 14, y: top + 44, w: cw - 28, h: h - top - 58, size: 13, color: INK, bg: mix(c, 0.92), multiline: true },
        ] as BField[];
      }),
    ];
  },
  form: [{ t: "text", key: "title", label: "Título" }, { t: "pairs", key: "cols", label: "Colunas", a: ["title", "Título"], b: ["body", "Conteúdo"], add: "+ Coluna", bArea: true }],
  text: (s) => `${s.title}\n${s.cols.map((c) => `${c.title}:\n${c.body}`).join("\n")}`,
  toContent: (s) => ({ title: s.title, items: s.cols.flatMap((c) => c.body.split("\n").filter(Boolean).map((t) => ({ text: t.replace(/^\s*[-*]\s+/, ""), sub: c.title }))) }),
  fromContent(c, color) {
    const items = c.items?.length ? c.items : contentItems(c).map((text) => ({ text, sub: "" }));
    const groups = new Map<string, string[]>();
    items.forEach((i, k) => { const g = i.sub || (k % 2 ? "B" : "A"); groups.set(g, [...(groups.get(g) ?? []), i.text]); });
    return { kind: "compare", title: c.title ?? "Comparação", color, cols: [...groups].slice(0, 5).map(([title, xs]) => ({ title, body: xs.map((x) => "- " + x).join("\n") })) };
  },
  resize: (prev, next, w, h) => ({ w: prev.cols.length && prev.cols.length !== next.cols.length ? (w * next.cols.length) / prev.cols.length : w, h }),
});
const LINEc = "#DDE3EE";

// ---------------- fita (esconde o que está embaixo; toque revela) ----------------
export const tape = defineBlock({
  kind: "tape", label: "Fita", hint: "Esconde o que está embaixo: um toque revela, outro esconde", behavior: "livre",
  make: () => ({ kind: "tape", revealed: false, label: "", pattern: "stripes", color: "#F2B33D" }),
  size: () => ({ w: 220, h: 44 }),
  clean: (r, color) => ({ kind: "tape", revealed: bool(r.revealed), label: str(r.label).slice(0, 60), pattern: r.pattern === "solid" || r.pattern === "dots" ? r.pattern : "stripes", color }),
  draw(s, w, h, _m, p) {
    if (s.revealed) {
      p.rects.push({ x: 0, y: 0, w, h, r: 6, fill: s.color, alpha: 0.1, stroke: s.color, sw: 1.5, dash: true });
      p.texts.push({ x: w - 6, y: 3, text: "👁", size: 11, color: MUTED, align: "right", alpha: 0.8 });
    } else {
      p.rects.push({ x: 0, y: 0, w, h, r: 6, fill: s.color });
      const ink = mix(s.color, -0.18);
      if (s.pattern === "stripes") for (let x = -h; x < w; x += 16) {
        const x0 = Math.max(0, x), x1 = Math.min(w, x + h); // reta y = h - (px - x), recortada à fita
        if (x1 > x0) p.lines.push({ pts: [{ x: x0, y: h - (x0 - x) }, { x: x1, y: h - (x1 - x) }], color: ink, width: 5, alpha: 0.35 });
      }
      else if (s.pattern === "dots") for (let y = 8; y < h; y += 12) for (let x = 8 + ((y / 12) % 2) * 6; x < w; x += 12) p.circles.push({ x, y, r: 1.8, fill: ink, alpha: 0.45 });
      if (s.label && h >= 18) p.texts.push({ x: w / 2, y: h / 2 - Math.min(14, h * 0.4) * 0.62, text: s.label, size: Math.min(14, h * 0.4), color: mix(s.color, -0.6), bold: true, align: "center" });
    }
    p.hits.push({ action: "toggle", index: 0, x: 0, y: 0, w, h });
  },
  tap: (s, hit) => (hit.action === "toggle" ? { ...s, revealed: !s.revealed } : s),
  form: [{ t: "text", key: "label", label: "Texto na fita (dica)", ph: "opcional" }, { t: "select", key: "pattern", label: "Padrão", options: [["stripes", "Listras"], ["solid", "Lisa"], ["dots", "Bolinhas"]] }, { t: "bool", key: "revealed", label: "Revelada" }],
  text: (s) => s.label,
  toContent: (s) => ({ title: s.label, text: "" }),
  fromContent: (c, color) => ({ kind: "tape", revealed: false, label: (c.title || "").slice(0, 60), pattern: "stripes", color }),
});

export const STUDY = [flashcard, tape, quiz, steps, exercise, reference, compare];
