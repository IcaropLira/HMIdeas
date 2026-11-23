// Galeria de modelos prontos: categorias, busca e prévias reais (os mesmos elementos que serão inseridos).
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { ElementsPreview } from "./ElementsPreview";
import { HirakuElement } from "../core/model";
import { TEMPLATES, TEMPLATE_CATEGORIES, Template, TemplateCategory, placeAt } from "../core/templates";
import { viewCenter } from "../core/mapActions";
import { useDoc, useSel, useTool } from "../core/store";
import { useUI } from "../core/ui";

/** Insere elementos prontos no centro da tela, seleciona o quadro (para arrastar tudo junto) e volta ao Selecionar. */
export function insertElements(els: HirakuElement[]) {
  if (!els.length) return;
  const c = viewCenter();
  const placed = placeAt(els, c.x, c.y);
  useDoc.getState().addElements(placed);
  const frame = placed.find((e) => e.type === "frame" && !e.frameId);
  useSel.getState().set(frame ? [frame.id] : placed.map((e) => e.id));
  useTool.getState().setTool("select");
}

export function insertTemplate(t: Template) {
  insertElements(t.build());
  useUI.getState().showToast(`“${t.name}” inserido. Arraste pelo título do quadro para mover tudo junto.`);
}

/** Janela genérica com abas laterais (galerias): modelos, mapas, grafos… */
export function GalleryShell({ title, tabs, tab, onTab, onClose, search, onSearch, children, footer }: {
  title: string; tabs: { id: string; label: string; count?: number }[]; tab: string; onTab: (id: string) => void; onClose: () => void;
  search?: string; onSearch?: (v: string) => void; children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel gallery dialog" role="dialog" aria-modal="true" aria-label={title}>
        <nav className="tabs" role="tablist" aria-label="Categorias">
          <div className="tabs-title"><strong>{title}</strong></div>
          {tabs.map((x) => (
            <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? "tab on" : "tab"} onClick={() => onTab(x.id)}>
              <span>{x.label}</span>{x.count !== undefined && <small className="tab-count">{x.count}</small>}
            </button>
          ))}
        </nav>
        <div className="gallery-body">
          <header className="gallery-head">
            {onSearch && <input className="gallery-search" placeholder="Buscar…" value={search} onChange={(e) => onSearch(e.target.value)} autoFocus />}
            <button className="btn sm" onClick={onClose} aria-label="Fechar" title="Fechar (Esc)"><Icon><path d="M6 6l12 12M18 6L6 18" /></Icon></button>
          </header>
          <div className="gallery-grid">{children}</div>
          {footer && <footer className="gallery-foot">{footer}</footer>}
        </div>
      </div>
    </div>
  );
}

export function GalleryCard({ title, hint, onClick, children }: { title: string; hint?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className="gcard" onClick={onClick} title={hint}>
      <span className="gcard-art">{children}</span>
      <b>{title}</b>
      {hint && <small>{hint}</small>}
    </button>
  );
}

export function TemplateGallery() {
  const open = useUI((s) => s.templatesOpen);
  const [cat, setCat] = useState<TemplateCategory | "todos">("todos");
  const [q, setQ] = useState("");
  const built = useMemo(() => (open ? new Map(TEMPLATES.map((t) => [t.id, t.build()])) : null), [open]);
  if (!open || !built) return null;
  const close = () => useUI.getState().setTemplatesOpen(false);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const list = TEMPLATES.filter((t) => (cat === "todos" || t.category === cat) && (!q || norm(`${t.name} ${t.hint}`).includes(norm(q))));
  return (
    <GalleryShell
      title="Modelos"
      tabs={[{ id: "todos", label: "Todos", count: TEMPLATES.length }, ...TEMPLATE_CATEGORIES.map((c) => ({ ...c, count: TEMPLATES.filter((t) => t.category === c.id).length }))]}
      tab={cat}
      onTab={(id) => setCat(id as TemplateCategory | "todos")}
      onClose={close}
      search={q}
      onSearch={setQ}
      footer={<span>Tudo é editável: textos, cores e formas. Cada modelo vem dentro de um quadro — arraste pelo título para mover o conjunto.</span>}
    >
      {list.map((t) => (
        <GalleryCard key={t.id} title={t.name} hint={t.hint} onClick={() => { close(); insertTemplate(t); }}>
          <ElementsPreview elements={built.get(t.id)!} w={220} h={150} bg="#F7F8FB" />
        </GalleryCard>
      ))}
      {!list.length && <p className="hint">Nenhum modelo com esse nome.</p>}
    </GalleryShell>
  );
}
