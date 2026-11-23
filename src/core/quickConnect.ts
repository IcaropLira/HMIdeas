// Conexão rápida: puxar uma seta de um dos pontos azuis nas bordas de um bloco/forma/texto/nó.
// Soltar sobre outro item liga os dois; soltar no vazio cria um item "irmão" do mesmo tipo já ligado (como no Miro). Puro.
import { Bindable, makeBinding, solveArrow } from "./binding";
import { defaultBlock } from "./blocks";
import { makeBlockElement } from "./blockElement";
import { makeVertex, nextVertexName } from "./graphEdit";
import { makeNode } from "./mindmap";
import { HirakuElement, ID, LinearElement, newId } from "./model";
import { ConnSide, SIDE_DIR } from "./selection";
import { elementBounds } from "./selection";

const center = (e: HirakuElement) => { const b = elementBounds(e); return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, w: b.maxX - b.minX, h: b.maxY - b.minY }; };

/** Ponto de onde sai a seta: meio do lado escolhido. */
export function sideAnchor(from: HirakuElement, side: ConnSide) {
  const c = center(from), d = SIDE_DIR[side];
  return { x: c.x + (d.x * c.w) / 2, y: c.y + (d.y * c.h) / 2 };
}

export function connectArrow(from: Bindable, side: ConnSide, end: { x: number; y: number }, to: Bindable | null, style: { color: string; width: number }, all: HirakuElement[], id: ID = newId()): LinearElement {
  const a = sideAnchor(from, side);
  const arrow: LinearElement = {
    id, type: "arrow", points: [a, end], stroke: style.color, strokeWidth: style.width, strokeStyle: "solid", startHead: "none", endHead: "triangle",
    curved: false, opacity: 1, startBinding: makeBinding(from, a), endBinding: to ? makeBinding(to, end) : null,
  };
  return solveArrow(arrow, new Map(all.map((e) => [e.id, e])));
}

/** Novo item do mesmo tipo, centrado em `P` (ou empurrado para fora se cair em cima da origem). */
export function siblingFor(from: HirakuElement, side: ConnSide, P: { x: number; y: number }, all: HirakuElement[]): HirakuElement | null {
  const c = center(from), d = SIDE_DIR[side];
  // longe o bastante da origem: ao menos meia caixa + 60 de vão na direção do lado
  const minDist = (d.x ? c.w : c.h) + 60;
  const along = (P.x - c.x) * d.x + (P.y - c.y) * d.y;
  const Q = along < minDist ? { x: c.x + d.x * minDist + (d.y ? P.x - c.x : 0) * 0, y: c.y + d.y * minDist } : P;
  if (along < minDist && d.x === 0) Q.x = c.x;
  if (along < minDist && d.y === 0) Q.y = c.y;
  if (from.type === "attachment" && from.kind === "block" && from.block) {
    const spec = { ...defaultBlock(from.block.kind), color: (from.block as { color: string }).color } as typeof from.block;
    return { ...makeBlockElement(spec, Q, { w: from.w, h: from.h }), frameId: from.frameId ?? null };
  }
  if (from.type === "rect" || from.type === "ellipse" || from.type === "diamond") {
    return { ...from, id: newId(), x: Q.x - from.w / 2, y: Q.y - from.h / 2, ...("text" in from ? { text: "" } : {}) } as HirakuElement;
  }
  if (from.type === "node") {
    if (from.vertex) return makeVertex(nextVertexName(all), Q);
    const n = makeNode(newId(), 0, 0, "Ideia", { shape: from.shape, fill: from.fill, stroke: from.stroke, color: from.color, fontSize: from.fontSize });
    return { ...n, x: Q.x - from.w / 2, y: Q.y - from.h / 2, w: from.w, h: from.h, parentId: null };
  }
  if (from.type === "text") return { ...from, id: newId(), x: Q.x - c.w / 2, y: Q.y - c.h / 2, text: "Texto" } as HirakuElement;
  return null;
}
