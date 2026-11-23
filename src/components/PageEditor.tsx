// Editor de Página (bloco "page"): a mesma experiência das Páginas do Hiraku Comic Manager — lista de páginas e
// subpáginas à esquerda (arraste para aninhar), capa, ícone, título e o editor em blocos. Tudo fica DENTRO do bloco no
// quadro (spec.md + spec.pages) e em Markdown compatível com o Manager/Obsidian (exportar, importar, copiar, colar).
// Mudanças aparecem ao vivo no quadro; fechar grava tudo como UM passo de desfazer.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { PageBlocks, fileToDataUrl } from "./page/PageBlocks";
import { usePageEdit } from "../core/pageEdit";
import { BLOCK_COLORS, SpecOf, SubPage, mix } from "../core/blocks";
import { flattenPage, pageWords, removeSubpages, moveSubpage, newSubId } from "../core/pageTree";
import { AttachmentElement, HirakuDoc } from "../core/model";
import { selectActivePage, useDoc } from "../core/store";
import { useUI } from "../core/ui";

type PageSpec = SpecOf<"page">;
const MAIN = "_";
const EMOJIS = "📄 📝 📚 💡 🎯 📌 🧠 🗺️ ✨ 🔥 ⭐ 📅 🎨 🎬 🧪 💰 🗓️ ✅ ❓ 💬 🚀 🏠 🌱 🎵 📷 🧩 ⚙️ 🔑 💎 🏆 🐱 🤖 ❤️ 🌙 ☀️ 🌊 🍀 📖 ✏️ 🧭".split(" ");

const download = (name: string, text: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  a.download = name.replace(/[\\/:*?"<>|]+/g, "").trim() + ".md" || "pagina.md";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

export function PageEditor() {
  const { id, sub } = usePageEdit();
  const el = useDoc((s) => (id ? selectActivePage(s).elements.find((e) => e.id === id) : undefined)) as AttachmentElement | undefined;
  const spec = el?.block?.kind === "page" ? (el.block as PageSpec) : null;
  const base = useRef<HirakuDoc | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const pb = useRef<PageBlocks | null>(null);
  const [focus, setFocus] = useState(false);
  const [filter, setFilter] = useState("");
  const [pick, setPick] = useState<"icon" | "cover" | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [dragRow, setDragRow] = useState<string | null>(null);

  // estado mais recente sem re-registrar callbacks do editor
  const live = () => {
    const e = selectActivePage(useDoc.getState()).elements.find((x) => x.id === usePageEdit.getState().id) as AttachmentElement | undefined;
    return e?.block?.kind === "page" ? { el: e, spec: e.block as PageSpec } : null;
  };
  const update = (fn: (s: PageSpec) => PageSpec) => {
    const cur = live();
    if (!cur) return;
    if (!base.current) base.current = useDoc.getState().doc;
    const next: AttachmentElement = { ...cur.el, block: fn(cur.spec), title: cur.spec.title };
    useDoc.getState().previewElements(selectActivePage(useDoc.getState()).elements.map((x) => (x.id === next.id ? next : x)));
  };
  const curSub = () => usePageEdit.getState().sub;
  const setMd = (md: string) => update((s) => (curSub() ? { ...s, pages: s.pages.map((p) => (p.id === curSub() ? { ...p, md } : p)) } : { ...s, md }));
  const close = () => {
    pb.current?.hideMenu();
    if (base.current) useDoc.getState().endPreview(base.current);
    base.current = null;
    usePageEdit.getState().close();
  };

  // monta o editor de blocos uma vez por bloco aberto
  useLayoutEffect(() => {
    if (!id || !host.current) return;
    const s = live()?.spec;
    if (!s) return;
    const sp = s.pages.find((p) => p.id === usePageEdit.getState().sub);
    pb.current = new PageBlocks(host.current, sp ? sp.md : s.md, {
      onChange: setMd,
      openSub: (pid) => usePageEdit.getState().go(pid === MAIN ? "" : pid),
      makeSub: (title) => { const nid = newSubId(); update((x) => ({ ...x, pages: [...x.pages, { id: nid, parentId: curSub(), title, icon: "", md: "" }] })); return nid; },
      subInfo: (pid) => {
        const x = live()?.spec;
        if (!x) return null;
        if (pid === MAIN) return { title: x.title, icon: x.icon, n: x.pages.filter((p) => !p.parentId).length };
        const p = x.pages.find((q) => q.id === pid);
        return p ? { title: p.title, icon: p.icon, n: x.pages.filter((q) => q.parentId === p.id).length } : null;
      },
      pages: () => { const x = live()?.spec; return x ? [{ id: MAIN, title: x.title, icon: x.icon }, ...x.pages.map((p) => ({ id: p.id, title: p.title, icon: p.icon }))] : []; },
      pickImage: () => new Promise((res) => {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/*";
        inp.onchange = () => { const f = inp.files?.[0]; if (f) void fileToDataUrl(f).then(res); else res(null); };
        inp.click();
      }),
      toast: (m) => useUI.getState().showToast(m),
    });
    return () => { pb.current?.destroy(); pb.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // trocou de página/subpágina: carrega o conteúdo
  useEffect(() => {
    const s = live()?.spec;
    if (!s || !pb.current) return;
    const sp = s.pages.find((p) => p.id === sub);
    pb.current.load(sp ? sp.md : s.md);
    setPick(null);
    // página nova (sem título): começa pelo título; senão, pelo texto
    requestAnimationFrame(() => {
      const t = document.querySelector<HTMLInputElement>(".pe-title");
      if (t && !t.value) t.focus();
      else pb.current?.focusStart();
      document.querySelector(".pe-scroll")?.scrollTo({ top: 0 });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub]);

  // o bloco sumiu (desfazer/apagar): fecha
  useEffect(() => { if (id && !spec) { base.current = null; usePageEdit.getState().close(); } }, [id, spec]);
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".pe-menu:not([hidden])")) { e.stopPropagation(); close(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const tree = useMemo(() => (spec ? flattenPage(spec) : { rows: [], md: "" }), [spec]);
  if (!id || !spec || !el) return null;

  const current: SubPage | null = spec.pages.find((p) => p.id === sub) ?? null;
  const title = current ? current.title : spec.title;
  const icon = current ? current.icon : spec.icon;
  const setTitle = (t: string) => update((s) => (current ? { ...s, pages: s.pages.map((p) => (p.id === current.id ? { ...p, title: t } : p)) } : { ...s, title: t }));
  const setIcon = (ic: string) => { update((s) => (current ? { ...s, pages: s.pages.map((p) => (p.id === current.id ? { ...p, icon: ic } : p)) } : { ...s, icon: ic })); setPick(null); };
  const crumbs: { id: string; title: string }[] = [];
  for (let q: SubPage | undefined = current ?? undefined, n = 0; q && n < 200; q = spec.pages.find((x) => x.id === q!.parentId), n++) crumbs.unshift({ id: q.id, title: q.title || "Sem título" });
  crumbs.unshift({ id: "", title: spec.title || "Sem título" });
  const md = current ? current.md : spec.md;

  const addSub = (parent: string) => {
    const nid = newSubId();
    update((s) => {
      const link = `▤ [[np:${nid}]]`;
      const addLink = (m: string) => (m.replace(/\s+$/, "") + (m.trim() ? "\n" : "") + link + "\n");
      return { ...s, md: parent ? s.md : addLink(s.md), pages: [...s.pages.map((p) => (p.id === parent ? { ...p, md: addLink(p.md) } : p)), { id: nid, parentId: parent, title: "", icon: "", md: "" }] };
    });
    usePageEdit.getState().go(nid);
    setTimeout(() => document.querySelector<HTMLInputElement>(".pe-title")?.focus());
  };
  const del = (pid: string) => {
    if (confirmDel !== pid) { setConfirmDel(pid); setTimeout(() => setConfirmDel((c) => (c === pid ? null : c)), 3000); return; }
    setConfirmDel(null);
    const s = live()?.spec;
    if (s && (sub === pid || removeSubpages(s, pid).removed.has(sub))) usePageEdit.getState().go("");
    update((x) => removeSubpages(x, pid).spec);
  };
  const exportAll = () => download(spec.title || "pagina", `# ${spec.icon ? spec.icon + " " : ""}${spec.title}\n\n${flattenPage(spec, true).md}`);
  const importMd = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".md,.markdown,.txt,text/markdown,text/plain";
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      const text = (await f.text()).replace(/^---\n[\s\S]*?\n---\n/, "");
      const next = md.trim() ? md.replace(/\s+$/, "") + "\n\n" + text : text;
      setMd(next);
      pb.current?.load(next);
      if (!title.trim() || /^Nova página|^Sem título/.test(title)) setTitle(f.name.replace(/\.(md|markdown|txt)$/i, ""));
      useUI.getState().showToast("Markdown importado.");
    };
    inp.click();
  };
  const words = pageWords(md);

  return (
    <div className="pe-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={"pe-window" + (focus ? " focus" : "")} role="dialog" aria-modal="true" aria-label={`Página ${title || "Sem título"}`}>
        <aside className="pe-explorer">
          <div className="pe-explorer-head">
            <b>Páginas <span className="pe-count">{spec.pages.length + 1}</span></b>
            <button className="chip sm" onClick={() => addSub(sub)} title="Nova subpágina dentro desta">＋ Nova</button>
          </div>
          <input className="pe-search" type="search" placeholder="Filtrar páginas" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar páginas" />
          <div className="pe-list" onDragOver={(e) => { if (dragRow) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); if (dragRow) update((s) => moveSubpage(s, dragRow, "")); setDragRow(null); }}>
            {tree.rows.filter((r) => !filter || r.title.toLowerCase().includes(filter.toLowerCase())).map((r) => (
              <div key={r.id || "main"} className={"pe-row" + ((r.id || "") === sub ? " active" : "")} style={{ ["--depth" as string]: r.depth }}
                draggable={!!r.id} onDragStart={(e) => { e.dataTransfer.setData("text/plain", "row"); setDragRow(r.id); }} onDragEnd={() => setDragRow(null)}
                onDragOver={(e) => { if (dragRow && dragRow !== r.id) { e.preventDefault(); e.stopPropagation(); } }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (dragRow) update((s) => moveSubpage(s, dragRow, r.id)); setDragRow(null); }}>
                <button className="pe-open" onClick={() => usePageEdit.getState().go(r.id)}>
                  <span className="pe-ic">{r.icon || (r.children ? "▾" : "▤")}</span>
                  <span className="pe-label"><b>{r.title || "Sem título"}</b>{r.children > 0 && <small>{r.children} subpágina{r.children > 1 ? "s" : ""}</small>}</span>
                </button>
                <button className="pe-add" onClick={() => addSub(r.id)} aria-label="Nova subpágina" title="Nova subpágina">＋</button>
                {r.id && <button className={"pe-del" + (confirmDel === r.id ? " sure" : "")} onClick={() => del(r.id)} aria-label="Excluir página" title={confirmDel === r.id ? "Clique de novo para excluir (com as subpáginas)" : "Excluir"}>{confirmDel === r.id ? "Excluir?" : "×"}</button>}
              </div>
            ))}
          </div>
          <p className="pe-tip">Arraste páginas para aninhar. Digite <kbd>/</kbd> no editor para inserir blocos e <kbd>@</kbd> para mencionar.</p>
        </aside>
        <main className="pe-doc">
          <div className="pe-topline">
            <span className="pe-crumbs">{crumbs.map((c, i) => i === crumbs.length - 1 ? <b key={c.id || "m"}>{c.title}</b> : <span key={c.id || "m"}><button className="pe-crumb" onClick={() => usePageEdit.getState().go(c.id)}>{c.title}</button> / </span>)}</span>
            <span className="pe-status">Salvo no quadro · {words} palavras</span>
            <button className="chip sm" onClick={() => { void navigator.clipboard?.writeText(md); useUI.getState().showToast("Markdown copiado: cole no Hiraku Comic Manager ou no Obsidian."); }} title="Copiar o Markdown desta página">⎘ Copiar</button>
            <button className="chip sm" onClick={() => download(title || "pagina", md)} title="Baixar esta página como .md">⤓ .md</button>
            {spec.pages.length > 0 && <button className="chip sm" onClick={exportAll} title="Baixar a página com todas as subpáginas (em toggles) num só .md">⤓ Tudo</button>}
            <button className="chip sm" onClick={importMd} title="Trazer um .md (do Manager, Obsidian…) para esta página">⤒ Importar</button>
            <button className="chip sm" onClick={() => setFocus(!focus)} title="Esconde a lista de páginas">{focus ? "▤ Lista" : "⤢ Foco"}</button>
            <button className="btn sm" onClick={close} aria-label="Fechar página" title="Fechar (Esc)"><Icon size={18}><path d="M6 6l12 12M18 6L6 18" /></Icon></button>
          </div>
          <div className="pe-scroll">
            {!current && <div className="pe-cover" style={{ background: `linear-gradient(135deg, ${spec.color}, ${mix(spec.color, 0.45)})` }} />}
            <div className="pe-page">
              <div className="pe-meta">
                <button className="pe-bigicon" onClick={() => setPick(pick === "icon" ? null : "icon")} title="Trocar ícone">{icon || <span className="pe-addicon">☺ Adicionar ícone</span>}</button>
                {!current && <button className="chip sm" onClick={() => setPick(pick === "cover" ? null : "cover")}>🎨 Capa</button>}
              </div>
              {pick === "icon" && (
                <div className="pe-picker">
                  {EMOJIS.map((e) => <button key={e} onClick={() => setIcon(e)}>{e}</button>)}
                  <button className="pe-noicon" onClick={() => setIcon("")}>Remover</button>
                </div>
              )}
              {pick === "cover" && (
                <div className="pe-picker colors">
                  {BLOCK_COLORS.map((c) => <button key={c} style={{ background: `linear-gradient(135deg, ${c}, ${mix(c, 0.45)})` }} onClick={() => { update((s) => ({ ...s, color: c })); setPick(null); }} aria-label={`Capa ${c}`} />)}
                </div>
              )}
              <input className="pe-title" placeholder="Sem título" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); pb.current?.focusStart(); } }} aria-label="Título da página" />
              <div className="pe-content" ref={host} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
