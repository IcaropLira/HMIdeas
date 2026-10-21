// Setas conectadas a formas ("binding"). Puro: nada de Pixi/React/store.
// Cada ponta de seta guarda a forma-alvo + um ponto de foco (u, v) normalizado dentro dela.
// A posição real da ponta é CALCULADA: onde o raio "vizinho da seta → foco" cruza o contorno da forma.
import { elementHit } from "./geometry";
import { ArrowBinding, HirakuElement, ID, LinearElement, SHAPE_TYPES, ShapeElement, TextElement, newId } from "./model";
import { Pt, outlinePath, pointInPolygon } from "./shapes";

/** Folga entre a ponta da seta e o contorno da forma (unidades do mundo). */
const BIND_GAP = 4;

export type Bindable = ShapeElement | TextElement;
export const isBindable = (e: HirakuElement): e is Bindable => e.type === "text" || (SHAPE_TYPES as string[]).includes(e.type);

function anchor(shape: Bindable, b: ArrowBinding): Pt {
  const c = Math.cos(shape.angle), s = Math.sin(shape.angle);
  const lx = (b.u * shape.w) / 2, ly = (b.v * shape.h) / 2;
  return { x: shape.x + shape.w / 2 + lx * c - ly * s, y: shape.y + shape.h / 2 + lx * s + ly * c };
}

/** Binding com o foco no ponto P (limitado a ±0.85 para ficar sempre dentro da forma). */
export function makeBinding(shape: Bindable, P: Pt): ArrowBinding {
  const c = Math.cos(shape.angle), s = Math.sin(shape.angle);
  const dx = P.x - (shape.x + shape.w / 2), dy = P.y - (shape.y + shape.h / 2);
  const hw = shape.w / 2, hh = shape.h / 2;
  const clamp = (v: number) => Math.max(-0.85, Math.min(0.85, v));
  return {
    elementId: shape.id,
    u: hw > 1e-6 ? clamp((dx * c + dy * s) / hw) : 0,
    v: hh > 1e-6 ? clamp((-dx * s + dy * c) / hh) : 0,
  };
}

/** Forma mais acima sob o ponto P (dentro dela ou perto do contorno). */
export function bindableAt(elements: HirakuElement[], P: Pt, tol: number): Bindable | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const e = elements[i];
    if (isBindable(e) && (pointInPolygon(P.x, P.y, outlinePath(e)) || elementHit(e, P.x, P.y, tol))) return e;
  }
  return null;
}

/** Primeira interseção do raio from→to com o polígono (t > 0). */
function rayBoundary(poly: Pt[], from: Pt, to: Pt): Pt | null {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.hypot(dx, dy) < 1e-9) return null;
  let bestT = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = a.x - from.x, wy = a.y - from.y;
    const t = (wx * ey - wy * ex) / den;
    const sp = (wx * dy - wy * dx) / den;
    if (t > 1e-9 && sp >= 0 && sp <= 1 && t < bestT) bestT = t;
  }
  return bestT === Infinity ? null : { x: from.x + dx * bestT, y: from.y + dy * bestT };
}

function solveEnd(pts: Pt[], idx: number, shape: Bindable, b: ArrowBinding): Pt {
  const neighbor = pts[idx === 0 ? 1 : pts.length - 2];
  const A = anchor(shape, b);
  const poly = outlinePath(shape);
  if (pointInPolygon(neighbor.x, neighbor.y, poly)) return A; // vizinho dentro da forma: sem contorno a seguir
  const hit = rayBoundary(poly, neighbor, A);
  if (!hit) return A;
  const L = Math.hypot(hit.x - neighbor.x, hit.y - neighbor.y);
  const gap = Math.min(BIND_GAP, L * 0.5);
  return { x: hit.x - ((hit.x - neighbor.x) / L) * gap, y: hit.y - ((hit.y - neighbor.y) / L) * gap };
}

/** Recalcula as pontas ligadas da seta. Alvo que não existe mais → desliga a ponta. Sem mudança → mesma referência. */
export function solveArrow(arrow: LinearElement, byId: Map<ID, HirakuElement>): LinearElement {
  if (arrow.type !== "arrow") return arrow;
  const look = (b: ArrowBinding | null | undefined) => {
    const e = b ? byId.get(b.elementId) : undefined;
    return e && isBindable(e) ? e : null;
  };
  let sb = arrow.startBinding ?? null;
  let eb = arrow.endBinding ?? null;
  const sShape = look(sb);
  const eShape = look(eb);
  const dropped = (sb && !sShape) || (eb && !eShape);
  if (!sShape) sb = null;
  if (!eShape) eb = null;
  if (!sShape && !eShape) return dropped ? { ...arrow, startBinding: sb, endBinding: eb } : arrow;

  const pts: Pt[] = arrow.points.map((p) => ({ x: p.x, y: p.y }));
  const last = pts.length - 1;
  for (let pass = 0; pass < 2; pass++) {
    if (sShape && sb) pts[0] = solveEnd(pts, 0, sShape, sb);
    if (eShape && eb) pts[last] = solveEnd(pts, last, eShape, eb);
  }
  return { ...arrow, points: pts, startBinding: sb, endBinding: eb };
}

const touches = (a: LinearElement, ids: Set<ID>) =>
  !!((a.startBinding && ids.has(a.startBinding.elementId)) || (a.endBinding && ids.has(a.endBinding.elementId)));

/** Depois de alterar `changedIds`: recalcula as setas ligadas a eles (as demais ficam intactas). */
export function rebindAfterChange(elements: HirakuElement[], changedIds: Set<ID>): HirakuElement[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  let out: HirakuElement[] | null = null;
  elements.forEach((e, i) => {
    if (e.type !== "arrow" || !touches(e, changedIds)) return;
    const solved = solveArrow(e, byId);
    if (solved === e) return;
    out ??= [...elements];
    out[i] = solved;
    byId.set(e.id, solved);
  });
  return out ?? elements;
}

/** Para a pré-visualização: setas (dentro ou fora da seleção) ligadas aos elementos de `next`, já recalculadas. */
export function solveAffected(all: HirakuElement[], next: HirakuElement[]): LinearElement[] {
  const byId = new Map(all.map((e) => [e.id, e]));
  next.forEach((e) => byId.set(e.id, e));
  const changed = new Set(next.map((e) => e.id));
  const out: LinearElement[] = [];
  for (const e of [...byId.values()]) {
    if (e.type !== "arrow" || !touches(e, changed)) continue;
    const solved = solveArrow(e, byId);
    byId.set(e.id, solved);
    out.push(solved);
  }
  return out;
}

/** Elementos removidos: as setas que apontavam para eles ficam soltas (mantêm a posição). */
export function clearBindingsTo(elements: HirakuElement[], removed: Set<ID>): HirakuElement[] {
  let out: HirakuElement[] | null = null;
  elements.forEach((e, i) => {
    if (e.type !== "arrow" || !touches(e, removed)) return;
    out ??= [...elements];
    out[i] = {
      ...e,
      startBinding: e.startBinding && removed.has(e.startBinding.elementId) ? null : e.startBinding,
      endBinding: e.endBinding && removed.has(e.endBinding.elementId) ? null : e.endBinding,
    };
  });
  return out ?? elements;
}

/** Setas movidas SEM a forma a que estavam ligadas se desligam dela (como no Excalidraw). */
export function detachForeign(els: HirakuElement[]): HirakuElement[] {
  const ids = new Set(els.map((e) => e.id));
  return els.map((e) => {
    if (e.type !== "arrow") return e;
    const sOut = !!e.startBinding && !ids.has(e.startBinding.elementId);
    const eOut = !!e.endBinding && !ids.has(e.endBinding.elementId);
    if (!sOut && !eOut) return e;
    return { ...e, startBinding: sOut ? null : e.startBinding, endBinding: eOut ? null : e.endBinding };
  });
}

/** Cópia com ids novos; ligações entre elementos copiados são remapeadas, as demais são cortadas. */
export function reidentify(els: HirakuElement[]): HirakuElement[] {
  const map = new Map(els.map((e) => [e.id, newId()]));
  const remap = (b: ArrowBinding | null | undefined) => (b && map.has(b.elementId) ? { ...b, elementId: map.get(b.elementId)! } : null);
  return els.map((e) => {
    const id = map.get(e.id)!;
    return e.type === "arrow" ? { ...e, id, startBinding: remap(e.startBinding), endBinding: remap(e.endBinding) } : { ...e, id };
  });
}
