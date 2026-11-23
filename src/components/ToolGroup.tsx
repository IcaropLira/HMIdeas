// Ferramentas agrupadas (como no Clip Studio/Photoshop): o botão mostra a última ferramenta usada do grupo; segurar
// (toque longo), clicar com o botão direito ou no triângulo abre as alternativas; duplo clique abre as propriedades.
import { ReactNode, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { shortcutOf, withKey } from "./commands";
import { showPanel } from "../core/workspace";

export interface ToolItem { id: string; label: string; icon: ReactNode; active: boolean; run: () => void; cmd?: string }

const KEY = "hm-ideas:tool-groups";
interface GroupsState { last: Record<string, string>; remember: (group: string, id: string) => void }
export const useToolGroups = create<GroupsState>((set, get) => ({
  last: (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } })(),
  remember: (group, id) => {
    if (get().last[group] === id) return;
    const last = { ...get().last, [group]: id };
    set({ last });
    try { localStorage.setItem(KEY, JSON.stringify(last)); } catch { /* sem armazenamento */ }
  },
}));

export function ToolGroupBtn({ group, items, label }: { group: string; items: ToolItem[]; label: string }) {
  const last = useToolGroups((s) => s.last[group]);
  const [open, setOpen] = useState<{ x: number; y: number; side: "right" | "left" | "up" } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const fly = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const active = items.find((i) => i.active);
  const shown = active ?? items.find((i) => i.id === last) ?? items[0];

  // o grupo lembra a ferramenta escolhida por qualquer caminho (atalho, menu, flyout)
  useEffect(() => { if (active) useToolGroups.getState().remember(group, active.id); }, [active?.id, group]);

  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!fly.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(null); btn.current?.focus(); } };
    document.addEventListener("pointerdown", off, true);
    window.addEventListener("keydown", esc, true);
    requestAnimationFrame(() => fly.current?.querySelector<HTMLButtonElement>("button[aria-checked=true], button")?.focus());
    return () => { document.removeEventListener("pointerdown", off, true); window.removeEventListener("keydown", esc, true); };
  }, [open]);

  const openFly = () => {
    const r = btn.current!.getBoundingClientRect();
    const vw = window.innerWidth;
    // barra vertical: abre ao lado; horizontal: abre em cima
    const vertical = !!btn.current!.closest(".vbar");
    if (vertical) setOpen(r.left < vw / 2 ? { x: r.right + 6, y: r.top, side: "right" } : { x: r.left - 6, y: r.top, side: "left" });
    else setOpen({ x: r.left, y: r.top - 6, side: "up" });
  };

  const pick = (it: ToolItem) => { it.run(); useToolGroups.getState().remember(group, it.id); setOpen(null); };

  return (
    <>
      <button
        ref={btn}
        className={shown.active ? "btn tgroup on" : "btn tgroup"}
        aria-label={shown.label}
        aria-pressed={shown.active}
        aria-haspopup={items.length > 1 ? "menu" : undefined}
        aria-expanded={items.length > 1 ? !!open : undefined}
        title={`${shown.cmd ? withKey(shown.label, shown.cmd) : shown.label}${items.length > 1 ? ` — segure ou botão direito: ${label}` : ""}`}
        onPointerDown={(e) => {
          if (items.length < 2 || e.button !== 0) return;
          longFired.current = false;
          timer.current = setTimeout(() => { longFired.current = true; openFly(); }, 430);
        }}
        onPointerUp={() => { if (timer.current) clearTimeout(timer.current); }}
        onPointerLeave={() => { if (timer.current) clearTimeout(timer.current); }}
        onClick={() => { if (longFired.current) { longFired.current = false; return; } shown.run(); }}
        onDoubleClick={() => showPanel("props")}
        onContextMenu={(e) => { if (items.length < 2) return; e.preventDefault(); openFly(); }}
        onKeyDown={(e) => { if (items.length > 1 && (e.key === "ArrowDown" || (e.key === "Enter" && e.altKey))) { e.preventDefault(); openFly(); } }}
      >
        <Icon>{shown.icon}</Icon>
        {items.length > 1 && <i className="tg-corner" aria-hidden="true" />}
      </button>
      {open && createPortal(
        <div ref={fly} className={`tg-fly ${open.side}`} role="menu" aria-label={label}
          style={open.side === "up" ? { left: open.x, bottom: window.innerHeight - open.y } : open.side === "right" ? { left: open.x, top: open.y } : { right: window.innerWidth - open.x, top: open.y }}
          onKeyDown={(e) => {
            const bs = [...(fly.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
            const i = bs.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === "ArrowDown") { e.preventDefault(); bs[(i + 1) % bs.length]?.focus(); }
            if (e.key === "ArrowUp") { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length]?.focus(); }
          }}>
          <div className="tg-title">{label}</div>
          {items.map((it) => (
            <button key={it.id} role="menuitemradio" aria-checked={it.active} className={it.active ? "tg-item on" : "tg-item"} onClick={() => pick(it)}>
              <Icon size={18}>{it.icon}</Icon><span>{it.label}</span><kbd>{it.cmd ? shortcutOf(it.cmd) : ""}</kbd>
            </button>
          ))}
          <button className="tg-item opts" onClick={() => { setOpen(null); showPanel("props"); }}><span className="tg-pad" /><span>Opções da ferramenta…</span><kbd /></button>
        </div>,
        document.body,
      )}
    </>
  );
}
