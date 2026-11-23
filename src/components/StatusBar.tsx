// Barra de status: zoom, coordenadas do cursor, página, grupo aberto (caminho clicável), seleção, ferramenta e estado
// do documento (cópia automática).
import { useEffect, useState } from "react";
import { screenToWorld } from "../core/camera";
import { selectActivePage, useDoc, useSel, useTool, useView } from "../core/store";
import { goPage } from "../core/actions";
import { ctxPath, currentCtx, exitGroup, selectedGroup, useGroupCtx } from "../core/groupActions";
import { useSaveState } from "../core/autosave";
import { useWorkspace } from "../core/workspace";
import { groupMap } from "../core/groups";
import { commandById, runCommand, withKey } from "./commands";
import { Icon } from "./Icon";

function useCursorWorld() {
  const [p, setP] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    let raf = 0;
    let last: PointerEvent | null = null;
    const on = (e: PointerEvent) => {
      last = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const ev = last!;
        const t = ev.target as HTMLElement | null;
        if (!t?.closest?.(".canvas-host")) { setP(null); return; }
        const w = screenToWorld(useView.getState().camera, ev.clientX, ev.clientY);
        setP({ x: Math.round(w.x), y: Math.round(w.y) });
      });
    };
    window.addEventListener("pointermove", on, { passive: true });
    return () => { window.removeEventListener("pointermove", on); cancelAnimationFrame(raf); };
  }, []);
  return p;
}

export function StatusBar() {
  const zoom = useView((s) => s.camera.zoom);
  const pages = useDoc((s) => s.doc.pages.length);
  const idx = useDoc((s) => s.doc.pages.findIndex((p) => p.id === s.activePageId));
  const page = useDoc((s) => selectActivePage(s));
  const sel = useSel((s) => s.ids);
  useGroupCtx((s) => s.ctx);
  const tool = useTool((s) => s.tool);
  const save = useSaveState((s) => s.state);
  const ws = useWorkspace((s) => s.list.find((w) => w.id === s.activeId)?.name ?? "");
  const cur = useCursorWorld();
  const path = ctxPath(page);
  const grp = sel.length ? selectedGroup() : null;
  const grpName = grp ? groupMap(page).get(grp)?.name : null;
  const toolName = commandById(`tool.${tool}`)?.label ?? tool;

  return (
    <div className="statusbar" role="status" aria-label="Barra de status">
      <div className="sb-group">
        <button className="sb-btn" onClick={() => runCommand("view.zoomOut")} title={withKey("Afastar", "view.zoomOut")} aria-label="Afastar">−</button>
        <button className="sb-btn zoom" onClick={() => runCommand("view.zoom100")} title={withKey("Voltar para 100%", "view.zoom100")}>{Math.round(zoom * 100)}%</button>
        <button className="sb-btn" onClick={() => runCommand("view.zoomIn")} title={withKey("Aproximar", "view.zoomIn")} aria-label="Aproximar">+</button>
        <button className="sb-btn" onClick={() => runCommand("view.fitAll")} title={withKey("Ver tudo", "view.fitAll")} aria-label="Ver tudo">
          <Icon size={14}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Icon>
        </button>
      </div>
      <span className="sb-sep" />
      <span className="sb-coords" title="Posição do cursor no quadro">{cur ? `x ${cur.x} · y ${cur.y}` : "x — · y —"}</span>
      <span className="sb-sep" />
      <div className="sb-group">
        <button className="sb-btn" disabled={idx <= 0} onClick={() => goPage(-1)} aria-label="Página anterior" title={withKey("Página anterior", "page.prev")}>‹</button>
        <span className="sb-text">Página {idx + 1}/{pages}</span>
        <button className="sb-btn" disabled={idx >= pages - 1} onClick={() => goPage(1)} aria-label="Próxima página" title={withKey("Próxima página", "page.next")}>›</button>
      </div>
      {path.length > 0 && (
        <>
          <span className="sb-sep" />
          <nav className="sb-path" aria-label="Grupo aberto">
            <button className="sb-btn" onClick={() => { while (currentCtx()) exitGroup(); }} title="Voltar para a página">Página</button>
            {path.map((g, i) => (
              <span key={g.id}>›<button className="sb-btn" disabled={i === path.length - 1} onClick={() => { while (currentCtx() && currentCtx() !== g.id) exitGroup(); }}>{g.name}</button></span>
            ))}
            <button className="sb-btn" onClick={() => exitGroup()} title={withKey("Sair do grupo", "obj.exit")}>Sair (Esc)</button>
          </nav>
        </>
      )}
      <span className="sb-fill" />
      {sel.length > 0 && <span className="sb-text">{grpName ? `Grupo “${grpName}”` : `${sel.length} ${sel.length === 1 ? "objeto" : "objetos"}`}</span>}
      <span className="sb-sep" />
      <span className="sb-text" title="Ferramenta ativa">{toolName}</span>
      <span className="sb-sep" />
      <span className="sb-text" title="Área de trabalho">{ws}</span>
      <span className="sb-sep" />
      <span className={`sb-save ${save}`} title="Cópia automática neste dispositivo (Salvar exporta o arquivo .hiraku)">
        <i />{save === "saved" ? "Salvo" : save === "pending" ? "Salvando…" : "Erro ao salvar"}
      </span>
    </div>
  );
}
