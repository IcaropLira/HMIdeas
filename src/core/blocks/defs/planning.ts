// Blocos de planejamento: calendário, semana, rastreador de hábitos, metas/progresso, matriz 2×2, cronograma e prós/contras.
import { defineBlock } from "../def";
import { SpecOf } from "../types";
import {
  BField, BLOCK_COLORS, INK, LH, MUTED, arr, cardBg, contentItems, cycle, linesFit, mix, num, para, str, strs, wrap,
} from "../kit";

export const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const firstDow = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).getUTCDay(); // 0 = domingo

// ---------------- calendário ----------------
export const calendar = defineBlock({
  kind: "calendar", label: "Calendário", hint: "Mês inteiro; toque num dia para marcar", behavior: "estruturado",
  make: () => ({ kind: "calendar", title: "", year: 2026, month: 10, marks: [{ day: 5, text: "Prova" }, { day: 18, text: "Entrega" }], color: BLOCK_COLORS[1] }),
  size: () => ({ w: 420, h: 380 }),
  clean: (r, color) => ({
    kind: "calendar", title: str(r.title, "", 120), year: Math.round(num(r.year, 2026, 1900, 2200)), month: Math.round(num(r.month, 0, 0, 11)), color,
    marks: arr(r.marks, 62, (x) => ({ day: Math.round(num((x as { day?: unknown })?.day, 1, 1, 31)), text: str((x as { text?: unknown })?.text, "", 80) })),
  }),
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 14);
    p.rects.push({ x: 0, y: 0, w, h: 54, r: 14, fill: s.color }, { x: 0, y: 40, w, h: 14, r: 0, fill: s.color });
    p.texts.push({ x: 18, y: 14, text: s.title || `${MONTHS[s.month]} ${s.year}`, size: 20, color: "#FFFFFF", bold: true });
    if (s.title) p.texts.push({ x: w - 18, y: 19, text: `${MONTHS[s.month]} ${s.year}`, size: 13, color: "#FFFFFF", alpha: 0.85, align: "right" });
    const cw = (w - 16) / 7, top = 62;
    ["D", "S", "T", "Q", "Q", "S", "S"].forEach((d, i) => p.texts.push({ x: 8 + cw * (i + 0.5), y: top, text: d, size: 12, color: i === 0 ? s.color : MUTED, bold: true, align: "center" }));
    const n = daysIn(s.year, s.month), f = firstDow(s.year, s.month), rows = Math.ceil((n + f) / 7);
    const rh = (h - top - 26) / rows;
    for (let d = 1; d <= n; d++) {
      const k = d - 1 + f, cx = 8 + cw * (k % 7), cy = top + 22 + rh * Math.floor(k / 7);
      const mark = s.marks.find((x) => x.day === d);
      if (mark) p.rects.push({ x: cx + 2, y: cy + 2, w: cw - 4, h: rh - 4, r: 8, fill: mix(s.color, 0.85) });
      p.texts.push({ x: cx + cw / 2, y: cy + 5, text: String(d), size: 14, color: mark ? mix(s.color, -0.45) : k % 7 === 0 ? mix(s.color, -0.1) : INK, bold: !!mark, align: "center" });
      if (mark?.text && rh > 34) para(p, wrap(mark.text, cw - 6, 10, m).slice(0, 2), cx + cw / 2, cy + 22, 10, mix(s.color, -0.5), { align: "center" }, linesFit(rh - 26, 10));
      else if (mark) p.circles.push({ x: cx + cw / 2, y: cy + rh - 9, r: 3, fill: s.color });
      p.hits.push({ action: "day", index: d, x: cx, y: cy, w: cw, h: rh });
    }
  },
  tap(s, hit) {
    if (hit.action !== "day") return s;
    const has = s.marks.some((x) => x.day === hit.index);
    return { ...s, marks: has ? s.marks.filter((x) => x.day !== hit.index) : [...s.marks, { day: hit.index, text: "" }].sort((a, b) => a.day - b.day) };
  },
  form: [
    { t: "text", key: "title", label: "Título (opcional)" },
    { t: "select", key: "month", label: "Mês", options: MONTHS.map((n, i) => [i, n]) },
    { t: "number", key: "year", label: "Ano", min: 1900, max: 2200 },
    { t: "pairs", key: "marks", label: "Dias marcados", a: ["day", "Dia"], b: ["text", "Evento"], add: "+ Evento", aNum: true },
  ],
  text: (s) => `${s.title || MONTHS[s.month]} ${s.year}\n${s.marks.map((x) => `${x.day}: ${x.text}`).join("\n")}`,
  toContent: (s) => ({ title: s.title || `${MONTHS[s.month]} ${s.year}`, items: s.marks.map((x) => ({ text: x.text || "•", sub: String(x.day) })) }),
  fromContent: (c, color) => ({ kind: "calendar", title: c.title ?? "", year: 2026, month: 10, color, marks: (c.items ?? []).map((i, k) => ({ day: Math.max(1, Math.min(31, parseInt(i.sub ?? "") || k + 1)), text: i.text })) }),
});

// ---------------- semana ----------------
export const week = defineBlock({
  kind: "week", label: "Planejamento semanal", hint: "Sete dias lado a lado", behavior: "estruturado",
  make: () => ({ kind: "week", title: "Semana", days: ["Aula 8h\nAcademia", "", "Reunião 14h", "", "Entrega", "", ""], color: BLOCK_COLORS[5] }),
  size: () => ({ w: 840, h: 260 }),
  clean: (r, color) => {
    const days = strs(r.days, 7, 2000);
    return { kind: "week", title: str(r.title, "", 120), color, days: [...days, ...Array(7 - days.length).fill("")] };
  },
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 14);
    p.texts.push({ x: 16, y: 14, text: s.title || "Semana", size: 18, color: INK, bold: true });
    const top = 48, cw = (w - 16) / 7;
    s.days.forEach((d, i) => {
      const x = 8 + i * cw, c = i >= 5 ? cycle(s.color, 1) : s.color;
      p.rects.push({ x: x + 3, y: top, w: cw - 6, h: h - top - 8, r: 10, fill: mix(c, 0.93) });
      p.texts.push({ x: x + cw / 2, y: top + 8, text: WEEKDAYS[i], size: 13, color: mix(c, -0.4), bold: true, align: "center" });
      const lines = d.split("\n").filter(Boolean).flatMap((l) => wrap("• " + l.replace(/^\s*[-*•]\s*/, ""), cw - 20, 12, m));
      para(p, lines, x + 10, top + 32, 12, INK, {}, linesFit(h - top - 46, 12));
    });
  },
  fields(s, w, h) {
    const top = 48, cw = (w - 16) / 7;
    return [
      { key: "title", x: 16, y: 14, w: w - 32, h: 24, size: 18, bold: true, color: INK, bg: "#FFFFFF", multiline: false },
      ...s.days.map((_, i) => ({ key: `days.${i}`, x: 8 + i * cw + 8, y: top + 30, w: cw - 16, h: h - top - 46, size: 12, color: INK, bg: mix(i >= 5 ? cycle(s.color, 1) : s.color, 0.93), multiline: true, placeholder: "Um por linha" })),
    ];
  },
  form: [{ t: "text", key: "title", label: "Título" }, ...WEEKDAYS.map((d, i) => ({ t: "area" as const, key: `days.${i}`, label: d, rows: 2 }))],
  text: (s) => `${s.title}\n${s.days.map((d, i) => `${WEEKDAYS[i]}: ${d.replace(/\n/g, "; ")}`).join("\n")}`,
  toContent: (s) => ({ title: s.title, items: s.days.flatMap((d, i) => d.split("\n").filter(Boolean).map((t) => ({ text: t, sub: WEEKDAYS[i] }))) }),
  fromContent: (c, color) => {
    const days = Array(7).fill("");
    (c.items?.length ? c.items : contentItems(c).map((text) => ({ text, sub: "" }))).forEach((it, k) => {
      const d = Math.max(0, WEEKDAYS.indexOf(it.sub ?? ""));
      const idx = it.sub && WEEKDAYS.includes(it.sub) ? d : k % 7;
      days[idx] = days[idx] ? days[idx] + "\n" + it.text : it.text;
    });
    return { kind: "week", title: c.title ?? "Semana", days, color };
  },
});

// ---------------- hábitos ----------------
export const habit = defineBlock({
  kind: "habit", label: "Rastreador de hábitos", hint: "Grade de dias; toque para marcar", behavior: "estruturado",
  make: () => ({ kind: "habit", title: "Hábitos", habits: ["Ler 20 min", "Exercício", "Água 2 L", "Dormir 8 h"], days: 14, checks: [0, 1, 2, 3].map((i) => Array.from({ length: 14 }, (_, d) => d < 9 && (d * (i + 3)) % 4 !== 1)), color: BLOCK_COLORS[2] }),
  size: (s) => ({ w: 160 + s.days * 26 + 50, h: 70 + s.habits.length * 32 }),
  clean(r, color) {
    const habits = strs(r.habits, 30, 80), days = Math.round(num(r.days, 14, 3, 31));
    const checks = habits.map((_, i) => Array.from({ length: days }, (_, j) => Array.isArray(r.checks?.[i]) && r.checks[i][j] === true));
    return { kind: "habit", title: str(r.title, "", 120), habits, days, checks, color };
  },
  minH: (s) => 70 + s.habits.length * 26,
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 14);
    p.texts.push({ x: 16, y: 14, text: s.title, size: 18, color: INK, bold: true });
    const lw = Math.min(170, w * 0.32), top = 56, cw = (w - lw - 60) / s.days, rh = (h - top - 10) / Math.max(1, s.habits.length);
    for (let d = 0; d < s.days; d++) p.texts.push({ x: lw + cw * (d + 0.5), y: top - 16, text: String(d + 1), size: 10, color: MUTED, align: "center" });
    p.texts.push({ x: w - 30, y: top - 16, text: "%", size: 10, color: MUTED, align: "center", bold: true });
    s.habits.forEach((name, i) => {
      const y = top + i * rh, c = cycle(s.color, i);
      if (i % 2 === 0) p.rects.push({ x: 8, y, w: w - 16, h: rh, r: 6, fill: "#F4F6FA" });
      para(p, wrap(name, lw - 24, 13, m).slice(0, 1), 16, y + rh / 2 - 8, 13, INK);
      const rad = Math.max(4, Math.min(cw, rh) * 0.32);
      let done = 0;
      for (let d = 0; d < s.days; d++) {
        const on = !!s.checks[i]?.[d];
        if (on) done++;
        p.circles.push({ x: lw + cw * (d + 0.5), y: y + rh / 2, r: rad, fill: on ? c : "#FFFFFF", stroke: on ? c : "#C9D1DE", sw: 1.4 });
        p.hits.push({ action: "habit", index: i, index2: d, x: lw + cw * d, y, w: cw, h: rh });
      }
      p.texts.push({ x: w - 30, y: y + rh / 2 - 7, text: `${Math.round((100 * done) / s.days)}`, size: 12, color: c, bold: true, align: "center" });
    });
  },
  tap: (s, hit) => (hit.action === "habit" ? { ...s, checks: s.checks.map((row, i) => (i === hit.index ? row.map((v, j) => (j === hit.index2 ? !v : v)) : row)) } : s),
  fields(s, w, h) {
    const lw = Math.min(170, w * 0.32), top = 56, rh = (h - top - 10) / Math.max(1, s.habits.length);
    return [
      { key: "title", x: 16, y: 14, w: w - 32, h: 24, size: 18, bold: true, color: INK, bg: "#FFFFFF", multiline: false },
      ...s.habits.map((_, i) => ({ key: `habits.${i}`, x: 14, y: top + i * rh + rh / 2 - 11, w: lw - 22, h: 22, size: 13, color: INK, bg: i % 2 === 0 ? "#F4F6FA" : "#FFFFFF", multiline: false })),
    ];
  },
  form: [{ t: "text", key: "title", label: "Título" }, { t: "number", key: "days", label: "Dias", min: 3, max: 31 }, { t: "habits" }],
  text: (s) => `${s.title}\n${s.habits.map((x, i) => `${x}: ${s.checks[i].filter(Boolean).length}/${s.days}`).join("\n")}`,
  toContent: (s) => ({ title: s.title, items: s.habits.map((t) => ({ text: t })) }),
  fromContent: (c, color) => { const habits = contentItems(c); return { kind: "habit", title: c.title ?? "Hábitos", habits, days: 14, checks: habits.map(() => Array(14).fill(false)), color }; },
  resize: (prev, next, w, h) => ({ w: prev.days !== next.days ? w + (next.days - prev.days) * 26 : w, h: next.habits.length !== prev.habits.length ? h + (next.habits.length - prev.habits.length) * 32 : h }),
});

// ---------------- metas / progresso ----------------
export const progress = defineBlock({
  kind: "progress", label: "Metas e progresso", hint: "Barras de progresso com − e +", behavior: "estruturado",
  make: () => ({ kind: "progress", title: "Metas", items: [{ text: "Livros lidos", value: 7, max: 12 }, { text: "Capítulos escritos", value: 3, max: 10 }, { text: "Treinos no mês", value: 14, max: 16 }], color: BLOCK_COLORS[0] }),
  size: (s) => ({ w: 340, h: 60 + s.items.length * 56 }),
  clean: (r, color) => ({ kind: "progress", title: str(r.title, "", 120), color, items: arr(r.items, 30, (x) => { const g = x as { text?: unknown; value?: unknown; max?: unknown }; const max = num(g?.max, 10, 1, 1e9); return { text: str(g?.text, "", 120), max, value: num(g?.value, 0, 0, max) }; }) }),
  minH: (s) => 56 + s.items.length * 50,
  draw(s, w, h, _m, p) {
    cardBg(p, w, h, 14);
    p.texts.push({ x: 18, y: 16, text: s.title, size: 18, color: INK, bold: true });
    const rh = (h - 58) / Math.max(1, s.items.length);
    s.items.forEach((g, i) => {
      const y = 54 + i * rh, c = cycle(s.color, i), pct = g.max ? g.value / g.max : 0;
      p.texts.push({ x: 18, y, text: g.text, size: 14, color: INK, bold: true });
      p.texts.push({ x: w - 84, y, text: `${g.value}/${g.max}`, size: 13, color: c, bold: true, align: "right" });
      const bw = w - 36, by = y + 24;
      p.rects.push({ x: 18, y: by, w: bw, h: 10, r: 5, fill: mix(c, 0.85) });
      if (pct > 0) p.rects.push({ x: 18, y: by, w: Math.max(10, bw * Math.min(1, pct)), h: 10, r: 5, fill: pct >= 1 ? "#2E9B5F" : c });
      // botões − e +
      [["−", "dec", w - 66], ["+", "inc", w - 36]].forEach(([t, a, x]) => {
        p.circles.push({ x: +x + 6, y: y + 8, r: 11, fill: mix(c, 0.88) });
        p.texts.push({ x: +x + 6, y: y - 1, text: String(t), size: 15, color: mix(c, -0.4), bold: true, align: "center" });
        p.hits.push({ action: String(a), index: i, x: +x - 8, y: y - 6, w: 28, h: 28 });
      });
    });
  },
  tap(s, hit) {
    const d = hit.action === "inc" ? 1 : hit.action === "dec" ? -1 : 0;
    return d ? { ...s, items: s.items.map((g, i) => (i === hit.index ? { ...g, value: Math.max(0, Math.min(g.max, g.value + d)) } : g)) } : s;
  },
  fields: (s, w, h) => {
    const rh = (h - 58) / Math.max(1, s.items.length);
    return [
      { key: "title", x: 18, y: 16, w: w - 36, h: 24, size: 18, bold: true, color: INK, bg: "#FFFFFF", multiline: false },
      ...s.items.map((_, i) => ({ key: `items.${i}.text`, x: 18, y: 54 + i * rh - 2, w: w - 160, h: 22, size: 14, bold: true, color: INK, bg: "#FFFFFF", multiline: false })),
    ];
  },
  form: [{ t: "text", key: "title", label: "Título" }, { t: "goals", key: "items" }],
  text: (s) => `${s.title}\n${s.items.map((g) => `${g.text}: ${g.value}/${g.max}`).join("\n")}`,
  toContent: (s) => ({ title: s.title, items: s.items.map((g) => ({ text: g.text, done: g.value >= g.max, sub: `${g.value}/${g.max}` })) }),
  fromContent: (c, color) => ({ kind: "progress", title: c.title ?? "Metas", color, items: (c.items?.length ? c.items : contentItems(c).map((text) => ({ text, done: false }))).map((i) => ({ text: i.text, value: i.done ? 10 : 0, max: 10 })) }),
});

// ---------------- matriz 2×2 ----------------
const matrix2Make = (): SpecOf<"matrix2"> => ({ kind: "matrix2", title: "Prioridades", xLabel: "Urgente → Não urgente", yLabel: "Importante → Não importante", labels: ["Fazer agora", "Agendar", "Delegar", "Eliminar"], cells: ["", "", "", ""], color: BLOCK_COLORS[1] });
export const matrix2 = defineBlock({
  kind: "matrix2", label: "Matriz 2×2", hint: "Eisenhower, SWOT, esforço × impacto…", behavior: "estruturado",
  make: matrix2Make,
  size: () => ({ w: 560, h: 460 }),
  clean: (r, color) => {
    const pad4 = (a: string[]) => [...a, "", "", "", ""].slice(0, 4);
    return { kind: "matrix2", title: str(r.title, "", 120), xLabel: str(r.xLabel, "", 120), yLabel: str(r.yLabel, "", 120), labels: pad4(strs(r.labels, 4, 60)), cells: pad4(strs(r.cells, 4, 4000)), color };
  },
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 14);
    p.texts.push({ x: 18, y: 14, text: s.title, size: 18, color: INK, bold: true });
    const left = s.yLabel ? 30 : 12, top = s.xLabel ? 70 : 50, gw = (w - left - 12) / 2, gh = (h - top - 12) / 2;
    if (s.xLabel) p.texts.push({ x: left + gw, y: 46, text: s.xLabel, size: 12, color: MUTED, bold: true, align: "center" });
    if (s.yLabel) p.texts.push({ x: 12, y: top + gh, text: s.yLabel, size: 12, color: MUTED, bold: true, align: "center", angle: -Math.PI / 2 });
    s.labels.forEach((lab, i) => {
      const x = left + (i % 2) * gw, y = top + Math.floor(i / 2) * gh, c = [s.color, cycle(s.color, 6), cycle(s.color, 2), cycle(s.color, 7)][i];
      p.rects.push({ x: x + 4, y: y + 4, w: gw - 8, h: gh - 8, r: 10, fill: mix(c, 0.9) });
      p.texts.push({ x: x + 16, y: y + 14, text: lab, size: 15, color: mix(c, -0.45), bold: true });
      const lines = s.cells[i].split("\n").filter(Boolean).flatMap((l) => wrap("• " + l.replace(/^\s*[-*•]\s*/, ""), gw - 36, 13, m));
      para(p, lines, x + 16, y + 40, 13, INK, {}, linesFit(gh - 52, 13));
    });
  },
  fields(s, w, h) {
    const left = s.yLabel ? 30 : 12, top = s.xLabel ? 70 : 50, gw = (w - left - 12) / 2, gh = (h - top - 12) / 2;
    return [
      { key: "title", x: 18, y: 14, w: w - 36, h: 24, size: 18, bold: true, color: INK, bg: "#FFFFFF", multiline: false },
      ...[0, 1, 2, 3].flatMap((i) => {
        const x = left + (i % 2) * gw, y = top + Math.floor(i / 2) * gh, bg = mix([s.color, cycle(s.color, 6), cycle(s.color, 2), cycle(s.color, 7)][i], 0.9);
        return [
          { key: `labels.${i}`, x: x + 14, y: y + 12, w: gw - 28, h: 22, size: 15, bold: true, color: INK, bg, multiline: false },
          { key: `cells.${i}`, x: x + 14, y: y + 38, w: gw - 28, h: gh - 50, size: 13, color: INK, bg, multiline: true, placeholder: "Um item por linha" },
        ] as BField[];
      }),
    ];
  },
  form: [{ t: "text", key: "title", label: "Título" }, { t: "text", key: "xLabel", label: "Eixo horizontal" }, { t: "text", key: "yLabel", label: "Eixo vertical" }, { t: "cells" }],
  text: (s) => `${s.title}\n${s.labels.map((l, i) => `${l}: ${s.cells[i].replace(/\n/g, "; ")}`).join("\n")}`,
  toContent: (s) => ({ title: s.title, items: s.labels.flatMap((l, i) => s.cells[i].split("\n").filter(Boolean).map((t) => ({ text: t, sub: l }))) }),
  fromContent: (c, color) => {
    const base = matrix2Make();
    const cells = ["", "", "", ""];
    (c.items?.length ? c.items : contentItems(c).map((text) => ({ text, sub: "" }))).forEach((it, k) => { const q = base.labels.indexOf(it.sub ?? ""); const i = q >= 0 ? q : k % 4; cells[i] = cells[i] ? cells[i] + "\n" + it.text : it.text; });
    return { ...base, title: c.title ?? base.title, cells, color };
  },
});

// ---------------- cronograma (gantt) ----------------
export const gantt = defineBlock({
  kind: "gantt", label: "Cronograma", hint: "Tarefas com início e fim por período (roadmap)", behavior: "estruturado",
  make: () => ({ kind: "gantt", title: "Cronograma", periods: ["Sem 1", "Sem 2", "Sem 3", "Sem 4", "Sem 5", "Sem 6"], tasks: [{ text: "Pesquisa", start: 0, end: 1 }, { text: "Protótipo", start: 1, end: 3 }, { text: "Testes", start: 3, end: 4 }, { text: "Entrega", start: 5, end: 5 }], color: BLOCK_COLORS[4] }),
  size: (s) => ({ w: 180 + s.periods.length * 80, h: 80 + s.tasks.length * 36 }),
  clean(r, color) {
    const periods = strs(r.periods, 36, 30);
    const n = Math.max(1, periods.length);
    return { kind: "gantt", title: str(r.title, "", 120), periods: periods.length ? periods : ["1"], color, tasks: arr(r.tasks, 60, (x) => { const t = x as { text?: unknown; start?: unknown; end?: unknown }; const start = Math.round(num(t?.start, 0, 0, n - 1)); return { text: str(t?.text, "", 120), start, end: Math.round(num(t?.end, start, start, n - 1)) }; }) };
  },
  minH: (s) => 70 + s.tasks.length * 30,
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 14);
    p.texts.push({ x: 16, y: 14, text: s.title, size: 18, color: INK, bold: true });
    const lw = Math.min(170, w * 0.3), top = 72, cw = (w - lw - 12) / s.periods.length, rh = (h - top - 10) / Math.max(1, s.tasks.length);
    s.periods.forEach((per, i) => {
      if (i % 2 === 0) p.rects.push({ x: lw + i * cw, y: top - 26, w: cw, h: h - top + 18, r: 0, fill: "#F4F6FA" });
      p.texts.push({ x: lw + cw * (i + 0.5), y: top - 22, text: per, size: 11, color: MUTED, bold: true, align: "center" });
    });
    s.tasks.forEach((t, i) => {
      const y = top + i * rh, c = cycle(s.color, i);
      para(p, wrap(t.text, lw - 24, 13, m).slice(0, 1), 16, y + rh / 2 - 8, 13, INK);
      const bx = lw + t.start * cw + 4, bw = (t.end - t.start + 1) * cw - 8, bh = Math.min(22, rh - 8);
      p.rects.push({ x: bx, y: y + (rh - bh) / 2, w: Math.max(8, bw), h: bh, r: bh / 2, fill: c });
    });
  },
  fields(s, w, h) {
    const lw = Math.min(170, w * 0.3), top = 72, rh = (h - top - 10) / Math.max(1, s.tasks.length);
    return [
      { key: "title", x: 16, y: 14, w: w - 32, h: 24, size: 18, bold: true, color: INK, bg: "#FFFFFF", multiline: false },
      ...s.tasks.map((_, i) => ({ key: `tasks.${i}.text`, x: 14, y: top + i * rh + rh / 2 - 11, w: lw - 22, h: 22, size: 13, color: INK, bg: "#FFFFFF", multiline: false })),
    ];
  },
  form: [{ t: "text", key: "title", label: "Título" }, { t: "lines", key: "periods", label: "Períodos", add: "+ Período" }, { t: "gantt", key: "tasks" }],
  text: (s) => `${s.title}\n${s.tasks.map((t) => `${t.text}: ${s.periods[t.start]} → ${s.periods[t.end]}`).join("\n")}`,
  toContent: (s) => ({ title: s.title, items: s.tasks.map((t) => ({ text: t.text, sub: s.periods[t.start] })) }),
  fromContent: (c, color) => { const items = contentItems(c); const n = Math.max(4, items.length); return { kind: "gantt", title: c.title ?? "Cronograma", periods: Array.from({ length: n }, (_, i) => `Sem ${i + 1}`), tasks: items.map((text, i) => ({ text, start: i, end: i })), color }; },
  resize: (prev, next, w, h) => ({ w: w + (next.periods.length - prev.periods.length) * 80, h: h + (next.tasks.length - prev.tasks.length) * 36 }),
});

// ---------------- prós e contras ----------------
const pcRows = (items: string[], cw: number, m: Parameters<typeof wrap>[3]) => items.map((t) => Math.max(1, wrap(t || " ", cw - 40, 14, m).length) * 14 * LH + 8);
export const proscons = defineBlock({
  kind: "proscons", label: "Prós e contras", hint: "Duas colunas com saldo", behavior: "estruturado",
  make: () => ({ kind: "proscons", title: "Vale a pena?", pros: ["Mais tempo livre", "Aprende algo novo"], cons: ["Custa caro"], color: BLOCK_COLORS[2] }),
  size: () => ({ w: 520, h: 260 }),
  clean: (r, color) => ({ kind: "proscons", title: str(r.title, "", 200), pros: strs(r.pros, 40), cons: strs(r.cons, 40), color }),
  minH: (s, w, m) => 108 + Math.max(pcRows(s.pros, w / 2, m).reduce((a, b) => a + b, 0), pcRows(s.cons, w / 2, m).reduce((a, b) => a + b, 0)),
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 14);
    p.texts.push({ x: 18, y: 14, text: s.title, size: 18, color: INK, bold: true });
    const total = s.pros.length + s.cons.length || 1, bw = w - 36;
    p.rects.push({ x: 18, y: 46, w: bw, h: 8, r: 4, fill: "#D2453A" }, { x: 18, y: 46, w: Math.max(8, (bw * s.pros.length) / total), h: 8, r: 4, fill: "#2E9B5F" });
    const cw = w / 2;
    ([["👍 Prós", s.pros, "#2E9B5F"], ["👎 Contras", s.cons, "#D2453A"]] as const).forEach(([lab, items, c], k) => {
      const x = k * cw;
      p.rects.push({ x: x + 10, y: 66, w: cw - 20, h: h - 76, r: 10, fill: mix(c, 0.92) });
      p.texts.push({ x: x + 22, y: 76, text: `${lab} (${items.length})`, size: 15, color: mix(c, -0.35), bold: true });
      let y = 104;
      pcRows([...items], cw, m).forEach((rh, i) => {
        if (y + rh > h - 12) return;
        p.circles.push({ x: x + 26, y: y + 9, r: 3, fill: c });
        para(p, wrap(items[i] || " ", cw - 40, 14, m), x + 36, y, 14, INK);
        y += rh;
      });
    });
  },
  fields(s, w, _h, m) {
    const cw = w / 2, out: BField[] = [{ key: "title", x: 18, y: 14, w: w - 36, h: 24, size: 18, bold: true, color: INK, bg: "#FFFFFF", multiline: false }];
    (["pros", "cons"] as const).forEach((k, j) => {
      let y = 104;
      pcRows(s[k], cw, m).forEach((rh, i) => { out.push({ key: `${k}.${i}`, x: j * cw + 34, y: y - 2, w: cw - 48, h: rh - 4, size: 14, color: INK, bg: mix(j ? "#D2453A" : "#2E9B5F", 0.92), multiline: false }); y += rh; });
    });
    return out;
  },
  split(s, key, before, after) {
    const mm = key.match(/^(pros|cons)\.(\d+)$/);
    if (!mm) return null;
    const k = mm[1] as "pros" | "cons", i = +mm[2], items = [...s[k]];
    items[i] = before; items.splice(i + 1, 0, after);
    return { spec: { ...s, [k]: items }, focus: `${k}.${i + 1}` };
  },
  form: [{ t: "text", key: "title", label: "Decisão" }, { t: "lines", key: "pros", label: "👍 Prós", add: "+ Pró" }, { t: "lines", key: "cons", label: "👎 Contras", add: "+ Contra" }],
  text: (s) => `${s.title}\nPrós: ${s.pros.join("; ")}\nContras: ${s.cons.join("; ")}`,
  toContent: (s) => ({ title: s.title, items: [...s.pros.map((t) => ({ text: t, sub: "Prós" })), ...s.cons.map((t) => ({ text: t, sub: "Contras" }))] }),
  fromContent: (c, color) => {
    const items = c.items?.length ? c.items : contentItems(c).map((text) => ({ text, sub: "" }));
    const cons = items.filter((i) => /contra|negativ|ruim/i.test(i.sub ?? "")).map((i) => i.text);
    return { kind: "proscons", title: c.title ?? "Decisão", pros: items.filter((i) => !/contra|negativ|ruim/i.test(i.sub ?? "")).map((i) => i.text), cons, color };
  },
});

export const PLANNING = [calendar, week, habit, progress, matrix2, gantt, proscons];
