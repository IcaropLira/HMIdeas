// Blocos nativos (como os do Miro/Milanote/Notion): cada tipo tem DADOS próprios e um comportamento próprio —
// o post-it é um post-it (cor, texto que se ajusta), a lista de tarefas tem caixinhas que marcam com um toque, a linha do
// tempo distribui os marcos sozinha, o kanban tem colunas e cartões, a tabela tem células… Modelos prontos são
// conjuntos desses blocos. Puro: gera PRIMITIVAS em coordenadas locais (0..w, 0..h); Pixi e SVG desenham as mesmas.
export type BlockKind = "sticky" | "card" | "todo" | "table" | "timeline" | "kanban" | "slide" | "doc" | "callout" | "code";

export interface TodoItem { text: string; done: boolean }
export interface TimelineItem { date: string; text: string }
export interface KanbanColumn { title: string; cards: string[] }

export type BlockSpec =
  | { kind: "sticky"; text: string; color: string }
  | { kind: "card"; title: string; body: string; color: string }
  | { kind: "todo"; title: string; items: TodoItem[]; color: string }
  | { kind: "table"; rows: string[][]; header: boolean; color: string }
  | { kind: "timeline"; title: string; items: TimelineItem[]; color: string }
  | { kind: "kanban"; title: string; columns: KanbanColumn[]; color: string }
  | { kind: "slide"; title: string; body: string; color: string; number: number }
  | { kind: "doc"; title: string; body: string; color: string }
  | { kind: "callout"; icon: string; text: string; color: string }
  | { kind: "code"; lang: string; code: string; color: string };

export const BLOCK_KINDS: { id: BlockKind; label: string; hint: string }[] = [
  { id: "sticky", label: "Post-it", hint: "Nota adesiva colorida; o texto se ajusta ao tamanho" },
  { id: "card", label: "Cartão", hint: "Título e texto, com faixa de cor" },
  { id: "todo", label: "Tarefas", hint: "Lista com caixinhas: um toque marca/desmarca" },
  { id: "table", label: "Tabela", hint: "Linhas e colunas editáveis, com cabeçalho" },
  { id: "timeline", label: "Linha do tempo", hint: "Marcos com data distribuídos numa linha" },
  { id: "kanban", label: "Kanban", hint: "Colunas com cartões" },
  { id: "slide", label: "Slide", hint: "Quadro 16:9 com título e tópicos" },
  { id: "doc", label: "Documento", hint: "Página com título, subtítulos (#) e listas (-)" },
  { id: "callout", label: "Destaque", hint: "Aviso com ícone e cor" },
  { id: "code", label: "Código", hint: "Trecho de código com fonte monoespaçada" },
];

export const STICKY_COLORS = ["#FFF1A8", "#FFD6A5", "#FFC8DD", "#CDB4FF", "#BDE0FE", "#B9F3D0", "#E9ECEF"];
export const BLOCK_COLORS = ["#4D6FC4", "#D2453A", "#2E9B5F", "#C98612", "#7B4FC9", "#0E8A9B", "#D1307A", "#3D4557"];

export function defaultBlock(kind: BlockKind): BlockSpec {
  switch (kind) {
    case "sticky": return { kind, text: "Escreva aqui…", color: STICKY_COLORS[0] };
    case "card": return { kind, title: "Título do cartão", body: "Uma ideia, uma referência ou um resumo.", color: BLOCK_COLORS[0] };
    case "todo": return { kind, title: "Tarefas", items: [{ text: "Primeira tarefa", done: true }, { text: "Segunda tarefa", done: false }, { text: "Terceira tarefa", done: false }], color: BLOCK_COLORS[2] };
    case "table": return { kind, rows: [["Item", "Valor", "Obs."], ["", "", ""], ["", "", ""]], header: true, color: BLOCK_COLORS[0] };
    case "timeline": return { kind, title: "Linha do tempo", items: [{ date: "Jan", text: "Início" }, { date: "Mar", text: "Protótipo" }, { date: "Jun", text: "Testes" }, { date: "Set", text: "Lançamento" }], color: BLOCK_COLORS[4] };
    case "kanban": return { kind, title: "Kanban", columns: [{ title: "A fazer", cards: ["Pesquisar", "Rascunho"] }, { title: "Fazendo", cards: ["Escrever"] }, { title: "Feito", cards: ["Definir tema"] }], color: BLOCK_COLORS[0] };
    case "slide": return { kind, title: "Título do slide", body: "- Ponto principal\n- Outro ponto\n- Conclusão", color: BLOCK_COLORS[4], number: 1 };
    case "doc": return { kind, title: "Documento", body: "# Introdução\nEscreva o texto aqui.\n\n# Tópicos\n- primeiro\n- segundo", color: BLOCK_COLORS[7] };
    case "callout": return { kind, icon: "💡", text: "Dica: destaque aqui o que não pode ser esquecido.", color: BLOCK_COLORS[3] };
    case "code": return { kind, lang: "python", code: "def soma(a, b):\n    return a + b\n\nprint(soma(2, 3))", color: BLOCK_COLORS[7] };
  }
}

export function defaultBlockSize(spec: BlockSpec): { w: number; h: number } {
  switch (spec.kind) {
    case "sticky": return { w: 220, h: 220 };
    case "card": return { w: 280, h: 170 };
    case "todo": return { w: 300, h: 60 + spec.items.length * 34 + 30 };
    case "table": return { w: Math.max(240, spec.rows[0]?.length * 140), h: spec.rows.length * 40 };
    case "timeline": return { w: Math.max(420, spec.items.length * 160), h: 190 };
    case "kanban": return { w: Math.max(400, spec.columns.length * 220 + 16), h: 380 };
    case "slide": return { w: 480, h: 270 };
    case "doc": return { w: 420, h: 540 };
    case "callout": return { w: 380, h: 96 };
    case "code": return { w: 440, h: 210 };
  }
}

// ---------------- saneamento ----------------
const str = (v: unknown, d = "", max = 4000) => (typeof v === "string" ? v.slice(0, max) : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanBlock(raw: any): BlockSpec | null {
  if (!raw || typeof raw !== "object" || !BLOCK_KINDS.some((k) => k.id === raw.kind)) return null;
  const d = defaultBlock(raw.kind);
  const color = hex(raw.color, (d as { color: string }).color);
  switch (raw.kind as BlockKind) {
    case "sticky": return { kind: "sticky", text: str(raw.text), color };
    case "card": return { kind: "card", title: str(raw.title, "", 200), body: str(raw.body), color };
    case "todo": return { kind: "todo", title: str(raw.title, "", 200), color, items: (Array.isArray(raw.items) ? raw.items : []).slice(0, 60).map((i: TodoItem) => ({ text: str(i?.text, "", 300), done: i?.done === true })) };
    case "table": {
      const rows = (Array.isArray(raw.rows) ? raw.rows : []).slice(0, 40).map((r: unknown) => (Array.isArray(r) ? r.slice(0, 12).map((c) => str(c, "", 300)) : [""]));
      const n = Math.max(1, ...rows.map((r: string[]) => r.length));
      return { kind: "table", header: raw.header !== false, color, rows: (rows.length ? rows : [[""]]).map((r: string[]) => [...r, ...Array(n - r.length).fill("")]) };
    }
    case "timeline": return { kind: "timeline", title: str(raw.title, "", 200), color, items: (Array.isArray(raw.items) ? raw.items : []).slice(0, 30).map((i: TimelineItem) => ({ date: str(i?.date, "", 40), text: str(i?.text, "", 200) })) };
    case "kanban": return { kind: "kanban", title: str(raw.title, "", 200), color, columns: (Array.isArray(raw.columns) ? raw.columns : []).slice(0, 10).map((c: KanbanColumn) => ({ title: str(c?.title, "", 80), cards: (Array.isArray(c?.cards) ? c.cards : []).slice(0, 40).map((x: unknown) => str(x, "", 300)) })) };
    case "slide": return { kind: "slide", title: str(raw.title, "", 200), body: str(raw.body), color, number: Number.isFinite(raw.number) ? Math.max(1, Math.round(raw.number)) : 1 };
    case "doc": return { kind: "doc", title: str(raw.title, "", 200), body: str(raw.body, "", 20000), color };
    case "callout": return { kind: "callout", icon: str(raw.icon, "💡", 8), text: str(raw.text), color };
    case "code": return { kind: "code", lang: str(raw.lang, "", 30), code: str(raw.code, "", 20000), color };
  }
}

// ---------------- primitivas ----------------
export interface BP { x: number; y: number }
export interface BRect { x: number; y: number; w: number; h: number; r: number; fill: string; alpha?: number; stroke?: string; sw?: number }
export interface BText { x: number; y: number; text: string; size: number; color: string; bold?: boolean; font?: "sans" | "hand" | "mono" | "serif"; align?: "left" | "center" | "right"; alpha?: number; strike?: boolean }
export interface BLine { pts: BP[]; color: string; width: number; alpha?: number; dash?: boolean }
export interface BCircle { x: number; y: number; r: number; fill: string; stroke?: string; sw?: number }
/** Área clicável com comportamento próprio (marcar tarefa). */
export interface BHit { kind: "toggle"; index: number; x: number; y: number; w: number; h: number }
export interface BlockPrims { rects: BRect[]; lines: BLine[]; circles: BCircle[]; texts: BText[]; hits: BHit[] }

/** Mede a largura de um texto numa fonte (no app vem do canvas; nos testes, aproximação). */
export type TextMeasure = (text: string, size: number, font: BText["font"], bold?: boolean) => number;
export const approxTextMeasure: TextMeasure = (t, size, font, bold) => t.length * size * (font === "mono" ? 0.6 : 0.53) * (bold ? 1.06 : 1);

/** Quebra o texto em linhas que cabem em `maxW` (palavras inteiras; palavra gigante é cortada). */
export function wrap(text: string, maxW: number, size: number, measure: TextMeasure, font: BText["font"] = "sans", bold = false): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para) { out.push(""); continue; }
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const tryLine = line + word;
      if (measure(tryLine.trimEnd(), size, font, bold) <= maxW || !line.trim()) {
        if (measure(word, size, font, bold) > maxW && !line.trim()) {
          // palavra maior que a linha: corta por caracteres
          let chunk = "";
          for (const ch of word) { if (measure(chunk + ch, size, font, bold) > maxW && chunk) { out.push(chunk); chunk = ch; } else chunk += ch; }
          line = chunk;
        } else line = tryLine;
      } else { out.push(line.trimEnd()); line = word.trimStart(); }
    }
    out.push(line.trimEnd());
  }
  return out;
}

const INK = "#1B2233", SOFT = "#5B677D";
const LH = 1.3;

function mix(hexColor: string, f: number): string {
  const c = parseInt(hexColor.slice(1), 16);
  const ch = (s: number) => Math.round(Math.min(255, Math.max(0, f >= 0 ? s + (255 - s) * f : s * (1 + f))));
  return "#" + ((ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255)).toString(16).padStart(6, "0");
}

/** Texto multilinha a partir de (x, y) (topo); devolve a altura usada. */
function para(p: BlockPrims, lines: string[], x: number, y: number, size: number, color: string, o: Partial<BText> = {}, maxLines = 999): number {
  const n = Math.min(lines.length, maxLines);
  for (let i = 0; i < n; i++) {
    const t = i === maxLines - 1 && lines.length > maxLines ? lines[i].replace(/\s*\S*$/, "") + "…" : lines[i];
    p.texts.push({ x, y: y + i * size * LH, text: t, size, color, ...o });
  }
  return n * size * LH;
}

/** Altura mínima para o conteúdo caber (blocos que crescem com o texto). */
export function blockContentHeight(spec: BlockSpec, w: number, measure: TextMeasure = approxTextMeasure): number {
  switch (spec.kind) {
    case "card": return 24 + wrap(spec.title, w - 44, 18, measure, "sans", true).length * 18 * LH + 8 + wrap(spec.body, w - 44, 14, measure).length * 14 * LH + 22;
    case "todo": return 56 + spec.items.reduce((s, i) => s + Math.max(30, wrap(i.text, w - 68, 15, measure).length * 15 * LH + 10), 0) + 34;
    case "callout": return Math.max(64, wrap(spec.text, w - 78, 15, measure).length * 15 * LH + 32);
    case "doc": return 0;
    case "table": return spec.rows.length * 40;
    default: return 0;
  }
}

export function blockPrims(spec: BlockSpec, w: number, h: number, measure: TextMeasure = approxTextMeasure): BlockPrims {
  const p: BlockPrims = { rects: [], lines: [], circles: [], texts: [], hits: [] };
  const shadow = (r: number, a = 0.1) => p.rects.push({ x: 2, y: 4, w, h, r, fill: "#1B2233", alpha: a });

  switch (spec.kind) {
    case "sticky": {
      shadow(4, 0.13);
      p.rects.push({ x: 0, y: 0, w, h, r: 4, fill: spec.color });
      p.rects.push({ x: w * 0.32, y: -7, w: w * 0.36, h: 16, r: 2, fill: "#FFFFFF", alpha: 0.55 }); // fita adesiva
      // o texto encolhe até caber
      let size = Math.min(30, Math.max(12, Math.round(Math.min(w, h) / 8)));
      let lines = wrap(spec.text, w - 32, size, measure, "hand");
      while (size > 11 && lines.length * size * LH > h - 34) { size -= 1; lines = wrap(spec.text, w - 32, size, measure, "hand"); }
      para(p, lines, 16, 20, size, mix(spec.color, -0.72), { font: "hand" }, Math.floor((h - 30) / (size * LH)));
      break;
    }
    case "card": {
      shadow(12);
      p.rects.push({ x: 0, y: 0, w, h, r: 12, fill: "#FFFFFF", stroke: "#DDE3EE", sw: 1 });
      p.rects.push({ x: 0, y: 0, w: 6, h, r: 3, fill: spec.color });
      const tl = wrap(spec.title, w - 44, 18, measure, "sans", true);
      const used = para(p, tl, 22, 18, 18, INK, { bold: true }, 3);
      para(p, wrap(spec.body, w - 44, 14, measure), 22, 18 + used + 8, 14, SOFT, {}, Math.max(1, Math.floor((h - used - 40) / (14 * LH))));
      break;
    }
    case "todo": {
      shadow(14);
      p.rects.push({ x: 0, y: 0, w, h, r: 14, fill: "#FFFFFF", stroke: "#DDE3EE", sw: 1 });
      p.texts.push({ x: 20, y: 18, text: spec.title || "Tarefas", size: 18, color: INK, bold: true });
      const done = spec.items.filter((i) => i.done).length;
      p.texts.push({ x: w - 20, y: 21, text: `${done}/${spec.items.length}`, size: 13, color: spec.color, bold: true, align: "right" });
      let y = 56;
      spec.items.forEach((it, i) => {
        const lines = wrap(it.text || " ", w - 68, 15, measure);
        const rowH = Math.max(30, lines.length * 15 * LH + 10);
        if (y + rowH > h - 26) return;
        const bx = 20, by = y + 4;
        p.rects.push({ x: bx, y: by, w: 18, h: 18, r: 5, fill: it.done ? spec.color : "#FFFFFF", stroke: it.done ? spec.color : "#B8C1D1", sw: 1.6 });
        if (it.done) p.lines.push({ pts: [{ x: bx + 4, y: by + 9.5 }, { x: bx + 7.5, y: by + 13 }, { x: bx + 14, y: by + 5.5 }], color: "#FFFFFF", width: 2.2 });
        p.hits.push({ kind: "toggle", index: i, x: bx - 10, y: y - 4, w: 40, h: Math.max(30, rowH) });
        para(p, lines, 48, y + 4, 15, it.done ? "#9AA3B2" : INK, { strike: it.done });
        y += rowH;
      });
      // barra de progresso
      const pw = w - 40;
      p.rects.push({ x: 20, y: h - 18, w: pw, h: 6, r: 3, fill: "#1B2233", alpha: 0.08 });
      if (spec.items.length && done) p.rects.push({ x: 20, y: h - 18, w: Math.max(6, (pw * done) / spec.items.length), h: 6, r: 3, fill: done === spec.items.length ? "#2E9B5F" : spec.color });
      break;
    }
    case "table": {
      const rows = spec.rows.length, cols = Math.max(1, spec.rows[0]?.length ?? 1);
      const rh = h / rows, cw = w / cols;
      shadow(10, 0.07);
      p.rects.push({ x: 0, y: 0, w, h, r: 10, fill: "#FFFFFF", stroke: "#CFD7E4", sw: 1 });
      if (spec.header) p.rects.push({ x: 0, y: 0, w, h: rh, r: 10, fill: mix(spec.color, 0.82) }, { x: 0, y: rh / 2, w, h: rh / 2, r: 0, fill: mix(spec.color, 0.82) });
      for (let r = 1; r < rows; r++) p.lines.push({ pts: [{ x: 0, y: r * rh }, { x: w, y: r * rh }], color: "#DCE2EC", width: 1 });
      for (let c = 1; c < cols; c++) p.lines.push({ pts: [{ x: c * cw, y: 0 }, { x: c * cw, y: h }], color: "#DCE2EC", width: 1 });
      spec.rows.forEach((row, r) => row.forEach((cell, c) => {
        if (!cell) return;
        const head = spec.header && r === 0;
        const size = Math.min(15, Math.max(10, rh * 0.36));
        const lines = wrap(cell, cw - 16, size, measure, "sans", head);
        para(p, lines, c * cw + 8, r * rh + (rh - Math.min(lines.length, 2) * size * LH) / 2, size, head ? mix(spec.color, -0.55) : INK, { bold: head }, 2);
      }));
      break;
    }
    case "timeline": {
      const ly = Math.min(h - 70, Math.max(70, h * 0.48));
      if (spec.title) p.texts.push({ x: 4, y: 2, text: spec.title, size: 18, color: INK, bold: true });
      p.lines.push({ pts: [{ x: 8, y: ly }, { x: w - 14, y: ly }], color: mix(spec.color, 0.35), width: 4 });
      p.lines.push({ pts: [{ x: w - 24, y: ly - 8 }, { x: w - 12, y: ly }, { x: w - 24, y: ly + 8 }], color: mix(spec.color, 0.35), width: 4 });
      const n = Math.max(1, spec.items.length);
      const step = (w - 50) / n;
      spec.items.forEach((it, i) => {
        const x = 24 + step * (i + 0.5);
        const c = BLOCK_COLORS[(BLOCK_COLORS.indexOf(spec.color) + i) % BLOCK_COLORS.length];
        p.circles.push({ x, y: ly, r: 10, fill: "#FFFFFF", stroke: c, sw: 4 });
        p.texts.push({ x, y: ly - 40, text: it.date, size: 14, color: c, bold: true, align: "center" });
        para(p, wrap(it.text, step - 14, 14, measure), x, ly + 22, 14, INK, { align: "center" }, Math.max(1, Math.floor((h - ly - 26) / (14 * LH))));
      });
      break;
    }
    case "kanban": {
      shadow(14, 0.06);
      p.rects.push({ x: 0, y: 0, w, h, r: 14, fill: "#F4F6FA", stroke: "#DDE3EE", sw: 1 });
      p.texts.push({ x: 16, y: 14, text: spec.title || "Kanban", size: 18, color: INK, bold: true });
      const n = Math.max(1, spec.columns.length);
      const gap = 10, top = 48;
      const cw = (w - 16 - gap * (n - 1)) / n;
      spec.columns.forEach((col, i) => {
        const x = 8 + i * (cw + gap);
        const c = BLOCK_COLORS[(BLOCK_COLORS.indexOf(spec.color) + i) % BLOCK_COLORS.length];
        p.rects.push({ x, y: top, w: cw, h: h - top - 8, r: 10, fill: "#FFFFFF", alpha: 0.7 });
        p.rects.push({ x, y: top, w: cw, h: 4, r: 2, fill: c });
        p.texts.push({ x: x + 10, y: top + 12, text: col.title, size: 14, color: INK, bold: true });
        p.texts.push({ x: x + cw - 10, y: top + 13, text: String(col.cards.length), size: 12, color: c, bold: true, align: "right" });
        let y = top + 40;
        for (const card of col.cards) {
          const lines = wrap(card || " ", cw - 24, 13, measure);
          const ch = Math.min(4, lines.length) * 13 * LH + 16;
          if (y + ch > h - 12) { p.texts.push({ x: x + 10, y, text: "…", size: 13, color: SOFT }); break; }
          p.rects.push({ x: x + 6, y: y + 2, w: cw - 12, h: ch, r: 8, fill: "#1B2233", alpha: 0.05 });
          p.rects.push({ x: x + 6, y, w: cw - 12, h: ch, r: 8, fill: "#FFFFFF", stroke: "#DDE3EE", sw: 1 });
          para(p, lines, x + 14, y + 8, 13, INK, {}, 4);
          y += ch + 8;
        }
      });
      break;
    }
    case "slide": {
      shadow(6, 0.15);
      p.rects.push({ x: 0, y: 0, w, h, r: 6, fill: "#FFFFFF", stroke: "#D5DCE8", sw: 1 });
      p.rects.push({ x: 0, y: 0, w, h: Math.max(6, h * 0.03), r: 3, fill: spec.color });
      const ts = Math.max(14, Math.round(h * 0.1));
      const tl = wrap(spec.title, w * 0.86, ts, measure, "sans", true);
      const used = para(p, tl, w * 0.07, h * 0.12, ts, INK, { bold: true }, 2);
      const bs = Math.max(10, Math.round(h * 0.06));
      const body = spec.body.split("\n").map((l) => l.replace(/^\s*[-*]\s+/, "•  "));
      para(p, body.flatMap((l) => wrap(l, w * 0.84, bs, measure)), w * 0.08, h * 0.12 + used + h * 0.06, bs, SOFT, {}, Math.floor((h * 0.7 - used) / (bs * LH)));
      p.texts.push({ x: w - 12, y: h - 22, text: String(spec.number), size: 12, color: "#9AA3B2", align: "right" });
      break;
    }
    case "doc": {
      shadow(4, 0.12);
      p.rects.push({ x: 0, y: 0, w, h, r: 4, fill: "#FFFFFF", stroke: "#DDE3EE", sw: 1 });
      const m = Math.max(24, w * 0.09);
      let y = m * 0.9;
      y += para(p, wrap(spec.title, w - 2 * m, 24, measure, "serif", true), m, y, 24, INK, { bold: true, font: "serif" }, 3) + 6;
      p.lines.push({ pts: [{ x: m, y }, { x: m + 60, y }], color: spec.color, width: 3 });
      y += 14;
      for (const raw of spec.body.split("\n")) {
        if (y > h - m * 0.6) break;
        if (/^#\s+/.test(raw)) { y += 6; y += para(p, wrap(raw.replace(/^#\s+/, ""), w - 2 * m, 17, measure, "serif", true), m, y, 17, INK, { bold: true, font: "serif" }) + 2; continue; }
        const bullet = /^\s*[-*]\s+/.test(raw);
        const text = bullet ? raw.replace(/^\s*[-*]\s+/, "") : raw;
        if (!text.trim()) { y += 8; continue; }
        if (bullet) p.circles.push({ x: m + 4, y: y + 9, r: 2.5, fill: spec.color });
        y += para(p, wrap(text, w - 2 * m - (bullet ? 16 : 0), 14, measure, "serif"), m + (bullet ? 16 : 0), y, 14, "#33394A", { font: "serif" }, Math.max(1, Math.floor((h - m * 0.6 - y) / (14 * LH)))) + 3;
      }
      break;
    }
    case "callout": {
      p.rects.push({ x: 0, y: 0, w, h, r: 12, fill: mix(spec.color, 0.86) });
      p.rects.push({ x: 0, y: 0, w: 5, h, r: 2.5, fill: spec.color });
      p.texts.push({ x: 20, y: 16, text: spec.icon, size: 24, color: INK });
      para(p, wrap(spec.text, w - 78, 15, measure), 60, 18, 15, mix(spec.color, -0.6), {}, Math.max(1, Math.floor((h - 26) / (15 * LH))));
      break;
    }
    case "code": {
      shadow(10, 0.15);
      p.rects.push({ x: 0, y: 0, w, h, r: 10, fill: "#1E1F2E" });
      p.rects.push({ x: 0, y: 0, w, h: 28, r: 10, fill: "#272939" }, { x: 0, y: 18, w, h: 10, r: 0, fill: "#272939" });
      ["#FF5F57", "#FEBC2E", "#28C840"].forEach((c, i) => p.circles.push({ x: 16 + i * 16, y: 14, r: 5, fill: c }));
      if (spec.lang) p.texts.push({ x: w - 12, y: 7, text: spec.lang, size: 11, color: "#8B90A8", align: "right", font: "mono" });
      const lines = spec.code.split("\n");
      const max = Math.max(1, Math.floor((h - 44) / (13 * LH)));
      lines.slice(0, max).forEach((l, i) => {
        p.texts.push({ x: 12, y: 38 + i * 13 * LH, text: String(i + 1).padStart(2), size: 13, color: "#5D6178", font: "mono" });
        const tone = /^\s*(#|\/\/)/.test(l) ? "#7F8AA6" : /\b(def|return|function|const|let|if|else|for|while|class|import|from|print)\b/.test(l) ? "#C9A2FF" : "#E6E8F2";
        p.texts.push({ x: 40, y: 38 + i * 13 * LH, text: l.replace(/\t/g, "  "), size: 13, color: tone, font: "mono" });
      });
      break;
    }
  }
  return p;
}

/** Área clicável sob o ponto local (x, y) do bloco. */
export function blockHitAt(p: BlockPrims, x: number, y: number): BHit | null {
  return p.hits.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) ?? null;
}

/** Aplica o toque numa área clicável (marcar/desmarcar tarefa). */
export function blockTap(spec: BlockSpec, hit: BHit): BlockSpec {
  if (hit.kind === "toggle" && spec.kind === "todo") return { ...spec, items: spec.items.map((it, i) => (i === hit.index ? { ...it, done: !it.done } : it)) };
  return spec;
}

export function blockTitle(spec: BlockSpec): string {
  return BLOCK_KINDS.find((k) => k.id === spec.kind)?.label ?? "Bloco";
}

/** Texto do bloco (busca, copiar como texto). */
export function blockText(spec: BlockSpec): string {
  switch (spec.kind) {
    case "sticky": return spec.text;
    case "card": case "doc": case "slide": return `${spec.title}\n${spec.body}`;
    case "todo": return `${spec.title}\n${spec.items.map((i) => `${i.done ? "[x]" : "[ ]"} ${i.text}`).join("\n")}`;
    case "table": return spec.rows.map((r) => r.join("\t")).join("\n");
    case "timeline": return `${spec.title}\n${spec.items.map((i) => `${i.date}: ${i.text}`).join("\n")}`;
    case "kanban": return `${spec.title}\n${spec.columns.map((c) => `${c.title}: ${c.cards.join("; ")}`).join("\n")}`;
    case "callout": return `${spec.icon} ${spec.text}`;
    case "code": return spec.code;
  }
}

/** Novo tamanho depois de editar: tabela/kanban crescem por coluna/linha, listas e cartões crescem com o texto. */
export function fitBlock(prev: BlockSpec, next: BlockSpec, w: number, h: number, measure: TextMeasure = approxTextMeasure): { w: number; h: number } {
  if (prev.kind === "table" && next.kind === "table") {
    const c0 = prev.rows[0]?.length || 1, c1 = next.rows[0]?.length || 1;
    w = (w * c1) / c0; h = (h * next.rows.length) / Math.max(1, prev.rows.length);
  } else if (prev.kind === "kanban" && next.kind === "kanban" && prev.columns.length !== next.columns.length && prev.columns.length) {
    w = (w * next.columns.length) / prev.columns.length;
  } else if (prev.kind === "timeline" && next.kind === "timeline" && next.items.length > prev.items.length) {
    w = Math.max(w, defaultBlockSize(next).w);
  }
  const need = blockContentHeight(next, w, measure);
  return { w: Math.round(w), h: Math.round(Math.max(h, need)) };
}
