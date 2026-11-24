// Barra de menus (Arquivo, Editar, Exibir, Inserir, Objeto, Organizar, Ferramentas, Janela, Ajuda). Cada item é um
// comando do registro: o nome, o atalho atual e o "marcado" vêm de lá, então menu, teclado e paleta nunca divergem.
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { allCommands, commandById, inScope, runCommand, shortcutOf } from "./commands";
import { useUI } from "../core/ui";
import { useWorkspace } from "../core/workspace";
import { useDoc, useSel } from "../core/store";
import { useGroupCtx } from "../core/groupActions";
import { APP_VERSION } from "../core/repo";
import { checkForUpdates, isTauri } from "../core/updater";

type Item = string | "-" | { label: string; items: Item[] } | { label: string; act: () => void; hint?: string };

const MENUS: { label: string; items: () => Item[] }[] = [
  { label: "Arquivo", items: () => ["file.new", "file.home", "-", "file.open", "file.save", "file.attach", "-", "file.export", "file.exportNotebook", "file.importPdf", "file.backup", "-", "page.new", "page.duplicate", "page.prev", "page.next",
    "-", { label: `Verificar atualizações · v${APP_VERSION}`, act: () => void checkForUpdates(true) },
    ...(isTauri() ? [] : [{ label: "Baixar o app", act: () => { location.href = `${import.meta.env.BASE_URL}download.html`; } } as Item])] },
  { label: "Editar", items: () => ["edit.undo", "edit.redo", "-", "edit.cut", "edit.copy", "edit.paste", "edit.duplicate", "edit.delete", "-",
    "edit.selectAll", "edit.selectAllPage", "edit.selectSame", "edit.escape", "-", "edit.text", "edit.eyedropper", "-", "edit.settings", "help.shortcuts"] },
  { label: "Exibir", items: () => ["view.zoomIn", "view.zoomOut", "view.zoom100", "view.fitAll", "view.fitSel", "-", "view.snapGrid", "view.smartGuides", "-",
    "view.pages", "view.menubar", "view.optionsbar", "view.statusbar", "view.pills", "-", "view.focus"] },
  { label: "Inserir", items: () => ["insert.library", "insert.templates", "insert.mapTemplates", "-", "insert.sticky", "insert.todo", "insert.table", "insert.card", "insert.pageBlock", "-", "file.attach", "tool.text", "tool.mindmap", "tool.frame"] },
  { label: "Objeto", items: () => ["obj.group", "obj.ungroup", "obj.release", "-", "obj.enter", "obj.exit", "-", "obj.lock", "obj.unlockAll", "obj.hide", "obj.showAll", "-", "obj.frame", "obj.edit", "obj.connect"] },
  { label: "Camada", items: () => ["layer.new", "layer.duplicate", "layer.viaCopy", "layer.viaCut", "-", "layer.clip", "layer.solo", "-",
    "layer.mergeDown", "layer.mergeVisible", "layer.flatten", "-", "layer.blendNext", "layer.blendPrev", "layer.above", "layer.below", "-", "panel.layers"] },
  { label: "Organizar", items: () => [
    "arr.front", "arr.forward", "arr.backward", "arr.back", "-",
    { label: "Alinhar", items: ["align.left", "align.hcenter", "align.right", "-", "align.top", "align.vcenter", "align.bottom"] },
    { label: "Distribuir", items: ["dist.h", "dist.v", "-", "dist.hc", "dist.vc"] },
    { label: "Igualar", items: ["eq.w", "eq.h", "eq.both"] },
    "arr.grid", "arr.center", "-", "arr.flipH", "arr.flipV", "arr.rotCW", "arr.rotCCW"] },
  { label: "Ferramentas", items: () => [
    ...allCommands().filter((c) => c.cat === "Ferramentas" && c.id.startsWith("tool.") && !["tool.sizeUp", "tool.sizeDown", "tool.eraserMode", "tool.recognize", "tool.fingerDraws"].includes(c.id)).map((c) => c.id),
    "-", { label: "Pincéis", items: allCommands().filter((c) => c.cat === "Pincéis").map((c) => c.id) },
    "tool.sizeUp", "tool.sizeDown", "tool.eraserMode", "tool.recognize", "tool.fingerDraws"] },
  { label: "Janela", items: () => [
    ...allCommands().filter((c) => c.id.startsWith("panel.")).map((c) => c.id), "-",
    { label: "Áreas de trabalho", items: [...useWorkspace.getState().list.map((w): Item => ({ label: (useWorkspace.getState().activeId === w.id ? "✓ " : "") + w.name, act: () => useWorkspace.getState().switchTo(w.id) })), "-", "ws.manage"] },
    "ws.restore", "ws.lock", "ws.hidePanels"] },
  { label: "Ajuda", items: () => ["help.palette", "help.shortcuts", "-", { label: "Sobre o HM Ideas", act: () => useUI.getState().setSettingsTab("sobre") }] },
];

function MenuList({ items, onDone, at }: { items: Item[]; onDone: () => void; at?: { x: number; y: number } }) {
  const [openSub, setOpenSub] = useState<{ i: number; x: number; y: number } | null>(null);
  // submenus ficam em posição fixa (o menu de cima rola e cortaria um filho absoluto)
  const style = at ? { position: "fixed" as const, left: Math.min(at.x, window.innerWidth - 270), top: Math.max(4, Math.min(at.y, window.innerHeight - 40 - Math.min(items.length * 30, window.innerHeight - 60))) } : undefined;
  const subAt = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: r.right + 2, y: r.top - 6 }; };
  return (
    <div className={at ? "mb-menu sub" : "mb-menu"} role="menu" style={style}>
      {items.map((it, i) => {
        if (it === "-") return <div key={i} className="mb-sep" role="separator" />;
        if (typeof it === "string") {
          const c = commandById(it);
          if (!c) return null;
          const enabled = inScope(c.scope) && (!c.when || c.when());
          const checked = c.checked?.();
          return (
            <button key={it} role={checked === undefined ? "menuitem" : "menuitemcheckbox"} aria-checked={checked} className="mb-item" disabled={!enabled}
              onMouseEnter={() => setOpenSub(null)} onClick={() => { onDone(); requestAnimationFrame(() => runCommand(it)); }} title={c.hint}>
              <span className="mb-check">{checked ? "✓" : ""}</span>
              <span className="mb-label">{c.label}</span>
              <kbd>{shortcutOf(it)}</kbd>
            </button>
          );
        }
        if ("items" in it) {
          return (
            <div key={i} className="mb-subwrap" onMouseEnter={(e) => setOpenSub({ i, ...subAt(e.currentTarget) })}>
              <button role="menuitem" aria-haspopup="menu" aria-expanded={openSub?.i === i} className="mb-item" onClick={(e) => setOpenSub(openSub?.i === i ? null : { i, ...subAt(e.currentTarget) })}>
                <span className="mb-check" /><span className="mb-label">{it.label}</span><span className="mb-arrow">›</span>
              </button>
              {openSub?.i === i && <MenuList items={it.items} onDone={onDone} at={openSub} />}
            </div>
          );
        }
        return (
          <button key={i} role="menuitem" className="mb-item" onMouseEnter={() => setOpenSub(null)} onClick={() => { onDone(); it.act(); }} title={it.hint}>
            <span className="mb-check" /><span className="mb-label">{it.label}</span><kbd />
          </button>
        );
      })}
    </div>
  );
}

export function MenuBar() {
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const ws = useWorkspace();
  const notebook = useUI((s) => s.notebookName);
  // re-renderiza itens habilitados/marcados conforme seleção, histórico e contexto mudam
  useSel((s) => s.ids.length);
  useDoc((s) => s.past.length + s.future.length);
  useGroupCtx((s) => s.ctx);

  useEffect(() => {
    if (open === null) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(null); } };
    document.addEventListener("pointerdown", off, true);
    window.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("pointerdown", off, true); window.removeEventListener("keydown", esc, true); };
  }, [open]);

  return (
    <div className="menubar" ref={ref} role="menubar" aria-label="Menu principal">
      <img className="mb-logo" src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={20} height={20} />
      {MENUS.map((m, i) => (
        <div key={m.label} className="mb-top">
          <button role="menuitem" aria-haspopup="menu" aria-expanded={open === i} className={open === i ? "mb-btn on" : "mb-btn"}
            onClick={() => setOpen(open === i ? null : i)} onMouseEnter={() => { if (open !== null) setOpen(i); }}>
            {m.label}
          </button>
          {open === i && <MenuList items={m.items()} onDone={() => setOpen(null)} />}
        </div>
      ))}
      <span className="mb-fill" />
      <button className="mb-btn nb" onClick={() => useUI.getState().setNotebooksOpen(true)} title="Cadernos: trocar, criar e organizar">
        <Icon size={16}><path d="M6 4h11a2 2 0 012 2v13a1 1 0 01-1 1H7a2 2 0 01-2-2V5a1 1 0 011-1z" /><path d="M9 4v16" /></Icon>
        <span>{notebook || "Cadernos"}</span>
      </button>
      <label className="mb-ws" title="Área de trabalho">
        <span className="sr">Área de trabalho</span>
        <select value={ws.activeId} onChange={(e) => ws.switchTo(e.target.value)} aria-label="Área de trabalho">
          {ws.list.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      <button className="mb-btn icon" onClick={() => runCommand("help.palette")} aria-label="Procurar comando" title={`Procurar comando (${shortcutOf("help.palette")})`}>
        <Icon size={17}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></Icon>
      </button>
      <button className="mb-btn icon" onClick={() => useUI.getState().setSettingsOpen(true)} aria-label="Configurações" title="Configurações">
        <Icon size={17}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></Icon>
      </button>
    </div>
  );
}
