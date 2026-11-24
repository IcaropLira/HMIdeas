// Barra contextual flutuante: aparece junto da seleção (e só quando há seleção), com as ações daquele caso:
// um objeto, vários objetos ou um grupo. Some enquanto se arrasta, para não atrapalhar.
import { ReactNode, useEffect, useRef, useState } from "react";
import { selectActivePage, useDoc, useSel, useTool, useView } from "../core/store";
import { useUI } from "../core/ui";
import { useEdit } from "../core/textEdit";
import { currentCtx, selectedGroup, useGroupCtx } from "../core/groupActions";
import { groupMap } from "../core/groups";
import { selectionBox, setSelectionBox } from "../core/alignActions";
import { usePageEdit } from "../core/pageEdit";
import { Icon } from "./Icon";
import { runCommand, shortcutOf, withKey } from "./commands";
import { AlignButtons } from "./ToolOptions";

type Pop = null | "move" | "arrange" | "align" | "dist" | "more";

const I = {
  move: <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />,
  dup: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></>,
  arrange: <><rect x="4" y="4" width="10" height="10" rx="1.5" /><rect x="10" y="10" width="10" height="10" rx="1.5" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
  more: <><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></>,
  group: <><rect x="3.5" y="3.5" width="17" height="17" rx="2" strokeDasharray="3 2.5" /><rect x="7" y="7" width="5" height="5" rx="1" /><rect x="12" y="12" width="5" height="5" rx="1" /></>,
  ungroup: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /><path d="M13 4h7v7M4 13v7h7" strokeDasharray="2 2" /></>,
  enter: <><rect x="3.5" y="3.5" width="17" height="17" rx="2" strokeDasharray="3 2.5" /><path d="M9 12h7M13 9l3 3-3 3" /></>,
  align: <path d="M5 4v16M8 7h10v4H8zM8 13h6v4H8z" />,
  dist: <path d="M4 4v16M20 4v16M9 8h6v8H9z" />,
  edit: <path d="M4 20l4-1 11-11a2.1 2.1 0 00-3-3L5 16l-1 4z" />,
  exit: <path d="M14 7l-5 5 5 5M20 12H9M4 4v16" />,
};

function Btn({ icon, label, onClick, on, cmd }: { icon: ReactNode; label: string; onClick: () => void; on?: boolean; cmd?: string }) {
  return (
    <button className={on ? "cb-btn on" : "cb-btn"} onClick={onClick} aria-label={label} title={cmd ? withKey(label, cmd) : label} aria-expanded={on}>
      <Icon size={18}>{icon}</Icon><span>{label}</span>
    </button>
  );
}

function MenuItem({ cmd, label }: { cmd: string; label?: string }) {
  return (
    <button className="cb-item" onClick={() => runCommand(cmd)}>
      <span>{label ?? cmd}</span><kbd>{shortcutOf(cmd)}</kbd>
    </button>
  );
}

/** Campos X/Y/L/A da seleção (também usados no painel Transformação). */
export function TransformFields() {
  useDoc((s) => s.doc);
  useSel((s) => s.ids);
  const [ratio, setRatio] = useState(false);
  const b = selectionBox();
  if (!b) return <p className="hint">Selecione algo para ver posição e tamanho.</p>;
  const f = (label: string, v: number, set: (n: number) => void) => (
    <label className="tf-field">
      <span>{label}</span>
      <input type="number" step={1} key={`${label}${Math.round(v)}`} defaultValue={Math.round(v)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        onBlur={(e) => { const n = +e.target.value; if (Number.isFinite(n) && Math.round(n) !== Math.round(v)) set(n); }} aria-label={label} />
    </label>
  );
  return (
    <div className="tf-grid">
      {f("X", b.minX, (x) => setSelectionBox({ x }))}
      {f("Y", b.minY, (y) => setSelectionBox({ y }))}
      {f("L", b.maxX - b.minX, (w) => setSelectionBox({ w: Math.max(1, w) }, ratio))}
      {f("A", b.maxY - b.minY, (h) => setSelectionBox({ h: Math.max(1, h) }, ratio))}
      <button className={ratio ? "btn sm on" : "btn sm"} aria-pressed={ratio} onClick={() => setRatio(!ratio)} title="Manter proporção" aria-label="Manter proporção">
        <Icon size={16}><path d="M9 15l6-6M8 12l-2 2a3 3 0 004 4l2-2M16 12l2-2a3 3 0 00-4-4l-2 2" /></Icon>
      </button>
    </div>
  );
}

export function ContextBar() {
  const ids = useSel((s) => s.ids);
  const cam = useView((s) => s.camera);
  const busy = useUI((s) => s.busy);
  const tool = useTool((s) => s.tool);
  const editing = useEdit((s) => !!s.session);
  const pageEditing = usePageEdit((s) => !!s.id);
  const home = useUI((s) => s.notebooksOpen);
  const page = useDoc((s) => selectActivePage(s));
  useGroupCtx((s) => s.ctx);
  const [pop, setPop] = useState<Pop>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setPop(null), [ids.join(",")]);
  useEffect(() => {
    if (!pop) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setPop(null); };
    document.addEventListener("pointerdown", off, true);
    return () => document.removeEventListener("pointerdown", off, true);
  }, [pop]);

  if (!ids.length || busy || editing || pageEditing || home || (tool !== "select" && tool !== "lasso")) return null;
  const b = selectionBox();
  if (!b) return null;
  const grp = selectedGroup();
  const ctx = currentCtx(page);
  const els = page.elements.filter((e) => ids.includes(e.id));
  const one = !grp && els.length === 1 ? els[0] : null;
  const editable = !!one && (one.type === "text" || one.type === "node" || one.type === "frame" || (one.type === "attachment" && one.kind === "block") || one.type === "arrow" || one.type === "line");

  // posição: acima da seleção, centralizada; se não couber, embaixo
  const vw = window.innerWidth, vh = window.innerHeight;
  const top = b.minY * cam.zoom + cam.y, bottom = b.maxY * cam.zoom + cam.y;
  const cx = ((b.minX + b.maxX) / 2) * cam.zoom + cam.x;
  const topInset = parseFloat(getComputedStyle(document.body).getPropertyValue("--insetT")) || 0;
  const above = top - 64 > topInset + 8;
  let y = above ? top - 58 : bottom + 40;
  y = Math.max(topInset + 8, Math.min(vh - 120, y));
  const x = Math.max(8, Math.min(vw - 8, cx));
  const toggle = (p: Exclude<Pop, null>) => setPop(pop === p ? null : p);

  let main: ReactNode;
  if (grp) {
    main = (
      <>
        <Btn icon={I.ungroup} label="Desagrupar" cmd="obj.ungroup" onClick={() => runCommand("obj.ungroup")} />
        <Btn icon={I.enter} label="Entrar" cmd="obj.enter" onClick={() => runCommand("obj.enter")} />
        <Btn icon={I.dup} label="Duplicar" cmd="edit.duplicate" onClick={() => runCommand("edit.duplicate")} />
        <Btn icon={I.lock} label="Travar" cmd="obj.lock" onClick={() => runCommand("obj.lock")} />
      </>
    );
  } else if (els.length > 1) {
    main = (
      <>
        <Btn icon={I.group} label="Agrupar" cmd="obj.group" onClick={() => runCommand("obj.group")} />
        <Btn icon={I.dup} label="Duplicar" cmd="edit.duplicate" onClick={() => runCommand("edit.duplicate")} />
        <Btn icon={I.align} label="Alinhar" on={pop === "align"} onClick={() => toggle("align")} />
        <Btn icon={I.dist} label="Distribuir" on={pop === "dist"} onClick={() => toggle("dist")} />
      </>
    );
  } else {
    main = (
      <>
        {editable && <Btn icon={I.edit} label="Editar" cmd="edit.text" onClick={() => runCommand("edit.text") || runCommand("map.edgeLabel")} />}
        <Btn icon={I.move} label="Mover" on={pop === "move"} onClick={() => toggle("move")} />
        <Btn icon={I.dup} label="Duplicar" cmd="edit.duplicate" onClick={() => runCommand("edit.duplicate")} />
        <Btn icon={I.arrange} label="Organizar" on={pop === "arrange"} onClick={() => toggle("arrange")} />
        <Btn icon={I.lock} label="Travar" cmd="obj.lock" onClick={() => runCommand("obj.lock")} />
      </>
    );
  }

  return (
    <div className="ctxbar" ref={ref} style={{ left: x, top: y }} role="toolbar" aria-label="Ações da seleção">
      <div className="cb-row">
        {ctx && <Btn icon={I.exit} label="Sair do grupo" cmd="obj.exit" onClick={() => runCommand("obj.exit")} />}
        {main}
        <Btn icon={I.more} label="Mais" on={pop === "more"} onClick={() => toggle("more")} />
      </div>
      {pop && (
        <div className={`cb-pop ${above ? "below" : "above"}`} role="menu">
          {pop === "move" && (<><div className="sec-title">Posição e tamanho</div><TransformFields /><p className="hint small">Arraste para mover · setas movem 1 px (Shift: 10) · Alt+arrastar duplica.</p></>)}
          {pop === "align" && (<><div className="sec-title">Alinhar</div><AlignButtons big /><MenuItem cmd="arr.center" label="Centralizar na tela" /></>)}
          {pop === "dist" && (
            <>
              <MenuItem cmd="dist.h" label="Espaços iguais na horizontal" />
              <MenuItem cmd="dist.v" label="Espaços iguais na vertical" />
              <MenuItem cmd="dist.hc" label="Centros na horizontal" />
              <MenuItem cmd="dist.vc" label="Centros na vertical" />
              <MenuItem cmd="arr.grid" label="Organizar em grade" />
              <MenuItem cmd="eq.w" label="Igualar larguras" />
              <MenuItem cmd="eq.h" label="Igualar alturas" />
              <MenuItem cmd="eq.both" label="Igualar tamanhos" />
            </>
          )}
          {pop === "arrange" && (
            <>
              <MenuItem cmd="arr.front" label="Trazer para a frente" />
              <MenuItem cmd="arr.forward" label="Avançar" />
              <MenuItem cmd="arr.backward" label="Recuar" />
              <MenuItem cmd="arr.back" label="Enviar para trás" />
              <div className="mb-sep" />
              <MenuItem cmd="arr.flipH" label="Espelhar na horizontal" />
              <MenuItem cmd="arr.flipV" label="Espelhar na vertical" />
              <MenuItem cmd="arr.rotCW" label="Girar 90°" />
              <MenuItem cmd="arr.center" label="Centralizar na tela" />
            </>
          )}
          {pop === "more" && (
            <>
              {ctx && <MenuItem cmd="obj.release" label="Tirar do grupo" />}
              {!grp && els.length > 1 && <MenuItem cmd="obj.group" label="Agrupar" />}
              {grp && <MenuItem cmd="obj.group" label="Agrupar com outro nível" />}
              <MenuItem cmd="edit.copy" label="Copiar" />
              <MenuItem cmd="edit.cut" label="Recortar" />
              <MenuItem cmd="obj.hide" label="Ocultar" />
              <MenuItem cmd="edit.selectSame" label="Selecionar do mesmo tipo" />
              <MenuItem cmd="obj.frame" label="Envolver em quadro" />
              {els.length > 1 && <MenuItem cmd="obj.connect" label="Ligar com seta" />}
              <MenuItem cmd="panel.props" label="Propriedades" />
              <MenuItem cmd="panel.objects" label="Objetos" />
              <div className="mb-sep" />
              <button className="cb-item danger" onClick={() => runCommand("edit.delete")}><span>Apagar</span><kbd>{shortcutOf("edit.delete")}</kbd></button>
            </>
          )}
        </div>
      )}
      {grp && <span className="cb-tag">{groupMap(page).get(grp)?.name}</span>}
    </div>
  );
}
