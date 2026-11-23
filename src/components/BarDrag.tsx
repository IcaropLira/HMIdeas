// Arrastar bloquinhos e barras (sem alças): pressionar um bloquinho e arrastar alguns pixels o leva junto; pressionar o
// "corpo" da barra (entre os bloquinhos) leva a barra inteira. Durante o arraste uma cópia segue o ponteiro, um traço
// mostra onde ele vai entrar e as bordas da tela acendem quando ele vai encaixar ali.
import { ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { Bar, ItemId, ItemTarget, Layout, Side, isVertical, moveBar, moveItems, useLayout } from "../core/layout";
import { useUI } from "../core/ui";

const EDGE = 56;

/** Destino sob o ponteiro + a dica visual (string que a barra/zona sabe desenhar). */
export function dropTargetAt(x: number, y: number, L: Layout, drag: { kind: "item"; id: ItemId } | { kind: "bar"; id: string }): { target: ItemTarget; hint: string } {
  const vw = window.innerWidth, vh = window.innerHeight;
  const insetB = parseFloat(getComputedStyle(document.body).getPropertyValue("--insetB")) || 0;
  const insetL = parseFloat(getComputedStyle(document.body).getPropertyValue("--insetL")) || 0;
  const insetR = parseFloat(getComputedStyle(document.body).getPropertyValue("--insetR")) || 0;
  // 1) perto de uma barra: entra nela, na posição do ponteiro
  let best: { bar: Bar; el: HTMLElement; d: number } | null = null;
  for (const el of document.querySelectorAll<HTMLElement>("[data-bar]")) {
    const bar = L.bars.find((b) => b.id === el.dataset.bar);
    if (!bar) continue;
    if (drag.kind === "bar" && bar.id === drag.id) continue;
    if (drag.kind === "item" && bar.items.length === 1 && bar.items[0] === drag.id) continue; // a própria barra de um item só
    const r = el.getBoundingClientRect();
    const m = 38;
    if (x < r.left - m || x > r.right + m || y < r.top - m || y > r.bottom + m) continue;
    const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    if (!best || d < best.d) best = { bar, el, d };
  }
  if (best) {
    const { bar, el } = best;
    const cells = [...el.querySelectorAll<HTMLElement>(":scope > [data-item]")];
    const others = cells.filter((c) => !(drag.kind === "item" && c.dataset.item === drag.id));
    let vertical = isVertical(bar);
    let orient: boolean | undefined;
    if (!bar.dock && others.length === 1) {
      // barra de um bloquinho só: soltar em cima/embaixo dele forma uma coluna; dos lados, uma linha
      const r = others[0].getBoundingClientRect();
      const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
      vertical = Math.abs(dy) >= Math.abs(dx);
      orient = vertical;
    }
    let index = 0;
    cells.forEach((c) => {
      const r = c.getBoundingClientRect();
      if (vertical ? y > r.top + r.height / 2 : x > r.left + r.width / 2) index = cells.indexOf(c) + 1;
    });
    return { target: { kind: "into", bar: bar.id, index, vertical: orient }, hint: `into:${bar.id}:${index}` };
  }
  // 2) bordas da tela: barra nova encaixada naquele lado
  const side: Side | null = x < EDGE + insetL ? "left" : x > vw - EDGE - insetR ? "right" : y > vh - insetB - EDGE ? "bottom" : null;
  if (side) return { target: { kind: "dock", side }, hint: `dock:${side}` };
  // 3) solto no meio: barra flutuante onde o ponteiro está
  return { target: { kind: "float", x: x - 24, y: y - 24, vertical: true }, hint: "float" };
}

export function useBarDrag(layout: Layout) {
  const [ghost, setGhost] = useState<{ html: string; x: number; y: number; w: number; h: number } | null>(null);

  const start = (e: React.PointerEvent, bar: Bar) => {
    if (layout.locked || e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest("input, select, textarea, [data-nodrag]")) return;
    const cell = t.closest<HTMLElement>("[data-item]");
    const what = cell ? { kind: "item" as const, id: cell.dataset.item as ItemId } : { kind: "bar" as const, id: bar.id };
    const src = (cell ?? (e.currentTarget as HTMLElement));
    const sx = e.clientX, sy = e.clientY;
    const r0 = src.getBoundingClientRect();
    const off = { x: sx - r0.left, y: sy - r0.top };
    const threshold = e.pointerType === "mouse" ? 6 : 12;
    let dragging = false;
    let last: { target: ItemTarget; hint: string } | null = null;

    const move = (ev: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < threshold) return;
        dragging = true;
        document.body.classList.add("dragging-ui");
        useUI.getState().setDrag(`${what.kind}:${what.id}`);
      }
      ev.preventDefault();
      last = dropTargetAt(ev.clientX, ev.clientY, useLayout.getState().layout, what);
      if (last.target.kind === "float" && what.kind === "bar") last.target = { ...last.target, x: ev.clientX - off.x, y: ev.clientY - off.y };
      useUI.getState().setDrag(`${what.kind}:${what.id}`, last.hint);
      setGhost({ html: src.outerHTML, x: ev.clientX - off.x, y: ev.clientY - off.y, w: r0.width, h: r0.height });
    };
    const finish = (apply: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      document.body.classList.remove("dragging-ui");
      if (!dragging) return;
      // o clique que vem depois do arraste não pode acionar a ferramenta
      const swallow = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 50);
      setGhost(null);
      useUI.getState().setDrag(null);
      if (apply && last) {
        const tg = last.target;
        useLayout.getState().update((L) => (what.kind === "item" ? moveItems(L, [what.id], tg) : moveBar(L, what.id, tg)));
      }
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  const ghostNode: ReactNode = ghost
    ? createPortal(
        <div className="bar-ghost" style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h }} aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: ghost.html }} />,
        document.body,
      )
    : null;

  return { start, ghost: ghostNode };
}
