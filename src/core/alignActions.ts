// Alinhar/distribuir/igualar/grade aplicados à seleção. Cada grupo selecionado conta como UM objeto (unidade).
// Um passo de desfazer por comando.
import { AlignMode, Axis, Box, Delta, alignDeltas, distributeCenters, distributeDeltas, equalizeScales, gridDeltas, unionBox } from "./align";
import { detachForeign } from "./binding";
import { selectionUnits, unitLeaves } from "./groups";
import { currentCtx } from "./groupActions";
import { withDependents } from "./mindmap";
import { HirakuElement, Page } from "./model";
import { Xform, applyXform, elementBounds, moveXform } from "./selection";
import { selectActivePage, useDoc, useSel, useView } from "./store";
import { useUI } from "./ui";

const page = (): Page => selectActivePage(useDoc.getState());

interface Item { box: Box; ids: string[] }

/** Unidades da seleção com a caixa de cada uma. */
function items(p: Page = page()): Item[] {
  const units = selectionUnits(p, useSel.getState().ids, currentCtx(p));
  return units
    .map((u) => {
      const leaves = unitLeaves(p, u).filter((e) => !(e.type === "node" && e.hidden));
      const box = unionBox(leaves.map(elementBounds));
      return box ? { box, ids: leaves.map((e) => e.id) } : null;
    })
    .filter((x): x is Item => !!x);
}

/** Área visível (mundo). */
export function viewBox(): Box {
  const c = useView.getState().camera;
  const w = typeof window !== "undefined" ? window.innerWidth : 1280, h = typeof window !== "undefined" ? window.innerHeight : 800;
  return { minX: -c.x / c.zoom, minY: -c.y / c.zoom, maxX: (w - c.x) / c.zoom, maxY: (h - c.y) / c.zoom };
}

/** Referência para um objeto sozinho: a folha (caderno com páginas) ou a área visível. */
function soloRef(p: Page): Box {
  return p.size ? { minX: 0, minY: 0, maxX: p.size.w, maxY: p.size.h } : viewBox();
}

/** Aplica uma transformação por unidade (com o que anda junto: ramos de mapa, conteúdo de quadro). */
function applyPer(p: Page, list: Item[], xf: (i: number) => Xform | null) {
  const all = p.elements;
  const done = new Set<string>();
  const out: HirakuElement[] = [];
  list.forEach((it, i) => {
    const x = xf(i);
    if (!x) return;
    const set = withDependents(all, it.ids);
    for (const e of all) {
      if (!set.has(e.id) || done.has(e.id)) continue;
      done.add(e.id);
      out.push(applyXform(e, x));
    }
  });
  if (out.length) useDoc.getState().updateElements(detachForeign(out));
}

const moves = (p: Page, list: Item[], ds: Delta[]) =>
  applyPer(p, list, (i) => (Math.abs(ds[i].dx) > 1e-6 || Math.abs(ds[i].dy) > 1e-6 ? moveXform(ds[i].dx, ds[i].dy) : null));

const need = (n: number, msg: string, list: Item[]) => {
  if (list.length >= n) return true;
  useUI.getState().showToast(msg);
  return false;
};

export function alignSelection(mode: AlignMode) {
  const p = page();
  const list = items(p);
  if (!list.length) return;
  // um objeto só: alinha à folha/área visível
  const ref = list.length === 1 ? soloRef(p) : unionBox(list.map((x) => x.box));
  moves(p, list, alignDeltas(list.map((x) => x.box), mode, ref));
}

export function distributeSelection(axis: Axis, by: "gap" | "center" = "gap") {
  const p = page();
  const list = items(p);
  if (!need(3, "Distribuir precisa de três ou mais objetos.", list)) return;
  const boxes = list.map((x) => x.box);
  moves(p, list, by === "center" ? distributeCenters(boxes, axis) : distributeDeltas(boxes, axis));
}

/** Espaço fixo entre os objetos (a partir do primeiro). */
export function spaceSelection(axis: Axis, gap: number) {
  const p = page();
  const list = items(p);
  if (!need(2, "Selecione dois ou mais objetos.", list)) return;
  moves(p, list, distributeDeltas(list.map((x) => x.box), axis, gap));
}

export function arrangeGrid(cols?: number, gap = 24) {
  const p = page();
  const list = items(p);
  if (!need(2, "Selecione dois ou mais objetos para organizar em grade.", list)) return;
  moves(p, list, gridDeltas(list.map((x) => x.box), cols, gap));
}

export function centerOnScreen() {
  const p = page();
  const list = items(p);
  const u = unionBox(list.map((x) => x.box));
  if (!u) return;
  const v = p.size ? { minX: 0, minY: 0, maxX: p.size.w, maxY: p.size.h } : viewBox();
  const dx = (v.minX + v.maxX) / 2 - (u.minX + u.maxX) / 2, dy = (v.minY + v.maxY) / 2 - (u.minY + u.maxY) / 2;
  moves(p, list, list.map(() => ({ dx, dy })));
}

/** Igualar largura/altura (escala cada objeto em volta do próprio centro). */
export function equalizeSelection(dim: "w" | "h" | "both", to: "max" | "min" | "first" = "max") {
  const p = page();
  const list = items(p);
  if (!need(2, "Selecione dois ou mais objetos para igualar.", list)) return;
  const sc = equalizeScales(list.map((x) => x.box), dim, to);
  applyPer(p, list, (i) => {
    const { sx, sy } = sc[i];
    if (Math.abs(sx - 1) < 1e-4 && Math.abs(sy - 1) < 1e-4) return null;
    const b = list[i].box, cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    return { m: { a: sx, b: 0, c: 0, d: sy, e: cx - sx * cx, f: cy - sy * cy }, sx, sy, dAngle: 0 };
  });
}

/** Posição/tamanho da seleção (painel Transformação). */
export function selectionBox(): Box | null {
  return unionBox(items().map((x) => x.box));
}

/** Move/escala a seleção inteira para a caixa pedida (painel Transformação). */
export function setSelectionBox(next: Partial<{ x: number; y: number; w: number; h: number }>, keepRatio = false) {
  const p = page();
  const list = items(p);
  const u = unionBox(list.map((x) => x.box));
  if (!u) return;
  const w0 = Math.max(0.001, u.maxX - u.minX), h0 = Math.max(0.001, u.maxY - u.minY);
  let w = next.w ?? w0, h = next.h ?? h0;
  if (keepRatio && next.w != null && next.h == null) h = (w / w0) * h0;
  if (keepRatio && next.h != null && next.w == null) w = (h / h0) * w0;
  const sx = Math.max(0.001, w) / w0, sy = Math.max(0.001, h) / h0;
  const x = next.x ?? u.minX, y = next.y ?? u.minY;
  const xf: Xform = { m: { a: sx, b: 0, c: 0, d: sy, e: x - sx * u.minX, f: y - sy * u.minY }, sx, sy, dAngle: 0 };
  applyPer(p, [{ box: u, ids: list.flatMap((it) => it.ids) }], () => xf);
}

/** Gira a seleção em volta do centro (graus). */
export function rotateSelection(deg: number) {
  const p = page();
  const list = items(p);
  const u = unionBox(list.map((x) => x.box));
  if (!u || !deg) return;
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const cx = (u.minX + u.maxX) / 2, cy = (u.minY + u.maxY) / 2;
  const xf: Xform = { m: { a: c, b: s, c: -s, d: c, e: cx - c * cx + s * cy, f: cy - s * cx - c * cy }, sx: 1, sy: 1, dAngle: r };
  applyPer(p, [{ box: u, ids: list.flatMap((it) => it.ids) }], () => xf);
}

/** Espelhar na horizontal/vertical (traços, linhas e posições; formas giradas espelham o ângulo). */
export function flipSelection(axis: Axis) {
  const p = page();
  const list = items(p);
  const u = unionBox(list.map((x) => x.box));
  if (!u) return;
  const cx = (u.minX + u.maxX) / 2, cy = (u.minY + u.maxY) / 2;
  const xf: Xform = axis === "h"
    ? { m: { a: -1, b: 0, c: 0, d: 1, e: 2 * cx, f: 0 }, sx: -1, sy: 1, dAngle: 0 }
    : { m: { a: 1, b: 0, c: 0, d: -1, e: 0, f: 2 * cy }, sx: 1, sy: -1, dAngle: 0 };
  applyPer(p, [{ box: u, ids: list.flatMap((it) => it.ids) }], () => xf);
}
