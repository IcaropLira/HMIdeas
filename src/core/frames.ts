// Quadros: contêineres aninháveis. Pertencer a um quadro = `frameId`. Puro (recebe/devolve listas).
// Um quadro NÃO recorta o conteúdo: é uma moldura com título e um véu de cor; mover o quadro leva os membros.
import { FrameElement, HirakuElement, ID, newId } from "./model";
import { elementBounds } from "./selection";
import { withDependents, nodesOf, rootOf } from "./mindmap";

export const FRAME_COLORS = ["#5E6B7E", "#2F4B8F", "#2F7D5B", "#D98A1F", "#C8372D", "#7B4FB5"];
export const FRAME_PAD = 28;

export const isFrameEl = (e: HirakuElement): e is FrameElement => e.type === "frame";
export const framesOf = (els: HirakuElement[]): FrameElement[] => els.filter(isFrameEl);

export function makeFrame(id: ID, x: number, y: number, w: number, h: number, title = "Quadro", color = FRAME_COLORS[0]): FrameElement {
  return { id, type: "frame", frameId: null, x, y, w, h, angle: 0, strokeWidth: 2, title, color, tint: 0.06, rounded: true, opacity: 1 };
}

/** Ids dos quadros ancestrais (do pai direto até o mais externo). */
export function frameChain(els: HirakuElement[], id: ID): ID[] {
  const byId = new Map(els.map((e) => [e.id, e]));
  const out: ID[] = [];
  let cur = byId.get(id)?.frameId ?? null;
  while (cur && !out.includes(cur)) {
    out.push(cur);
    cur = byId.get(cur)?.frameId ?? null;
  }
  return out;
}

/** Todos os membros (diretos e de quadros internos) de um quadro. */
export function frameMembers(els: HirakuElement[], frameId: ID): HirakuElement[] {
  const set = withDependents(els, [frameId]);
  set.delete(frameId);
  return els.filter((e) => set.has(e.id));
}

const contains = (f: FrameElement, cx: number, cy: number) => cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h;

/**
 * Reatribui `frameId` dos elementos `ids` (e dos que andam junto com eles) conforme o quadro MAIS INTERNO que
 * contém o centro. Quadros nunca entram em si mesmos nem nos próprios descendentes. Nós de uma árvore
 * herdam o quadro da raiz do mapa. Devolve a mesma lista se nada mudou.
 */
export function settleFrames(els: HirakuElement[], ids: Iterable<ID>): HirakuElement[] {
  const frames = framesOf(els);
  const moved = new Set(ids);
  if (!moved.size) return els;
  const byId = new Map(els.map((e) => [e.id, e]));
  const assigned = new Map<ID, ID | null>();

  const pick = (e: HirakuElement): ID | null => {
    const b = elementBounds(e);
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    const banned = e.type === "frame" ? withDependents(els, [e.id]) : null;
    let best: FrameElement | null = null;
    for (const f of frames) {
      if (f.id === e.id || banned?.has(f.id)) continue;
      if (!contains(f, cx, cy)) continue;
      if (!best || f.w * f.h < best.w * best.h) best = f;
    }
    return best ? best.id : null;
  };

  // raízes do que se moveu: elementos cujo "pai" (nó-pai) não está no conjunto movido decidem por si
  for (const id of moved) {
    const e = byId.get(id);
    if (!e) continue;
    if (e.type === "node") {
      const root = rootOf(els, id);
      if (root && root.id !== id) {
        if (moved.has(root.id)) continue; // a raiz decide por todos
        assigned.set(id, byId.get(root.id)!.frameId ?? null);
        continue;
      }
    }
    assigned.set(id, pick(e));
  }
  // descendentes de nós herdam a decisão da raiz
  for (const id of moved) {
    const e = byId.get(id);
    if (e?.type !== "node" || assigned.has(id)) continue;
    const root = rootOf(els, id);
    if (root && assigned.has(root.id)) assigned.set(id, assigned.get(root.id)!);
  }
  // nós-filhos de quem não se moveu mas cuja raiz (que se moveu) decidiu
  for (const n of nodesOf(els)) {
    const root = rootOf(els, n.id);
    if (root && root.id !== n.id && moved.has(root.id) && !assigned.has(n.id)) assigned.set(n.id, assigned.get(root.id)!);
  }

  let out: HirakuElement[] | null = null;
  els.forEach((e, i) => {
    if (!assigned.has(e.id)) return;
    const f = assigned.get(e.id) ?? null;
    if ((e.frameId ?? null) === f) return;
    out ??= els.slice();
    out[i] = { ...e, frameId: f } as HirakuElement;
  });
  return out ?? els;
}

/** Cria um quadro em volta dos elementos `ids` (com folga) e os coloca dentro dele. */
export function wrapInFrame(els: HirakuElement[], ids: ID[], title = "Quadro"): { elements: HirakuElement[]; id: ID } | null {
  const sel = els.filter((e) => ids.includes(e.id));
  if (!sel.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of sel) {
    const b = elementBounds(e);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  const id = newId();
  // o quadro novo herda o quadro dos elementos (se todos estão no mesmo)
  const parents = new Set(sel.map((e) => e.frameId ?? null));
  const outer = parents.size === 1 ? [...parents][0] : null;
  const frame = makeFrame(id, minX - FRAME_PAD, minY - FRAME_PAD - 8, maxX - minX + FRAME_PAD * 2, maxY - minY + FRAME_PAD * 2 + 8, title);
  frame.frameId = outer;
  const members = new Set(withDependents(els, ids));
  // membros diretos: os selecionados (os dependentes já seguem por frameId/parentId); quadros internos ficam dentro deles
  const direct = new Set(sel.filter((e) => !(e.type === "node" && e.parentId && members.has(e.parentId) && ids.includes(e.parentId))).map((e) => e.id));
  const mapped = els.map((e) => (direct.has(e.id) && !(e.type === "node" && e.parentId && direct.has(e.parentId)) ? ({ ...e, frameId: id } as HirakuElement) : e));
  // nós filhos herdam o quadro da raiz
  const final = settleKeep(mapped, id);
  return { elements: [frame, ...final], id };
}

/** Faz todos os nós cuja raiz está no quadro `fid` ficarem também nele. */
function settleKeep(els: HirakuElement[], fid: ID): HirakuElement[] {
  const inFrame = new Set(els.filter((e) => e.frameId === fid).map((e) => e.id));
  return els.map((e) => {
    if (e.type !== "node" || e.frameId === fid) return e;
    const r = rootOf(els, e.id);
    return r && inFrame.has(r.id) ? ({ ...e, frameId: fid } as HirakuElement) : e;
  });
}

/** Desfaz o quadro: os membros sobem para o quadro pai (ou ficam soltos). */
export function ungroupFrame(els: HirakuElement[], id: ID): HirakuElement[] {
  const f = els.find((e) => e.id === id);
  if (!f || f.type !== "frame") return els;
  const up = f.frameId ?? null;
  return els.filter((e) => e.id !== id).map((e) => (e.frameId === id ? ({ ...e, frameId: up } as HirakuElement) : e));
}

/** Ajusta o quadro ao conteúdo (membros diretos + folga). */
export function fitFrameToContent(els: HirakuElement[], id: ID): HirakuElement[] {
  const f = els.find((e) => e.id === id);
  if (!f || f.type !== "frame") return els;
  const mem = frameMembers(els, id);
  if (!mem.length) return els;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of mem) {
    const b = elementBounds(e);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  return els.map((e) => (e.id === id ? { ...f, x: minX - FRAME_PAD, y: minY - FRAME_PAD - 8, w: maxX - minX + FRAME_PAD * 2, h: maxY - minY + FRAME_PAD * 2 + 8 } : e));
}

/** Profundidade de aninhamento (0 = quadro de topo). */
export const frameDepth = (els: HirakuElement[], id: ID) => frameChain(els, id).length;
