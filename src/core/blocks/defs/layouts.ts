// Layouts e peças visuais: cartão de pessoa, de livro/filme, de projeto, seção, chave/colchete, folha para escrever e adesivos.
import { defineBlock } from "../def";
import { BField, BLOCK_COLORS, INK, LH, MUTED, SOFT, cardBg, contentBody, contentItems, linesFit, mix, num, onColor, oneOf, para, str, wrap } from "../kit";

// ---------------- pessoa ----------------
export const profile = defineBlock({
  kind: "profile", label: "Pessoa", hint: "Cartão de pessoa ou personagem", behavior: "livre",
  make: () => ({ kind: "profile", name: "Nome da pessoa", role: "Papel / função", text: "Uma descrição curta, contato ou características.", emoji: "🙂", color: BLOCK_COLORS[6] }),
  size: () => ({ w: 300, h: 200 }),
  clean: (r, color) => ({ kind: "profile", name: str(r.name, "", 120), role: str(r.role, "", 120), text: str(r.text), emoji: str(r.emoji, "", 8), color }),
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 16);
    p.rects.push({ x: 0, y: 0, w, h: 56, r: 16, fill: mix(s.color, 0.75) }, { x: 0, y: 40, w, h: 16, r: 0, fill: mix(s.color, 0.75) });
    p.circles.push({ x: 50, y: 58, r: 32, fill: s.color, stroke: "#FFFFFF", sw: 4 });
    const initials = s.name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("");
    p.texts.push({ x: 50, y: s.emoji ? 42 : 46, text: s.emoji || initials || "?", size: s.emoji ? 28 : 22, color: "#FFFFFF", bold: !s.emoji, align: "center" });
    p.texts.push({ x: 94, y: 62, text: s.name, size: 17, color: INK, bold: true });
    p.texts.push({ x: 94, y: 84, text: s.role, size: 13, color: mix(s.color, -0.35), bold: true });
    para(p, wrap(s.text, w - 36, 13, m), 18, 112, 13, SOFT, {}, linesFit(h - 122, 13));
  },
  fields: (_s, w, h) => [
    { key: "name", x: 94, y: 60, w: w - 108, h: 22, size: 17, bold: true, color: INK, bg: "#FFFFFF", multiline: false },
    { key: "role", x: 94, y: 82, w: w - 108, h: 20, size: 13, bold: true, color: SOFT, bg: "#FFFFFF", multiline: false },
    { key: "text", x: 18, y: 112, w: w - 36, h: h - 122, size: 13, color: SOFT, bg: "#FFFFFF", multiline: true },
  ],
  form: [{ t: "text", key: "name", label: "Nome" }, { t: "text", key: "role", label: "Papel" }, { t: "icon", key: "emoji", label: "Avatar", options: ["", "🙂", "😎", "🧑‍🎓", "👩‍💻", "🧑‍🏫", "🦸", "🧙", "🐱", "🤖"] }, { t: "area", key: "text", label: "Descrição", rows: 3 }],
  text: (s) => `${s.name} — ${s.role}\n${s.text}`,
  toContent: (s) => ({ title: s.name, text: [s.role, s.text].filter(Boolean).join("\n") }),
  fromContent: (c, color) => ({ kind: "profile", name: c.title ?? "", role: "", text: contentBody(c), emoji: "🙂", color }),
});

// ---------------- livro / filme / série… ----------------
export const MEDIA_TYPES = ["Livro", "Filme", "Série", "Jogo", "Álbum", "Artigo", "Curso"];
const MEDIA_ICON: Record<string, string> = { Livro: "📖", Filme: "🎬", Série: "📺", Jogo: "🎮", Álbum: "🎵", Artigo: "📰", Curso: "🎓" };
export const media = defineBlock({
  kind: "media", label: "Livro / filme", hint: "Ficha com capa, ano e nota em estrelas (toque nas estrelas)", behavior: "livre",
  make: () => ({ kind: "media", media: "Livro", title: "Título", creator: "Autor", year: "2024", rating: 4, note: "O que achei, citação favorita…", color: BLOCK_COLORS[3] }),
  size: () => ({ w: 320, h: 180 }),
  clean: (r, color) => ({ kind: "media", media: str(r.media, "Livro", 20), title: str(r.title, "", 200), creator: str(r.creator, "", 120), year: str(r.year, "", 12), rating: Math.round(num(r.rating, 0, 0, 5)), note: str(r.note), color }),
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 14);
    const cw = Math.min(96, w * 0.3), ch = h - 28;
    p.rects.push({ x: 14, y: 14, w: cw, h: ch, r: 8, fill: s.color }, { x: 14, y: 14, w: 6, h: ch, r: 3, fill: INK, alpha: 0.18 });
    p.texts.push({ x: 14 + cw / 2, y: 14 + ch / 2 - 18, text: MEDIA_ICON[s.media] ?? "⭐", size: 30, color: onColor(s.color), align: "center" });
    const x = 28 + cw, tw = w - x - 14;
    p.texts.push({ x, y: 16, text: s.media.toUpperCase(), size: 10, color: mix(s.color, -0.3), bold: true });
    const tl = para(p, wrap(s.title, tw, 16, m, "sans", true), x, 32, 16, INK, { bold: true }, 2);
    p.texts.push({ x, y: 36 + tl, text: [s.creator, s.year].filter(Boolean).join(" · "), size: 12, color: SOFT });
    for (let i = 0; i < 5; i++) {
      p.texts.push({ x: x + i * 20, y: 56 + tl, text: i < s.rating ? "★" : "☆", size: 17, color: i < s.rating ? "#F2B705" : "#C9D1DE" });
      p.hits.push({ action: "rate", index: i + 1, x: x + i * 20 - 2, y: 52 + tl, w: 20, h: 26 });
    }
    para(p, wrap(s.note, tw, 12, m), x, 84 + tl, 12, SOFT, { italic: true }, linesFit(h - 96 - tl, 12));
  },
  tap: (s, hit) => (hit.action === "rate" ? { ...s, rating: s.rating === hit.index ? hit.index - 1 : hit.index } : s),
  fields(s, w, h, m) {
    const cw = Math.min(96, w * 0.3), x = 28 + cw, tw = w - x - 14, tl = Math.min(2, wrap(s.title || "M", tw, 16, m, "sans", true).length) * 16 * LH;
    return [
      { key: "title", x, y: 32, w: tw, h: tl, size: 16, bold: true, color: INK, bg: "#FFFFFF", multiline: false },
      { key: "note", x, y: 84 + tl, w: tw, h: h - 96 - tl, size: 12, italic: true, color: SOFT, bg: "#FFFFFF", multiline: true },
    ];
  },
  form: [{ t: "select", key: "media", label: "Tipo", options: MEDIA_TYPES.map((x) => [x, `${MEDIA_ICON[x]} ${x}`]) }, { t: "text", key: "title", label: "Título" }, { t: "text", key: "creator", label: "Autor / diretor" }, { t: "text", key: "year", label: "Ano" }, { t: "number", key: "rating", label: "Nota (0–5)", min: 0, max: 5 }, { t: "area", key: "note", label: "Nota pessoal", rows: 3 }],
  text: (s) => `${s.title} (${s.creator}, ${s.year}) ${"★".repeat(s.rating)}\n${s.note}`,
  toContent: (s) => ({ title: s.title, text: s.note }),
  fromContent: (c, color) => ({ kind: "media", media: "Livro", title: c.title ?? "", creator: "", year: "", rating: 0, note: contentBody(c), color }),
});

// ---------------- projeto ----------------
export const STATUS = [["Ideia", "#7B4FC9"], ["Planejando", "#4D6FC4"], ["Em andamento", "#C98612"], ["Pausado", "#5B677D"], ["Concluído", "#2E9B5F"]] as const;
export const project = defineBlock({
  kind: "project", label: "Projeto", hint: "Status, responsável, prazo e progresso (toque no status)", behavior: "livre",
  make: () => ({ kind: "project", title: "Nome do projeto", status: "Em andamento", owner: "Responsável", due: "30/11", progress: 40, text: "Objetivo e próximos passos.", color: BLOCK_COLORS[0] }),
  size: () => ({ w: 320, h: 190 }),
  clean: (r, color) => ({ kind: "project", title: str(r.title, "", 200), status: str(r.status, "Ideia", 40), owner: str(r.owner, "", 80), due: str(r.due, "", 30), progress: Math.round(num(r.progress, 0, 0, 100)), text: str(r.text), color }),
  draw(s, w, h, m, p) {
    cardBg(p, w, h, 14);
    p.rects.push({ x: 0, y: 0, w, h: 6, r: 3, fill: s.color });
    const sc = STATUS.find((x) => x[0] === s.status)?.[1] ?? MUTED, sw = m(s.status, 11, "sans", true) + 24;
    p.rects.push({ x: 18, y: 20, w: sw, h: 22, r: 11, fill: mix(sc, 0.85) });
    p.circles.push({ x: 28, y: 31, r: 3.5, fill: sc });
    p.texts.push({ x: 36, y: 24, text: s.status, size: 11, color: mix(sc, -0.35), bold: true });
    p.hits.push({ action: "status", index: 0, x: 14, y: 16, w: sw + 8, h: 30 });
    if (s.due) p.texts.push({ x: w - 18, y: 24, text: "📅 " + s.due, size: 12, color: SOFT, align: "right" });
    const tl = para(p, wrap(s.title, w - 36, 17, m, "sans", true), 18, 52, 17, INK, { bold: true }, 2);
    para(p, wrap(s.text, w - 36, 13, m), 18, 58 + tl, 13, SOFT, {}, linesFit(h - 112 - tl, 13));
    p.texts.push({ x: 18, y: h - 46, text: s.owner ? "👤 " + s.owner : "", size: 12, color: SOFT });
    p.texts.push({ x: w - 18, y: h - 46, text: `${s.progress}%`, size: 12, color: s.color, bold: true, align: "right" });
    p.rects.push({ x: 18, y: h - 24, w: w - 36, h: 8, r: 4, fill: mix(s.color, 0.85) });
    if (s.progress) p.rects.push({ x: 18, y: h - 24, w: Math.max(8, ((w - 36) * s.progress) / 100), h: 8, r: 4, fill: s.progress >= 100 ? "#2E9B5F" : s.color });
    p.hits.push({ action: "progress", index: 0, x: 14, y: h - 32, w: w - 28, h: 24 });
  },
  tap(s, hit) {
    if (hit.action === "status") return { ...s, status: STATUS[(STATUS.findIndex((x) => x[0] === s.status) + 1) % STATUS.length][0] };
    if (hit.action === "progress") { const v = s.progress >= 100 ? 0 : Math.min(100, Math.floor(s.progress / 10) * 10 + 10); return { ...s, progress: v, status: v >= 100 ? "Concluído" : s.status }; }
    return s;
  },
  fields(s, w, h, m) {
    const tl = Math.min(2, wrap(s.title || "M", w - 36, 17, m, "sans", true).length) * 17 * LH;
    return [
      { key: "title", x: 18, y: 52, w: w - 36, h: tl, size: 17, bold: true, color: INK, bg: "#FFFFFF", multiline: false },
      { key: "text", x: 18, y: 58 + tl, w: w - 36, h: h - 112 - tl, size: 13, color: SOFT, bg: "#FFFFFF", multiline: true },
    ] as BField[];
  },
  form: [{ t: "text", key: "title", label: "Projeto" }, { t: "select", key: "status", label: "Status", options: STATUS.map((x) => [x[0], x[0]]) }, { t: "text", key: "owner", label: "Responsável" }, { t: "text", key: "due", label: "Prazo" }, { t: "number", key: "progress", label: "Progresso (%)", min: 0, max: 100, step: 5 }, { t: "area", key: "text", label: "Descrição", rows: 3 }],
  text: (s) => `${s.title} [${s.status}] ${s.progress}%\n${s.text}`,
  toContent: (s) => ({ title: s.title, text: s.text }),
  fromContent: (c, color) => ({ kind: "project", title: c.title ?? "", status: "Ideia", owner: "", due: "", progress: 0, text: contentBody(c), color }),
});

// ---------------- seção ----------------
export const section = defineBlock({
  kind: "section", label: "Seção", hint: "Área colorida com título para agrupar ideias", behavior: "livre",
  make: () => ({ kind: "section", title: "Grupo de ideias", color: BLOCK_COLORS[5] }),
  size: () => ({ w: 520, h: 360 }),
  clean: (r, color) => ({ kind: "section", title: str(r.title, "", 120), color }),
  draw(s, w, h, _m, p) {
    p.rects.push({ x: 0, y: 0, w, h, r: 18, fill: mix(s.color, 0.9), stroke: mix(s.color, 0.6), sw: 1.5, dash: true });
    p.rects.push({ x: 14, y: 14, w: Math.min(w - 28, s.title.length * 9.5 + 30), h: 30, r: 15, fill: s.color });
    p.texts.push({ x: 29, y: 20, text: s.title, size: 15, color: onColor(s.color), bold: true });
  },
  fields: (s, w) => [{ key: "title", x: 26, y: 18, w: w - 52, h: 22, size: 15, bold: true, color: onColor(s.color), bg: s.color, multiline: false }],
  form: [{ t: "text", key: "title", label: "Título" }],
  text: (s) => s.title,
  toContent: (s) => ({ title: s.title }),
  fromContent: (c, color) => ({ kind: "section", title: c.title || contentItems(c)[0] || "Seção", color }),
});

// ---------------- chave / colchete ----------------
export const brace = defineBlock({
  kind: "brace", label: "Chave", hint: "Chave { ou colchete [ com rótulo, para agrupar itens", behavior: "relacional", palette: "block",
  make: () => ({ kind: "brace", side: "right", shape: "curly", text: "resumo do grupo", color: BLOCK_COLORS[7] }),
  size: (s) => (s.side === "left" || s.side === "right" ? { w: 190, h: 220 } : { w: 300, h: 90 }),
  clean: (r, color) => ({ kind: "brace", side: oneOf(r.side, ["left", "right", "top", "bottom"] as const, "right"), shape: oneOf(r.shape, ["curly", "square"] as const, "curly"), text: str(r.text, "", 300), color }),
  draw(s, w, h, m, p) {
    const vert = s.side === "left" || s.side === "right", t = 14;
    // desenha numa orientação "chave à esquerda do texto" e gira por eixo
    const L = vert ? h : w, depth = t;
    const base = (u: number, d: number) => {
      if (s.side === "right") return { x: d, y: u };
      if (s.side === "left") return { x: w - d, y: u };
      if (s.side === "bottom") return { x: u, y: d };
      return { x: u, y: h - d };
    };
    const pts = (() => {
      const out: { x: number; y: number }[] = [];
      const seg = (u0: number, u1: number, d0: number, d1: number) => { for (let k = 0; k <= 8; k++) { const f = k / 8, e = (1 - Math.cos(f * Math.PI)) / 2; out.push(base(u0 + (u1 - u0) * f, d0 + (d1 - d0) * e)); } };
      seg(0, L * 0.08, 0, depth * 0.5); seg(L * 0.08, L * 0.42, depth * 0.5, depth * 0.5); seg(L * 0.42, L * 0.5, depth * 0.5, depth);
      seg(L * 0.5, L * 0.58, depth, depth * 0.5); seg(L * 0.58, L * 0.92, depth * 0.5, depth * 0.5); seg(L * 0.92, L, depth * 0.5, 0);
      return out;
    })();
    p.lines.push({ pts: s.shape === "square" ? [base(0, 0), base(0, depth), base(L, depth), base(L, 0)] : pts, color: s.color, width: 2.5 });
    if (!s.text) return;
    if (vert) {
      const tx = s.side === "right" ? depth + 12 : 0, tw = w - depth - 14;
      const lines = wrap(s.text, tw, 15, m);
      para(p, lines, s.side === "right" ? tx : tw, h / 2 - (lines.length * 15 * LH) / 2, 15, INK, { align: s.side === "right" ? "left" : "right" }, linesFit(h, 15));
    } else {
      const lines = wrap(s.text, w, 15, m);
      para(p, lines, w / 2, s.side === "bottom" ? depth + 10 : 4, 15, INK, { align: "center" }, linesFit(h - depth - 12, 15));
    }
  },
  fields(s, w, h) {
    const vert = s.side === "left" || s.side === "right";
    return vert
      ? [{ key: "text", x: s.side === "right" ? 26 : 0, y: 10, w: w - 28, h: h - 20, size: 15, color: INK, bg: "#FFFFFF", align: s.side === "right" ? "left" : "right", multiline: true }]
      : [{ key: "text", x: 0, y: s.side === "bottom" ? 24 : 4, w, h: h - 30, size: 15, color: INK, bg: "#FFFFFF", align: "center", multiline: true }];
  },
  form: [{ t: "select", key: "side", label: "Lado do texto", options: [["right", "Chave à esquerda {"], ["left", "Chave à direita }"], ["bottom", "Chave em cima"], ["top", "Chave embaixo"]] }, { t: "select", key: "shape", label: "Forma", options: [["curly", "Chave { }"], ["square", "Colchete [ ]"]] }, { t: "area", key: "text", label: "Rótulo", rows: 2 }],
  text: (s) => s.text,
  toContent: (s) => ({ text: s.text }),
  fromContent: (c, color) => ({ kind: "brace", side: "right", shape: "curly", text: [c.title, contentBody(c)].filter(Boolean).join("\n"), color }),
});

// ---------------- folha para escrever ----------------
export const sheet = defineBlock({
  kind: "sheet", label: "Folha", hint: "Área pautada, quadriculada ou pontilhada para escrever à mão por cima", behavior: "livre",
  make: () => ({ kind: "sheet", pattern: "ruled", title: "", color: "#FFFFFF" }),
  size: () => ({ w: 420, h: 300 }),
  clean: (r, color) => ({ kind: "sheet", pattern: oneOf(r.pattern, ["blank", "ruled", "grid", "dots"] as const, "ruled"), title: str(r.title, "", 120), color }),
  draw(s, w, h, _m, p) {
    cardBg(p, w, h, 6, s.color, 0.1, "#DDE3EE");
    const g = 26, top = s.title ? 40 : 20, line = s.color === "#FFFFFF" || onColor(s.color) === INK ? "#C9D3E3" : "#FFFFFF";
    if (s.title) p.texts.push({ x: 16, y: 12, text: s.title, size: 15, color: onColor(s.color), bold: true });
    if (s.pattern === "ruled") {
      for (let y = top + g; y < h - 8; y += g) p.lines.push({ pts: [{ x: 10, y }, { x: w - 10, y }], color: line, width: 1 });
      p.lines.push({ pts: [{ x: 46, y: 6 }, { x: 46, y: h - 6 }], color: "#F0A3A3", width: 1 });
    } else if (s.pattern === "grid") {
      for (let y = top; y < h - 4; y += g / 1.3) p.lines.push({ pts: [{ x: 6, y }, { x: w - 6, y }], color: line, width: 0.8 });
      for (let x = 6 + g / 1.3; x < w - 4; x += g / 1.3) p.lines.push({ pts: [{ x, y: top }, { x, y: h - 6 }], color: line, width: 0.8 });
    } else if (s.pattern === "dots") {
      for (let y = top; y < h - 6; y += g) for (let x = 14; x < w - 6; x += g) p.circles.push({ x, y, r: 1.3, fill: "#AAB4C4" });
    }
  },
  fields: (s, w) => [{ key: "title", x: 16, y: 10, w: w - 32, h: 22, size: 15, bold: true, color: onColor(s.color), bg: s.color, multiline: false, placeholder: "Título (opcional)" }],
  form: [{ t: "select", key: "pattern", label: "Padrão", options: [["blank", "Em branco"], ["ruled", "Pautada"], ["grid", "Quadriculada"], ["dots", "Pontilhada"]] }, { t: "text", key: "title", label: "Título" }],
  palette: "sticky",
  text: (s) => s.title,
  toContent: (s) => ({ title: s.title }),
  fromContent: (c) => ({ kind: "sheet", pattern: "ruled", title: c.title ?? "", color: "#FFFFFF" }),
});

// ---------------- adesivos ----------------
export const sticker = defineBlock({
  kind: "sticker", label: "Adesivo", hint: "Emoji recortado, selo, carimbo ou fita adesiva", behavior: "livre",
  make: () => ({ kind: "sticker", style: "emoji", emoji: "⭐", text: "", color: BLOCK_COLORS[3], tilt: -6 }),
  size: (s) => (s.style === "badge" ? { w: 170, h: 56 } : s.style === "tape" ? { w: 200, h: 44 } : s.style === "stamp" ? { w: 150, h: 150 } : { w: 120, h: 120 }),
  clean: (r, color) => ({ kind: "sticker", style: oneOf(r.style, ["emoji", "badge", "stamp", "tape"] as const, "emoji"), emoji: str(r.emoji, "", 16), text: str(r.text, "", 60), color, tilt: num(r.tilt, 0, -45, 45) }),
  draw(s, w, h, m, p) {
    p.tilt = (s.tilt * Math.PI) / 180;
    if (s.style === "emoji") {
      const R = Math.min(w, h) / 2 - 4, cy = s.text ? R + 2 : h / 2;
      p.circles.push({ x: w / 2 + 2, y: cy + 4, r: R, fill: INK, alpha: 0.16 }, { x: w / 2, y: cy, r: R, fill: "#FFFFFF" });
      p.texts.push({ x: w / 2, y: cy - R * 0.72, text: s.emoji || "⭐", size: R * 1.3, color: INK, align: "center" });
      if (s.text) {
        const tw = m(s.text, 12, "sans", true) + 18;
        p.rects.push({ x: w / 2 - tw / 2, y: h - 22, w: tw, h: 20, r: 10, fill: s.color });
        p.texts.push({ x: w / 2, y: h - 19, text: s.text, size: 12, color: onColor(s.color), bold: true, align: "center" });
      }
    } else if (s.style === "badge") {
      p.rects.push({ x: 2, y: 4, w, h, r: h / 2, fill: INK, alpha: 0.18 }, { x: 0, y: 0, w, h, r: h / 2, fill: "#FFFFFF" }, { x: 4, y: 4, w: w - 8, h: h - 8, r: (h - 8) / 2, fill: s.color });
      const label = (s.emoji ? s.emoji + " " : "") + s.text;
      let size = h * 0.42;
      while (size > 9 && m(label, size, "sans", true) > w - 28) size -= 1;
      p.texts.push({ x: w / 2, y: h / 2 - size * 0.62, text: label, size, color: onColor(s.color), bold: true, align: "center" });
    } else if (s.style === "stamp") {
      const R = Math.min(w, h) / 2 - 3, c = s.color;
      p.circles.push({ x: w / 2, y: h / 2, r: R, fill: "#FFFFFF", alpha: 0, stroke: c, sw: 4 }, { x: w / 2, y: h / 2, r: R - 8, fill: "#FFFFFF", alpha: 0, stroke: c, sw: 1.5 });
      p.rects.push({ x: 6, y: h / 2 - h * 0.13, w: w - 12, h: h * 0.26, r: 3, fill: c, alpha: 0.12 });
      let size = h * 0.17;
      while (size > 8 && m(s.text.toUpperCase(), size, "sans", true) > w - 30) size -= 1;
      p.texts.push({ x: w / 2, y: h / 2 - size * 0.62, text: s.text.toUpperCase(), size, color: c, bold: true, align: "center", alpha: 0.9 });
      if (s.emoji) p.texts.push({ x: w / 2, y: h * 0.17, text: s.emoji, size: h * 0.13, color: INK, align: "center" });
    } else {
      const zig = (x: number, flip: boolean) => Array.from({ length: 7 }, (_, i) => ({ x: x + (i % 2 ? (flip ? -5 : 5) : 0), y: (h * i) / 6 }));
      const poly = [...zig(0, false), ...zig(w, true).reverse()];
      p.lines.push({ pts: [...poly, poly[0]], color: s.color, width: 0, fill: s.color, fillAlpha: 0.72 });
      for (let x = 12; x < w - 6; x += 16) p.lines.push({ pts: [{ x, y: h - 2 }, { x: x + 10, y: 2 }], color: "#FFFFFF", width: 3, alpha: 0.28 });
      if (s.text) p.texts.push({ x: w / 2, y: h / 2 - 9, text: s.text, size: 14, color: onColor(s.color), bold: true, align: "center", font: "hand" });
    }
  },
  fields: (s, w, h) => (s.style === "emoji" ? [] : [{ key: "text", x: 12, y: h / 2 - 12, w: w - 24, h: 24, size: Math.min(18, h * 0.3), bold: true, color: onColor(s.color), bg: s.style === "stamp" ? "#FFFFFF" : s.color, align: "center", multiline: false }]),
  form: [
    { t: "select", key: "style", label: "Estilo", options: [["emoji", "Emoji recortado"], ["badge", "Selo"], ["stamp", "Carimbo"], ["tape", "Fita adesiva"]] },
    { t: "icon", key: "emoji", label: "Emoji", options: ["", "⭐", "❤️", "🔥", "✅", "❌", "💡", "📌", "🎯", "🚀", "👀", "🤔", "😀", "😎", "👍", "👎", "🎉", "📚", "✏️", "🧠", "⏰", "☕", "🌱", "💎", "🏆", "⚡", "🌈", "🍀"] },
    { t: "text", key: "text", label: "Texto" },
    { t: "number", key: "tilt", label: "Inclinação (°)", min: -45, max: 45, step: 1 },
  ],
  text: (s) => `${s.emoji} ${s.text}`.trim(),
  toContent: (s) => ({ title: s.text || s.emoji }),
  fromContent: (c, color) => ({ kind: "sticker", style: "badge", emoji: "", text: (c.title || contentItems(c)[0] || "OK").slice(0, 30), color, tilt: -4 }),
});

// ---------------- quadro aninhado (abre outra página do caderno) ----------------
export const board = defineBlock({
  kind: "board", label: "Quadro aninhado", hint: "Um quadro dentro do quadro: toque em Abrir para entrar", behavior: "relacional",
  make: () => ({ kind: "board", title: "Novo quadro", pageId: "", note: "", color: BLOCK_COLORS[2] }),
  size: () => ({ w: 260, h: 170 }),
  clean: (r, color) => ({ kind: "board", title: str(r.title).slice(0, 80), pageId: str(r.pageId).slice(0, 80), note: str(r.note).slice(0, 400), color }),
  draw(s, w, h, m, p) {
    p.rects.push({ x: 8, y: 8, w: w - 8, h: h - 8, r: 14, fill: mix(s.color, 0.72) });
    p.rects.push({ x: 4, y: 4, w: w - 8, h: h - 8, r: 14, fill: mix(s.color, 0.86) });
    cardBg(p, w - 8, h - 8, 14);
    // miniatura de "quadro": três cartõezinhos
    const gx = 16, gy = 16;
    p.rects.push({ x: gx, y: gy, w: 40, h: 28, r: 5, fill: mix(s.color, 0.6) });
    p.rects.push({ x: gx + 46, y: gy + 10, w: 30, h: 22, r: 5, fill: mix(s.color, 0.78) });
    p.lines.push({ pts: [{ x: gx + 40, y: gy + 14 }, { x: gx + 46, y: gy + 20 }], color: mix(s.color, -0.2), width: 1.5 });
    para(p, wrap(s.title || "Quadro", w - 40, 17, m, "sans", true).slice(0, 2), 16, 58, 17, INK, { bold: true });
    if (s.note && h > 130) para(p, wrap(s.note, w - 40, 12, m).slice(0, Math.max(0, linesFit(h - 130, 12))), 16, 102, 12, MUTED);
    p.rects.push({ x: w - 98, y: h - 46, w: 80, h: 28, r: 14, fill: s.color });
    p.texts.push({ x: w - 58, y: h - 40, text: s.pageId ? "Abrir ↗" : "Criar ↗", size: 13, color: onColor(s.color), bold: true, align: "center" });
    p.hits.push({ action: "board", index: 0, x: w - 104, y: h - 52, w: 92, h: 40 });
  },
  fields: (_s, w) => [{ key: "title", x: 16, y: 56, w: w - 40, h: 44, size: 17, bold: true, color: INK, bg: "#FFFFFF", multiline: false }],
  form: [{ t: "text", key: "title", label: "Nome do quadro" }, { t: "area", key: "note", label: "Descrição", rows: 3 }],
  text: (s) => `${s.title}\n${s.note}`,
  toContent: (s) => ({ title: s.title, text: s.note }),
  fromContent: (c, color) => ({ kind: "board", title: c.title || "Quadro", pageId: "", note: c.text ?? "", color }),
});

export const LAYOUTS = [profile, media, project, section, brace, sheet, sticker, board];
