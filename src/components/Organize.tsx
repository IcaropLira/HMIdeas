// Organização visual (0.15): trilha dos quadros aninhados + isolamento + link (topo), modo tópicos do mapa, grafo do
// caderno e o painel Organizar (links e referências, organizar/selecionar por propriedade, conversões).
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { arrangeSelection } from "../core/alignActions";
import { PROP_KEYS, SORT_KEYS, allLinks, backlinks, elementLabel, notebookGraph } from "../core/organize";
import {
  applyMapOutline, blockToMindMap, breadcrumb, copyLink, exitIsolate, followLink, goTo, goUp, insertBoard, linkToPage, mapOutline, mapToBlock,
  pasteLink, removeLink, selectSame, selectedMapRoot, selectionToBoard, textsToMap, toggleIsolate, useIsolate, useLinkClip,
} from "../core/organizeActions";
import { selectActivePage, useDoc, useSel } from "../core/store";
import { Icon } from "./Icon";

interface OrgUI { outline: string | null; graph: boolean; set: (p: Partial<Omit<OrgUI, "set">>) => void }
export const useOrgUI = create<OrgUI>((set) => ({ outline: null, graph: false, set: (p) => set(p) }));

export function openOutline() {
  const root = selectedMapRoot();
  if (!root) { useOrgUI.getState().set({ outline: null }); return false; }
  useOrgUI.getState().set({ outline: root });
  return true;
}

/** Trilha (quadros aninhados), aviso de isolamento e "ir para o link" no topo do quadro. */
export function OrgBar() {
  const page = useDoc((s) => selectActivePage(s));
  const pages = useDoc((s) => s.doc.pages);
  const iso = useIsolate((s) => s.on);
  const isoPage = useIsolate((s) => s.pageId);
  const sel = useSel((s) => s.ids);
  useEffect(() => { if (iso && isoPage !== page.id) exitIsolate(); }, [iso, isoPage, page.id]);
  const crumbs = useMemo(() => breadcrumb(page, pages), [page, pages]);
  const linked = sel.length === 1 ? page.elements.find((e) => e.id === sel[0] && e.linkTo) : undefined;
  const target = linked?.linkTo && pages.find((p) => p.id === linked.linkTo!.page);
  if (!crumbs.length && !iso && !target) return null;
  return (
    <div className="orgbar" role="navigation" aria-label="Caminho">
      {crumbs.length > 0 && <>
        <button className="btn sm" onClick={goUp} aria-label="Voltar ao quadro de cima" title="Voltar ao quadro de cima"><Icon size={18}><path d="M12 19V5M6 11l6-6 6 6" /></Icon></button>
        {crumbs.map((c) => <button key={c.id} className="crumb" onClick={() => useDoc.getState().setActivePage(c.id)}>{c.name}</button>)}
        <span className="crumb cur">{page.name}</span>
      </>}
      {iso && <><span className="vsep" /><b className="iso">Isolado</b><button className="btn sm" onClick={exitIsolate}>Sair</button></>}
      {target && <><span className="vsep" /><button className="btn sm link" onClick={followLink} title="Seguir o link (Alt+Enter)">↗ {linked!.linkTo!.el ? "Ir ao item em" : "Ir para"} “{target.name}”</button></>}
    </div>
  );
}

/** Modo tópicos: o mapa como lista indentada; editar e aplicar mantém cores, notas e ligações dos nós existentes. */
export function OutlineModal() {
  const root = useOrgUI((s) => s.outline);
  const [text, setText] = useState("");
  useEffect(() => { if (root) setText(mapOutline(root)); }, [root]);
  if (!root) return null;
  const close = () => useOrgUI.getState().set({ outline: null });
  const apply = () => { if (applyMapOutline(root, text)) close(); };
  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <section className="outline-modal dialog" role="dialog" aria-modal="true" aria-label="Modo tópicos">
        <header><strong>Modo tópicos</strong><small>Tab/Shift+Tab mudam o nível · Ctrl+Enter aplica</small>
          <button className="btn sm" onClick={close} aria-label="Fechar"><Icon><path d="M6 6l12 12M18 6L6 18" /></Icon></button></header>
        <textarea value={text} autoFocus spellCheck={false} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") close();
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); apply(); }
            if (e.key === "Tab") {
              e.preventDefault();
              const ta = e.currentTarget, a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
              const ls = v.lastIndexOf("\n", a - 1) + 1, le = v.indexOf("\n", b) === -1 ? v.length : v.indexOf("\n", b);
              const block = v.slice(ls, le).split("\n").map((l) => (e.shiftKey ? l.replace(/^ {1,2}/, "") : "  " + l)).join("\n");
              const next = v.slice(0, ls) + block + v.slice(le);
              setText(next);
              requestAnimationFrame(() => { ta.selectionStart = ls; ta.selectionEnd = ls + block.length; });
            }
          }} />
        <footer><span className="hint">Cada linha é um nó; o recuo é o nível. Linhas novas viram nós; apagadas somem do mapa.</span>
          <button className="btn" onClick={close}>Cancelar</button><button className="btn primary" onClick={apply}>Aplicar ao mapa</button></footer>
      </section>
    </div>
  );
}

/** Grafo do caderno: páginas e os links entre elas. */
export function GraphView() {
  const open = useOrgUI((s) => s.graph);
  const doc = useDoc((s) => s.doc);
  const active = useDoc((s) => s.activePageId);
  const g = useMemo(() => (open ? notebookGraph(doc, 640, 440) : null), [open, doc]);
  if (!open || !g) return null;
  const close = () => useOrgUI.getState().set({ graph: false });
  const pos = new Map(g.nodes.map((n) => [n.id, n]));
  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <section className="graph-modal dialog" role="dialog" aria-modal="true" aria-label="Grafo do caderno">
        <header><strong>Grafo do caderno</strong><small>{g.nodes.length} páginas · {g.edges.length} ligações</small>
          <button className="btn sm" onClick={close} aria-label="Fechar"><Icon><path d="M6 6l12 12M18 6L6 18" /></Icon></button></header>
        <svg viewBox="0 0 640 440" role="img" aria-label="Páginas e links">
          {g.edges.map((e, i) => { const a = pos.get(e.a)!, b = pos.get(e.b)!; return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={Math.min(5, 1 + e.w)} className="g-edge" />; })}
          {g.nodes.map((n) => (
            <g key={n.id} className={n.id === active ? "g-node on" : "g-node"} transform={`translate(${n.x} ${n.y})`} onClick={() => { goTo({ page: n.id }); close(); }} role="button" aria-label={`Ir para ${n.label}`}>
              <circle r={10 + Math.min(10, n.links * 2)} style={n.bookmark ? { fill: n.bookmark } : undefined} />
              <text y={4} textAnchor="middle" className="g-num">{n.n}</text>
              <text y={30 + Math.min(10, n.links * 2)} textAnchor="middle">{n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}</text>
            </g>
          ))}
        </svg>
        {!g.edges.length && <p className="hint">Ainda não há links entre páginas. Use “Copiar link” e “Ligar ao link copiado”, ou crie quadros aninhados.</p>}
      </section>
    </div>
  );
}

/** Painel Organizar. */
export function OrganizePanel() {
  const doc = useDoc((s) => s.doc);
  const page = useDoc((s) => selectActivePage(s));
  const sel = useSel((s) => s.ids);
  const clip = useLinkClip();
  const iso = useIsolate((s) => s.on);
  const back = useMemo(() => backlinks(doc, page.id), [doc, page.id]);
  const out = useMemo(() => allLinks(doc).filter((l) => l.fromPage === page.id), [doc, page.id]);
  const name = (id: string) => doc.pages.find((p) => p.id === id)?.name ?? "?";
  const selEls = page.elements.filter((e) => sel.includes(e.id));
  const hasNode = selEls.some((e) => e.type === "node");
  const hasBlock = selEls.some((e) => e.type === "attachment" && e.kind === "block");
  const texts = selEls.filter((e) => e.type === "text").length;
  return (
    <div className="organize">
      <section>
        <h4>Quadros aninhados</h4>
        <div className="row">
          <button className="btn" onClick={() => insertBoard()}>+ Quadro dentro</button>
          <button className="btn" disabled={!sel.length} onClick={selectionToBoard} title="Leva a seleção para uma página nova e deixa um atalho no lugar">Seleção → quadro</button>
          {page.parentPage && <button className="btn" onClick={goUp}>↑ Voltar</button>}
        </div>
      </section>
      <section>
        <h4>Links</h4>
        <div className="row">
          <button className="btn" onClick={copyLink} title="Copia um link para o item selecionado (ou para a página)">Copiar link</button>
          <button className="btn" disabled={!clip.target || !sel.length} onClick={pasteLink} title={clip.target ? `Liga a seleção a “${clip.label}”` : "Copie um link antes"}>Ligar ao link copiado</button>
          {selEls.some((e) => e.linkTo) && <button className="btn" onClick={removeLink}>Tirar link</button>}
        </div>
        {sel.length > 0 && (
          <label className="mini-select">Ligar à página
            <select value="" onChange={(e) => { if (e.target.value) linkToPage(e.target.value); }}>
              <option value="">escolha…</option>
              {doc.pages.filter((p) => p.id !== page.id).map((p, i) => <option key={p.id} value={p.id}>{i + 1}. {p.name}</option>)}
            </select>
          </label>
        )}
        <small className="sub">Links desta página ({out.length})</small>
        {out.map((l) => <button key={l.fromEl} className="link-row" onClick={() => goTo(l.to)}>{l.label} <span>→ {name(l.to.page)}</span></button>)}
        <small className="sub">Referências para esta página ({back.length})</small>
        {back.map((l) => <button key={l.fromEl + l.fromPage} className="link-row" onClick={() => goTo({ page: l.fromPage, el: l.fromEl })}>{name(l.fromPage)} <span>· {l.label}</span></button>)}
        {!back.length && <p className="hint">Nenhuma página aponta para cá.</p>}
        <button className="btn" onClick={() => useOrgUI.getState().set({ graph: true })}>Ver grafo do caderno</button>
      </section>
      <section>
        <h4>Foco</h4>
        <button className={iso ? "btn on" : "btn"} disabled={!iso && !sel.length} onClick={toggleIsolate}>{iso ? "Sair do isolamento" : "Isolar seleção"}</button>
      </section>
      <section>
        <h4>Organizar automaticamente</h4>
        <p className="hint">Ordena a seleção e põe em grade.</p>
        <div className="row">{SORT_KEYS.map((k) => <button key={k.id} className="chip" disabled={sel.length < 2} onClick={() => arrangeSelection(k.id)}>{k.label}</button>)}</div>
      </section>
      <section>
        <h4>Selecionar parecidos</h4>
        <div className="row">{PROP_KEYS.map((k) => <button key={k.id} className="chip" disabled={!sel.length} onClick={() => selectSame(k.id)}>{k.label}</button>)}</div>
      </section>
      <section>
        <h4>Converter</h4>
        <div className="row">
          <button className="chip" disabled={!hasNode} onClick={() => openOutline()}>Mapa → tópicos</button>
          <button className="chip" disabled={!hasNode} onClick={() => mapToBlock("list")}>Mapa → lista</button>
          <button className="chip" disabled={!hasNode} onClick={() => mapToBlock("todo")}>Mapa → tarefas</button>
          <button className="chip" disabled={!hasNode} onClick={() => mapToBlock("kanban")}>Mapa → kanban</button>
          <button className="chip" disabled={!hasBlock} onClick={blockToMindMap}>Bloco → mapa</button>
          <button className="chip" disabled={texts < 2} onClick={textsToMap}>Textos → mapa</button>
        </div>
        {selEls.length === 1 && <p className="hint">Selecionado: {elementLabel(selEls[0])}</p>}
      </section>
    </div>
  );
}
