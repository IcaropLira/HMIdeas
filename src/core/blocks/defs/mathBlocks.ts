// Blocos matemáticos: matriz/vetor, sistema de equações, gráfico de dados (barras, linhas, setores) e teorema/lema/prova.
import { defineBlock } from "../def";
import { BField, BLOCK_COLORS, INK, LH, MUTED, SOFT, arr, cardBg, contentBody, contentItems, cycle, linesFit, mix, oneOf, para, str, strs, wrap } from "../kit";
import { prettyMath } from "./text";

// ---------------- matriz ----------------
function bracket(p: { lines: { pts: { x: number; y: number }[]; color: string; width: number }[] }, x: number, y: number, h: number, right: boolean, kind: string, color: string) {
  const d = right ? -1 : 1, t = 8;
  if (kind === "bar") p.lines.push({ pts: [{ x, y }, { x, y: y + h }], color, width: 2 });
  else if (kind === "round") p.lines.push({ pts: Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * Math.PI; return { x: x + d * t * (1 - Math.sin(a)), y: y + h / 2 - (h / 2) * Math.cos(a) }; }), color, width: 2 });
  else p.lines.push({ pts: [{ x: x + d * t, y }, { x, y }, { x, y: y + h }, { x: x + d * t, y: y + h }], color, width: 2 });
}
export const matrix = defineBlock({
  kind: "matrix", label: "Matriz", hint: "Matriz ou vetor com colchetes", behavior: "estruturado",
  make: () => ({ kind: "matrix", name: "A =", rows: [["1", "0", "2"], ["0", "1", "-1"], ["3", "2", "1"]], brackets: "square", color: BLOCK_COLORS[4] }),
  size: (s) => ({ w: 90 + (s.rows[0]?.length ?? 1) * 56, h: 40 + s.rows.length * 40 }),
  clean(r, color) {
    const rows = arr(r.rows, 12, (x) => (Array.isArray(x) ? strs(x, 12, 40) : [""]));
    const n = Math.max(1, ...rows.map((x) => x.length));
    return { kind: "matrix", name: str(r.name, "", 30), brackets: oneOf(r.brackets, ["square", "round", "bar"] as const, "square"), color, rows: (rows.length ? rows : [["0"]]).map((x) => [...x, ...Array(n - x.length).fill("")]) };
  },
  draw(s, w, h, m, p) {
    const rows = s.rows.length, cols = s.rows[0]?.length ?? 1;
    const nameW = s.name ? m(prettyMath(s.name), 22, "serif") + 14 : 0;
    const gx = 14 + nameW + 12, gw = w - gx - 26, gy = 14, gh = h - 28;
    if (s.name) p.texts.push({ x: 10, y: h / 2 - 15, text: prettyMath(s.name), size: 22, color: INK, font: "serif", italic: true });
    bracket(p, gx - 6, gy, gh, false, s.brackets, s.color);
    bracket(p, gx + gw + 6, gy, gh, true, s.brackets, s.color);
    const cw = gw / cols, rh = gh / rows, size = Math.min(20, rh * 0.55);
    s.rows.forEach((row, i) => row.forEach((c, j) => p.texts.push({ x: gx + cw * (j + 0.5), y: gy + rh * (i + 0.5) - size * 0.62, text: prettyMath(c), size, color: INK, font: "serif", align: "center" })));
  },
  fields(s, w, h, m) {
    const rows = s.rows.length, cols = s.rows[0]?.length ?? 1, nameW = s.name ? m(prettyMath(s.name), 22, "serif") + 14 : 0;
    const gx = 14 + nameW + 12, gw = w - gx - 26, cw = gw / cols, rh = (h - 28) / rows, size = Math.min(20, rh * 0.55);
    return s.rows.flatMap((row, i) => row.map((_, j) => ({ key: `rows.${i}.${j}`, x: gx + cw * j + 2, y: 14 + rh * i + 2, w: cw - 4, h: rh - 4, size, font: "mono" as const, color: INK, bg: "#FFFFFF", align: "center" as const, multiline: false })));
  },
  form: [{ t: "text", key: "name", label: "Nome (ex.: A =, v⃗ =)" }, { t: "select", key: "brackets", label: "Delimitador", options: [["square", "[ ] colchetes"], ["round", "( ) parênteses"], ["bar", "| | determinante"]] }, { t: "table", key: "rows" }],
  text: (s) => `${s.name}\n${s.rows.map((r) => r.join("  ")).join("\n")}`,
  toContent: (s) => ({ title: s.name, items: s.rows.map((r) => ({ text: r.join(" ") })) }),
  fromContent: (c, color) => ({ kind: "matrix", name: c.title ?? "", brackets: "square", color, rows: (contentItems(c).length ? contentItems(c) : ["0"]).map((l) => l.split(/[\s,;]+/).filter(Boolean)).map((r, _, all) => { const n = Math.max(...all.map((x) => x.length)); return [...r, ...Array(n - r.length).fill("")]; }) }),
  resize(prev, next, w, h) {
    const c0 = prev.rows[0]?.length || 1, c1 = next.rows[0]?.length || 1;
    return { w: w + (c1 - c0) * 56, h: h + (next.rows.length - prev.rows.length) * 40 };
  },
});

// ---------------- sistema de equações ----------------
export const system = defineBlock({
  kind: "system", label: "Sistema de equações", hint: "Equações com chave à esquerda", behavior: "livre",
  make: () => ({ kind: "system", eqs: ["2x + y = 7", "x - y = 2"], color: BLOCK_COLORS[4] }),
  size: (s) => ({ w: 260, h: 30 + s.eqs.length * 34 }),
  clean: (r, color) => ({ kind: "system", eqs: strs(r.eqs, 12, 200), color }),
  draw(s, _w, h, _m, p) {
    const n = Math.max(1, s.eqs.length), top = 10, eh = (h - 20) / n, size = Math.min(22, eh * 0.62);
    const x = 18, mid = h / 2, t = 9;
    p.lines.push({ pts: [{ x: x + t, y: top }, { x, y: top + 8 }, { x, y: mid - 8 }, { x: x - t, y: mid }, { x, y: mid + 8 }, { x, y: h - top - 8 }, { x: x + t, y: h - top }], color: s.color, width: 2.4 });
    s.eqs.forEach((e, i) => p.texts.push({ x: x + 18, y: top + eh * (i + 0.5) - size * 0.62, text: prettyMath(e), size, color: INK, font: "serif", italic: true }));
  },
  fields(s, w, h) {
    const n = Math.max(1, s.eqs.length), eh = (h - 20) / n, size = Math.min(22, eh * 0.62);
    return s.eqs.map((_, i) => ({ key: `eqs.${i}`, x: 36, y: 10 + eh * i + 2, w: w - 44, h: eh - 4, size, font: "mono" as const, color: INK, bg: "#FFFFFF", multiline: false }));
  },
  split(s, key, before, after) {
    const mm = key.match(/^eqs\.(\d+)$/);
    if (!mm) return null;
    const i = +mm[1], eqs = [...s.eqs];
    eqs[i] = before; eqs.splice(i + 1, 0, after);
    return { spec: { ...s, eqs }, focus: `eqs.${i + 1}` };
  },
  form: [{ t: "lines", key: "eqs", label: "Equações (x^2, sqrt( ), pi…)", add: "+ Equação" }],
  text: (s) => s.eqs.map(prettyMath).join("\n"),
  toContent: (s) => ({ items: s.eqs.map((t) => ({ text: t })) }),
  fromContent: (c, color) => ({ kind: "system", eqs: contentItems(c), color }),
  resize: (prev, next, w, h) => ({ w, h: h + (next.eqs.length - prev.eqs.length) * 34 }),
});

// ---------------- gráfico de dados ----------------
const val = (b: string) => { const v = parseFloat(b.replace(",", ".")); return Number.isFinite(v) ? v : 0; };
export const chart = defineBlock({
  kind: "chart", label: "Gráfico", hint: "Barras, linhas ou setores a partir de uma tabela", behavior: "estruturado",
  make: () => ({ kind: "chart", title: "Vendas", chart: "bar", items: [{ a: "Jan", b: "12" }, { a: "Fev", b: "19" }, { a: "Mar", b: "8" }, { a: "Abr", b: "15" }, { a: "Mai", b: "22" }], color: BLOCK_COLORS[0] }),
  size: () => ({ w: 420, h: 280 }),
  clean: (r, color) => ({ kind: "chart", title: str(r.title, "", 120), chart: oneOf(r.chart, ["bar", "line", "pie"] as const, "bar"), color, items: arr(r.items, 40, (x) => ({ a: str((x as { a?: unknown })?.a, "", 40), b: str((x as { b?: unknown })?.b, "0", 20) })) }),
  draw(s, w, h, _m, p) {
    cardBg(p, w, h, 14);
    p.texts.push({ x: 18, y: 14, text: s.title, size: 16, color: INK, bold: true });
    const vals = s.items.map((i) => val(i.b)), n = Math.max(1, vals.length);
    if (s.chart === "pie") {
      const total = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1, R = Math.min(w * 0.3, (h - 60) / 2), cx = 24 + R, cy = 44 + (h - 52) / 2;
      let a0 = -Math.PI / 2;
      vals.forEach((v, i) => {
        const a1 = a0 + (Math.max(0, v) / total) * Math.PI * 2, steps = Math.max(2, Math.ceil((a1 - a0) / 0.08));
        const pts = [{ x: cx, y: cy }, ...Array.from({ length: steps + 1 }, (_, k) => { const a = a0 + ((a1 - a0) * k) / steps; return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R }; }), { x: cx, y: cy }];
        p.lines.push({ pts, color: "#FFFFFF", width: 1.5, fill: cycle(s.color, i), fillAlpha: 1 });
        a0 = a1;
      });
      const lx = cx + R + 24;
      s.items.forEach((it, i) => {
        const y = 52 + i * 22;
        if (y > h - 20) return;
        p.rects.push({ x: lx, y: y + 2, w: 12, h: 12, r: 3, fill: cycle(s.color, i) });
        p.texts.push({ x: lx + 18, y, text: `${it.a} · ${Math.round((100 * Math.max(0, vals[i])) / total)}%`, size: 12, color: INK });
      });
      return;
    }
    const L = 44, T = 50, R2 = w - 16, B = h - 30, max = Math.max(1e-9, ...vals.map((v) => Math.abs(v))), niceMax = max;
    for (let k = 0; k <= 4; k++) {
      const y = B - ((B - T) * k) / 4;
      p.lines.push({ pts: [{ x: L, y }, { x: R2, y }], color: "#EEF1F6", width: 1 });
      p.texts.push({ x: L - 6, y: y - 7, text: String(Math.round(((niceMax * k) / 4) * 10) / 10), size: 10, color: MUTED, align: "right" });
    }
    const step = (R2 - L) / n;
    s.items.forEach((it, i) => p.texts.push({ x: L + step * (i + 0.5), y: B + 6, text: it.a, size: 11, color: SOFT, align: "center" }));
    const yOf = (v: number) => B - ((B - T) * Math.max(0, v)) / niceMax;
    if (s.chart === "bar") vals.forEach((v, i) => p.rects.push({ x: L + step * i + step * 0.18, y: yOf(v), w: step * 0.64, h: B - yOf(v), r: 4, fill: s.color }));
    else {
      const pts = vals.map((v, i) => ({ x: L + step * (i + 0.5), y: yOf(v) }));
      p.lines.push({ pts: [{ x: pts[0].x, y: B }, ...pts, { x: pts[pts.length - 1].x, y: B }], color: s.color, width: 0, fill: s.color, fillAlpha: 0.12 });
      p.lines.push({ pts, color: s.color, width: 2.6 });
      pts.forEach((q) => p.circles.push({ x: q.x, y: q.y, r: 4, fill: "#FFFFFF", stroke: s.color, sw: 2 }));
    }
  },
  fields: (_s, w) => [{ key: "title", x: 18, y: 14, w: w - 36, h: 22, size: 16, bold: true, color: INK, bg: "#FFFFFF", multiline: false }],
  form: [{ t: "text", key: "title", label: "Título" }, { t: "select", key: "chart", label: "Tipo", options: [["bar", "Barras"], ["line", "Linhas"], ["pie", "Setores (pizza)"]] }, { t: "pairs", key: "items", label: "Dados", a: ["a", "Rótulo"], b: ["b", "Valor"], add: "+ Dado" }],
  text: (s) => `${s.title}\n${s.items.map((i) => `${i.a}: ${i.b}`).join("\n")}`,
  toContent: (s) => ({ title: s.title, items: s.items.map((i) => ({ text: i.a, sub: i.b })) }),
  fromContent: (c, color) => ({ kind: "chart", title: c.title ?? "Gráfico", chart: "bar", color, items: (c.items?.length ? c.items : contentItems(c).map((t) => { const [a, b] = t.split(/[:=]\s*/); return { text: a, sub: b }; })).map((i) => ({ a: i.text, b: i.sub && /\d/.test(i.sub) ? i.sub : "1" })) }),
});

// ---------------- teorema ----------------
export const theorem = defineBlock({
  kind: "theorem", label: "Teorema", hint: "Teorema, lema, proposição ou prova (∎)", behavior: "livre",
  make: () => ({ kind: "theorem", label: "Teorema", name: "Pitágoras", text: "Num triângulo retângulo, a^2 + b^2 = c^2, onde c é a hipotenusa.", color: BLOCK_COLORS[4] }),
  size: () => ({ w: 380, h: 130 }),
  clean: (r, color) => ({ kind: "theorem", label: str(r.label, "Teorema", 40), name: str(r.name, "", 120), text: str(r.text, "", 8000), color }),
  minH: (s, w, m) => 50 + wrap(prettyMath(s.text), w - 40, 15, m, "serif").length * 15 * LH + 16,
  draw(s, w, h, m, p) {
    const proof = /prova|demonstra/i.test(s.label);
    p.rects.push({ x: 0, y: 0, w, h, r: 6, fill: proof ? "#FFFFFF" : mix(s.color, 0.94), stroke: proof ? "#DDE3EE" : "", sw: 1 }, { x: 0, y: 0, w: 4, h, r: 2, fill: s.color });
    p.texts.push({ x: 20, y: 16, text: s.label + (s.name ? ` (${s.name})` : "") + ".", size: 15, color: mix(s.color, -0.4), bold: true, font: "serif" });
    para(p, wrap(prettyMath(s.text), w - 40, 15, m, "serif"), 20, 42, 15, INK, { font: "serif", italic: !proof }, linesFit(h - 54, 15));
    if (proof) p.texts.push({ x: w - 16, y: h - 26, text: "∎", size: 16, color: INK, align: "right" });
  },
  fields: (s, w, h) => [{ key: "text", x: 20, y: 42, w: w - 40, h: h - 54, size: 15, font: "serif", italic: !/prova/i.test(s.label), color: INK, bg: mix(s.color, 0.94), multiline: true }] as BField[],
  form: [{ t: "select", key: "label", label: "Tipo", options: [["Teorema", "Teorema"], ["Lema", "Lema"], ["Proposição", "Proposição"], ["Corolário", "Corolário"], ["Definição", "Definição"], ["Prova", "Prova"]] }, { t: "text", key: "name", label: "Nome (opcional)" }, { t: "area", key: "text", label: "Enunciado", rows: 5, font: "serif" }],
  text: (s) => `${s.label}${s.name ? ` (${s.name})` : ""}. ${prettyMath(s.text)}`,
  toContent: (s) => ({ title: s.name || s.label, text: s.text }),
  fromContent: (c, color) => ({ kind: "theorem", label: "Teorema", name: c.title ?? "", text: contentBody(c), color }),
});

export const MATH = [matrix, system, chart, theorem];
