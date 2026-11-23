// Gerenciador de janelas acopláveis (UI). Áreas de encaixe nas 4 bordas com pilhas de abas, janelas flutuantes,
// divisórias redimensionáveis, recolher em ícones e indicadores de encaixe durante o arraste. O estado é o
// DockLayout do workspace ativo (core/docking.ts, puro); aqui só se desenha e se traduzem gestos em operações.
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DockLayout, DropTarget, ICON_STRIP, PanelId, SIDES, Side, areaExtent, closeContainer, closePanel, dropPanels, isVerticalSide,
  moveTab, panelLabel, raiseFloat, resizeArea, resizeStacks, setActive, setFloatRect, toggleCollapsed, toggleIconic,
} from "../core/docking";
import { useWorkspace } from "../core/workspace";
import { useTheme } from "../core/theme";
import { useTool } from "../core/store";
import { useUI } from "../core/ui";
import { Icon } from "./Icon";
import { LayersPanel } from "./LayersPanel";
import { BrushPanel } from "./BrushPanel";
import { ColorPicker } from "./ColorPicker";
import { PaperPanel } from "./PaperPanel";
import { MapPanel } from "./MapPanel";
import { SciencePanel } from "./SciencePanel";
import {
  AlignPanel, HistoryPanel, LibraryPanel, MaterialsPanel, NavigatorPanel, ObjectsPanel, PropsPanel, ShortcutsPanel, TextPanel, ToolsPanel, TransformPanel,
} from "./PanelViews";
import { MenuBar } from "./MenuBar";
import { OptionsBar } from "./ToolOptions";
import { StatusBar } from "./StatusBar";

export const PANEL_ICON: Record<PanelId, ReactNode> = {
  tools: <path d="M5 3l14 7-6 2-2 6L5 3z" />,
  props: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  transform: <><rect x="6" y="6" width="12" height="12" rx="1" strokeDasharray="3 2" /><path d="M3 3h4M3 3v4M21 21h-4M21 21v-4" /></>,
  align: <path d="M5 4v16M8 7h10v4H8zM8 13h6v4H8z" />,
  objects: <><path d="M4 6h4M10 6h10M6 12h4M12 12h8M6 18h4M12 18h8" /></>,
  layers: <><path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z" /><path d="M3.5 12L12 16.5 20.5 12" /><path d="M3.5 16L12 20.5 20.5 16" /></>,
  colors: <><circle cx="12" cy="12" r="8.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="15" cy="9" r="1.5" /><circle cx="8" cy="14" r="1.5" /></>,
  brushes: <><path d="M20 4l-8.5 8.5" /><path d="M11.5 12.5c-2.5-.5-4.5 1-4.5 3.5 0 1.5-1 2.5-3 3 2.5 2 7.5 1 8-1.5.4-2-.2-3.8-.5-5z" /></>,
  text: <><path d="M3 18l4.5-11L12 18M4.8 14h5.4" /><path d="M14 18l3-7 3 7M15 16h4" /></>,
  history: <><path d="M4 12a8 8 0 108-8 8 8 0 00-6.3 3" /><path d="M4 4v4h4M12 8v4l3 2" /></>,
  navigator: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><rect x="8" y="9" width="7" height="5" rx="1" /></>,
  library: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><path d="M16.5 13v7M13 16.5h7" /></>,
  materials: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  paper: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M4 15h16" /></>,
  map: <><circle cx="12" cy="12" r="2.5" /><circle cx="5" cy="6" r="1.8" /><circle cx="5" cy="18" r="1.8" /><circle cx="19" cy="9" r="1.8" /><path d="M10 11L6.5 7M10 13l-3.5 4M14.4 11l3-1.4" /></>,
  science: <><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="7" r="2.2" /><circle cx="11" cy="18" r="2.2" /><path d="M8 6.4l7.8.4M7 7.8l3 8.3M16.9 9l-4.6 7.2" /></>,
  shortcuts: <><rect x="3" y="7" width="18" height="11" rx="2" /><path d="M7 11h.01M11 11h.01M15 11h.01M8 15h8" /></>,
};

function PanelView({ id }: { id: PanelId }) {
  switch (id) {
    case "tools": return <ToolsPanel />;
    case "props": return <PropsPanel />;
    case "transform": return <TransformPanel />;
    case "align": return <AlignPanel />;
    case "objects": return <ObjectsPanel />;
    case "layers": return <LayersPanel />;
    case "colors": return <ColorPicker onEyedropper={() => { useTool.getState().set({ picking: true }); useUI.getState().showToast("Toque num desenho para pegar a cor dele."); }} />;
    case "brushes": return <BrushPanel />;
    case "text": return <TextPanel />;
    case "history": return <HistoryPanel />;
    case "navigator": return <NavigatorPanel />;
    case "library": return <LibraryPanel />;
    case "materials": return <MaterialsPanel />;
    case "paper": return <PaperPanel />;
    case "map": return <MapPanel />;
    case "science": return <SciencePanel />;
    case "shortcuts": return <ShortcutsPanel />;
  }
}

interface Drag {
  ids: PanelId[];
  active: PanelId;
  label: string;
  x: number;
  y: number;
  target: DropTarget | null;
  preview: { x: number; y: number; w: number; h: number } | null;
}

const css = (name: string) => parseFloat(getComputedStyle(document.body).getPropertyValue(name)) || 0;

/** Onde soltar, a partir do ponto (indicadores de encaixe). */
function targetAt(x: number, y: number, L: DockLayout, dragIds: PanelId[]): { target: DropTarget; preview: Drag["preview"] } {
  const vw = window.innerWidth, vh = window.innerHeight;
  const top = css("--chromeT"), bottom = vh - css("--statusH");
  const band = 44;
  // 1) bordas da janela (nova pilha encostada naquele lado)
  const edges: [Side, boolean][] = [
    ["left", x < band], ["right", x > vw - band], ["top", y < top + band && y > top - 4], ["bottom", y > bottom - band && y < bottom + 4],
  ];
  for (const [side, hit] of edges) {
    if (!hit) continue;
    const ext = L.areas[side].stacks.length ? areaExtent(L, side) : 280;
    const preview = side === "left" ? { x: 0, y: top, w: ext, h: bottom - top }
      : side === "right" ? { x: vw - ext, y: top, w: ext, h: bottom - top }
      : side === "top" ? { x: css("--dockL"), y: top, w: vw - css("--dockL") - css("--dockR"), h: L.areas.top.stacks.length ? L.areas.top.size : 200 }
      : { x: css("--dockL"), y: bottom - (L.areas.bottom.stacks.length ? L.areas.bottom.size : 200), w: vw - css("--dockL") - css("--dockR"), h: L.areas.bottom.stacks.length ? L.areas.bottom.size : 200 };
    return { target: { kind: "edge", side }, preview };
  }
  // 2) sobre uma pilha encaixada: aba (meio/cabeçalho) ou dividir (antes/depois)
  const hits = document.elementsFromPoint(x, y) as HTMLElement[];
  const st = hits.map((h) => h.closest<HTMLElement>("[data-stack]")).find(Boolean);
  if (st) {
    const side = st.dataset.side as Side, idx = +st.dataset.index!;
    const stack = L.areas[side].stacks[idx];
    const r = st.getBoundingClientRect();
    const inHead = !!hits.find((h) => h.closest(".dock-head"));
    const same = stack && stack.panels.length === dragIds.length && dragIds.every((p) => stack.panels.includes(p));
    const vertical = isVerticalSide(side);
    const f = vertical ? (y - r.top) / r.height : (x - r.left) / r.width;
    if (!same && (inHead || (f > 0.3 && f < 0.7))) return { target: { kind: "tab", side, stack: idx }, preview: { x: r.left, y: r.top, w: r.width, h: r.height } };
    const where = f < 0.5 ? "before" : "after";
    const preview = vertical
      ? { x: r.left, y: where === "before" ? r.top : r.top + r.height / 2, w: r.width, h: r.height / 2 }
      : { x: where === "before" ? r.left : r.left + r.width / 2, y: r.top, w: r.width / 2, h: r.height };
    if (!same) return { target: { kind: "split", side, stack: idx, where }, preview };
  }
  // 3) sobre uma janela flutuante: vira aba dela
  const fl = hits.map((h) => h.closest<HTMLElement>("[data-float]")).find(Boolean);
  if (fl) {
    const f = L.floats.find((w) => w.id === fl.dataset.float);
    if (f && !dragIds.every((p) => f.panels.includes(p))) {
      const r = fl.getBoundingClientRect();
      return { target: { kind: "tabf", float: f.id }, preview: { x: r.left, y: r.top, w: r.width, h: r.height } };
    }
  }
  // 4) solto: janela flutuante onde o ponteiro está
  const w = 320, h = 420;
  const fx = Math.max(8, Math.min(vw - w - 8, x - 60)), fy = Math.max(top + 4, Math.min(bottom - h - 8, y - 14));
  return { target: { kind: "float", x: fx, y: fy, w, h }, preview: { x: fx, y: fy, w, h } };
}

export function WindowChrome() {
  const ws = useWorkspace();
  const focus = useTheme((s) => s.focus);
  const L = ws.dock;
  const chrome = ws.chrome;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [peek, setPeek] = useState<{ side: Side; id: PanelId } | null>(null);
  const peekRef = useRef<HTMLDivElement>(null);

  // medidas das barras e áreas → variáveis CSS (as barras flutuantes antigas e os pop-ups se afastam delas)
  useLayoutEffect(() => {
    const s = document.body.style;
    const on = !focus;
    const menuH = on && chrome.menubar ? 34 : 0, optH = on && chrome.optionsbar ? 44 : 0, statusH = on && chrome.statusbar ? 28 : 0;
    const ext = (side: Side) => (on ? areaExtent(L, side) : 0);
    const vars: Record<string, number> = {
      "--menuH": menuH, "--optH": optH, "--statusH": statusH, "--chromeT": menuH + optH,
      "--dockL": ext("left"), "--dockR": ext("right"), "--dockT": ext("top"), "--dockB": ext("bottom"),
      "--insetT": menuH + optH + ext("top"), "--insetB": statusH + ext("bottom"), "--insetL": ext("left"), "--insetR": ext("right"),
    };
    for (const [k, v] of Object.entries(vars)) s.setProperty(k, `${v}px`);
    document.body.dataset.pills = on && !chrome.pills ? "off" : "on";
  }, [L, chrome, focus]);

  useEffect(() => {
    if (!peek) return;
    const off = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (peekRef.current?.contains(t) || t.closest?.(".dock-icons")) return;
      setPeek(null);
    };
    document.addEventListener("pointerdown", off, true);
    return () => document.removeEventListener("pointerdown", off, true);
  }, [peek]);

  if (focus) return null;
  const locked = L.locked;

  /** Gesto comum: aba (um painel) ou alça (a pilha toda). Arrastar 6px começa a mover; senão é clique. */
  const startTabGesture = (e: React.PointerEvent, ids: PanelId[], active: PanelId, onClick: () => void) => {
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging) {
        if (locked || Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        dragging = true;
        document.body.classList.add("dragging-ui");
      }
      const t = targetAt(ev.clientX, ev.clientY, useWorkspace.getState().dock, ids);
      setDrag({ ids, active, label: ids.length > 1 ? `${ids.length} painéis` : panelLabel(active), x: ev.clientX, y: ev.clientY, target: t.target, preview: t.preview });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      document.body.classList.remove("dragging-ui");
      if (!dragging) { onClick(); return; }
      const t = targetAt(ev.clientX, ev.clientY, useWorkspace.getState().dock, ids);
      setDrag(null);
      useWorkspace.getState().updateDock((D) => dropPanels(D, ids, t.target, active));
    };
    const cancel = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      document.body.classList.remove("dragging-ui");
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  /** Arraste genérico com valor inicial; `apply` recebe o deslocamento (persistindo só no fim). */
  const startResize = (e: React.PointerEvent, apply: (dx: number, dy: number, final: boolean) => void) => {
    if (locked) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    document.body.classList.add("dragging-ui");
    const move = (ev: PointerEvent) => apply(ev.clientX - sx, ev.clientY - sy, false);
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("dragging-ui");
      apply(ev.clientX - sx, ev.clientY - sy, true);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const tabs = (container: string, panels: PanelId[], active: PanelId) => (
    <div className={panels.length > 2 ? "dock-tabs many" : "dock-tabs"} role="tablist">
      {panels.map((p) => (
        <button key={p} role="tab" aria-selected={p === active} className={p === active ? "dock-tab on" : "dock-tab"} title={panelLabel(p)}
          onPointerDown={(e) => startTabGesture(e, [p], p, () => useWorkspace.getState().updateDock((D) => setActive(D, container, p)))}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              const i = panels.indexOf(p) + (e.key === "ArrowRight" ? 1 : -1);
              if (e.altKey) useWorkspace.getState().updateDock((D) => moveTab(D, p, i));
              else if (panels[i]) useWorkspace.getState().updateDock((D) => setActive(D, container, panels[i]));
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              useWorkspace.getState().updateDock((D) => setActive(D, container, p));
            }
          }}>
          <Icon size={15}>{PANEL_ICON[p]}</Icon><span>{panelLabel(p)}</span>
        </button>
      ))}
    </div>
  );

  const headButtons = (container: string, collapsed: boolean | undefined, side: Side | null, panels: PanelId[], active: PanelId) => (
    <div className="dock-hbtns">
      {side && <button className="dock-hb" onClick={() => useWorkspace.getState().updateDock((D) => toggleIconic(D, side, true))} title="Recolher a área em ícones" aria-label="Recolher em ícones">
        <Icon size={14}>{side === "right" ? <path d="M9 6l6 6-6 6" /> : side === "left" ? <path d="M15 6l-6 6 6 6" /> : side === "top" ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}</Icon>
      </button>}
      {side && !locked && <button className="dock-hb" onClick={() => useWorkspace.getState().updateDock((D) => dropPanels(D, panels, { kind: "float", x: Math.max(60, window.innerWidth / 2 - 160), y: 120, w: 320, h: 440 }, active))} title="Soltar como janela flutuante" aria-label="Flutuar">
        <Icon size={14}><rect x="8" y="4" width="12" height="12" rx="2" /><path d="M4 9v9a2 2 0 002 2h9" /></Icon>
      </button>}
      <button className="dock-hb" onClick={() => useWorkspace.getState().updateDock((D) => toggleCollapsed(D, container))} title={collapsed ? "Expandir" : "Minimizar"} aria-label={collapsed ? "Expandir" : "Minimizar"}>
        <Icon size={14}>{collapsed ? <path d="M6 9l6 6 6-6" /> : <path d="M6 15l6-6 6 6" />}</Icon>
      </button>
      <button className="dock-hb" onClick={() => useWorkspace.getState().updateDock((D) => (panels.length > 1 ? closePanel(D, active) : closeContainer(D, container)))} title={`Fechar ${panelLabel(active)}`} aria-label={`Fechar ${panelLabel(active)}`}>
        <Icon size={14}><path d="M6 6l12 12M18 6L6 18" /></Icon>
      </button>
    </div>
  );

  const area = (side: Side) => {
    const a = L.areas[side];
    if (!a.stacks.length) return null;
    const vertical = isVerticalSide(side);
    if (a.iconic) {
      const all = a.stacks.flatMap((s) => s.panels);
      return (
        <div key={side} className={`dock-area iconic ${side}`} data-dock={side} style={vertical ? { width: ICON_STRIP } : { height: ICON_STRIP }}>
          <div className="dock-icons" role="toolbar" aria-label={`Painéis recolhidos (${side})`}>
            <button className="dock-ib expand" onClick={() => useWorkspace.getState().updateDock((D) => toggleIconic(D, side, false))} title="Expandir a área" aria-label="Expandir a área">
              <Icon size={16}>{side === "right" ? <path d="M15 6l-6 6 6 6" /> : side === "left" ? <path d="M9 6l6 6-6 6" /> : side === "top" ? <path d="M6 9l6 6 6-6" /> : <path d="M6 15l6-6 6 6" />}</Icon>
            </button>
            {all.map((p) => (
              <button key={p} className={peek?.id === p ? "dock-ib on" : "dock-ib"} title={panelLabel(p)} aria-label={panelLabel(p)} aria-expanded={peek?.id === p}
                onPointerDown={(e) => startTabGesture(e, [p], p, () => setPeek(peek?.id === p ? null : { side, id: p }))}>
                <Icon size={18}>{PANEL_ICON[p]}</Icon>
              </button>
            ))}
          </div>
          {peek && peek.side === side && all.includes(peek.id) && (
            <div className={`dock-peek ${side}`} ref={peekRef} role="dialog" aria-label={panelLabel(peek.id)}>
              <div className="dock-head"><span className="dock-title"><Icon size={15}>{PANEL_ICON[peek.id]}</Icon>{panelLabel(peek.id)}</span>
                <button className="dock-hb" onClick={() => setPeek(null)} aria-label="Fechar"><Icon size={14}><path d="M6 6l12 12M18 6L6 18" /></Icon></button></div>
              <div className="dock-body"><PanelView id={peek.id} /></div>
            </div>
          )}
        </div>
      );
    }
    const style = vertical ? { width: a.size } : { height: a.size };
    return (
      <div key={side} className={`dock-area ${side}`} data-dock={side} style={style}>
        {!locked && (
          <div className={`dock-resize ${side}`} role="separator" aria-orientation={vertical ? "vertical" : "horizontal"} aria-label="Redimensionar a área"
            onPointerDown={(e) => { const s0 = a.size; startResize(e, (dx, dy, final) => {
              const d = side === "left" ? dx : side === "right" ? -dx : side === "top" ? dy : -dy;
              const D = resizeArea(useWorkspace.getState().dock, side, s0 + d);
              useWorkspace.getState().setDock(D, final);
            }); }} />
        )}
        {a.stacks.map((st, i) => (
          <div key={st.id} className="dock-slot" style={st.collapsed ? { flex: "0 0 auto" } : { flex: `${st.size} 1 0` }}>
            <section className={st.collapsed ? "dock-stack collapsed" : "dock-stack"} data-stack={st.id} data-side={side} data-index={i} aria-label={panelLabel(st.active)}>
              <div className="dock-head">
                {!locked && <span className="dock-grip" title="Arraste para mover a pilha inteira" aria-hidden="true"
                  onPointerDown={(e) => startTabGesture(e, st.panels, st.active, () => undefined)}>⠿</span>}
                {tabs(st.id, st.panels, st.active)}
                {headButtons(st.id, st.collapsed, side, st.panels, st.active)}
              </div>
              {!st.collapsed && <div className="dock-body" role="tabpanel"><PanelView id={st.active} /></div>}
            </section>
            {i < a.stacks.length - 1 && !locked && !st.collapsed && !a.stacks[i + 1].collapsed && (
              <div className={vertical ? "dock-split h" : "dock-split v"} role="separator" aria-label="Dividir painéis"
                onPointerDown={(e) => {
                  const slotA = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                  const slotB = (e.currentTarget.parentElement!.nextElementSibling as HTMLElement).getBoundingClientRect();
                  const total = vertical ? slotA.height + slotB.height : slotA.width + slotB.width;
                  const sz = vertical ? slotA.height : slotA.width;
                  startResize(e, (dx, dy, final) => {
                    const frac = (sz + (vertical ? dy : dx)) / total;
                    useWorkspace.getState().setDock(resizeStacks(useWorkspace.getState().dock, side, i, frac), final);
                  });
                }} />
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      {chrome.menubar && <MenuBar />}
      {chrome.optionsbar && <OptionsBar />}
      {SIDES.map(area)}
      {L.floats.map((f) => (
        <section key={f.id} className={f.collapsed ? "dock-float collapsed" : "dock-float"} data-float={f.id} style={{ left: f.x, top: f.y, width: f.w, height: f.collapsed ? undefined : f.h }}
          onPointerDown={() => { if (L.floats[L.floats.length - 1]?.id !== f.id) useWorkspace.getState().updateDock((D) => raiseFloat(D, f.id)); }} aria-label={`Janela: ${panelLabel(f.active)}`}>
          <div className="dock-head"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest("button")) return;
              const x0 = f.x, y0 = f.y;
              startResize(e, (dx, dy, final) => useWorkspace.getState().setDock(setFloatRect(useWorkspace.getState().dock, f.id, { x: x0 + dx, y: Math.max(0, y0 + dy) }), final));
            }}>
            {tabs(f.id, f.panels, f.active)}
            <div className="dock-hbtns">
              {!locked && <button className="dock-hb" title="Encaixar à direita" aria-label="Encaixar à direita" onClick={() => useWorkspace.getState().updateDock((D) => dropPanels(D, f.panels, { kind: "edge", side: "right" }, f.active))}>
                <Icon size={14}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M14 4v16" /></Icon>
              </button>}
              <button className="dock-hb" onClick={() => useWorkspace.getState().updateDock((D) => toggleCollapsed(D, f.id))} title={f.collapsed ? "Expandir" : "Minimizar"} aria-label={f.collapsed ? "Expandir" : "Minimizar"}>
                <Icon size={14}>{f.collapsed ? <path d="M6 9l6 6 6-6" /> : <path d="M6 15l6-6 6 6" />}</Icon>
              </button>
              <button className="dock-hb" onClick={() => useWorkspace.getState().updateDock((D) => (f.panels.length > 1 ? closePanel(D, f.active) : closeContainer(D, f.id)))} aria-label={`Fechar ${panelLabel(f.active)}`} title="Fechar">
                <Icon size={14}><path d="M6 6l12 12M18 6L6 18" /></Icon>
              </button>
            </div>
          </div>
          {!f.collapsed && <div className="dock-body"><PanelView id={f.active} /></div>}
          {!f.collapsed && !locked && (
            <div className="dock-float-resize" role="separator" aria-label="Redimensionar janela"
              onPointerDown={(e) => { const w0 = f.w, h0 = f.h; startResize(e, (dx, dy, final) => useWorkspace.getState().setDock(setFloatRect(useWorkspace.getState().dock, f.id, { w: w0 + dx, h: h0 + dy }), final)); }} />
          )}
        </section>
      ))}
      {chrome.statusbar && <StatusBar />}
      {drag && (
        <div className="dock-overlay" aria-hidden="true">
          {(["left", "right", "top", "bottom"] as Side[]).map((s) => (
            <div key={s} className={drag.target?.kind === "edge" && drag.target.side === s ? `dock-edge ${s} on` : `dock-edge ${s}`}>
              <span>{s === "left" ? "Esquerda" : s === "right" ? "Direita" : s === "top" ? "Em cima" : "Embaixo"}</span>
            </div>
          ))}
          {drag.preview && <div className={`dock-preview ${drag.target?.kind ?? ""}`} style={{ left: drag.preview.x, top: drag.preview.y, width: drag.preview.w, height: drag.preview.h }}>
            <span>{drag.target?.kind === "tab" || drag.target?.kind === "tabf" ? "Juntar como aba" : drag.target?.kind === "split" ? "Dividir aqui" : drag.target?.kind === "edge" ? "Encaixar na borda" : "Janela flutuante"}</span>
          </div>}
          <div className="dock-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }}><Icon size={15}>{PANEL_ICON[drag.active]}</Icon>{drag.label}</div>
        </div>
      )}
    </>
  );
}
