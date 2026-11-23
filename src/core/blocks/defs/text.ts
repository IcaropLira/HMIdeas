// Blocos de texto: título, texto livre/caixa/nota, lista, citação, definição, glossário, pergunta e resposta, fórmula.
import { defineBlock } from "../def";
import {
  BField, BLOCK_COLORS, INK, LH, LINE, SOFT, arr, cardBg, contentBody, contentItems, linesFit, mix, oneOf, para, str, strs, wrap, TextMeasure,
} from "../kit";

// ---------------- título ----------------
const HSIZE = { 1: 34, 2: 26, 3: 20 } as const;
export const heading = defineBlock({
  kind: "heading", label: "Título", hint: "Título ou subtítulo solto no quadro", behavior: "livre",
  make: () => ({ kind: "heading", text: "Título", level: 1, color: BLOCK_COLORS[0] }),
  size: (s) => ({ w: 360, h: HSIZE[s.level] * LH + (s.level === 1 ? 20 : 10) }),
  clean: (r, color) => ({ kind: "heading", text: str(r.text, "", 300), level: ([1, 2, 3].includes(r.level) ? r.level : 1) as 1 | 2 | 3, color }),
  minH: (s, w, m) => wrap(s.text, w, HSIZE[s.level], m, "sans", true).length * HSIZE[s.level] * LH + (s.level === 1 ? 14 : 6),
  draw(s, w, h, m, p) {
    const size = HSIZE[s.level];
    const used = para(p, wrap(s.text, w, size, m, "sans", true), 0, 0, size, s.level === 3 ? mix(s.color, -0.2) : INK, { bold: true }, linesFit(h, size));
    if (s.level === 1) p.rects.push({ x: 0, y: used + 4, w: Math.min(80, w), h: 5, r: 2.5, fill: s.color });
    if (s.level === 2) p.rects.push({ x: 0, y: used + 2, w, h: 1.5, r: 0, fill: LINE });
  },
  fields: (s, w, h) => [{ key: "text", x: 0, y: 0, w, h: Math.max(HSIZE[s.level] * LH, h - 10), size: HSIZE[s.level], bold: true, color: INK, bg: "#FFFFFF", multiline: false, placeholder: "Título" }],
  form: [{ t: "text", key: "text", label: "Texto" }, { t: "select", key: "level", label: "Nível", options: [[1, "Título"], [2, "Subtítulo"], [3, "Seção"]] }],
  text: (s) => s.text,
  toContent: (s) => ({ title: s.text }),
  fromContent: (c, color) => ({ kind: "heading", text: c.title || contentItems(c)[0] || "", level: 1, color }),
});

// ---------------- texto ----------------
const TEXT_SIZE = { plain: 16, box: 15, note: 14, footnote: 12 } as const;
const textPad = (style: keyof typeof TEXT_SIZE) => (style === "plain" ? { x: 0, y: 0 } : style === "footnote" ? { x: 0, y: 10 } : { x: 16, y: 14 });
export const text = defineBlock({
  kind: "text", label: "Texto", hint: "Parágrafo, caixa de texto, nota lateral ou de rodapé", behavior: "livre",
  make: () => ({ kind: "text", text: "Escreva um parágrafo aqui. O texto quebra sozinho na largura do bloco.", style: "plain", color: BLOCK_COLORS[0] }),
  size: (s) => ({ w: s.style === "footnote" ? 320 : 340, h: 90 }),
  clean: (r, color) => ({ kind: "text", text: str(r.text, "", 20000), style: oneOf(r.style, ["plain", "box", "note", "footnote"] as const, "plain"), color }),
  minH(s, w, m) { const pd = textPad(s.style), sz = TEXT_SIZE[s.style]; return wrap(s.text, w - 2 * pd.x, sz, m).length * sz * LH + 2 * pd.y; },
  draw(s, w, h, m, p) {
    const pd = textPad(s.style), sz = TEXT_SIZE[s.style];
    if (s.style === "box") cardBg(p, w, h, 10, "#FFFFFF", 0.06);
    if (s.style === "note") p.rects.push({ x: 0, y: 0, w, h, r: 8, fill: mix(s.color, 0.9) }, { x: 0, y: 0, w: 3, h, r: 1.5, fill: s.color });
    if (s.style === "footnote") p.lines.push({ pts: [{ x: 0, y: 2 }, { x: Math.min(90, w), y: 2 }], color: SOFT, width: 1 });
    para(p, wrap(s.text, w - 2 * pd.x, sz, m), pd.x, pd.y, sz, s.style === "footnote" ? SOFT : s.style === "note" ? mix(s.color, -0.55) : INK, { italic: s.style === "note" }, linesFit(h - 2 * pd.y, sz));
  },
  fields(s, w, h) {
    const pd = textPad(s.style), sz = TEXT_SIZE[s.style];
    return [{ key: "text", x: pd.x, y: pd.y, w: w - 2 * pd.x, h: h - 2 * pd.y, size: sz, italic: s.style === "note", color: s.style === "footnote" ? SOFT : INK, bg: s.style === "note" ? mix(s.color, 0.9) : "#FFFFFF", multiline: true }];
  },
  form: [{ t: "select", key: "style", label: "Estilo", options: [["plain", "Texto livre"], ["box", "Caixa de texto"], ["note", "Nota lateral"], ["footnote", "Nota de rodapé"]] }, { t: "area", key: "text", label: "Texto", rows: 7 }],
  text: (s) => s.text,
  toContent: (s) => ({ text: s.text }),
  fromContent: (c, color) => ({ kind: "text", text: [c.title, contentBody(c)].filter(Boolean).join("\n"), style: "plain", color }),
});

// ---------------- lista ----------------
const listRows = (s: { items: string[] }, w: number, m: TextMeasure) => s.items.map((t) => Math.max(1, wrap(t || " ", w - 54, 15, m).length) * 15 * LH + 8);
const listTop = (s: { title: string }) => (s.title ? 50 : 16);
export const list = defineBlock({
  kind: "list", label: "Lista", hint: "Lista com marcadores, numerada ou de setas", behavior: "estruturado",
  make: () => ({ kind: "list", title: "Lista", items: ["Primeiro item", "Segundo item", "Terceiro item"], style: "bullet", color: BLOCK_COLORS[0] }),
  size: (s) => ({ w: 280, h: listTop(s) + s.items.length * 28 + 14 }),
  clean: (r, color) => ({ kind: "list", title: str(r.title, "", 200), items: strs(r.items, 100), style: oneOf(r.style, ["bullet", "number", "arrow"] as const, "bullet"), color }),
  minH: (s, w, m) => listTop(s) + listRows(s, w, m).reduce((a, b) => a + b, 0) + 12,
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 12, "#FFFFFF", 0.08);
    if (s.title) p.texts.push({ x: 18, y: 16, text: s.title, size: 17, color: INK, bold: true });
    let y = listTop(s);
    const rows = listRows(s, w, m);
    s.items.forEach((t, i) => {
      if (y + rows[i] > h - 6) return;
      if (s.style === "bullet") p.circles.push({ x: 26, y: y + 10, r: 3.5, fill: s.color });
      else if (s.style === "number") { p.circles.push({ x: 27, y: y + 10, r: 10, fill: mix(s.color, 0.82) }); p.texts.push({ x: 27, y: y + 2.5, text: String(i + 1), size: 12, color: mix(s.color, -0.5), bold: true, align: "center" }); }
      else p.lines.push({ pts: [{ x: 20, y: y + 10 }, { x: 32, y: y + 10 }, { x: 27, y: y + 5 }, { x: 32, y: y + 10 }, { x: 27, y: y + 15 }], color: s.color, width: 2 });
      para(p, wrap(t || " ", w - 54, 15, m), 44, y + 1, 15, INK);
      y += rows[i];
    });
  },
  fields(s, w, _h, m) {
    const out: BField[] = s.title ? [{ key: "title", x: 18, y: 16, w: w - 36, h: 24, size: 17, bold: true, color: INK, bg: "#FFFFFF", multiline: false }] : [];
    let y = listTop(s);
    listRows(s, w, m).forEach((rh, i) => { out.push({ key: `items.${i}`, x: 44, y: y + 1, w: w - 54, h: rh - 6, size: 15, color: INK, bg: "#FFFFFF", multiline: false }); y += rh; });
    return out;
  },
  split(s, key, before, after) {
    const mm = key.match(/^items\.(\d+)$/);
    if (!mm) return null;
    const i = +mm[1], items = [...s.items];
    items[i] = before; items.splice(i + 1, 0, after);
    return { spec: { ...s, items }, focus: `items.${i + 1}` };
  },
  form: [{ t: "text", key: "title", label: "Título (opcional)" }, { t: "select", key: "style", label: "Marcador", options: [["bullet", "• Marcadores"], ["number", "1. Numerada"], ["arrow", "→ Setas"]] }, { t: "lines", key: "items", label: "Itens", add: "+ Item" }],
  text: (s) => `${s.title}\n${s.items.map((t, i) => (s.style === "number" ? `${i + 1}. ` : "- ") + t).join("\n")}`,
  toContent: (s) => ({ title: s.title, items: s.items.map((t) => ({ text: t })) }),
  fromContent: (c, color) => ({ kind: "list", title: c.title ?? "", items: contentItems(c), style: "bullet", color }),
});

// ---------------- citação ----------------
export const quote = defineBlock({
  kind: "quote", label: "Citação", hint: "Frase em destaque com autor", behavior: "livre",
  make: () => ({ kind: "quote", text: "A imaginação é mais importante que o conhecimento.", author: "Albert Einstein", color: BLOCK_COLORS[4] }),
  size: () => ({ w: 360, h: 150 }),
  clean: (r, color) => ({ kind: "quote", text: str(r.text), author: str(r.author, "", 120), color }),
  minH: (s, w, m) => 30 + wrap(s.text, w - 70, 19, m, "serif").length * 19 * LH + (s.author ? 34 : 14),
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 12, mix(s.color, 0.93), 0.06, "");
    p.texts.push({ x: 14, y: -6, text: "“", size: 64, color: s.color, font: "serif", bold: true });
    const used = para(p, wrap(s.text, w - 70, 19, m, "serif"), 50, 26, 19, INK, { font: "serif", italic: true }, linesFit(h - 60, 19));
    if (s.author) p.texts.push({ x: w - 20, y: Math.min(h - 28, 32 + used), text: "— " + s.author, size: 13, color: mix(s.color, -0.35), bold: true, align: "right" });
  },
  fields: (s, w, h) => [
    { key: "text", x: 50, y: 26, w: w - 70, h: h - 64, size: 19, font: "serif", italic: true, color: INK, bg: mix(s.color, 0.93), multiline: true },
    { key: "author", x: w * 0.4, y: h - 30, w: w * 0.6 - 20, h: 20, size: 13, bold: true, color: mix(s.color, -0.35), bg: mix(s.color, 0.93), align: "right", multiline: false, placeholder: "Autor" },
  ],
  form: [{ t: "area", key: "text", label: "Citação", rows: 4, font: "serif" }, { t: "text", key: "author", label: "Autor / fonte" }],
  text: (s) => `“${s.text}” — ${s.author}`,
  toContent: (s) => ({ title: s.author, text: s.text }),
  fromContent: (c, color) => ({ kind: "quote", text: contentBody(c), author: c.title ?? "", color }),
});

// ---------------- definição / conceito ----------------
export const definition = defineBlock({
  kind: "definition", label: "Definição", hint: "Termo + significado (definição, conceito, regra)", behavior: "livre",
  make: () => ({ kind: "definition", label: "Definição", term: "Fotossíntese", text: "Processo em que plantas transformam luz, água e CO₂ em glicose e oxigênio.", color: BLOCK_COLORS[5] }),
  size: () => ({ w: 340, h: 150 }),
  clean: (r, color) => ({ kind: "definition", label: str(r.label, "Definição", 40), term: str(r.term, "", 200), text: str(r.text), color }),
  minH: (s, w, m) => 52 + wrap(s.term, w - 36, 20, m, "sans", true).length * 20 * LH + wrap(s.text, w - 36, 15, m).length * 15 * LH + 18,
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 12);
    const lw = Math.min(w - 36, s.label.length * 8 + 22);
    p.rects.push({ x: 18, y: 16, w: lw, h: 22, r: 11, fill: mix(s.color, 0.82) });
    p.texts.push({ x: 18 + lw / 2, y: 20, text: s.label.toUpperCase(), size: 11, color: mix(s.color, -0.5), bold: true, align: "center" });
    const used = para(p, wrap(s.term, w - 36, 20, m, "sans", true), 18, 48, 20, INK, { bold: true }, 2);
    para(p, wrap(s.text, w - 36, 15, m), 18, 54 + used, 15, SOFT, {}, linesFit(h - 66 - used, 15));
  },
  fields(s, w, h, m) {
    const th = Math.min(2, wrap(s.term || "M", w - 36, 20, m, "sans", true).length) * 20 * LH;
    return [
      { key: "term", x: 18, y: 48, w: w - 36, h: th, size: 20, bold: true, color: INK, bg: "#FFFFFF", multiline: false, placeholder: "Termo" },
      { key: "text", x: 18, y: 54 + th, w: w - 36, h: h - 66 - th, size: 15, color: SOFT, bg: "#FFFFFF", multiline: true, placeholder: "Significado" },
    ];
  },
  form: [{ t: "select", key: "label", label: "Tipo", options: [["Definição", "Definição"], ["Conceito", "Conceito"], ["Regra", "Regra"], ["Propriedade", "Propriedade"], ["Exemplo", "Exemplo"]] }, { t: "text", key: "term", label: "Termo" }, { t: "area", key: "text", label: "Significado", rows: 4 }],
  text: (s) => `${s.term}: ${s.text}`,
  toContent: (s) => ({ title: s.term, text: s.text }),
  fromContent: (c, color) => ({ kind: "definition", label: "Definição", term: c.title || contentItems(c)[0] || "", text: c.title ? contentBody(c) : contentItems(c).slice(1).join(" "), color }),
});

// ---------------- glossário ----------------
const gRows = (s: { items: { a: string; b: string }[] }, w: number, m: TextMeasure) => s.items.map((it) => Math.max(wrap(it.a || " ", w * 0.32 - 20, 14, m, "sans", true).length, wrap(it.b || " ", w * 0.68 - 24, 14, m).length) * 14 * LH + 14);
export const glossary = defineBlock({
  kind: "glossary", label: "Glossário", hint: "Termos e significados (vocabulário)", behavior: "estruturado",
  make: () => ({ kind: "glossary", title: "Glossário", items: [{ a: "Termo", b: "Significado do termo." }, { a: "Outro termo", b: "Outro significado." }], color: BLOCK_COLORS[5] }),
  size: (s) => ({ w: 420, h: 56 + s.items.length * 40 }),
  clean: (r, color) => ({ kind: "glossary", title: str(r.title, "", 200), color, items: arr(r.items, 100, (x) => ({ a: str((x as { a?: unknown })?.a, "", 200), b: str((x as { b?: unknown })?.b, "", 1000) })) }),
  minH: (s, w, m) => 52 + gRows(s, w, m).reduce((a, b) => a + b, 0) + 8,
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 12);
    p.texts.push({ x: 18, y: 16, text: s.title, size: 17, color: INK, bold: true });
    let y = 50;
    gRows(s, w, m).forEach((rh, i) => {
      if (y + rh > h) return;
      if (i % 2 === 0) p.rects.push({ x: 8, y, w: w - 16, h: rh, r: 6, fill: mix(s.color, 0.93) });
      para(p, wrap(s.items[i].a, w * 0.32 - 20, 14, m, "sans", true), 18, y + 7, 14, mix(s.color, -0.45), { bold: true });
      para(p, wrap(s.items[i].b, w * 0.68 - 24, 14, m), w * 0.32 + 6, y + 7, 14, INK);
      y += rh;
    });
  },
  fields(s, w, _h, m) {
    const out: BField[] = [{ key: "title", x: 18, y: 16, w: w - 36, h: 24, size: 17, bold: true, color: INK, bg: "#FFFFFF", multiline: false }];
    let y = 50;
    gRows(s, w, m).forEach((rh, i) => {
      const bg = i % 2 === 0 ? mix(s.color, 0.93) : "#FFFFFF";
      out.push({ key: `items.${i}.a`, x: 18, y: y + 5, w: w * 0.32 - 20, h: rh - 10, size: 14, bold: true, color: mix(s.color, -0.45), bg, multiline: false });
      out.push({ key: `items.${i}.b`, x: w * 0.32 + 6, y: y + 5, w: w * 0.68 - 24, h: rh - 10, size: 14, color: INK, bg, multiline: true });
      y += rh;
    });
    return out;
  },
  form: [{ t: "text", key: "title", label: "Título" }, { t: "pairs", key: "items", label: "Termos", a: ["a", "Termo"], b: ["b", "Significado"], add: "+ Termo", bArea: true }],
  text: (s) => `${s.title}\n${s.items.map((i) => `${i.a}: ${i.b}`).join("\n")}`,
  toContent: (s) => ({ title: s.title, items: s.items.map((i) => ({ text: i.a, sub: i.b })) }),
  fromContent: (c, color) => ({ kind: "glossary", title: c.title ?? "Glossário", color, items: c.items?.length ? c.items.map((i) => ({ a: i.text, b: i.sub ?? "" })) : contentItems(c).map((t) => { const [a, ...b] = t.split(/:\s*/); return { a, b: b.join(": ") }; }) }),
});

// ---------------- pergunta e resposta ----------------
const qaH = (s: { q: string }, w: number, m: TextMeasure) => Math.max(1, wrap(s.q, w - 66, 16, m, "sans", true).length) * 16 * LH;
export const qa = defineBlock({
  kind: "qa", label: "Pergunta e resposta", hint: "P: pergunta · R: resposta", behavior: "livre",
  make: () => ({ kind: "qa", q: "Qual é a pergunta?", a: "A resposta vem aqui.", color: BLOCK_COLORS[0] }),
  size: () => ({ w: 340, h: 140 }),
  clean: (r, color) => ({ kind: "qa", q: str(r.q), a: str(r.a), color }),
  minH: (s, w, m) => 18 + qaH(s, w, m) + 18 + wrap(s.a, w - 66, 15, m).length * 15 * LH + 18,
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 12);
    const qh = qaH(s, w, m);
    p.circles.push({ x: 30, y: 30, r: 12, fill: s.color });
    p.texts.push({ x: 30, y: 22, text: "P", size: 13, color: "#FFFFFF", bold: true, align: "center" });
    para(p, wrap(s.q, w - 66, 16, m, "sans", true), 52, 20, 16, INK, { bold: true });
    const ay = 20 + qh + 16;
    p.lines.push({ pts: [{ x: 18, y: ay - 8 }, { x: w - 18, y: ay - 8 }], color: LINE, width: 1, dash: true });
    p.circles.push({ x: 30, y: ay + 10, r: 12, fill: mix(s.color, 0.8) });
    p.texts.push({ x: 30, y: ay + 2, text: "R", size: 13, color: mix(s.color, -0.5), bold: true, align: "center" });
    para(p, wrap(s.a, w - 66, 15, m), 52, ay, 15, SOFT, {}, linesFit(h - ay - 10, 15));
  },
  fields(s, w, h, m) {
    const qh = qaH(s, w, m), ay = 20 + qh + 16;
    return [
      { key: "q", x: 52, y: 20, w: w - 66, h: qh, size: 16, bold: true, color: INK, bg: "#FFFFFF", multiline: true },
      { key: "a", x: 52, y: ay, w: w - 66, h: h - ay - 10, size: 15, color: SOFT, bg: "#FFFFFF", multiline: true },
    ];
  },
  form: [{ t: "area", key: "q", label: "Pergunta", rows: 2 }, { t: "area", key: "a", label: "Resposta", rows: 4 }],
  text: (s) => `P: ${s.q}\nR: ${s.a}`,
  toContent: (s) => ({ title: s.q, text: s.a }),
  fromContent: (c, color) => ({ kind: "qa", q: c.title || contentItems(c)[0] || "", a: c.title ? contentBody(c) : contentItems(c).slice(1).join("\n"), color }),
});

// ---------------- fórmula ----------------
const SUP: Record<string, string> = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", x: "ˣ", y: "ʸ", a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", k: "ᵏ", m: "ᵐ", t: "ᵗ", T: "ᵀ" };
const SUB: Record<string, string> = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", n: "ₙ", i: "ᵢ", x: "ₓ", a: "ₐ", e: "ₑ", k: "ₖ", m: "ₘ", t: "ₜ", j: "ⱼ" };
const WORDS: [RegExp, string][] = [
  [/(?<![A-Za-z])sqrt\s*\(/g, "√("], [/(?<![A-Za-z])cbrt\s*\(/g, "∛("], [/(?<![A-Za-z])pi(?![A-Za-z])/g, "π"], [/(?<![A-Za-z])theta(?![A-Za-z])/g, "θ"], [/(?<![A-Za-z])alpha(?![A-Za-z])/g, "α"], [/(?<![A-Za-z])beta(?![A-Za-z])/g, "β"], [/(?<![A-Za-z])gamma(?![A-Za-z])/g, "γ"],
  [/(?<![A-Za-z])delta(?![A-Za-z])/g, "δ"], [/(?<![A-Za-z])Delta(?![A-Za-z])/g, "Δ"], [/(?<![A-Za-z])lambda(?![A-Za-z])/g, "λ"], [/(?<![A-Za-z])mu(?![A-Za-z])/g, "μ"], [/(?<![A-Za-z])sigma(?![A-Za-z])/g, "σ"], [/(?<![A-Za-z])omega(?![A-Za-z])/g, "ω"], [/(?<![A-Za-z])phi(?![A-Za-z])/g, "φ"], [/(?<![A-Za-z])epsilon(?![A-Za-z])/g, "ε"],
  [/(?<![A-Za-z])(infinity|inf)(?![A-Za-z])/g, "∞"], [/(?<![A-Za-z])int(?![A-Za-z])/g, "∫"], [/(?<![A-Za-z])sum(?![A-Za-z])/g, "Σ"], [/(?<![A-Za-z])prod(?![A-Za-z])/g, "Π"], [/(?<![A-Za-z])partial(?![A-Za-z])/g, "∂"], [/(?<![A-Za-z])nabla(?![A-Za-z])/g, "∇"], [/(?<![A-Za-z])forall(?![A-Za-z])/g, "∀"], [/(?<![A-Za-z])exists(?![A-Za-z])/g, "∃"],
  [/<->/g, "↔"], [/<=>/g, "⇔"], [/=>/g, "⇒"], [/->/g, "→"], [/>=/g, "≥"], [/<=/g, "≤"], [/!=/g, "≠"], [/~=/g, "≈"], [/\+-/g, "±"], [/\*/g, "·"], [/(?<![A-Za-z])deg(?![A-Za-z])/g, "°"],
];
/** Deixa uma expressão digitada com cara de fórmula: x^2 → x², a_1 → a₁, sqrt( → √(, pi → π, >= → ≥… */
export function prettyMath(expr: string): string {
  let s = expr;
  for (const [r, t] of WORDS) s = s.replace(r, t);
  const script = (map: Record<string, string>, mark: string) => {
    s = s.replace(new RegExp(`\\${mark}\\{([^}]*)\\}|\\${mark}\\(([^()]*)\\)|\\${mark}([\\w+\\-]+)`, "g"), (all, g0, gp, g2) => {
      const g1 = g0 ?? gp;
      const body: string = g1 ?? (/^[-+]?\d+/.test(g2) ? g2.match(/^[-+]?\d+/)![0] : g2[0]);
      const rest = g1 === undefined ? g2.slice(body.length) : "";
      return [...body].every((ch) => map[ch]) ? [...body].map((ch) => map[ch]).join("") + rest : all;
    });
  };
  script(SUP, "^");
  script(SUB, "_");
  return s;
}
export const math = defineBlock({
  kind: "math", label: "Fórmula", hint: "Equação com aparência de fórmula (x^2 → x², sqrt → √, pi → π)", behavior: "livre",
  make: () => ({ kind: "math", label: "Fórmula", expr: "x = (-b +- sqrt(b^2 - 4ac)) / 2a", color: BLOCK_COLORS[4] }),
  size: () => ({ w: 380, h: 110 }),
  clean: (r, color) => ({ kind: "math", label: str(r.label, "", 60), expr: str(r.expr, "", 2000), color }),
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 12, "#FFFFFF", 0.08);
    if (s.label) p.texts.push({ x: 16, y: 12, text: s.label, size: 12, color: mix(s.color, -0.3), bold: true });
    const lines = s.expr.split("\n").map(prettyMath);
    const top = s.label ? 30 : 12;
    let size = Math.min(30, (h - top - 12) / (lines.length * LH));
    while (size > 12 && lines.some((l) => m(l, size, "serif") > w - 32)) size -= 1;
    const used = lines.length * size * LH;
    para(p, lines, w / 2, top + (h - top - 8 - used) / 2, size, INK, { font: "serif", italic: true, align: "center" });
  },
  fields: (s, w, h) => [{ key: "expr", x: 16, y: s.label ? 30 : 12, w: w - 32, h: h - (s.label ? 42 : 24), size: 18, font: "mono", color: INK, bg: "#FFFFFF", align: "center", multiline: true, placeholder: "x^2 + y^2 = r^2" }],
  form: [{ t: "text", key: "label", label: "Rótulo (ex.: Equação 1)" }, { t: "area", key: "expr", label: "Expressão (x^2, a_1, sqrt( ), pi, >=, int, sum…)", rows: 3, font: "mono" }],
  text: (s) => prettyMath(s.expr),
  toContent: (s) => ({ title: s.label, text: s.expr }),
  fromContent: (c, color) => ({ kind: "math", label: c.title ?? "", expr: contentItems(c).join("\n"), color }),
});

export const TEXT = [heading, text, list, quote, definition, glossary, qa, math];
