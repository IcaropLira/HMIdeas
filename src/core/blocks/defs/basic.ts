// Blocos da 0.7: post-it, cartão, tarefas, tabela, linha do tempo, kanban, slide, documento, destaque e código.
import { defineBlock } from "../def";
import {
  BLOCK_COLORS, INK, LH, LINE, MUTED, SOFT, STICKY_COLORS, arr, bulletBody, cardBg, check, contentBody, contentItems, cycle, linesFit,
  mix, num, para, str, strs, wrap, BField, TextMeasure,
} from "../kit";

// ---------------- post-it ----------------
function stickySize(text: string, w: number, h: number, m: TextMeasure) {
  let size = Math.min(30, Math.max(12, Math.round(Math.min(w, h) / 8)));
  let lines = wrap(text, w - 32, size, m, "hand");
  while (size > 11 && lines.length * size * LH > h - 34) { size -= 1; lines = wrap(text, w - 32, size, m, "hand"); }
  return { size, lines };
}
export const sticky = defineBlock({
  kind: "sticky", label: "Post-it", hint: "Nota adesiva; o texto se ajusta ao tamanho", behavior: "livre", palette: "sticky",
  make: () => ({ kind: "sticky", text: "Escreva aqui…", color: STICKY_COLORS[0] }),
  size: () => ({ w: 220, h: 220 }),
  clean: (r, color) => ({ kind: "sticky", text: str(r.text), color }),
  draw(s, w, h, m, p) {
    p.rects.push({ x: 2, y: 4, w, h, r: 4, fill: INK, alpha: 0.13 }, { x: 0, y: 0, w, h, r: 4, fill: s.color });
    p.rects.push({ x: w * 0.32, y: -7, w: w * 0.36, h: 16, r: 2, fill: "#FFFFFF", alpha: 0.55 });
    const { size, lines } = stickySize(s.text, w, h, m);
    para(p, lines, 16, 20, size, mix(s.color, -0.72), { font: "hand" }, Math.floor((h - 30) / (size * LH)));
  },
  fields(s, w, h, m) {
    const { size } = stickySize(s.text || "M", w, h, m);
    return [{ key: "text", x: 16, y: 20, w: w - 32, h: h - 34, size, font: "hand", color: mix(s.color, -0.72), bg: s.color, multiline: true, placeholder: "Escreva aqui…" }];
  },
  form: [{ t: "area", key: "text", label: "Texto", rows: 6, font: "hand" }],
  text: (s) => s.text,
  toContent: (s) => ({ text: s.text }),
  fromContent: (c, color) => ({ kind: "sticky", text: [c.title, contentBody(c)].filter(Boolean).join("\n"), color: STICKY_COLORS.includes(color) ? color : STICKY_COLORS[0] }),
});

// ---------------- cartão ----------------
const cardTitleY = 18;
export const card = defineBlock({
  kind: "card", label: "Cartão", hint: "Título e texto, com faixa de cor", behavior: "livre",
  make: () => ({ kind: "card", title: "Título do cartão", body: "Uma ideia, uma referência ou um resumo.", color: BLOCK_COLORS[0] }),
  size: () => ({ w: 280, h: 170 }),
  clean: (r, color) => ({ kind: "card", title: str(r.title, "", 200), body: str(r.body), color, ...(r.icon ? { icon: str(r.icon, "", 8) } : {}) }),
  minH: (s, w, m) => 24 + wrap((s.icon ? s.icon + " " : "") + s.title, w - 44, 18, m, "sans", true).length * 18 * LH + 8 + wrap(s.body, w - 44, 14, m).length * 14 * LH + 22,
  draw(s, w, h, m, p) {
    cardBg(p, w, h);
    p.rects.push({ x: 0, y: 0, w: 6, h, r: 3, fill: s.color });
    const used = para(p, wrap((s.icon ? s.icon + " " : "") + s.title, w - 44, 18, m, "sans", true), 22, cardTitleY, 18, INK, { bold: true }, 3);
    para(p, wrap(s.body, w - 44, 14, m), 22, cardTitleY + used + 8, 14, SOFT, {}, Math.max(1, Math.floor((h - used - 40) / (14 * LH))));
  },
  fields(s, w, h, m) {
    const th = Math.max(1, Math.min(3, wrap(s.title || "M", w - 44, 18, m, "sans", true).length)) * 18 * LH;
    return [
      { key: "title", x: 22, y: cardTitleY, w: w - 44, h: th, size: 18, bold: true, color: INK, bg: "#FFFFFF", multiline: false, placeholder: "Título" },
      { key: "body", x: 22, y: cardTitleY + th + 8, w: w - 44, h: Math.max(20, h - th - 40), size: 14, color: SOFT, bg: "#FFFFFF", multiline: true, placeholder: "Texto" },
    ];
  },
  form: [{ t: "text", key: "title", label: "Título" }, { t: "area", key: "body", label: "Texto", rows: 5 }],
  text: (s) => `${s.title}\n${s.body}`,
  toContent: (s) => ({ title: s.title, text: s.body }),
  fromContent: (c, color) => ({ kind: "card", title: c.title ?? "", body: contentBody(c), color }),
});

// ---------------- tarefas ----------------
const todoRows = (s: { items: { text: string }[] }, w: number, m: TextMeasure) => s.items.map((it) => Math.max(30, wrap(it.text || " ", w - 68, 15, m).length * 15 * LH + 10));
export const todo = defineBlock({
  kind: "todo", label: "Tarefas", hint: "Lista com caixinhas: um toque marca/desmarca", behavior: "estruturado",
  make: () => ({ kind: "todo", title: "Tarefas", items: [{ text: "Primeira tarefa", done: true }, { text: "Segunda tarefa", done: false }, { text: "Terceira tarefa", done: false }], color: BLOCK_COLORS[2] }),
  size: (s) => ({ w: 300, h: 60 + s.items.length * 34 + 30 }),
  clean: (r, color) => ({ kind: "todo", title: str(r.title, "", 200), color, items: arr(r.items, 80, (i) => ({ text: str((i as { text?: unknown })?.text, "", 300), done: (i as { done?: unknown })?.done === true })) }),
  minH: (s, w, m) => 56 + todoRows(s, w, m).reduce((a, b) => a + b, 0) + 34,
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 14);
    p.texts.push({ x: 20, y: 18, text: s.title || "Tarefas", size: 18, color: INK, bold: true });
    const done = s.items.filter((i) => i.done).length;
    p.texts.push({ x: w - 20, y: 21, text: `${done}/${s.items.length}`, size: 13, color: s.color, bold: true, align: "right" });
    const rows = todoRows(s, w, m);
    let y = 56;
    s.items.forEach((it, i) => {
      const rowH = rows[i];
      if (y + rowH > h - 26) return;
      check(p, 20, y + 4, 18, it.done, s.color);
      p.hits.push({ action: "toggle", index: i, x: 10, y: y - 4, w: 40, h: rowH });
      para(p, wrap(it.text || " ", w - 68, 15, m), 48, y + 4, 15, it.done ? MUTED : INK, { strike: it.done });
      y += rowH;
    });
    const pw = w - 40;
    p.rects.push({ x: 20, y: h - 18, w: pw, h: 6, r: 3, fill: INK, alpha: 0.08 });
    if (s.items.length && done) p.rects.push({ x: 20, y: h - 18, w: Math.max(6, (pw * done) / s.items.length), h: 6, r: 3, fill: done === s.items.length ? "#2E9B5F" : s.color });
  },
  tap: (s, hit) => (hit.action === "toggle" ? { ...s, items: s.items.map((it, i) => (i === hit.index ? { ...it, done: !it.done } : it)) } : s),
  fields(s, w, _h, m) {
    const out: BField[] = [{ key: "title", x: 20, y: 18, w: w - 80, h: 24, size: 18, bold: true, color: INK, bg: "#FFFFFF", multiline: false, placeholder: "Título" }];
    let y = 56;
    todoRows(s, w, m).forEach((rh, i) => { out.push({ key: `items.${i}.text`, x: 48, y: y + 4, w: w - 68, h: rh - 8, size: 15, color: INK, bg: "#FFFFFF", multiline: false, placeholder: "Tarefa" }); y += rh; });
    return out;
  },
  split(s, key, before, after) {
    const mm = key.match(/^items\.(\d+)\.text$/);
    if (!mm) return null;
    const i = +mm[1];
    const items = [...s.items];
    items[i] = { ...items[i], text: before };
    items.splice(i + 1, 0, { text: after, done: false });
    return { spec: { ...s, items }, focus: `items.${i + 1}.text` };
  },
  form: [{ t: "text", key: "title", label: "Título" }, { t: "checklist", key: "items", label: "Tarefas" }],
  text: (s) => `${s.title}\n${s.items.map((i) => `${i.done ? "[x]" : "[ ]"} ${i.text}`).join("\n")}`,
  toContent: (s) => ({ title: s.title, items: s.items.map((i) => ({ text: i.text, done: i.done })) }),
  fromContent: (c, color) => ({ kind: "todo", title: c.title ?? "Tarefas", items: c.items?.length ? c.items.map((i) => ({ text: i.text, done: !!i.done })) : contentItems(c).map((text) => ({ text, done: false })), color }),
});

// ---------------- tabela ----------------
export const table = defineBlock({
  kind: "table", label: "Tabela", hint: "Linhas e colunas editáveis, com cabeçalho", behavior: "estruturado",
  make: () => ({ kind: "table", rows: [["Item", "Valor", "Obs."], ["", "", ""], ["", "", ""]], header: true, color: BLOCK_COLORS[0] }),
  size: (s) => ({ w: Math.max(240, (s.rows[0]?.length ?? 1) * 140), h: s.rows.length * 40 }),
  clean(r, color) {
    const rows = arr(r.rows, 60, (x) => (Array.isArray(x) ? strs(x, 16) : [""]));
    const n = Math.max(1, ...rows.map((x) => x.length));
    return { kind: "table", header: r.header !== false, color, rows: (rows.length ? rows : [[""]]).map((x) => [...x, ...Array(n - x.length).fill("")]) };
  },
  minH: (s) => s.rows.length * 32,
  draw(s, w, h, m, p) {
    const rows = s.rows.length, cols = Math.max(1, s.rows[0]?.length ?? 1);
    const rh = h / rows, cw = w / cols;
    cardBg(p, w, h, 10, "#FFFFFF", 0.07, "#CFD7E4");
    if (s.header) p.rects.push({ x: 0, y: 0, w, h: rh, r: 10, fill: mix(s.color, 0.82) }, { x: 0, y: rh / 2, w, h: rh / 2, r: 0, fill: mix(s.color, 0.82) });
    for (let r = 1; r < rows; r++) p.lines.push({ pts: [{ x: 0, y: r * rh }, { x: w, y: r * rh }], color: "#DCE2EC", width: 1 });
    for (let c = 1; c < cols; c++) p.lines.push({ pts: [{ x: c * cw, y: 0 }, { x: c * cw, y: h }], color: "#DCE2EC", width: 1 });
    const size = Math.min(15, Math.max(10, rh * 0.36));
    s.rows.forEach((row, r) => row.forEach((cell, c) => {
      if (!cell) return;
      const head = s.header && r === 0;
      const lines = wrap(cell, cw - 16, size, m, "sans", head);
      para(p, lines, c * cw + 8, r * rh + (rh - Math.min(lines.length, 2) * size * LH) / 2, size, head ? mix(s.color, -0.55) : INK, { bold: head }, 2);
    }));
  },
  fields(s, w, h) {
    const rows = s.rows.length, cols = Math.max(1, s.rows[0]?.length ?? 1), rh = h / rows, cw = w / cols;
    const size = Math.min(15, Math.max(10, rh * 0.36));
    return s.rows.flatMap((row, r) => row.map((_, c) => ({ key: `rows.${r}.${c}`, x: c * cw + 4, y: r * rh + 3, w: cw - 8, h: rh - 6, size, bold: s.header && r === 0, color: INK, bg: s.header && r === 0 ? mix(s.color, 0.82) : "#FFFFFF", multiline: false })));
  },
  form: [{ t: "table", key: "rows" }],
  text: (s) => s.rows.map((r) => r.join("\t")).join("\n"),
  toContent: (s) => {
    const [head, ...body] = s.header ? s.rows : [[], ...s.rows];
    return { title: head.join(" · "), items: body.map((r) => ({ text: r[0] ?? "", sub: r.slice(1).filter(Boolean).join(" · ") })) };
  },
  fromContent: (c, color) => ({ kind: "table", header: true, color, rows: [[c.title || "Item", "Detalhe"], ...(c.items?.length ? c.items.map((i) => [i.text, i.sub ?? (i.done ? "✓" : "")]) : contentItems(c).map((t) => [t, ""]))] }),
  resize(prev, next, w, h) {
    const c0 = prev.rows[0]?.length || 1, c1 = next.rows[0]?.length || 1;
    return { w: (w * c1) / c0, h: (h * next.rows.length) / Math.max(1, prev.rows.length) };
  },
});

// ---------------- linha do tempo ----------------
export const timeline = defineBlock({
  kind: "timeline", label: "Linha do tempo", hint: "Marcos com data distribuídos numa linha", behavior: "estruturado",
  make: () => ({ kind: "timeline", title: "Linha do tempo", items: [{ date: "Jan", text: "Início" }, { date: "Mar", text: "Protótipo" }, { date: "Jun", text: "Testes" }, { date: "Set", text: "Lançamento" }], color: BLOCK_COLORS[4] }),
  size: (s) => ({ w: Math.max(420, s.items.length * 160), h: 190 }),
  clean: (r, color) => ({ kind: "timeline", title: str(r.title, "", 200), color, items: arr(r.items, 40, (i) => ({ date: str((i as { date?: unknown })?.date, "", 40), text: str((i as { text?: unknown })?.text, "", 200) })) }),
  draw(s, w, h, m, p) {
    const ly = Math.min(h - 70, Math.max(70, h * 0.48));
    if (s.title) p.texts.push({ x: 4, y: 2, text: s.title, size: 18, color: INK, bold: true });
    p.lines.push({ pts: [{ x: 8, y: ly }, { x: w - 14, y: ly }], color: mix(s.color, 0.35), width: 4 });
    p.lines.push({ pts: [{ x: w - 24, y: ly - 8 }, { x: w - 12, y: ly }, { x: w - 24, y: ly + 8 }], color: mix(s.color, 0.35), width: 4 });
    const step = (w - 50) / Math.max(1, s.items.length);
    s.items.forEach((it, i) => {
      const x = 24 + step * (i + 0.5), c = cycle(s.color, i);
      p.circles.push({ x, y: ly, r: 10, fill: "#FFFFFF", stroke: c, sw: 4 });
      p.texts.push({ x, y: ly - 40, text: it.date, size: 14, color: c, bold: true, align: "center" });
      para(p, wrap(it.text, step - 14, 14, m), x, ly + 22, 14, INK, { align: "center" }, linesFit(h - ly - 26, 14));
    });
  },
  fields(s, w, h) {
    const ly = Math.min(h - 70, Math.max(70, h * 0.48)), step = (w - 50) / Math.max(1, s.items.length);
    return [
      { key: "title", x: 4, y: 2, w: w - 8, h: 24, size: 18, bold: true, color: INK, bg: "#FFFFFF", multiline: false, placeholder: "Título" },
      ...s.items.flatMap((_, i) => {
        const x = 24 + step * (i + 0.5);
        return [
          { key: `items.${i}.date`, x: x - step / 2 + 6, y: ly - 42, w: step - 12, h: 22, size: 14, bold: true, color: cycle(s.color, i), bg: "#FFFFFF", align: "center" as const, multiline: false, placeholder: "Data" },
          { key: `items.${i}.text`, x: x - step / 2 + 6, y: ly + 20, w: step - 12, h: h - ly - 22, size: 14, color: INK, bg: "#FFFFFF", align: "center" as const, multiline: true, placeholder: "Marco" },
        ];
      }),
    ];
  },
  form: [{ t: "text", key: "title", label: "Título" }, { t: "pairs", key: "items", label: "Marcos", a: ["date", "Data"], b: ["text", "Marco"], add: "+ Marco" }],
  text: (s) => `${s.title}\n${s.items.map((i) => `${i.date}: ${i.text}`).join("\n")}`,
  toContent: (s) => ({ title: s.title, items: s.items.map((i) => ({ text: i.text, sub: i.date })) }),
  fromContent: (c, color) => ({ kind: "timeline", title: c.title ?? "", color, items: (c.items?.length ? c.items : contentItems(c).map((text) => ({ text, sub: "" }))).map((i, k) => ({ date: i.sub || String(k + 1), text: i.text })) }),
  resize: (prev, next, w, h) => ({ w: next.items.length > prev.items.length ? Math.max(w, Math.max(420, next.items.length * 160)) : w, h }),
});

// ---------------- kanban ----------------
export const kanban = defineBlock({
  kind: "kanban", label: "Kanban", hint: "Colunas com cartões", behavior: "estruturado",
  make: () => ({ kind: "kanban", title: "Kanban", columns: [{ title: "A fazer", cards: ["Pesquisar", "Rascunho"] }, { title: "Fazendo", cards: ["Escrever"] }, { title: "Feito", cards: ["Definir tema"] }], color: BLOCK_COLORS[0] }),
  size: (s) => ({ w: Math.max(400, s.columns.length * 220 + 16), h: 380 }),
  clean: (r, color) => ({ kind: "kanban", title: str(r.title, "", 200), color, columns: arr(r.columns, 12, (c) => ({ title: str((c as { title?: unknown })?.title, "", 80), cards: strs((c as { cards?: unknown })?.cards, 60) })) }),
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 14, "#F4F6FA", 0.06);
    p.texts.push({ x: 16, y: 14, text: s.title || "Kanban", size: 18, color: INK, bold: true });
    const n = Math.max(1, s.columns.length), gap = 10, top = 48, cw = (w - 16 - gap * (n - 1)) / n;
    s.columns.forEach((col, i) => {
      const x = 8 + i * (cw + gap), c = cycle(s.color, i);
      p.rects.push({ x, y: top, w: cw, h: h - top - 8, r: 10, fill: "#FFFFFF", alpha: 0.7 }, { x, y: top, w: cw, h: 4, r: 2, fill: c });
      p.texts.push({ x: x + 10, y: top + 12, text: col.title, size: 14, color: INK, bold: true });
      p.texts.push({ x: x + cw - 10, y: top + 13, text: String(col.cards.length), size: 12, color: c, bold: true, align: "right" });
      let y = top + 40;
      for (const cardText of col.cards) {
        const lines = wrap(cardText || " ", cw - 24, 13, m);
        const ch = Math.min(4, lines.length) * 13 * LH + 16;
        if (y + ch > h - 12) { p.texts.push({ x: x + 10, y, text: "…", size: 13, color: SOFT }); break; }
        p.rects.push({ x: x + 6, y: y + 2, w: cw - 12, h: ch, r: 8, fill: INK, alpha: 0.05 }, { x: x + 6, y, w: cw - 12, h: ch, r: 8, fill: "#FFFFFF", stroke: LINE, sw: 1 });
        para(p, lines, x + 14, y + 8, 13, INK, {}, 4);
        y += ch + 8;
      }
    });
  },
  fields(s, w, _h, m) {
    const n = Math.max(1, s.columns.length), gap = 10, top = 48, cw = (w - 16 - gap * (n - 1)) / n;
    const out: BField[] = [{ key: "title", x: 16, y: 14, w: w - 32, h: 24, size: 18, bold: true, color: INK, bg: "#F4F6FA", multiline: false }];
    s.columns.forEach((col, i) => {
      const x = 8 + i * (cw + gap);
      out.push({ key: `columns.${i}.title`, x: x + 10, y: top + 10, w: cw - 40, h: 22, size: 14, bold: true, color: INK, bg: "#FFFFFF", multiline: false });
      let y = top + 40;
      col.cards.forEach((cardText, k) => {
        const ch = Math.min(4, wrap(cardText || " ", cw - 24, 13, m).length) * 13 * LH + 16;
        out.push({ key: `columns.${i}.cards.${k}`, x: x + 12, y: y + 6, w: cw - 24, h: ch - 12, size: 13, color: INK, bg: "#FFFFFF", multiline: false });
        y += ch + 8;
      });
    });
    return out;
  },
  split(s, key, before, after) {
    const mm = key.match(/^columns\.(\d+)\.cards\.(\d+)$/);
    if (!mm) return null;
    const ci = +mm[1], k = +mm[2];
    const cards = [...s.columns[ci].cards];
    cards[k] = before; cards.splice(k + 1, 0, after);
    return { spec: { ...s, columns: s.columns.map((c, i) => (i === ci ? { ...c, cards } : c)) }, focus: `columns.${ci}.cards.${k + 1}` };
  },
  form: [{ t: "text", key: "title", label: "Título" }, { t: "columns", key: "columns" }],
  text: (s) => `${s.title}\n${s.columns.map((c) => `${c.title}: ${c.cards.join("; ")}`).join("\n")}`,
  toContent: (s) => ({ title: s.title, items: s.columns.flatMap((c) => c.cards.map((text) => ({ text, sub: c.title, done: /feito|conclu|done/i.test(c.title) }))) }),
  fromContent(c, color) {
    const items = c.items?.length ? c.items : contentItems(c).map((text) => ({ text, done: false, sub: "" }));
    const named = items.some((i) => i.sub && !i.done);
    if (named) {
      const cols: { title: string; cards: string[] }[] = [];
      for (const i of items) { const t = i.sub || "A fazer"; (cols.find((x) => x.title === t) ?? (cols.push({ title: t, cards: [] }), cols[cols.length - 1])).cards.push(i.text); }
      return { kind: "kanban", title: c.title ?? "Kanban", color, columns: cols };
    }
    return { kind: "kanban", title: c.title ?? "Kanban", color, columns: [{ title: "A fazer", cards: items.filter((i) => !i.done).map((i) => i.text) }, { title: "Fazendo", cards: [] }, { title: "Feito", cards: items.filter((i) => i.done).map((i) => i.text) }] };
  },
  resize: (prev, next, w, h) => ({ w: prev.columns.length && prev.columns.length !== next.columns.length ? (w * next.columns.length) / prev.columns.length : w, h }),
});

// ---------------- slide ----------------
export const slide = defineBlock({
  kind: "slide", label: "Slide", hint: "Quadro 16:9 com título e tópicos", behavior: "livre",
  make: () => ({ kind: "slide", title: "Título do slide", body: "- Ponto principal\n- Outro ponto\n- Conclusão", color: BLOCK_COLORS[4], number: 1 }),
  size: () => ({ w: 480, h: 270 }),
  clean: (r, color) => ({ kind: "slide", title: str(r.title, "", 200), body: str(r.body), color, number: Math.round(num(r.number, 1, 1, 9999)) }),
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 6, "#FFFFFF", 0.15, "#D5DCE8");
    p.rects.push({ x: 0, y: 0, w, h: Math.max(6, h * 0.03), r: 3, fill: s.color });
    const ts = Math.max(14, Math.round(h * 0.1));
    const used = para(p, wrap(s.title, w * 0.86, ts, m, "sans", true), w * 0.07, h * 0.12, ts, INK, { bold: true }, 2);
    const bs = Math.max(10, Math.round(h * 0.06));
    const body = s.body.split("\n").map((l) => l.replace(/^\s*[-*]\s+/, "•  "));
    para(p, body.flatMap((l) => wrap(l, w * 0.84, bs, m)), w * 0.08, h * 0.12 + used + h * 0.06, bs, SOFT, {}, Math.floor((h * 0.7 - used) / (bs * LH)));
    p.texts.push({ x: w - 12, y: h - 22, text: String(s.number), size: 12, color: MUTED, align: "right" });
  },
  fields(s, w, h, m) {
    const ts = Math.max(14, Math.round(h * 0.1)), bs = Math.max(10, Math.round(h * 0.06));
    const th = Math.min(2, wrap(s.title || "M", w * 0.86, ts, m, "sans", true).length) * ts * LH;
    return [
      { key: "title", x: w * 0.07, y: h * 0.12, w: w * 0.86, h: th, size: ts, bold: true, color: INK, bg: "#FFFFFF", multiline: false, placeholder: "Título" },
      { key: "body", x: w * 0.08, y: h * 0.12 + th + h * 0.06, w: w * 0.84, h: h * 0.7 - th, size: bs, color: SOFT, bg: "#FFFFFF", multiline: true, placeholder: "- tópico" },
    ];
  },
  form: [{ t: "text", key: "title", label: "Título" }, { t: "area", key: "body", label: "Tópicos (- um por linha)", rows: 5 }, { t: "number", key: "number", label: "Número", min: 1 }],
  text: (s) => `${s.title}\n${s.body}`,
  toContent: (s) => ({ title: s.title, text: s.body }),
  fromContent: (c, color) => ({ kind: "slide", title: c.title ?? "", body: bulletBody(c), color, number: 1 }),
});

// ---------------- documento ----------------
export const doc = defineBlock({
  kind: "doc", label: "Documento", hint: "Página com título, subtítulos (#) e listas (-)", behavior: "livre",
  make: () => ({ kind: "doc", title: "Documento", body: "# Introdução\nEscreva o texto aqui.\n\n# Tópicos\n- primeiro\n- segundo", color: BLOCK_COLORS[7] }),
  size: () => ({ w: 420, h: 540 }),
  clean: (r, color) => ({ kind: "doc", title: str(r.title, "", 200), body: str(r.body, "", 40000), color }),
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 4, "#FFFFFF", 0.12);
    const mg = Math.max(24, w * 0.09);
    let y = mg * 0.9;
    y += para(p, wrap(s.title, w - 2 * mg, 24, m, "serif", true), mg, y, 24, INK, { bold: true, font: "serif" }, 3) + 6;
    p.lines.push({ pts: [{ x: mg, y }, { x: mg + 60, y }], color: s.color, width: 3 });
    y += 14;
    for (const raw of s.body.split("\n")) {
      if (y > h - mg * 0.6) break;
      if (/^#\s+/.test(raw)) { y += 6; y += para(p, wrap(raw.replace(/^#\s+/, ""), w - 2 * mg, 17, m, "serif", true), mg, y, 17, INK, { bold: true, font: "serif" }) + 2; continue; }
      const bullet = /^\s*[-*]\s+/.test(raw);
      const t = bullet ? raw.replace(/^\s*[-*]\s+/, "") : raw;
      if (!t.trim()) { y += 8; continue; }
      if (bullet) p.circles.push({ x: mg + 4, y: y + 9, r: 2.5, fill: s.color });
      y += para(p, wrap(t, w - 2 * mg - (bullet ? 16 : 0), 14, m, "serif"), mg + (bullet ? 16 : 0), y, 14, "#33394A", { font: "serif" }, linesFit(h - mg * 0.6 - y, 14)) + 3;
    }
  },
  fields(s, w, h, m) {
    const mg = Math.max(24, w * 0.09), th = Math.min(3, wrap(s.title || "M", w - 2 * mg, 24, m, "serif", true).length) * 24 * LH;
    return [
      { key: "title", x: mg, y: mg * 0.9, w: w - 2 * mg, h: th, size: 24, bold: true, font: "serif", color: INK, bg: "#FFFFFF", multiline: false },
      { key: "body", x: mg, y: mg * 0.9 + th + 20, w: w - 2 * mg, h: h - mg * 1.6 - th - 20, size: 14, font: "serif", color: "#33394A", bg: "#FFFFFF", multiline: true, placeholder: "# subtítulo\n- item" },
    ];
  },
  form: [{ t: "text", key: "title", label: "Título" }, { t: "area", key: "body", label: "Texto (# subtítulo, - lista)", rows: 12, font: "serif" }],
  text: (s) => `${s.title}\n${s.body}`,
  toContent: (s) => ({ title: s.title, text: s.body }),
  fromContent: (c, color) => ({ kind: "doc", title: c.title ?? "Documento", body: bulletBody(c), color }),
});

// ---------------- destaque ----------------
export const CALLOUT_ICONS = ["💡", "⚠️", "⛔", "ℹ️", "✅", "❗", "📌", "🤔", "🧪", "👁️", "🏁", "⏰", "🎯", "👍", "👎", "❓", "📝", "🔥"];
const calloutTop = (s: { title?: string }) => (s.title ? 40 : 18);
export const callout = defineBlock({
  kind: "callout", label: "Destaque", hint: "Aviso com ícone e cor (dica, alerta, lembrete…)", behavior: "livre",
  make: () => ({ kind: "callout", icon: "💡", text: "Dica: destaque aqui o que não pode ser esquecido.", color: BLOCK_COLORS[3] }),
  size: () => ({ w: 380, h: 96 }),
  clean: (r, color) => ({ kind: "callout", icon: str(r.icon, "💡", 8), text: str(r.text), color, ...(r.title ? { title: str(r.title, "", 80) } : {}) }),
  minH: (s, w, m) => Math.max(64, wrap(s.text, w - 78, 15, m).length * 15 * LH + calloutTop(s) + 14),
  draw(s, w, h, m, p) {
    p.rects.push({ x: 0, y: 0, w, h, r: 12, fill: mix(s.color, 0.86) }, { x: 0, y: 0, w: 5, h, r: 2.5, fill: s.color });
    p.texts.push({ x: 20, y: 16, text: s.icon, size: 24, color: INK });
    if (s.title) p.texts.push({ x: 60, y: 16, text: s.title, size: 15, color: mix(s.color, -0.45), bold: true });
    para(p, wrap(s.text, w - 78, 15, m), 60, calloutTop(s), 15, mix(s.color, -0.6), {}, linesFit(h - calloutTop(s) - 8, 15));
  },
  tap: (s, hit) => (hit.action === "icon" ? { ...s, icon: CALLOUT_ICONS[(CALLOUT_ICONS.indexOf(s.icon) + 1) % CALLOUT_ICONS.length] } : s),
  fields: (s, w, h) => [
    ...(s.title ? [{ key: "title", x: 60, y: 14, w: w - 78, h: 22, size: 15, bold: true, color: mix(s.color, -0.45), bg: mix(s.color, 0.86), multiline: false }] : []),
    { key: "text", x: 60, y: calloutTop(s), w: w - 78, h: h - calloutTop(s) - 8, size: 15, color: mix(s.color, -0.6), bg: mix(s.color, 0.86), multiline: true },
  ],
  form: [{ t: "icon", key: "icon", label: "Ícone", options: CALLOUT_ICONS }, { t: "text", key: "title", label: "Rótulo (opcional)" }, { t: "area", key: "text", label: "Texto", rows: 4 }],
  text: (s) => `${s.icon} ${s.title ? s.title + ": " : ""}${s.text}`,
  toContent: (s) => ({ title: s.title, text: s.text }),
  fromContent: (c, color) => ({ kind: "callout", icon: "💡", title: c.title || undefined, text: contentBody(c), color }),
});

// ---------------- código ----------------
export const code = defineBlock({
  kind: "code", label: "Código", hint: "Trecho de código com fonte monoespaçada", behavior: "livre", palette: "none",
  make: () => ({ kind: "code", lang: "python", code: "def soma(a, b):\n    return a + b\n\nprint(soma(2, 3))", color: BLOCK_COLORS[7] }),
  size: () => ({ w: 440, h: 210 }),
  clean: (r, color) => ({ kind: "code", lang: str(r.lang, "", 30), code: str(r.code, "", 40000), color }),
  minH: (s) => 48 + Math.min(80, s.code.split("\n").length) * 13 * LH,
  draw(s, w, h, _m, p) {
    p.rects.push({ x: 2, y: 4, w, h, r: 10, fill: INK, alpha: 0.15 }, { x: 0, y: 0, w, h, r: 10, fill: "#1E1F2E" });
    p.rects.push({ x: 0, y: 0, w, h: 28, r: 10, fill: "#272939" }, { x: 0, y: 18, w, h: 10, r: 0, fill: "#272939" });
    ["#FF5F57", "#FEBC2E", "#28C840"].forEach((c, i) => p.circles.push({ x: 16 + i * 16, y: 14, r: 5, fill: c }));
    if (s.lang) p.texts.push({ x: w - 12, y: 7, text: s.lang, size: 11, color: "#8B90A8", align: "right", font: "mono" });
    const max = linesFit(h - 44, 13);
    s.code.split("\n").slice(0, max).forEach((l, i) => {
      p.texts.push({ x: 12, y: 38 + i * 13 * LH, text: String(i + 1).padStart(2), size: 13, color: "#5D6178", font: "mono" });
      const tone = /^\s*(#|\/\/|--)/.test(l) ? "#7F8AA6" : /\b(def|return|function|const|let|if|else|for|while|class|import|from|print|se|então|senão|enquanto|para|fim|retorne|algoritmo|início)\b/.test(l) ? "#C9A2FF" : "#E6E8F2";
      p.texts.push({ x: 40, y: 38 + i * 13 * LH, text: l.replace(/\t/g, "  "), size: 13, color: tone, font: "mono" });
    });
  },
  fields: (_s, w, h) => [{ key: "code", x: 40, y: 37, w: w - 52, h: h - 44, size: 13, font: "mono", color: "#E6E8F2", bg: "#1E1F2E", multiline: true }],
  form: [{ t: "text", key: "lang", label: "Linguagem" }, { t: "area", key: "code", label: "Código", rows: 10, font: "mono" }],
  text: (s) => s.code,
  toContent: (s) => ({ title: s.lang, text: s.code }),
  fromContent: (c, color) => ({ kind: "code", lang: "", code: [c.title, contentBody(c)].filter(Boolean).join("\n"), color }),
});

export const BASIC = [sticky, card, todo, table, timeline, kanban, slide, doc, callout, code];
