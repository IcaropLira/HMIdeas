import { memo, useEffect, useMemo, useRef, useState } from "react";
import { goPage } from "../core/actions";
import { Page } from "../core/model";
import { selectActivePage, useDoc, useSel, useView } from "../core/store";
import { BOOKMARK_COLORS, buildIndex, filterIndex } from "../core/notebook";
import { usePageTemplates } from "../core/pageTemplateStore";
import { elementBounds } from "../core/selection";
import { useUI } from "../core/ui";
import { pageThumb, safeColor } from "../render/svgThumb";
import { Icon } from "./Icon";

/** Miniatura: só refaz quando os elementos (ou a cor) da página mudam. */
const Thumb = memo(
  function Thumb({ page }: { page: Page }) {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const { paths, viewBox } = useMemo(() => pageThumb(page), [page.elements]);
    return (
      <svg className="thumb" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" style={{ background: safeColor(page.background, "#EDF0F4") }} aria-hidden="true">
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.fill} stroke={p.stroke ?? "none"} strokeWidth={p.sw} strokeDasharray={p.dash ?? undefined} strokeLinejoin="round" strokeLinecap="round" opacity={p.alpha < 1 ? p.alpha : undefined} />
        ))}
      </svg>
    );
  },
  (a, b) => a.page.elements === b.page.elements && a.page.background === b.page.background,
);

function RenameInput({ initial, onDone }: { initial: string; onDone: (value: string | null) => void }) {
  const done = useRef(false);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  return (
    <input
      className="rename"
      autoFocus
      defaultValue={initial}
      maxLength={60}
      aria-label="Nome da página"
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => finish(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(e.currentTarget.value);
        else if (e.key === "Escape") finish(null);
      }}
    />
  );
}

/** Vai para a página e centraliza o elemento (título do índice), sem mudar o zoom. */
export function goToElement(pageId: string, elId?: string) {
  const d = useDoc.getState();
  d.setActivePage(pageId);
  const el = elId && d.doc.pages.find((p) => p.id === pageId)?.elements.find((e) => e.id === elId);
  if (!el) return;
  const b = elementBounds(el), cam = useView.getState().camera;
  useView.getState().setCamera({ ...cam, x: window.innerWidth / 2 - ((b.minX + b.maxX) / 2) * cam.zoom, y: window.innerHeight * 0.35 - b.minY * cam.zoom });
  useSel.getState().set([el.id]);
}

const Ribbon = ({ color }: { color: string }) => <span className="pg-ribbon" style={{ background: color }} aria-hidden="true" />;
const STAR = <path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />;

/** Menu "⋯" da página: girar, marcador, favoritar e modelos. */
function PageMenu({ onClose, onRename }: { onClose: () => void; onRename: () => void }) {
  const d = useDoc.getState();
  const page = useDoc((s) => selectActivePage(s));
  const templates = usePageTemplates((s) => s.list);
  const [naming, setNaming] = useState(false);
  const toast = (m: string) => useUI.getState().showToast(m);
  const saveTpl = (name: string | null) => {
    setNaming(false);
    if (name === null) return;
    if (usePageTemplates.getState().add(page, name || page.name)) toast(`Modelo “${name || page.name}” salvo. Use em “Nova página de modelo”.`);
    else toast("Não coube no armazenamento deste dispositivo (a página tem imagens grandes?).");
  };
  const i = d.doc.pages.findIndex((p) => p.id === page.id), n = d.doc.pages.length;
  return (
    <div className="menu pg-menu" role="menu">
      <button role="menuitem" onClick={() => { onRename(); onClose(); }}>Renomear <kbd>duplo clique</kbd></button>
      <div className="pg-row">
        <button role="menuitem" disabled={i <= 0} onClick={() => d.movePage(page.id, -1)}>↑ Subir</button>
        <button role="menuitem" disabled={i >= n - 1} onClick={() => d.movePage(page.id, 1)}>↓ Descer</button>
      </div>
      <small className="pg-tip">Dica: arraste a miniatura para mudar a ordem (no tablet, segure antes).</small>
      <button role="menuitem" disabled={!page.size} onClick={() => { d.rotatePage(page.id); onClose(); }} title={page.size ? "Retrato ↔ paisagem" : "Só para cadernos com páginas de tamanho fixo"}>
        Girar folha {page.size ? (page.size.w > page.size.h ? "(para retrato)" : "(para paisagem)") : ""}
      </button>
      <button role="menuitem" onClick={() => { d.setPageMeta(page.id, { starred: !page.starred }); onClose(); }}>{page.starred ? "Tirar dos favoritos" : "Favoritar página"}</button>
      <div className="pg-colors" role="group" aria-label="Marcador">
        <span>Marcador</span>
        {BOOKMARK_COLORS.map((c) => <button key={c} className={page.bookmark === c ? "swatch on" : "swatch"} style={{ background: c }} aria-label={`Marcador ${c}`} onClick={() => { d.setPageMeta(page.id, { bookmark: page.bookmark === c ? undefined : c }); onClose(); }} />)}
        {page.bookmark && <button className="btn sm" onClick={() => { d.setPageMeta(page.id, { bookmark: undefined }); onClose(); }} aria-label="Tirar marcador" title="Tirar marcador"><Icon size={16}><path d="M6 6l12 12M18 6L6 18" /></Icon></button>}
      </div>
      <hr />
      {naming ? <div className="pg-name"><RenameInput initial={page.name} onDone={saveTpl} /></div>
        : <button role="menuitem" onClick={() => setNaming(true)}>Salvar página como modelo…</button>}
      <div className="pg-tpls">
        <small>Nova página de modelo</small>
        {templates.length === 0 && <p className="hint">Nenhum modelo ainda. Salve uma página para reutilizar o papel e o conteúdo.</p>}
        {templates.map((t) => (
          <div key={t.id} className="pg-tpl">
            <button role="menuitem" onClick={() => { const p = usePageTemplates.getState().make(t.id); if (p) d.insertPage(p); onClose(); }} title="Inserir depois da página atual">
              <Thumb page={t.page} /><span>{t.name}</span>
            </button>
            <button className="btn sm" aria-label={`Apagar modelo ${t.name}`} title="Apagar modelo" onClick={() => usePageTemplates.getState().remove(t.id)}><Icon size={16}><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></Icon></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Índice automático: páginas, títulos (textos grandes, quadros, raízes de mapa), marcadores e favoritas. */
function IndexView({ go }: { go: (pageId: string, elId?: string) => void }) {
  const doc = useDoc((s) => s.doc);
  const activeId = useDoc((s) => s.activePageId);
  const [q, setQ] = useState(""), [only, setOnly] = useState<"all" | "marked" | "starred">("all");
  const entries = useMemo(() => filterIndex(buildIndex(doc), q, only), [doc, q, only]);
  return (
    <div className="pg-index">
      <input className="pg-search" placeholder="Buscar no índice…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar no índice" />
      <div className="seg small" role="tablist" aria-label="Filtrar">
        {([["all", "Tudo"], ["marked", "Marcadas"], ["starred", "Favoritas"]] as const).map(([v, l]) => <button key={v} role="tab" aria-selected={only === v} className={only === v ? "on" : ""} onClick={() => setOnly(v)}>{l}</button>)}
      </div>
      <ol className="pg-toc">
        {entries.map((e) => (
          <li key={e.pageId} className={e.pageId === activeId ? "on" : ""}>
            <button className="toc-page" onClick={() => go(e.pageId)}>
              <span className="num">{e.n}</span><span className="name">{e.name}</span>
              {e.starred && <span className="star"><Icon size={14}>{STAR}</Icon></span>}
              {e.bookmark && <span className="dot" style={{ background: e.bookmark }} />}
            </button>
            {e.headings.map((h) => <button key={h.id} className={`toc-h l${h.level}`} onClick={() => go(e.pageId, h.id)}>{h.text}</button>)}
          </li>
        ))}
      </ol>
      {!entries.length && <p className="hint">{q ? "Nada encontrado." : only === "all" ? "" : "Nenhuma página marcada. Use ⋯ → Marcador ou Favoritar."}</p>}
      <p className="hint small">Títulos entram sozinhos: textos grandes (fonte ≥ 22), quadros e raízes de mapas.</p>
    </div>
  );
}

export function Sidebar() {
  const pages = useDoc((s) => s.doc.pages);
  const activeId = useDoc((s) => selectActivePage(s).id);
  const open = useUI((s) => s.sidebarOpen);
  const [editing, setEditing] = useState<string | null>(null);
  const [tab, setTab] = useState<"pages" | "index">("pages");
  const [menu, setMenu] = useState(false);
  const [drag, setDrag] = useState<{ id: string; to: number } | null>(null);
  const activeRef = useRef<HTMLLIElement>(null), listRef = useRef<HTMLOListElement>(null), menuRef = useRef<HTMLDivElement>(null);
  const swallow = useRef(false);

  // O dock se afasta da barra lateral via CSS (body[data-sidebar]).
  useEffect(() => {
    document.body.dataset.sidebar = open ? "open" : "closed";
  }, [open]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeId, open]);

  useEffect(() => {
    if (!menu) return;
    const off = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("pointerdown", off, true);
    return () => document.removeEventListener("pointerdown", off, true);
  }, [menu]);

  if (!open) return null;

  const d = useDoc.getState();
  const close = () => { if (window.innerWidth < 760) useUI.getState().setSidebar(false); }; // em tela estreita a barra cobre o canvas
  const go = (id: string) => { d.setActivePage(id); close(); };

  /** Arrastar para reordenar: mouse arrasta na hora (6 px); caneta/dedo depois de segurar 300 ms (senão rola a lista). */
  const startDrag = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || editing) return;
    const x0 = e.clientX, y0 = e.clientY, mouse = e.pointerType === "mouse";
    let armed = mouse, active = false, to = -1;
    const timer = mouse ? undefined : setTimeout(() => { armed = true; navigator.vibrate?.(10); }, 300);
    const target = (y: number) => {
      const items = [...(listRef.current?.querySelectorAll<HTMLLIElement>("li.page") ?? [])];
      let k = items.findIndex((li) => { const r = li.getBoundingClientRect(); return y < r.top + r.height / 2; });
      if (k < 0) k = items.length;
      const from = pages.findIndex((p) => p.id === id);
      return k > from ? k - 1 : k;
    };
    const move = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - x0, ev.clientY - y0);
      if (!armed) { if (dist > 10) { clearTimeout(timer); done(); } return; }
      if (!active && dist < 6) return;
      active = true;
      ev.preventDefault();
      to = target(ev.clientY);
      setDrag({ id, to });
      const r = listRef.current?.getBoundingClientRect();
      if (r && ev.clientY < r.top + 30) listRef.current!.scrollTop -= 12;
      if (r && ev.clientY > r.bottom - 30) listRef.current!.scrollTop += 12;
    };
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", done);
      setDrag(null);
    };
    const up = () => {
      if (active) { swallow.current = true; if (to >= 0) d.reorderPage(id, to); }
      done();
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", done);
  };

  return (
    <aside className="sidebar" aria-label="Páginas">
      <div className="brand">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={28} height={28} />
        <div className="brand-text">
          <strong>HM Ideas</strong>
          <span>Hiraku Manager Ideas</span>
        </div>
      </div>
      <div className="seg small side-tabs" role="tablist" aria-label="Ver">
        <button role="tab" aria-selected={tab === "pages"} className={tab === "pages" ? "on" : ""} onClick={() => setTab("pages")}>Páginas</button>
        <button role="tab" aria-selected={tab === "index"} className={tab === "index" ? "on" : ""} onClick={() => setTab("index")}>Índice</button>
      </div>
      {tab === "index" ? <IndexView go={(pid, el) => { goToElement(pid, el); close(); }} /> : <>
      <div className="side-actions" role="toolbar" aria-label="Ações da página">
        <button className="btn sm" onClick={d.addPage} aria-label="Nova página" title="Nova página">
          <Icon size={19}><path d="M12 5v14M5 12h14" /></Icon>
        </button>
        <button className="btn sm" onClick={() => d.duplicatePage(activeId)} aria-label="Duplicar página" title="Duplicar página">
          <Icon size={19}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15V7a2 2 0 012-2h8" /></Icon>
        </button>
        <button className="btn sm danger" disabled={pages.length <= 1} onClick={() => d.deletePage(activeId)} aria-label="Excluir página" title="Excluir página (dá para desfazer)">
          <Icon size={19}><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></Icon>
        </button>
        <div className="pg-more" ref={menuRef}>
          <button className={menu ? "btn sm on" : "btn sm"} onClick={() => setMenu(!menu)} aria-label="Mais ações da página" aria-expanded={menu} title="Girar, marcador, favoritar e modelos">
            <Icon size={19}><circle cx="5.5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18.5" cy="12" r="1.2" /></Icon>
          </button>
          {menu && <PageMenu onClose={() => setMenu(false)} onRename={() => setEditing(activeId)} />}
        </div>
      </div>

      <ol className={drag ? "pages dragging" : "pages"} ref={listRef}>
        {pages.map((p, i) => (
          <li key={p.id} ref={p.id === activeId ? activeRef : undefined}
            className={["page", p.id === activeId && "on", drag?.id === p.id && "lifted", drag && drag.id !== p.id && drag.to === i && (pages.findIndex((x) => x.id === drag.id) > i ? "ins-before" : "ins-after")].filter(Boolean).join(" ")}>
            <button className="page-btn" onPointerDown={(e) => startDrag(e, p.id)}
              onClick={(e) => { if (swallow.current) { swallow.current = false; e.preventDefault(); return; } go(p.id); }}
              onDoubleClick={() => setEditing(p.id)} aria-current={p.id === activeId ? "page" : undefined} aria-label={`Página ${i + 1}: ${p.name}`}>
              <Thumb page={p} />
              {p.bookmark && <Ribbon color={p.bookmark} />}
              {p.size && p.size.w > p.size.h && <span className="pg-orient" title="Paisagem">⟲</span>}
            </button>
            <div className="page-meta">
              <span className="num">{i + 1}</span>
              {editing === p.id ? (
                <RenameInput
                  initial={p.name}
                  onDone={(v) => {
                    setEditing(null);
                    if (v !== null) d.renamePage(p.id, v);
                  }}
                />
              ) : (
                <span className="name" onDoubleClick={() => setEditing(p.id)}>{p.name}</span>
              )}
              <button className={p.starred ? "pg-star on" : "pg-star"} onClick={() => d.setPageMeta(p.id, { starred: !p.starred })} aria-label={p.starred ? "Tirar dos favoritos" : "Favoritar página"} title={p.starred ? "Tirar dos favoritos" : "Favoritar página"}>
                <Icon size={15}>{STAR}</Icon>
              </button>
            </div>
          </li>
        ))}
      </ol>
      </>}
    </aside>
  );
}

/** Canto superior esquerdo: abre a barra lateral e navega sem precisar abri-la. */
export function PageNav() {
  const pages = useDoc((s) => s.doc.pages);
  const activeId = useDoc((s) => selectActivePage(s).id);
  const open = useUI((s) => s.sidebarOpen);
  const idx = pages.findIndex((p) => p.id === activeId);
  const last = idx >= pages.length - 1;
  const notebook = useUI((s) => s.notebookName);

  return (
    <div className="topleft" role="toolbar" aria-label="Navegação de páginas">
      <button className={open ? "btn on" : "btn"} onClick={() => useUI.getState().setSidebar(!open)} aria-expanded={open} aria-label="Páginas" title="Páginas">
        <Icon><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M9 5v14" /></Icon>
      </button>
      <button className="btn nbchip" onClick={() => useUI.getState().setNotebooksOpen(true)} aria-label="Abrir cadernos" title="Cadernos: trocar, criar e organizar">
        <Icon size={20}><path d="M6 4h11a2 2 0 012 2v13a1 1 0 01-1 1H7a2 2 0 01-2-2V5a1 1 0 011-1z" /><path d="M9 4v16M12.5 9h3.5" /></Icon>
        <span className="nbname">{notebook || "Cadernos"}</span>
        <Icon size={14}><path d="M7 10l5 5 5-5" /></Icon>
      </button>
      <span className="vsep" aria-hidden="true" />
      <button className="btn" disabled={idx <= 0} onClick={() => goPage(-1)} aria-label="Página anterior" title="Página anterior (PageUp)">
        <Icon><path d="M14 6l-6 6 6 6" /></Icon>
      </button>
      <span className="pageno" aria-live="polite">{idx + 1} / {pages.length}</span>
      {last ? (
        <button className="btn" onClick={() => useDoc.getState().addPage()} aria-label="Nova página" title="Nova página">
          <Icon><path d="M12 5v14M5 12h14" /></Icon>
        </button>
      ) : (
        <button className="btn" onClick={() => goPage(1)} aria-label="Próxima página" title="Próxima página (PageDown)">
          <Icon><path d="M10 6l6 6-6 6" /></Icon>
        </button>
      )}
    </div>
  );
}

export function Toast() {
  const toast = useUI((s) => s.toast);
  return toast ? <div className="toast" role="status">{toast.msg}</div> : null;
}
