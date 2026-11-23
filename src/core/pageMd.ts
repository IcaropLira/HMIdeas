// Páginas no estilo do Hiraku Comic Manager: o conteúdo é MARKDOWN comum (o mesmo formato do Manager e do Obsidian), lido e
// escrito como uma lista de blocos. Puro e testável. Formato:
//   texto · # / ## / #### / ##### títulos · - lista · 1. numerada · - [ ] tarefa · <details><summary> toggle · > citação
//   > [!tip] 💡 callout · ``` código · $$ equação · | tabela | (<!--sheet--> antes = planilha com fórmulas) · [toc] · --- ·
//   ![[imagem]] · ▤ [[np:id]] subpágina
export type PBType =
  | "text" | "h1" | "h2" | "h3" | "h4" | "bul" | "num" | "todo" | "toggle" | "quote" | "callout" | "code" | "eq" | "tbl" | "sheet" | "toc" | "div" | "img" | "subpg";

export interface PBlock {
  t: PBType;
  txt: string;
  ind: number;
  chk?: boolean;
  open?: boolean;
  ico?: string;
  kind?: string;
  lang?: string;
  rows?: string[][];
}

const PICTO = /^(\p{Extended_Pictographic}️?)\s*(.*)$/u;

export function parsePage(md: string): PBlock[] {
  const L = md.replace(/\r/g, "").split("\n"), B: PBlock[] = [];
  let dep = 0, sheet = false;
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    let x: RegExpMatchArray | null;
    if (l.trim() === "<!--sheet-->") { sheet = true; continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(L[i + 1] ?? "")) {
      const sp = (r: string) => r.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
      const R = [sp(l)];
      i += 2;
      while (i < L.length && /^\s*\|.*\|\s*$/.test(L[i])) R.push(sp(L[i++]));
      i--;
      const W = Math.max(...R.map((r) => r.length));
      R.forEach((r) => { while (r.length < W) r.push(""); });
      B.push({ t: sheet ? "sheet" : "tbl", rows: R, txt: "", ind: dep });
      sheet = false;
      continue;
    }
    if (/^\[toc\]\s*$/i.test(l)) { B.push({ t: "toc", txt: "", ind: dep }); continue; }
    if ((x = l.match(/^```(.*)$/))) {
      const c: string[] = [];
      i++;
      while (i < L.length && !/^```\s*$/.test(L[i])) c.push(L[i++]);
      B.push({ t: "code", lang: x[1].trim(), txt: c.join("\n"), ind: dep });
      continue;
    }
    if (/^\$\$\s*$/.test(l)) {
      const c: string[] = [];
      i++;
      while (i < L.length && !/^\$\$\s*$/.test(L[i])) c.push(L[i++]);
      B.push({ t: "eq", txt: c.join("\n"), ind: dep });
      continue;
    }
    if ((x = l.match(/^<details( open)?><summary>(.*)<\/summary>\s*$/))) { B.push({ t: "toggle", txt: x[2], open: !!x[1], ind: dep }); dep++; continue; }
    if (/^<\/details>\s*$/.test(l)) { dep = Math.max(0, dep - 1); continue; }
    const sp = l.match(/^( *)/)![1].length >> 1;
    if ((x = l.match(/^ *- \[( |x)\] (.*)$/i))) B.push({ t: "todo", chk: x[1] !== " ", txt: x[2], ind: dep + sp });
    else if ((x = l.match(/^ *[-*] (.*)$/))) B.push({ t: "bul", txt: x[1], ind: dep + sp });
    else if ((x = l.match(/^ *\d+\. (.*)$/))) B.push({ t: "num", txt: x[1], ind: dep + sp });
    else if ((x = l.match(/^# (.*)$/))) B.push({ t: "h1", txt: x[1], ind: dep });
    else if ((x = l.match(/^## (.*)$/))) B.push({ t: "h2", txt: x[1], ind: dep });
    else if ((x = l.match(/^#{3,4} (.*)$/))) B.push({ t: "h3", txt: x[1], ind: dep });
    else if ((x = l.match(/^#{5,6} (.*)$/))) B.push({ t: "h4", txt: x[1], ind: dep });
    else if ((x = l.match(/^> \[!(\w+)\][ ]?(.*)$/))) {
      const e = x[2].match(PICTO);
      B.push({ t: "callout", kind: x[1], ico: e ? e[1] : "💡", txt: e ? e[2] : x[2], ind: dep });
    } else if ((x = l.match(/^> (.*)$/))) B.push({ t: "quote", txt: x[1], ind: dep });
    else if (/^(---+|\*\*\*+)\s*$/.test(l)) B.push({ t: "div", txt: "", ind: dep });
    else if ((x = l.match(/^▤ \[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/))) B.push({ t: "subpg", txt: x[1].trim(), ind: dep });
    else if ((x = l.match(/^!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/))) B.push({ t: "img", txt: x[1].trim(), ind: dep });
    else if ((x = l.match(/^!\[[^\]]*\]\((data:image\/[^)]+|https?:[^)]+)\)\s*$/))) B.push({ t: "img", txt: x[1], ind: dep });
    else B.push({ t: "text", txt: l, ind: dep });
  }
  return B;
}

export function numberOf(B: PBlock[], i: number): number {
  let n = 1;
  for (let j = i - 1; j >= 0; j--) {
    if (B[j].ind > B[i].ind) continue;
    if (B[j].ind === B[i].ind && B[j].t === "num") n++;
    else break;
  }
  return n;
}

export function tableMd(rows: string[][]): string {
  const R = rows.length ? rows : [["Coluna 1", "Coluna 2"], ["", ""]];
  const e = (r: string[]) => "| " + r.map((c) => String(c).replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ") + " |";
  return [e(R[0]), "| " + R[0].map(() => "---").join(" | ") + " |", ...R.slice(1).map(e)].join("\n");
}

export function serializePage(B: PBlock[]): string {
  const o: string[] = [], st: number[] = [];
  B.forEach((b, i) => {
    while (st.length && b.ind <= st[st.length - 1]) { st.pop(); o.push("</details>"); }
    const sp = "  ".repeat(Math.max(0, b.ind - st.length)), t = b.txt || "";
    const line: Record<PBType, () => string> = {
      text: () => t, h1: () => "# " + t, h2: () => "## " + t, h3: () => "#### " + t, h4: () => "##### " + t,
      tbl: () => tableMd(b.rows ?? []), sheet: () => "<!--sheet-->\n" + tableMd(b.rows ?? []), toc: () => "[toc]",
      bul: () => sp + "- " + t, num: () => sp + numberOf(B, i) + ". " + t, todo: () => sp + "- [" + (b.chk ? "x" : " ") + "] " + t,
      quote: () => "> " + t, callout: () => "> [!" + (b.kind || "note") + "] " + (b.kind === "pull" ? "" : (b.ico || "💡")) + " " + t,
      code: () => "```" + (b.lang || "") + "\n" + t + "\n```", eq: () => "$$\n" + t + "\n$$", div: () => "---",
      img: () => (/^(data:|https?:)/.test(t) ? `![](${t})` : "![[" + t + "]]"), subpg: () => "▤ [[" + t + "]]",
      toggle: () => `<details${b.open ? " open" : ""}><summary>${t}</summary>`,
    };
    o.push(line[b.t]());
    if (b.t === "toggle") st.push(b.ind);
  });
  while (st.length) { st.pop(); o.push("</details>"); }
  return o.join("\n");
}

/** Texto sem marcação (contagem de palavras, prévia, busca). */
export const plainText = (s: string) => s.replace(/<[^>]*>/g, "").replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a).replace(/\*\*|~~|`|\*/g, "");

// ---------------- planilha: fórmulas sem eval ----------------
// =SOMA(A1:A3) · =MÉDIA(B1:B4) · =MIN/MAX/CONT · =A1*2+B3 · ^ potência. Erros viram "#ERRO"; ciclos param em 20 níveis.
export const colName = (i: number) => String.fromCharCode(65 + i);
export function sheetEval(R: string[][], r: number, c: number, depth = 0): string {
  const raw = String((R[r] ?? [])[c] ?? "").trim();
  if (raw[0] !== "=") return raw;
  if (depth > 20) return "#ERRO";
  const toNum = (row: number, col: number) => { const s = sheetEval(R, row, col, depth + 1); if (s === "#ERRO") throw new Error("ref"); const v = parseFloat(s.replace(",", ".")); return Number.isFinite(v) ? v : 0; };
  const src = raw.slice(1).toUpperCase().replace(/MÉDIA|MEDIA/g, "AVG").replace(/SOMA/g, "SUM").replace(/CONT(AR)?\b|CONT\./g, "COUNT").replace(/,(?=\d)/g, ".").replace(/;/g, ",");
  let k = 0;
  const peek = () => src[k], skip = () => { while (src[k] === " ") k++; };
  const fail = () => { throw new Error("x"); };
  const ref = (): [number, number] | null => { const m = src.slice(k).match(/^([A-Z])(\d+)/); if (!m) return null; k += m[0].length; return [+m[2] - 1, m[1].charCodeAt(0) - 65]; };
  function list(): number[] {
    const out: number[] = [];
    skip();
    if (peek() === ")") return out;
    for (;;) {
      skip();
      const save = k, a = ref();
      if (a && src[k] === ":") { k++; const b = ref() ?? fail()!; for (let y = Math.min(a[0], b[0]); y <= Math.max(a[0], b[0]); y++) for (let x = Math.min(a[1], b[1]); x <= Math.max(a[1], b[1]); x++) out.push(toNum(y, x)); }
      else { k = save; out.push(expr()); }
      skip();
      if (peek() === ",") { k++; continue; }
      return out;
    }
  }
  function atom(): number {
    skip();
    if (peek() === "(") { k++; const v = expr(); skip(); if (peek() !== ")") fail(); k++; return v; }
    if (peek() === "-") { k++; return -atom(); }
    if (peek() === "+") { k++; return atom(); }
    const fn = src.slice(k).match(/^(SUM|AVG|MIN|MAX|COUNT)\(/);
    if (fn) {
      k += fn[0].length;
      const a = list();
      skip();
      if (peek() !== ")") fail();
      k++;
      const f = fn[1];
      return f === "SUM" ? a.reduce((p, q) => p + q, 0) : f === "AVG" ? (a.length ? a.reduce((p, q) => p + q, 0) / a.length : 0) : f === "MIN" ? Math.min(...a) : f === "MAX" ? Math.max(...a) : a.length;
    }
    const r0 = ref();
    if (r0) return toNum(r0[0], r0[1]);
    const n = src.slice(k).match(/^\d+(\.\d+)?/);
    if (!n) fail();
    k += n![0].length;
    return parseFloat(n![0]);
  }
  function pow(): number { const b = atom(); skip(); if (peek() === "^") { k++; return Math.pow(b, pow()); } return b; }
  function term(): number { let v = pow(); for (;;) { skip(); const o = peek(); if (o !== "*" && o !== "/") return v; k++; const r = pow(); v = o === "*" ? v * r : v / r; } }
  function expr(): number { let v = term(); for (;;) { skip(); const o = peek(); if (o !== "+" && o !== "-") return v; k++; const r = term(); v = o === "+" ? v + r : v - r; } }
  try {
    const v = expr();
    skip();
    if (k < src.length) return "#ERRO";
    return Number.isFinite(v) ? String(Math.round(v * 1e4) / 1e4) : "#ERRO";
  } catch {
    return "#ERRO";
  }
}

/** Tipos de bloco do editor, com ícone, nome e grupo (menu "/" e "Transformar em"). */
export const PAGE_TYPES: { id: string; ic: string; label: string; group: string; alias?: string }[] = [
  { id: "text", ic: "¶", label: "Texto", group: "Básico" },
  { id: "h1", ic: "H1", label: "Título 1", group: "Básico", alias: "heading titulo" },
  { id: "h2", ic: "H2", label: "Título 2", group: "Básico", alias: "heading titulo" },
  { id: "h3", ic: "H3", label: "Título 3", group: "Básico", alias: "heading titulo" },
  { id: "h4", ic: "H4", label: "Título 4", group: "Básico", alias: "heading titulo" },
  { id: "bul", ic: "•", label: "Lista com marcadores", group: "Listas", alias: "bullet" },
  { id: "num", ic: "1.", label: "Lista numerada", group: "Listas", alias: "numbered" },
  { id: "todo", ic: "☑", label: "Lista de tarefas", group: "Listas", alias: "checklist checkbox" },
  { id: "toggle", ic: "▸", label: "Toggle", group: "Listas", alias: "recolher expandir" },
  { id: "quote", ic: "❝", label: "Citação", group: "Destaque" },
  { id: "callout", ic: "💡", label: "Callout", group: "Destaque", alias: "destaque aviso" },
  { id: "info", ic: "ℹ️", label: "Callout: informação", group: "Destaque", alias: "informacao" },
  { id: "tip", ic: "💡", label: "Callout: dica", group: "Destaque", alias: "dica ideia" },
  { id: "warn", ic: "⚠️", label: "Callout: aviso", group: "Destaque", alias: "aviso atencao cuidado" },
  { id: "danger", ic: "⛔", label: "Callout: perigo", group: "Destaque", alias: "perigo erro alerta" },
  { id: "ok", ic: "✅", label: "Callout: sucesso", group: "Destaque", alias: "sucesso certo" },
  { id: "pull", ic: "❞", label: "Frase de destaque", group: "Destaque", alias: "pullquote" },
  { id: "tbl", ic: "▦", label: "Tabela", group: "Dados e código", alias: "table grade" },
  { id: "sheet", ic: "▤", label: "Planilha com fórmulas", group: "Dados e código", alias: "excel spreadsheet soma" },
  { id: "toc", ic: "☰", label: "Sumário", group: "Dados e código", alias: "indice contents" },
  { id: "code", ic: "</>", label: "Código", group: "Dados e código" },
  { id: "eq", ic: "∑", label: "Equação", group: "Dados e código", alias: "math formula" },
  { id: "div", ic: "―", label: "Divisor", group: "Outros", alias: "linha separador" },
  { id: "img", ic: "🖼", label: "Imagem", group: "Outros", alias: "foto figura" },
  { id: "subpg", ic: "▤", label: "Subpágina", group: "Outros", alias: "page pagina" },
];
export const CALLOUT_KINDS: Record<string, [string, string]> = { info: ["ℹ️", "info"], tip: ["💡", "tip"], warn: ["⚠️", "warning"], danger: ["⛔", "danger"], ok: ["✅", "success"], pull: ["", "pull"] };
/** Atalhos de Markdown digitados no começo de um bloco de texto. */
export const MD_SHORTCUTS: [RegExp, PBType][] = [[/^#\s$/, "h1"], [/^##\s$/, "h2"], [/^###\s$/, "h3"], [/^[-*]\s$/, "bul"], [/^1\.\s$/, "num"], [/^\[\]\s$/, "todo"], [/^>\s$/, "quote"], [/^```$/, "code"]];
