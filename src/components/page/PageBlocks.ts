// Editor de blocos das Páginas (porte do editor do Hiraku Comic Manager, reescrito em TypeScript e sem estado global).
// DOM puro com contenteditable: cada bloco é uma linha `.nb` com alça ⋮⋮, prefixo (•, 1., ☑, ▸…) e o texto `.ed`.
// "/" abre o menu de blocos, "@" menciona páginas e datas, selecionar texto mostra a barra de formatação, a alça abre o
// menu do bloco (transformar, cores, mover, duplicar…), arrastar a alça reordena. O conteúdo é sempre Markdown.
import { CALLOUT_KINDS, MD_SHORTCUTS, PAGE_TYPES, PBType, PBlock, colName, numberOf, parsePage, plainText, serializePage, sheetEval } from "../../core/pageMd";
import { prettyMath } from "../../core/blocks";

export interface PageHost {
  onChange(md: string): void;
  /** abre uma subpágina (np:id) */
  openSub(id: string): void;
  /** cria subpágina e devolve o id */
  makeSub(title: string): string;
  subInfo(id: string): { title: string; icon: string; n: number } | null;
  /** páginas para mencionar com @ */
  pages(): { id: string; title: string; icon: string }[];
  pickImage(): Promise<string | null>;
  toast(msg: string): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const COLORS: [string, string][] = [["Cinza", "#9b9a97"], ["Marrom", "#a1887f"], ["Laranja", "#d9a05b"], ["Amarelo", "#c9b458"], ["Verde", "#6f9a88"], ["Azul", "#6f93ae"], ["Roxo", "#8a7fb5"], ["Rosa", "#c487a5"], ["Vermelho", "#b0605c"]];
const ICONS = ["💡", "⚠️", "📌", "❗", "✅", "📝", "🔥", "ℹ️", "⛔", "🎯"];
const GROUPS = ["Básico", "Listas", "Destaque", "Dados e código", "Outros"];

const safeSpan = (t: string) => {
  const m = t.match(/^<span style="([^"]*)">$/);
  if (!m) return t;
  const ok = m[1].split(";").map((p) => p.trim()).filter((p) => /^(color|background-color)\s*:\s*[#\w(),.\s%]+$/i.test(p));
  return ok.length ? `<span style="${ok.join(";")}">` : "<span>";
};
/** Markdown de linha → HTML seguro. */
export function m2h(s: string): string {
  const keep: string[] = [];
  let x = String(s).replace(/<\/?u>|<span style="[^"]*">|<\/span>/g, (m) => { keep.push(m); return "\u0001" + (keep.length - 1) + "\u0002"; });
  x = esc(x).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<i>$2</i>").replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => `<span class="wl" contenteditable="false" data-l="${a}">${b || a}</span>`);
  return x.replace(/\u0001(\d+)\u0002/g, (_m, i) => safeSpan(keep[+i]));
}
/** HTML editado → Markdown de linha. */
export function h2m(n: Node): string {
  let s = "";
  n.childNodes.forEach((c) => {
    if (c.nodeType === 3) s += (c as Text).data.replace(/​/g, "");
    else if (c.nodeType === 1) {
      const e = c as HTMLElement, t = e.tagName, x = h2m(e);
      if (e.classList.contains("wl")) s += `[[${e.dataset.l}${e.textContent !== e.dataset.l ? "|" + e.textContent : ""}]]`;
      else if (t === "B" || t === "STRONG") s += x ? `**${x}**` : "";
      else if (t === "I" || t === "EM") s += x ? `*${x}*` : "";
      else if (t === "U") s += x ? `<u>${x}</u>` : "";
      else if (t === "S" || t === "STRIKE" || t === "DEL") s += x ? `~~${x}~~` : "";
      else if (t === "CODE") s += e.textContent ? "`" + e.textContent + "`" : "";
      else if (t === "BR") s += "";
      else if ((e.style.color || e.style.backgroundColor) && x) s += `<span style="${e.style.color ? `color:${e.style.color};` : ""}${e.style.backgroundColor ? `background-color:${e.style.backgroundColor};` : ""}">${x}</span>`;
      else s += x;
    }
  });
  return s;
}

type MenuItem = { ic: string; l: string; fn: () => void };

export class PageBlocks {
  B: PBlock[];
  private menu: HTMLDivElement;
  private bar: HTMLDivElement;
  private menuItems: MenuItem[] = [];
  private menuSel = 0;
  private menuKind: "slash" | "at" | "turn" | "raw" | null = null;
  private ctxIndex = -1;
  private drag: number | null = null;
  private focusTd: HTMLElement | null = null;
  private off: (() => void)[] = [];

  constructor(private root: HTMLElement, md: string, private host: PageHost) {
    this.B = parsePage(md);
    this.ensureTail();
    this.menu = document.createElement("div");
    this.menu.className = "pe-menu";
    this.menu.hidden = true;
    this.bar = document.createElement("div");
    this.bar.className = "pe-bar";
    this.bar.hidden = true;
    this.bar.innerHTML = `<button data-bf="turn">Texto ▾</button><button data-bf="bold"><b>B</b></button><button data-bf="italic"><i>I</i></button><button data-bf="underline"><u>U</u></button><button data-bf="strikeThrough"><s>S</s></button><button data-bf="code">&lt;/&gt;</button><button data-bf="color">A ▾</button>`;
    document.body.append(this.menu, this.bar);
    root.classList.add("pe");
    this.listen();
    this.render();
  }

  destroy() {
    this.off.forEach((f) => f());
    this.menu.remove();
    this.bar.remove();
    this.root.innerHTML = "";
  }

  /** Troca o conteúdo (outra página/subpágina). */
  load(md: string) {
    this.B = parsePage(md);
    this.ensureTail();
    this.hideMenu();
    this.render();
  }

  focusStart() { this.focus(0, false); }

  // ---------------- render ----------------
  private ensureTail() {
    if (!this.B.length) this.B.push({ t: "text", txt: "", ind: 0 });
    const last = this.B[this.B.length - 1];
    if (["subpg", "tbl", "sheet", "img", "toc", "div", "code", "eq"].includes(last.t)) this.B.push({ t: "text", txt: "", ind: 0 });
  }

  render() {
    const B = this.B;
    let hide: number | null = null;
    this.root.innerHTML = B.map((b, i) => {
      if (hide !== null) { if (b.ind > hide) return ""; hide = null; }
      if (b.t === "toggle" && !b.open) hide = b.ind;
      const pre: Partial<Record<PBType, string>> = {
        bul: "•", num: numberOf(B, i) + ".", todo: `<input type="checkbox" class="ck2" ${b.chk ? "checked" : ""} aria-label="Concluída">`,
        toggle: `<span class="tg2" role="button" aria-label="${b.open ? "Recolher" : "Expandir"}">${b.open ? "▾" : "▸"}</span>`,
        callout: `<span class="ci" role="button" title="Trocar ícone">${b.ico || "💡"}</span>`,
      };
      const plain = b.t === "code" || b.t === "eq";
      const ph = b.t === "text" ? "Digite '/' para blocos ou '@' para mencionar" : /^h\d$/.test(b.t) ? "Título" : "Digite…";
      let body: string;
      if (b.t === "tbl" || b.t === "sheet") body = this.tableHtml(b);
      else if (b.t === "toc") body = this.tocHtml();
      else if (b.t === "subpg") body = this.subHtml(b);
      else if (b.t === "div") body = "<hr>";
      else if (b.t === "img") body = /^(data:|https?:)/.test(b.txt) ? `<img class="bi" src="${esc(b.txt)}" alt="">` : `<div class="pe-missing">🖼 ${esc(b.txt)} — imagem do Vault (abra no Hiraku Comic Manager)</div>`;
      else body = `<div class="ed${plain ? " pl" : ""}" contenteditable="true" data-ph="${ph}" spellcheck="${!plain}">${plain ? esc(b.txt) : m2h(b.txt)}</div>`;
      if (b.t === "eq" && b.txt.trim()) body += `<div class="eqv">${esc(b.txt.split("\n").map(prettyMath).join("\n"))}</div>`;
      if (b.t === "code") body = `<div class="cbw">${b.lang ? `<span class="lang">${esc(b.lang)}</span>` : ""}${body}</div>`;
      return `<div class="nb t-${b.t}${b.t === "callout" && b.kind ? " k-" + b.kind : ""}" data-i="${i}" style="margin-left:${b.ind * 24}px"><span class="hd" draggable="true" title="Arraste para mover; clique para o menu">⋮⋮</span><span class="pre">${pre[b.t] ?? ""}</span>${body}</div>`;
    }).join("");
  }

  private tableHtml(b: PBlock): string {
    const sh = b.t === "sheet";
    const R = b.rows ?? (b.rows = [["Coluna 1", "Coluna 2"], ["", ""]]);
    return `<div class="tbw${sh ? " sheet" : ""}"><table>${sh ? `<thead><tr><th></th>${R[0].map((_, c) => `<th>${colName(c)}</th>`).join("")}</tr></thead>` : ""}<tbody>${R.map((r, ri) => `<tr>${sh ? `<th>${ri + 1}</th>` : ""}${r.map((v, ci) => `<td contenteditable="true" data-r="${ri}" data-c="${ci}" data-raw="${esc(v)}">${esc(sh ? sheetEval(R, ri, ci) : v)}</td>`).join("")}</tr>`).join("")}</tbody></table><div class="tb-act"><button type="button" data-tb="addr">＋ Linha</button><button type="button" data-tb="addc">＋ Coluna</button><button type="button" data-tb="delr">− Linha</button><button type="button" data-tb="delc">− Coluna</button>${sh ? '<span class="tb-hint">=SOMA(A1:A3) · =MÉDIA · =MIN · =MAX · =A1*2</span>' : ""}</div></div>`;
  }
  private tocHtml(): string {
    const h = this.B.map((x, i) => [x, i] as const).filter(([x]) => /^h[1-4]$/.test(x.t));
    return `<div class="toc"><b>Sumário</b>${h.length ? h.map(([x, i]) => `<a data-ti="${i}" style="margin-left:${(+x.t[1] - 1) * 14}px">${esc(plainText(x.txt) || "Sem título")}</a>`).join("") : '<div class="mut">Adicione títulos para montar o sumário.</div>'}</div>`;
  }
  private subHtml(b: PBlock): string {
    const id = b.txt.startsWith("np:") ? b.txt.slice(3) : "";
    const k = id ? this.host.subInfo(id) : null;
    return `<span class="sp${k ? "" : " bad"}" contenteditable="false" data-sp="${esc(id)}">${k?.icon || "▤"} <b>${esc(k ? k.title || "Sem título" : b.txt.startsWith("np:") ? "Página removida" : b.txt)}</b>${k?.n ? `<small>· ${k.n} subpágina${k.n > 1 ? "s" : ""}</small>` : ""}${k ? "" : `<small>· ${b.txt.startsWith("np:") ? "removida" : "do Vault"}</small>`}</span>`;
  }

  private sync() { this.host.onChange(serializePage(this.B)); }
  private edAt(i: number) { return this.root.querySelector<HTMLElement>(`.nb[data-i="${i}"] .ed`); }
  focus(i: number, end = true) {
    const ed = this.edAt(i);
    if (!ed) return;
    ed.focus();
    const r = document.createRange();
    r.selectNodeContents(ed);
    r.collapse(!end);
    const s = getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
  }
  private idxOf(node: Element): number { return +(node.closest(".nb") as HTMLElement).dataset.i!; }
  private caretPos(ed: HTMLElement): number {
    const s = getSelection();
    if (!s || !s.rangeCount || !s.anchorNode) return -1;
    const r = s.getRangeAt(0).cloneRange();
    r.selectNodeContents(ed);
    r.setEnd(s.anchorNode, s.anchorOffset);
    return r.toString().length;
  }

  // ---------------- edição ----------------
  private onInput(ed: HTMLElement) {
    const i = this.idxOf(ed), b = this.B[i];
    if (b.t === "code" || b.t === "eq") { b.txt = ed.innerText.replace(/\n$/, ""); this.sync(); return; }
    const tx = (ed.textContent ?? "").replace(/​/g, "");
    if (b.t === "text") {
      const h = MD_SHORTCUTS.find(([r]) => r.test(tx));
      if (h) { b.t = h[1]; b.txt = ""; if (h[1] === "todo") b.chk = false; this.render(); this.sync(); this.focus(i); return; }
    }
    this.inlineMd();
    b.txt = h2m(ed);
    this.sync();
    const sl = b.t === "text" && tx.match(/^\/(\S*)$/);
    if (sl) {
      const q = sl[1].toLowerCase();
      const items = PAGE_TYPES.filter((x) => (x.label + x.id + (x.alias ?? "")).toLowerCase().includes(q)).map((x) => ({ ic: x.ic, l: x.label, fn: () => this.turn(i, x.id, true) }));
      if ("cores color".includes(q) || !q) items.push({ ic: "A", l: "Cores de texto e destaque", fn: () => { this.turn(i, "text", true); const r = this.edAt(i)!.getBoundingClientRect(); this.raw(r.left, r.bottom + 4, this.swatches("fg") + this.swatches("bg"), i); } });
      if (items.length) { this.show(ed.getBoundingClientRect(), items, "slash"); return; }
    }
    const s = getSelection();
    if (s && s.rangeCount && s.anchorNode && s.anchorNode.nodeType === 3) {
      const before = (s.anchorNode as Text).data.slice(0, s.anchorOffset), m = before.match(/@([^\s@]*)$/);
      if (m) {
        const q = m[1].toLowerCase();
        const items: MenuItem[] = this.host.pages().filter((p) => (p.title || "sem título").toLowerCase().includes(q)).slice(0, 8)
          .map((p) => ({ ic: p.icon || "▤", l: p.title || "Sem título", fn: () => this.insertAt(m[0], `<span class="wl" contenteditable="false" data-l="np:${esc(p.id)}">${esc(p.title || "Sem título")}</span>&#8203;`) }));
        for (const [l, d] of [["Hoje", 0], ["Amanhã", 1], ["Ontem", -1]] as const) if (!q || l.toLowerCase().startsWith(q)) items.push({ ic: "📅", l, fn: () => this.insertAt(m[0], new Date(Date.now() + d * 864e5).toLocaleDateString("pt-BR") + " ") });
        if (items.length) { this.show(s.getRangeAt(0).getBoundingClientRect(), items, "at"); return; }
      }
    }
    if (this.menuKind === "slash" || this.menuKind === "at") this.hideMenu();
  }

  private inlineMd() {
    const s = getSelection();
    if (!s || !s.rangeCount || !s.isCollapsed) return;
    const n = s.anchorNode;
    if (!n || n.nodeType !== 3) return;
    const t = (n as Text).data.slice(0, s.anchorOffset);
    for (const [r, tag] of [[/\*\*([^*]+)\*\*$/, "b"], [/~~([^~]+)~~$/, "s"], [/`([^`]+)`$/, "code"], [/(?:^|[^*])\*([^*]+)\*$/, "i"]] as const) {
      const m = t.match(r);
      if (!m) continue;
      const full = tag === "i" ? "*" + m[1] + "*" : m[0];
      const rg = document.createRange();
      rg.setStart(n, s.anchorOffset - full.length);
      rg.setEnd(n, s.anchorOffset);
      s.removeAllRanges();
      s.addRange(rg);
      document.execCommand("insertHTML", false, `<${tag}>${esc(m[1])}</${tag}>&#8203;`);
      return;
    }
  }

  private insertAt(typed: string, html: string) {
    const s = getSelection()!, n = s.anchorNode!, o = s.anchorOffset, r = document.createRange();
    r.setStart(n, o - typed.length);
    r.setEnd(n, o);
    s.removeAllRanges();
    s.addRange(r);
    document.execCommand("insertHTML", false, html);
    const a = document.activeElement as HTMLElement | null;
    const ed = a?.closest?.(".ed") as HTMLElement | null;
    if (ed && this.root.contains(ed)) this.onInput(ed);
  }

  turn(i: number, t: string, clear = false) {
    const b = this.B[i];
    this.hideMenu();
    if (clear) b.txt = "";
    if (CALLOUT_KINDS[t]) { b.t = "callout"; b.kind = CALLOUT_KINDS[t][1]; b.ico = CALLOUT_KINDS[t][0]; }
    else if (t === "tbl" || t === "sheet") { b.t = t; b.txt = ""; b.rows = b.rows ?? (t === "sheet" ? [["", "", ""], ["", "", ""], ["", "", ""], ["", "", ""]] : [["Coluna 1", "Coluna 2", "Coluna 3"], ["", "", ""], ["", "", ""]]); }
    else if (t === "toc") { b.t = "toc"; b.txt = ""; }
    else if (t === "subpg") { const id = this.host.makeSub(plainText(b.txt)); b.t = "subpg"; b.txt = "np:" + id; this.ensureTail(); this.render(); this.sync(); this.host.openSub(id); return; }
    else if (t === "img") {
      void this.host.pickImage().then((url) => {
        if (!url) return;
        const nb: PBlock = { t: "img", txt: url, ind: b.ind };
        if (b.t === "text" && !b.txt) this.B.splice(i, 1, nb); else this.B.splice(i + 1, 0, nb);
        this.ensureTail(); this.render(); this.sync();
      });
      return;
    } else if (t === "div") { b.t = "div"; b.txt = ""; this.B.splice(i + 1, 0, { t: "text", txt: "", ind: b.ind }); this.render(); this.sync(); this.focus(i + 1); return; }
    else {
      b.t = t as PBType;
      if (t === "callout") { b.ico = b.ico || "💡"; b.kind = b.kind || "note"; }
      if (t === "toggle") b.open = true;
      if (t === "todo") b.chk = !!b.chk;
    }
    this.ensureTail();
    this.render();
    this.sync();
    if (b.t === "tbl" || b.t === "sheet") this.root.querySelector<HTMLElement>(`.nb[data-i="${i}"] td`)?.focus();
    else this.focus(i, true);
  }

  private split(i: number, ed: HTMLElement) {
    const b = this.B[i], s = getSelection()!;
    if (!s.isCollapsed) document.execCommand("delete");
    const r = s.getRangeAt(0), tail = r.cloneRange();
    tail.selectNodeContents(ed);
    tail.setStart(r.endContainer, r.endOffset);
    const d = document.createElement("div");
    d.appendChild(tail.extractContents());
    const rest = h2m(d);
    b.txt = h2m(ed);
    if (!b.txt && !rest && ["bul", "num", "todo", "quote", "callout"].includes(b.t)) { b.t = "text"; this.render(); this.sync(); this.focus(i); return; }
    const nt: PBType = b.t === "bul" || b.t === "num" || b.t === "todo" ? b.t : "text";
    const nb: PBlock = { t: nt, txt: rest, ind: b.t === "toggle" && b.open ? b.ind + 1 : b.ind };
    if (nt === "todo") nb.chk = false;
    this.B.splice(i + 1, 0, nb);
    this.render();
    this.sync();
    this.focus(i + 1, false);
  }

  private onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    // tabela: Enter desce
    const td = t.closest?.(".tbw td") as HTMLElement | null;
    if (td && e.key === "Enter") {
      e.preventDefault();
      const n = td.closest("table")!.querySelector<HTMLElement>(`td[data-r="${+td.dataset.r! + (e.shiftKey ? -1 : 1)}"][data-c="${td.dataset.c}"]`);
      n?.focus();
      return;
    }
    const ed = t.closest?.(".ed") as HTMLElement | null;
    if (!ed || !this.root.contains(ed)) return;
    const i = this.idxOf(ed), b = this.B[i], n = this.menu.hidden ? 0 : this.menuItems.length;
    if (n && ["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(e.key)) {
      e.preventDefault();
      if (e.key === "Escape") return this.hideMenu();
      if (e.key === "ArrowDown") this.menuSel = (this.menuSel + 1) % n;
      else if (e.key === "ArrowUp") this.menuSel = (this.menuSel + n - 1) % n;
      else { const it = this.menuItems[this.menuSel]; this.hideMenu(); it.fn(); return; }
      this.drawMenu();
      return;
    }
    const mod = e.ctrlKey || e.metaKey, code = b.t === "code" || b.t === "eq";
    const s = getSelection()!, pos = s.isCollapsed ? this.caretPos(ed) : -1;
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "d") { e.preventDefault(); this.B.splice(i + 1, 0, { ...b }); this.render(); this.sync(); this.focus(i + 1); return; }
    if (e.altKey && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const j = i + (e.key === "ArrowUp" ? -1 : 1);
      if (j < 0 || j >= this.B.length) return;
      e.preventDefault();
      [this.B[i], this.B[j]] = [this.B[j], this.B[i]];
      this.render(); this.sync(); this.focus(j);
      return;
    }
    if (mod && e.key === "/") { e.preventDefault(); const r = ed.getBoundingClientRect(); this.blockMenu(r.left, r.bottom + 4, i); return; }
    if (mod && ["b", "i", "u"].includes(e.key.toLowerCase())) { e.preventDefault(); this.exec({ b: "bold", i: "italic", u: "underline" }[e.key.toLowerCase()]!); return; }
    if (e.key === "Enter" && code && mod) { e.preventDefault(); this.B.splice(i + 1, 0, { t: "text", txt: "", ind: b.ind }); this.render(); this.sync(); this.focus(i + 1); return; }
    if (e.key === "Enter" && !e.shiftKey && !code) { e.preventDefault(); this.split(i, ed); return; }
    if (e.key === "Tab") { e.preventDefault(); b.ind = Math.max(0, Math.min(6, b.ind + (e.shiftKey ? -1 : 1))); this.render(); this.sync(); this.focus(i); return; }
    if (e.key === "Backspace" && pos === 0) {
      e.preventDefault();
      if (b.t !== "text") { b.t = "text"; this.render(); this.sync(); this.focus(i, false); return; }
      if (b.ind > 0) { b.ind--; this.render(); this.sync(); this.focus(i, false); return; }
      if (i > 0) {
        const p = this.B[i - 1];
        if (["code", "eq", "subpg", "tbl", "sheet", "toc"].includes(p.t)) return;
        if (p.t === "div" || p.t === "img") { this.B.splice(i - 1, 1); this.render(); this.sync(); this.focus(i - 1, false); return; }
        p.txt = p.txt + "⁣" + b.txt;
        this.B.splice(i, 1);
        this.render();
        const e2 = this.edAt(i - 1)!, w = document.createTreeWalker(e2, NodeFilter.SHOW_TEXT);
        let tn: Node | null;
        while ((tn = w.nextNode())) {
          const k = (tn as Text).data.indexOf("⁣");
          if (k >= 0) { (tn as Text).data = (tn as Text).data.replace("⁣", ""); e2.focus(); const r = document.createRange(); r.setStart(tn, k); r.collapse(true); s.removeAllRanges(); s.addRange(r); break; }
        }
        p.txt = h2m(e2);
        this.sync();
      }
      return;
    }
    const jump = (dir: "previousElementSibling" | "nextElementSibling") => {
      let q = ed.closest(".nb")![dir] as HTMLElement | null;
      while (q && !q.querySelector(".ed")) q = q[dir] as HTMLElement | null;
      if (!q) return;
      e.preventDefault();
      const t2 = q.querySelector<HTMLElement>(".ed")!;
      t2.focus();
      const r = document.createRange();
      r.selectNodeContents(t2);
      r.collapse(dir === "nextElementSibling");
      s.removeAllRanges();
      s.addRange(r);
    };
    if (e.key === "ArrowUp" && pos === 0) jump("previousElementSibling");
    if (e.key === "ArrowDown" && pos === (ed.textContent ?? "").length && pos >= 0) jump("nextElementSibling");
  }

  private exec(c: string, v?: string) {
    document.execCommand("styleWithCSS", false, String(c === "foreColor" || c === "hiliteColor"));
    document.execCommand(c, false, v);
    const a = document.activeElement as HTMLElement | null, ed = a?.closest?.(".ed") as HTMLElement | null;
    if (ed && this.root.contains(ed)) this.onInput(ed);
  }
  private color(k: "fg" | "bg", h: string) {
    const i = this.ctxIndex;
    if (i >= 0) {
      const ed = this.edAt(i), s = getSelection();
      if (ed && !(s && s.rangeCount && !s.isCollapsed && ed.contains(s.anchorNode))) { ed.focus(); document.execCommand("selectAll"); }
    }
    if (!h) this.exec("removeFormat");
    else this.exec(k === "bg" ? "hiliteColor" : "foreColor", k === "bg" ? h + "40" : h);
    this.hideMenu();
  }

  // ---------------- menus ----------------
  private show(r: DOMRect, items: MenuItem[], kind: "slash" | "at" | "turn") {
    this.menuItems = items;
    this.menuSel = 0;
    this.menuKind = kind;
    this.place(r.left, r.bottom + 4);
    this.drawMenu();
  }
  private drawMenu() {
    this.menu.innerHTML = this.menuItems.map((it, i) => `<div class="mi${i === this.menuSel ? " on" : ""}" data-mi="${i}"><span>${esc(it.ic)}</span>${esc(it.l)}</div>`).join("");
    this.menu.hidden = false;
    this.clamp();
    this.menu.querySelector(".mi.on")?.scrollIntoView({ block: "nearest" });
  }
  private raw(x: number, y: number, html: string, i: number) {
    this.menuItems = [];
    this.menuKind = "raw";
    this.ctxIndex = i;
    this.menu.innerHTML = html;
    this.menu.hidden = false;
    this.place(x, y);
    this.clamp();
  }
  private place(x: number, y: number) { this.menu.style.left = x + "px"; this.menu.style.top = y + "px"; }
  private clamp() {
    const m = this.menu, x = parseFloat(m.style.left), y = parseFloat(m.style.top);
    m.style.left = Math.max(8, Math.min(x, innerWidth - m.offsetWidth - 8)) + "px";
    m.style.top = Math.max(8, Math.min(y, innerHeight - m.offsetHeight - 8)) + "px";
  }
  hideMenu() { this.menu.hidden = true; this.menuItems = []; this.menuKind = null; }

  private swatches(k: "fg" | "bg") {
    return `<h6>${k === "fg" ? "Cor do texto" : "Cor de fundo"}</h6><div class="sws"><span class="sw" data-bc="${k}|" title="Padrão">∅</span>${COLORS.map(([n, h]) => `<span class="sw" data-bc="${k}|${h}" title="${n}" style="${k === "fg" ? "color:" + h : "background:" + h + "40"}">${k === "fg" ? "A" : ""}</span>`).join("")}</div>`;
  }

  private blockMenu(x: number, y: number, i: number) {
    const b = this.B[i], dt = ["tbl", "sheet", "toc"].includes(b.t), ed = !["div", "img", "subpg"].includes(b.t) && !dt;
    const types = PAGE_TYPES.filter((t) => t.id !== "div" && t.id !== "img");
    const plain = plainText(b.txt || ""), words = plain.trim() ? plain.trim().split(/\s+/).length : 0;
    const it = (a: string, ic: string, l: string, k = "") => `<div class="mi" data-bx="${a}"><span>${ic}</span>${l}${k ? `<kbd>${k}</kbd>` : ""}</div>`;
    const grid = GROUPS.map((g) => [g, types.filter((t) => t.group === g)] as const).filter(([, L]) => L.length)
      .map(([g, L]) => `<div class="bm-g">${g}</div><div class="bm-grid">${L.map((t) => `<div class="mi${b.t === t.id || (b.t === "callout" && CALLOUT_KINDS[t.id]?.[1] === b.kind) ? " cur" : ""}" data-bt="${t.id}" data-al="${t.alias ?? ""}"><span>${t.ic}</span>${t.label}</div>`).join("")}</div>`).join("");
    this.raw(x, y, (ed || dt ? `<input class="bm-q" placeholder="Pesquisar ações…" aria-label="Pesquisar ações"><h6>Transformar em</h6><div class="bm-tf">${grid}</div>${ed ? this.swatches("fg") + this.swatches("bg") : ""}` : "")
      + `<h6>Bloco</h6>${it("ins-up", "⤒", "Inserir bloco acima")}${it("ins-down", "⤓", "Inserir bloco abaixo")}${it("dup", "⧉", "Duplicar", "Ctrl+D")}${it("up", "↑", "Mover para cima", "Alt+Shift+↑")}${it("down", "↓", "Mover para baixo", "Alt+Shift+↓")}${it("indent", "⇥", "Recuar", "Tab")}${it("outdent", "⇤", "Desrecuar", "Shift+Tab")}${ed ? it("copy", "⎘", "Copiar texto") + it("clear", "⌫", "Limpar formatação") : ""}${it("del", "🗑", "Excluir")}<div class="bm-foot">${words} palavras · ${plain.length} caracteres</div>`, i);
    setTimeout(() => this.menu.querySelector<HTMLInputElement>(".bm-q")?.focus());
  }

  private blockAction(a: string) {
    const i = this.ctxIndex, B = this.B, b = B[i];
    this.hideMenu();
    if (!b) return;
    if (a === "copy") { void navigator.clipboard?.writeText(plainText(b.txt || "")); this.host.toast("Texto copiado."); return; }
    if (a === "clear") b.txt = (b.txt || "").replace(/<\/?u>|<\/?span[^>]*>/g, "").replace(/\*\*|~~|`/g, "").replace(/\*/g, "");
    else if (a === "indent") b.ind = Math.min(6, b.ind + 1);
    else if (a === "outdent") b.ind = Math.max(0, b.ind - 1);
    else if (a === "dup") B.splice(i + 1, 0, { ...b, rows: b.rows?.map((r) => [...r]) });
    else if (a === "up" && i > 0) [B[i - 1], B[i]] = [B[i], B[i - 1]];
    else if (a === "down" && i < B.length - 1) [B[i + 1], B[i]] = [B[i], B[i + 1]];
    else if (a === "del") { B.splice(i, 1); this.ensureTail(); }
    else if (a === "ins-up" || a === "ins-down") { const at = a === "ins-up" ? i : i + 1; B.splice(at, 0, { t: "text", txt: "", ind: b.ind }); this.render(); this.sync(); this.focus(at); return; }
    this.render();
    this.sync();
  }

  private tableAction(btn: HTMLElement) {
    const nb = btn.closest(".nb") as HTMLElement, i = +nb.dataset.i!, b = this.B[i], R = b.rows!;
    const td = this.focusTd && nb.contains(this.focusTd) ? this.focusTd : nb.querySelector<HTMLElement>("tr:last-child td:last-child")!;
    const r = +td.dataset.r!, c = +td.dataset.c!, o = btn.dataset.tb;
    if (o === "addr") R.splice(r + 1, 0, Array(R[0].length).fill(""));
    else if (o === "delr" && R.length > 1) R.splice(r, 1);
    else if (o === "addc") R.forEach((x) => x.splice(c + 1, 0, ""));
    else if (o === "delc" && R[0].length > 1) R.forEach((x) => x.splice(c, 1));
    this.render();
    this.sync();
  }
  private refreshSheet(w: HTMLElement) {
    const i = this.idxOf(w), b = this.B[i];
    if (b.t !== "sheet") return;
    w.querySelectorAll<HTMLElement>("td").forEach((td) => { if (td !== document.activeElement) td.textContent = sheetEval(b.rows!, +td.dataset.r!, +td.dataset.c!); });
  }

  // ---------------- eventos ----------------
  private listen() {
    const on = <K extends keyof DocumentEventMap>(t: Document | HTMLElement, ev: K, f: (e: DocumentEventMap[K]) => void, opt?: boolean) => {
      t.addEventListener(ev, f as EventListener, opt);
      this.off.push(() => t.removeEventListener(ev, f as EventListener, opt));
    };
    const R = this.root;
    on(R, "input", (e) => {
      const t = e.target as HTMLElement;
      const td = t.closest(".tbw td") as HTMLElement | null;
      if (td) { const i = this.idxOf(td), b = this.B[i]; b.rows![+td.dataset.r!][+td.dataset.c!] = td.textContent ?? ""; td.dataset.raw = td.textContent ?? ""; this.sync(); this.refreshSheet(td.closest(".tbw")!); return; }
      const ed = t.closest(".ed") as HTMLElement | null;
      if (ed) this.onInput(ed);
    });
    on(R, "keydown", (e) => this.onKey(e));
    on(R, "focusin", (e) => { const td = (e.target as HTMLElement).closest(".tbw td") as HTMLElement | null; if (!td) return; this.focusTd = td; if (td.closest(".sheet")) td.textContent = td.dataset.raw ?? ""; });
    on(R, "focusout", (e) => { const td = (e.target as HTMLElement).closest(".tbw td") as HTMLElement | null; if (td?.closest(".sheet")) this.refreshSheet(td.closest(".tbw")!); });
    on(R, "click", (e) => {
      const t = e.target as HTMLElement;
      const ck = t.closest(".ck2") as HTMLInputElement | null;
      if (ck) { this.B[this.idxOf(ck)].chk = ck.checked; this.sync(); ck.closest(".nb")?.classList.toggle("done", ck.checked); return; }
      const tg = t.closest(".tg2");
      if (tg) { const b = this.B[this.idxOf(tg)]; b.open = !b.open; this.render(); this.sync(); return; }
      const ci = t.closest(".ci");
      if (ci) { const b = this.B[this.idxOf(ci)]; b.ico = ICONS[(ICONS.indexOf(b.ico ?? "") + 1) % ICONS.length]; this.render(); this.sync(); return; }
      const hd = t.closest(".hd");
      if (hd) { const r = hd.getBoundingClientRect(); this.blockMenu(r.left, r.bottom + 2, this.idxOf(hd)); return; }
      const tb = t.closest("[data-tb]") as HTMLElement | null;
      if (tb) { this.tableAction(tb); return; }
      const sp = t.closest(".sp") as HTMLElement | null;
      if (sp?.dataset.sp) { this.host.openSub(sp.dataset.sp); return; }
      const wl = t.closest(".wl") as HTMLElement | null;
      if (wl?.dataset.l?.startsWith("np:")) { this.host.openSub(wl.dataset.l.slice(3)); return; }
      const ti = t.closest("[data-ti]") as HTMLElement | null;
      if (ti) { this.root.querySelector(`.nb[data-i="${ti.dataset.ti}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
      // clique no espaço vazio depois do último bloco: foca o fim
      if (t === R) this.focus(this.B.length - 1, true);
    });
    on(R, "contextmenu", (e) => {
      if (e.shiftKey) return;
      const nb = (e.target as HTMLElement).closest(".nb");
      if (!nb) return;
      e.preventDefault();
      this.blockMenu(e.clientX, e.clientY, this.idxOf(nb));
    });
    on(R, "paste", (e) => {
      const ed = (e.target as HTMLElement).closest(".ed") as HTMLElement | null;
      if (!ed) return;
      const i = this.idxOf(ed), cd = e.clipboardData!, img = Array.from(cd.files).find((f) => /^image\//.test(f.type));
      e.preventDefault();
      e.stopPropagation();
      if (img) { void fileToDataUrl(img).then((url) => { this.B.splice(i + 1, 0, { t: "img", txt: url, ind: this.B[i].ind }); this.ensureTail(); this.render(); this.sync(); }); return; }
      const t = cd.getData("text/plain");
      if (!t) return;
      if (!t.includes("\n")) { document.execCommand("insertText", false, t); return; }
      const b = this.B[i], P = parsePage(t).map((x) => ({ ...x, ind: x.ind + b.ind })), empty = !(ed.textContent ?? "").trim();
      this.B.splice(empty ? i : i + 1, empty ? 1 : 0, ...P);
      this.ensureTail();
      this.render();
      this.sync();
      this.focus(Math.min(this.B.length - 1, i + P.length - (empty ? 1 : 0)), true);
    });
    // arrastar blocos pela alça
    on(R, "dragstart", (e) => { const hd = (e.target as HTMLElement).closest?.(".hd"); if (!hd) return; this.drag = this.idxOf(hd); hd.closest(".nb")!.classList.add("dragging"); e.dataTransfer!.effectAllowed = "move"; e.dataTransfer!.setData("text/plain", "pe"); });
    on(R, "dragover", (e) => {
      if (this.drag === null && !Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      R.querySelectorAll(".nb.dov,.nb.dov2").forEach((x) => x.classList.remove("dov", "dov2"));
      const nb = (e.target as HTMLElement).closest(".nb") as HTMLElement | null;
      if (nb) nb.classList.add(e.clientY > nb.getBoundingClientRect().top + nb.offsetHeight / 2 ? "dov2" : "dov");
    });
    on(R, "dragend", () => { this.drag = null; R.querySelectorAll(".nb.dragging,.nb.dov,.nb.dov2").forEach((x) => x.classList.remove("dragging", "dov", "dov2")); });
    on(R, "drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      R.querySelectorAll(".nb.dov,.nb.dov2").forEach((x) => x.classList.remove("dov", "dov2"));
      const nb = (e.target as HTMLElement).closest(".nb") as HTMLElement | null;
      const j = nb ? +nb.dataset.i! : this.B.length - 1, after = nb ? e.clientY > nb.getBoundingClientRect().top + nb.offsetHeight / 2 : true;
      const img = Array.from(e.dataTransfer?.files ?? []).find((f) => /^image\//.test(f.type));
      if (img) { void fileToDataUrl(img).then((url) => { this.B.splice(j + 1, 0, { t: "img", txt: url, ind: 0 }); this.ensureTail(); this.render(); this.sync(); }); return; }
      if (this.drag === null) return;
      const from = this.drag;
      this.drag = null;
      const [m] = this.B.splice(from, 1);
      let to = j + (after ? 1 : 0);
      if (from < to) to--;
      this.B.splice(to, 0, m);
      this.render();
      this.sync();
    });
    // menus (ficam fora do root)
    on(this.menu, "mousedown", (e) => { if (!(e.target as HTMLElement).closest("input")) e.preventDefault(); });
    on(this.bar, "mousedown", (e) => e.preventDefault());
    on(this.menu, "click", (e) => {
      const t = e.target as HTMLElement;
      const mi = t.closest("[data-mi]") as HTMLElement | null;
      if (mi) { const it = this.menuItems[+mi.dataset.mi!]; this.hideMenu(); it?.fn(); return; }
      const bt = t.closest("[data-bt]") as HTMLElement | null;
      if (bt) { this.turn(this.ctxIndex, bt.dataset.bt!); return; }
      const bc = t.closest("[data-bc]") as HTMLElement | null;
      if (bc) { const [k, h] = bc.dataset.bc!.split("|"); this.color(k as "fg" | "bg", h); return; }
      const bx = t.closest("[data-bx]") as HTMLElement | null;
      if (bx) this.blockAction(bx.dataset.bx!);
    });
    on(this.menu, "input", (e) => {
      const t = e.target as HTMLInputElement;
      if (!t.classList.contains("bm-q")) return;
      const q = t.value.toLowerCase().trim();
      this.menu.querySelectorAll<HTMLElement>(".bm-grid").forEach((g) => {
        let any = false;
        g.querySelectorAll<HTMLElement>(".mi").forEach((m) => { const ok = !q || (m.textContent + " " + (m.dataset.al ?? "")).toLowerCase().includes(q); m.hidden = !ok; if (ok) any = true; });
        g.hidden = !any;
        if (g.previousElementSibling) (g.previousElementSibling as HTMLElement).hidden = !any;
      });
    });
    on(this.bar, "click", (e) => {
      const b = (e.target as HTMLElement).closest("[data-bf]") as HTMLElement | null;
      if (!b) return;
      const c = b.dataset.bf!, s = getSelection();
      if (!s || !s.rangeCount) return;
      const e0 = s.anchorNode?.nodeType === 3 ? s.anchorNode.parentElement : (s.anchorNode as HTMLElement | null);
      const ed = e0?.closest(".ed") as HTMLElement | null;
      if (!ed) return;
      if (["bold", "italic", "underline", "strikeThrough"].includes(c)) this.exec(c);
      else if (c === "code") { document.execCommand("insertHTML", false, `<code>${esc(s.toString())}</code>&#8203;`); this.onInput(ed); }
      else if (c === "color") { const r = b.getBoundingClientRect(); this.raw(r.left, r.bottom + 4, this.swatches("fg") + this.swatches("bg"), -1); }
      else if (c === "turn") { const i = this.idxOf(ed), r = b.getBoundingClientRect(); this.show(r, PAGE_TYPES.filter((x) => !["img", "div", "subpg"].includes(x.id)).map((x) => ({ ic: x.ic, l: x.label, fn: () => this.turn(i, x.id) })), "turn"); }
    });
    on(document, "selectionchange", () => {
      const s = getSelection();
      let ok = false;
      if (s && s.rangeCount && !s.isCollapsed && s.anchorNode) {
        const e0 = s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : (s.anchorNode as HTMLElement);
        ok = !!e0?.closest?.(".ed:not(.pl)") && this.root.contains(e0);
      }
      if (!ok) { this.bar.hidden = true; return; }
      const r = s!.getRangeAt(0).getBoundingClientRect();
      this.bar.hidden = false;
      this.bar.style.left = Math.max(8, Math.min(innerWidth - this.bar.offsetWidth - 8, r.left + r.width / 2 - this.bar.offsetWidth / 2)) + "px";
      this.bar.style.top = Math.max(8, r.top - this.bar.offsetHeight - 8) + "px";
    });
    on(document, "mousedown", (e) => { if (!this.menu.hidden && !this.menu.contains(e.target as Node) && !this.bar.contains(e.target as Node)) this.hideMenu(); });
  }
}

export function fileToDataUrl(f: Blob, max = 1600): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(fr.error);
    fr.onload = () => {
      const src = String(fr.result);
      if (!/^data:image\/(png|jpe?g|webp|bmp)/.test(src)) return res(src);
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height));
        if (k >= 1 && src.length < 900_000) return res(src);
        const c = document.createElement("canvas");
        c.width = Math.round(im.width * k);
        c.height = Math.round(im.height * k);
        c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.85));
      };
      im.onerror = () => res(src);
      im.src = src;
    };
    fr.readAsDataURL(f);
  });
}
