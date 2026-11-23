// Bloco Página: um documento completo no estilo das Páginas do Hiraku Comic Manager (editor em blocos com "/", tabelas,
// planilha, toggles, subpáginas…). No quadro aparece como uma prévia; abre no editor de página (components/PageEditor).
import { defineBlock } from "../def";
import { BLOCK_COLORS, INK, LH, MUTED, SOFT, arr, linesFit, mix, para, str, wrap } from "../kit";
import { PBlock, numberOf, parsePage, plainText, sheetEval } from "../../pageMd";

export const page = defineBlock({
  kind: "page", label: "Página", hint: "Documento com editor em blocos (/, tabelas, toggles, subpáginas) — igual ao Hiraku Comic Manager", behavior: "estruturado",
  make: () => ({
    kind: "page", title: "Nova página", icon: "📄", color: BLOCK_COLORS[4], pages: [],
    md: "Digite **/** para inserir blocos: títulos, listas, tarefas, tabelas, planilhas com fórmulas, toggles, callouts, código…\n\n## Ideias\n- primeira ideia\n- [ ] uma tarefa\n\n> [!tip] 💡 Arraste os blocos pela alça ⋮⋮ para reorganizar.",
  }),
  size: () => ({ w: 340, h: 420 }),
  clean: (r, color) => ({
    kind: "page", title: str(r.title, "", 300), icon: str(r.icon, "", 16), md: str(r.md, "", 400000), color,
    pages: arr(r.pages, 400, (x) => { const p = x as Record<string, unknown>; return { id: str(p?.id, "", 40) || Math.random().toString(36).slice(2, 10), parentId: str(p?.parentId, "", 40), title: str(p?.title, "", 300), icon: str(p?.icon, "", 16), md: str(p?.md, "", 400000) }; }).filter((p) => p.id),
  }),
  draw(s, w, h, m, p) {
    p.rects.push({ x: 2, y: 4, w, h, r: 10, fill: INK, alpha: 0.12 }, { x: 0, y: 0, w, h, r: 10, fill: "#FFFFFF", stroke: "#DDE3EE", sw: 1 });
    p.rects.push({ x: 0, y: 0, w, h: 54, r: 10, fill: s.color }, { x: 0, y: 44, w, h: 10, r: 0, fill: s.color }, { x: w * 0.55, y: 0, w: w * 0.45, h: 54, r: 10, fill: mix(s.color, 0.3), alpha: 0.6 });
    const pad = 22;
    if (s.icon) p.texts.push({ x: pad, y: 32, text: s.icon, size: 32, color: INK });
    let y = s.icon ? 80 : 68;
    y += para(p, wrap(s.title || "Sem título", w - 2 * pad, 22, m, "serif", true), pad, y, 22, INK, { bold: true, font: "serif" }, 2) + 8;
    const B = parsePage(s.md);
    const bottom = h - 44;
    for (let i = 0; i < B.length && y < bottom; i++) {
      const b = B[i], ind = pad + b.ind * 16, tw = w - ind - pad, t = plainText(b.txt);
      const room = linesFit(bottom - y, 13);
      const head = (size: number) => { y += 4; y += para(p, wrap(t, tw, size, m, "serif", true), ind, y, size, INK, { bold: true, font: "serif" }, Math.min(2, room)) + 2; };
      switch (b.t) {
        case "h1": head(18); break;
        case "h2": head(16); break;
        case "h3": case "h4": head(14); break;
        case "bul": case "num": case "todo": {
          if (b.t === "bul") p.circles.push({ x: ind + 4, y: y + 8.5, r: 2.2, fill: SOFT });
          else if (b.t === "num") p.texts.push({ x: ind, y, text: numberOf(B, i) + ".", size: 13, color: SOFT });
          else { p.rects.push({ x: ind, y: y + 2, w: 12, h: 12, r: 3, fill: b.chk ? s.color : "#FFFFFF", stroke: b.chk ? s.color : "#B8C1D1", sw: 1.3 }); }
          y += para(p, wrap(t, tw - 18, 13, m), ind + 18, y, 13, b.chk ? MUTED : INK, { strike: !!b.chk }, Math.min(2, room)) + 2;
          break;
        }
        case "toggle": p.texts.push({ x: ind, y, text: b.open ? "▾" : "▸", size: 13, color: SOFT }); y += para(p, wrap(t, tw - 16, 13, m), ind + 16, y, 13, INK, { bold: true }, 1) + 2; break;
        case "quote": { const hh = para(p, wrap(t, tw - 14, 13, m), ind + 12, y, 13, SOFT, { italic: true }, Math.min(3, room)); p.rects.push({ x: ind, y, w: 3, h: hh, r: 1.5, fill: INK, alpha: 0.6 }); y += hh + 4; break; }
        case "callout": {
          const lines = wrap(t, tw - 34, 12, m).slice(0, Math.min(3, room)), hh = lines.length * 12 * LH + 12;
          p.rects.push({ x: ind, y, w: tw, h: hh, r: 6, fill: mix(s.color, 0.9) });
          p.texts.push({ x: ind + 8, y: y + 5, text: b.ico || "💡", size: 13, color: INK });
          para(p, lines, ind + 28, y + 6, 12, INK);
          y += hh + 6;
          break;
        }
        case "code": case "eq": {
          const lines = b.txt.split("\n").slice(0, Math.min(4, room)), hh = lines.length * 11 * LH + 12;
          p.rects.push({ x: ind, y, w: tw, h: hh, r: 6, fill: "#F2F4F8" });
          para(p, lines, ind + 8, y + 6, 11, INK, { font: "mono" });
          y += hh + 6;
          break;
        }
        case "tbl": case "sheet": {
          const R = (b.rows ?? []).slice(0, Math.min(5, room)), cols = Math.max(1, R[0]?.length ?? 1), cw = tw / cols, rh = 20;
          R.forEach((row, r) => {
            if (r === 0) p.rects.push({ x: ind, y, w: tw, h: rh, r: 3, fill: b.t === "sheet" ? "#EEF7F1" : "#F2F4F8" });
            row.forEach((_, c) => { const v = b.t === "sheet" ? sheetEval(b.rows!, r, c) : row[c]; p.texts.push({ x: ind + c * cw + 5, y: y + 4, text: wrap(v, cw - 8, 11, m)[0] ?? "", size: 11, color: INK, bold: r === 0 && b.t === "tbl" }); });
            p.lines.push({ pts: [{ x: ind, y: y + rh }, { x: ind + tw, y: y + rh }], color: "#E3E8F0", width: 1 });
            y += rh;
          });
          y += 6;
          break;
        }
        case "div": p.lines.push({ pts: [{ x: ind, y: y + 8 }, { x: ind + tw, y: y + 8 }], color: "#DDE3EE", width: 1 }); y += 16; break;
        case "subpg": {
          const sub = s.pages.find((x) => "np:" + x.id === b.txt);
          p.rects.push({ x: ind, y, w: tw, h: 24, r: 6, fill: "#FFFFFF", stroke: "#DDE3EE", sw: 1 });
          p.texts.push({ x: ind + 8, y: y + 5, text: `${sub?.icon || "▤"} ${sub?.title || "Subpágina"}`, size: 12, color: INK, bold: true });
          y += 30;
          break;
        }
        case "img": p.rects.push({ x: ind, y, w: tw, h: 40, r: 6, fill: "#F2F4F8" }); p.texts.push({ x: ind + tw / 2, y: y + 12, text: "🖼 imagem", size: 12, color: MUTED, align: "center" }); y += 46; break;
        case "toc": p.texts.push({ x: ind, y, text: "☰ Sumário", size: 12, color: SOFT, bold: true }); y += 18; break;
        default: if (!t.trim()) { y += 8; break; } y += para(p, wrap(t, tw, 13, m), ind, y, 13, "#33394A", {}, Math.min(4, room)) + 4;
      }
    }
    // rodapé: subpáginas + botão abrir
    p.rects.push({ x: 0, y: h - 40, w, h: 40, r: 0, fill: "#FFFFFF" }, { x: 0, y: h - 40, w, h: 1, r: 0, fill: "#E8ECF2" });
    const subs = s.pages.length;
    if (subs) p.texts.push({ x: pad, y: h - 28, text: `▤ ${subs} subpágina${subs > 1 ? "s" : ""}`, size: 12, color: SOFT });
    const bw = 104;
    p.rects.push({ x: w - bw - 12, y: h - 33, w: bw, h: 26, r: 13, fill: mix(s.color, 0.85) });
    p.texts.push({ x: w - bw / 2 - 12, y: h - 28, text: "Abrir página ↗", size: 12, color: mix(s.color, -0.45), bold: true, align: "center" });
    p.hits.push({ action: "open", index: 0, x: w - bw - 16, y: h - 38, w: bw + 8, h: 36 });
  },
  fields: (s, w, _h, m) => [{ key: "title", x: 22, y: s.icon ? 80 : 68, w: w - 44, h: Math.min(2, wrap(s.title || "M", w - 44, 22, m, "serif", true).length) * 22 * LH, size: 22, bold: true, font: "serif", color: INK, bg: "#FFFFFF", multiline: false, placeholder: "Sem título" }],
  form: [{ t: "text", key: "title", label: "Título" }, { t: "icon", key: "icon", label: "Ícone", options: ["", "📄", "📝", "📚", "💡", "🎯", "📌", "🧠", "🗺️", "✨", "🔥", "⭐", "📅", "🎨", "🎬", "🧪"] }],
  text: (s) => `${s.title}\n${plainText(s.md)}`,
  toContent(s) {
    const B: PBlock[] = parsePage(s.md);
    return { title: s.title, items: B.filter((b) => b.txt.trim() && !["code", "eq", "subpg", "img"].includes(b.t)).map((b) => ({ text: plainText(b.txt), done: b.t === "todo" ? !!b.chk : undefined })) };
  },
  fromContent: (c, color) => ({
    kind: "page", title: c.title ?? "Página", icon: "📄", color, pages: [],
    md: c.text ?? (c.items ?? []).map((i) => (i.done !== undefined ? `- [${i.done ? "x" : " "}] ${i.text}` : `- ${i.text}${i.sub ? `: ${i.sub}` : ""}`)).join("\n"),
  }),
});
