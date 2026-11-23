import { PointerEvent as ReactPointerEvent } from "react";
import { BLOCKS, BlockId, FloatPos, Rect, blocksOn, dockGroup, floatSide, groupMembers, leaderOf, mergeGroups, snapPosition, snapToRects, useLayout } from "../core/layout";
import { useUI } from "../core/ui";

/** Margem da barra flutuante (padding 6px + borda 1px no CSS `.fbar`): o conteúdo não pula ao começar a arrastar. */
const FLOAT_PAD = 7;

const label = (id: BlockId) => BLOCKS.find((b) => b.id === id)?.label ?? id;
const viewport = () => ({ w: window.innerWidth, h: window.innerHeight });
/** Espaço ocupado pela barra de páginas (quando aberta em tela larga): o ímã da esquerda cola depois dela. */
const insetLeft = () => (useUI.getState().sidebarOpen && window.innerWidth > 760 ? 256 : 0);

const floatBar = (id: BlockId) => document.querySelector<HTMLElement>(`[data-fbar="${id}"]`);
const sizeOf = (el: Element | null | undefined, fallback: { w: number; h: number }) => {
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 ? { w: r.width, h: r.height } : fallback;
};

type Hint = { kind: "zone"; side: "bottom" | "left" | "right" } | { kind: "block"; id: BlockId; before: boolean; float: boolean };

/** O que está sob o ponteiro: uma zona de encaixe, ou um bloco de OUTRA barra (encaixada ou flutuante) para juntar. */
function hintAt(x: number, y: number, leader: BlockId): Hint | null {
  const els = (document.elementsFromPoint?.(x, y) ?? []).filter((el) => !el.closest(`[data-fbar="${leader}"]`));
  for (const el of els) {
    const z = el.closest<HTMLElement>("[data-dropzone]");
    if (z) return { kind: "zone", side: z.dataset.dropzone as "bottom" | "left" | "right" };
    const b = el.closest<HTMLElement>("[data-block]");
    if (b) {
      const r = b.getBoundingClientRect();
      const vertical = !!b.closest(".vbar");
      const before = vertical ? y < r.top + r.height / 2 : x < r.left + r.width / 2;
      return { kind: "block", id: b.dataset.block as BlockId, before, float: !!b.closest("[data-fbar]") };
    }
  }
  return null;
}
const hintKey = (h: Hint | null) => (!h ? null : h.kind === "zone" ? `zone:${h.side}` : `block:${h.id}:${h.before ? "b" : "a"}`);

/** Retângulos das OUTRAS barras na tela (flutuantes e encaixadas), para o ímã entre barras. */
function otherBars(leader: BlockId): Rect[] {
  const out: Rect[] = [];
  const all = document.querySelectorAll?.<HTMLElement>("[data-fbar], [data-rail]") ?? [];
  all.forEach((el) => {
    if (el.dataset.fbar === leader) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0) out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
  });
  return out;
}

type DragTarget = { kind: "block"; id: BlockId } | { kind: "group"; leader: BlockId } | { kind: "side"; side: "bottom" | "left" | "right" };

/**
 * Arrasta um bloco, um GRUPO de blocos flutuantes ou uma BARRA inteira (lego): o que é arrastado vira (ou já é) um grupo
 * flutuante, segue o ponteiro com ímã nas bordas da tela e nas outras barras, e ao soltar:
 * - numa zona de encaixe → encaixa o grupo todo naquela barra;
 * - sobre um bloco de outra barra (encaixada ou flutuante) → junta tudo ali, antes/depois dele;
 * - em qualquer outro lugar → fica flutuando.
 * Usa listeners na JANELA (o bloco troca de contêiner durante o gesto e o React recria o elemento).
 */
function startDrag(e: ReactPointerEvent<HTMLElement>, target: DragTarget) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  const sel = target.kind === "block" ? "[data-block]" : target.kind === "group" ? "[data-fbar]" : "[data-rail]";
  const box = (e.currentTarget as HTMLElement).closest<HTMLElement>(sel);
  if (!box) return;
  e.preventDefault(); // sem selecionar texto nem rolar a página
  e.stopPropagation?.();
  const before = useLayout.getState().layout;
  const r = box.getBoundingClientRect();
  const leaderNow = target.kind === "block" ? leaderOf(before, target.id) : target.kind === "group" ? target.leader : null;
  // um bloco que flutua sozinho se comporta como o próprio grupo
  const alone = target.kind === "block" && leaderNow === target.id && groupMembers(before, target.id).length === 1;
  let start: FloatPos;
  let size: { w: number; h: number };
  if (target.kind === "group" || alone) {
    const id = target.kind === "group" ? target.leader : (target as { id: BlockId }).id;
    start = before.floats[id] ?? { x: r.left, y: r.top, vertical: false };
    size = sizeOf(floatBar(id), { w: r.width, h: r.height });
  } else if (target.kind === "block") {
    const side = before.side[target.id];
    const vertical = side === "float" ? before.floats[leaderNow!]?.vertical ?? false : side === "left" || side === "right";
    start = { x: r.left - FLOAT_PAD, y: r.top - FLOAT_PAD, vertical };
    size = { w: r.width + 2 * FLOAT_PAD, h: r.height + 2 * FLOAT_PAD };
  } else {
    start = { x: r.left, y: r.top, vertical: target.side !== "bottom" };
    size = { w: r.width, h: r.height };
  }
  const off = { x: e.clientX - start.x, y: e.clientY - start.y };
  let last: FloatPos = start;
  let leader: BlockId | null = target.kind === "group" ? target.leader : alone ? (target as { id: BlockId }).id : null;

  // Só vira flutuante no primeiro movimento real: um clique sem mover não muda nada.
  let moved = false;
  const pointerId = e.pointerId;
  document.body.classList.add("dragging-ui");

  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    if (!moved) {
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return; // tolerância: tremor da caneta/dedo
      moved = true;
      const st = useLayout.getState();
      if (target.kind === "block" && !alone) { st.setFloat(target.id, start, false); leader = target.id; }
      else if (target.kind === "side") {
        const res = floatSide(st.layout, target.side, start);
        leader = res.leader;
        st.setLayout(res.layout, false);
      }
    }
    if (!leader) return;
    size = sizeOf(floatBar(leader), size);
    useUI.getState().setDrag(leader, hintKey(hintAt(ev.clientX, ev.clientY, leader)));
    // Durante o gesto o ímã vale, mas a orientação só muda ao soltar (a troca mudaria o tamanho no meio do arraste e tremeria).
    const raw = snapToRects({ x: ev.clientX - off.x, y: ev.clientY - off.y }, size, otherBars(leader));
    const s = snapPosition(raw, size, viewport(), last.vertical, { insetLeft: insetLeft() });
    last = { x: s.x, y: s.y, vertical: last.vertical };
    useLayout.getState().setFloat(leader, last, false);
  };

  const finish = (ev: PointerEvent, cancelled: boolean) => {
    if (ev.pointerId !== pointerId) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    document.body.classList.remove("dragging-ui");
    const st = useLayout.getState();
    const hint = moved && !cancelled && leader ? hintAt(ev.clientX, ev.clientY, leader) : null;
    useUI.getState().setDrag(null);
    if (!moved || !leader) return; // só um toque: nada mudou
    if (cancelled) { st.setLayout(before); return; } // gesto cancelado pelo sistema: volta para onde estava
    const L = st.layout;
    if (hint?.kind === "zone") { st.setLayout(dockGroup(L, leader, hint.side)); return; }
    if (hint?.kind === "block") {
      if (hint.float) { st.setLayout(mergeGroups(L, leader, hint.id, hint.before)); return; }
      const side = L.side[hint.id];
      if (side === "bottom" || side === "left" || side === "right") {
        const order = blocksOn(L, side);
        const i = order.indexOf(hint.id);
        st.setLayout(dockGroup(L, leader, side, hint.before ? hint.id : order[i + 1] ?? null));
        return;
      }
    }
    const raw = snapToRects({ x: last.x, y: last.y }, size, otherBars(leader));
    const final = snapPosition(raw, size, viewport(), last.vertical, { insetLeft: insetLeft(), pointer: { x: ev.clientX, y: ev.clientY } });
    st.setFloat(leader, { x: final.x, y: final.y, vertical: final.vertical });
  };
  const up = (ev: PointerEvent) => finish(ev, false);
  const cancel = (ev: PointerEvent) => finish(ev, true);

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
}

/** Arrasta um bloco: sai da barra (ou do grupo) e vira flutuante sozinho. */
export const startBlockDrag = (e: ReactPointerEvent<HTMLElement>, id: BlockId) => startDrag(e, { kind: "block", id });
/** Arrasta um grupo flutuante inteiro. */
export const startGroupDrag = (e: ReactPointerEvent<HTMLElement>, leader: BlockId) => startDrag(e, { kind: "group", leader });
/** Arrasta a barra inteira de um lado (esquerda, direita ou embaixo). */
export const startSideDrag = (e: ReactPointerEvent<HTMLElement>, side: "bottom" | "left" | "right") => startDrag(e, { kind: "side", side });

/** Gira (horizontal ↔ vertical) um bloco flutuante. */
export function rotateBlock(id: BlockId) {
  const { layout, setFloat } = useLayout.getState();
  const p = layout.floats[id];
  if (layout.side[id] === "float" && p) setFloat(id, { ...p, vertical: !p.vertical });
}

/**
 * Alça de arrastar: 6 pontos (2 colunas × 3 linhas). Some quando as posições estão travadas.
 * É só para ponteiro (mouse, caneta, toque); o caminho por teclado e leitor de tela é o menu de Configurações.
 */
export function BlockHandle({ id }: { id: BlockId }) {
  const locked = useLayout((s) => s.layout.locked);
  if (locked) return null;
  return (
    <div
      className="grip"
      data-grip={id}
      title={`Arraste para mover “${label(id)}” (duplo clique gira quando flutuante)`}
      aria-hidden="true"
      onPointerDown={(e) => startBlockDrag(e, id)}
      onDoubleClick={() => rotateBlock(id)}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => <i key={i} />)}
    </div>
  );
}

/**
 * Alça de uma BARRA inteira (lateral, de baixo ou grupo flutuante): uma pílula, diferente dos 6 pontos dos blocos.
 * Arrastar leva todos os blocos juntos; duplo clique gira o grupo flutuante.
 */
export function BarHandle({ side, leader, vertical }: { side?: "bottom" | "left" | "right"; leader?: BlockId; vertical: boolean }) {
  const locked = useLayout((s) => s.layout.locked);
  if (locked) return null;
  return (
    <div
      className={vertical ? "bargrip v" : "bargrip"}
      title="Arraste para mover a barra inteira (solte numa zona ou em outra barra para juntar)"
      aria-hidden="true"
      onPointerDown={(e) => (leader ? startGroupDrag(e, leader) : side ? startSideDrag(e, side) : undefined)}
      onDoubleClick={() => leader && rotateBlock(leader)}
    >
      <i />
    </div>
  );
}
