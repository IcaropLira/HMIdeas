// Bloco como elemento do documento (AttachmentElement kind "block"). Puro.
import { AttachmentElement, newId } from "./model";
import { BlockKind, BlockSpec, blockTitle, defaultBlock, defaultBlockSize } from "./blocks";

export function makeBlockElement(spec: BlockSpec, center: { x: number; y: number }, size?: { w: number; h: number }, id = newId()): AttachmentElement {
  const { w, h } = size ?? defaultBlockSize(spec);
  return { id, type: "attachment", frameId: null, x: center.x - w / 2, y: center.y - h / 2, w, h, kind: "block", title: blockTitle(spec), url: "", mime: "application/x-hm-block", block: spec, opacity: 1 };
}

/** Mesmo bloco, mas posicionado pelo canto superior esquerdo (modelos). */
export function blockAt(spec: BlockSpec, x: number, y: number, w?: number, h?: number): AttachmentElement {
  const s = defaultBlockSize(spec);
  const W = w ?? s.w, H = h ?? s.h;
  return makeBlockElement(spec, { x: x + W / 2, y: y + H / 2 }, { w: W, h: H });
}

export const isBlock = (e: { type: string; kind?: string }): e is AttachmentElement & { block: BlockSpec } => e.type === "attachment" && e.kind === "block" && !!(e as AttachmentElement).block;

export const newBlock = (kind: BlockKind, center: { x: number; y: number }) => makeBlockElement(defaultBlock(kind), center);
