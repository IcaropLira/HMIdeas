import { PointerEvent as ReactPointerEvent } from "react";
import { BLOCKS, BlockId, FloatPos, snapPosition, useLayout } from "../core/layout";
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

/**
 * Arrasta um bloco: ele vira flutuante no lugar onde está, segue o ponteiro (com ímã nas bordas e limite da tela)
 * e, ao soltar, grava a posição final. Usa listeners na JANELA, e não captura de ponteiro no botão, porque o bloco
 * muda de contêiner (barra → flutuante) durante o gesto e o React recria o elemento.
 */
export function startBlockDrag(e: ReactPointerEvent<HTMLElement>, id: BlockId) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  const block = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-block]");
  if (!block) return;
  e.preventDefault(); // sem selecionar texto nem rolar a página
  const store = useLayout.getState();
  const before = store.layout;
  const r = block.getBoundingClientRect();
  const vertical = before.side[id] === "float" ? before.floats[id]?.vertical ?? false : before.side[id] === "left" || before.side[id] === "right";
  const wasFloat = before.side[id] === "float";
  const start: FloatPos = wasFloat && before.floats[id] ? before.floats[id]! : { x: r.left - FLOAT_PAD, y: r.top - FLOAT_PAD, vertical };
  const off = { x: e.clientX - start.x, y: e.clientY - start.y };
  let size = wasFloat ? sizeOf(floatBar(id), { w: r.width + 2 * FLOAT_PAD, h: r.height + 2 * FLOAT_PAD }) : { w: r.width + 2 * FLOAT_PAD, h: r.height + 2 * FLOAT_PAD };
  let last: FloatPos = start;

  // Começa a flutuar já (sem gravar): se for só um clique sem mover, volta ao que era no `finish`.
  let moved = false;
  const pointerId = e.pointerId;
  document.body.classList.add("dragging-ui");

  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    if (!moved) {
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return; // tolerância: não arrasta por tremor da caneta/dedo
      moved = true;
      useLayout.getState().setFloat(id, start, false);
    }
    size = sizeOf(floatBar(id), size);
    // Durante o gesto o ímã vale, mas a orientação só muda ao soltar (a troca mudaria o tamanho no meio do arraste e tremeria).
    const s = snapPosition({ x: ev.clientX - off.x, y: ev.clientY - off.y }, size, viewport(), last.vertical, { insetLeft: insetLeft() });
    last = { x: s.x, y: s.y, vertical: last.vertical };
    useLayout.getState().setFloat(id, last, false);
  };

  const finish = (ev: PointerEvent, cancelled: boolean) => {
    if (ev.pointerId !== pointerId) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    document.body.classList.remove("dragging-ui");
    const st = useLayout.getState();
    if (!moved) return; // só um toque: nada mudou
    if (cancelled) {
      // gesto cancelado pelo sistema: volta para onde estava
      st.setSide(id, before.side[id]);
      if (before.side[id] === "float" && before.floats[id]) st.setFloat(id, before.floats[id]!);
      return;
    }
    const final = snapPosition({ x: last.x, y: last.y }, size, viewport(), last.vertical, { insetLeft: insetLeft() });
    st.setFloat(id, { x: final.x, y: final.y, vertical: final.vertical });
  };
  const up = (ev: PointerEvent) => finish(ev, false);
  const cancel = (ev: PointerEvent) => finish(ev, true);

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
}

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
