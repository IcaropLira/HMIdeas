import { memo, useEffect, useMemo, useRef, useState } from "react";
import { goPage } from "../core/actions";
import { Page } from "../core/model";
import { selectActivePage, useDoc } from "../core/store";
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

export function Sidebar() {
  const pages = useDoc((s) => s.doc.pages);
  const activeId = useDoc((s) => selectActivePage(s).id);
  const open = useUI((s) => s.sidebarOpen);
  const [editing, setEditing] = useState<string | null>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  // O dock se afasta da barra lateral via CSS (body[data-sidebar]).
  useEffect(() => {
    document.body.dataset.sidebar = open ? "open" : "closed";
  }, [open]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeId, open]);

  if (!open) return null;

  const idx = pages.findIndex((p) => p.id === activeId);
  const d = useDoc.getState();
  const go = (id: string) => {
    d.setActivePage(id);
    if (window.innerWidth < 760) useUI.getState().setSidebar(false); // em tela estreita a barra cobre o canvas
  };

  return (
    <aside className="sidebar" aria-label="Páginas">
      <div className="brand">
        <img src="/icon.svg" alt="" width={28} height={28} />
        <div className="brand-text">
          <strong>HM Ideas</strong>
          <span>Hiraku Manager Ideas</span>
        </div>
      </div>
      <div className="side-actions" role="toolbar" aria-label="Ações da página">
        <button className="btn sm" onClick={d.addPage} aria-label="Nova página" title="Nova página">
          <Icon size={19}><path d="M12 5v14M5 12h14" /></Icon>
        </button>
        <button className="btn sm" onClick={() => d.duplicatePage(activeId)} aria-label="Duplicar página" title="Duplicar página">
          <Icon size={19}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15V7a2 2 0 012-2h8" /></Icon>
        </button>
        <button className="btn sm" onClick={() => setEditing(activeId)} aria-label="Renomear página" title="Renomear (ou duplo clique no nome)">
          <Icon size={19}><path d="M4 20l4-1 11-11a2.1 2.1 0 00-3-3L5 16l-1 4z" /></Icon>
        </button>
        <button className="btn sm" disabled={idx <= 0} onClick={() => d.movePage(activeId, -1)} aria-label="Mover para cima" title="Mover para cima">
          <Icon size={19}><path d="M6 14l6-6 6 6" /></Icon>
        </button>
        <button className="btn sm" disabled={idx >= pages.length - 1} onClick={() => d.movePage(activeId, 1)} aria-label="Mover para baixo" title="Mover para baixo">
          <Icon size={19}><path d="M6 10l6 6 6-6" /></Icon>
        </button>
        <button className="btn sm danger" disabled={pages.length <= 1} onClick={() => d.deletePage(activeId)} aria-label="Excluir página" title="Excluir página (dá para desfazer)">
          <Icon size={19}><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></Icon>
        </button>
      </div>

      <ol className="pages">
        {pages.map((p, i) => (
          <li key={p.id} ref={p.id === activeId ? activeRef : undefined} className={p.id === activeId ? "page on" : "page"}>
            <button className="page-btn" onClick={() => go(p.id)} onDoubleClick={() => setEditing(p.id)} aria-current={p.id === activeId ? "page" : undefined} aria-label={`Página ${i + 1}: ${p.name}`}>
              <Thumb page={p} />
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
            </div>
          </li>
        ))}
      </ol>
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

  return (
    <div className="topleft" role="toolbar" aria-label="Navegação de páginas">
      <button className={open ? "btn on" : "btn"} onClick={() => useUI.getState().setSidebar(!open)} aria-expanded={open} aria-label="Páginas" title="Páginas">
        <Icon><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M9 5v14" /></Icon>
      </button>
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
