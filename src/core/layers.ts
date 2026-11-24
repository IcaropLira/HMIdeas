// Camadas: funções puras sobre a página + a camada ATIVA (estado de interface, fora do desfazer).
import { create } from "zustand";
import { HirakuElement, ID, Layer, Page, makeLayer, newId } from "./model";
import { reidentify } from "./binding";
import { isHiddenEl, isLockedEl } from "./groups";

/** Camada efetiva de um elemento: a dele, se existir na página; senão a primeira (arquivos antigos). */
export function layerIdOf(page: Pick<Page, "layers">, el: HirakuElement): ID {
  const layers = page.layers ?? [];
  const id = el.layerId;
  if (id && layers.some((l) => l.id === id)) return id;
  return layers[0]?.id ?? "";
}

let interactiveCache = new WeakMap<Page, HirakuElement[]>();

/** Modo isolamento (0.15): só estes ids (e o que vier junto) podem ser tocados. null = desligado. UI, fora do desfazer. */
let isolated: Set<ID> | null = null;
export const isolation = () => isolated;
export function setIsolation(ids: Iterable<ID> | null) {
  isolated = ids ? new Set(ids) : null;
  interactiveCache = new WeakMap(); // a lista "tocável" muda
}
/**
 * Elementos que o usuário pode tocar: em camadas visíveis e destravadas. Selecionar, laço, borracha e texto usam esta
 * lista; o desenho usa todas. Cacheado pela página (imutável).
 */
export function interactiveElements(page: Page): HirakuElement[] {
  const hit = interactiveCache.get(page);
  if (hit) return hit;
  const off = new Set((page.layers ?? []).filter((l) => !l.visible || l.locked).map((l) => l.id));
  // também ficam de fora objetos travados/ocultos (por eles mesmos ou pelo grupo)
  const flagged = page.elements.some((e) => e.locked || e.invisible) || (page.groups ?? []).some((g) => g.locked || g.hidden);
  let out = off.size || flagged
    ? page.elements.filter((e) => !off.has(layerIdOf(page, e)) && !(flagged && (isLockedEl(page, e) || isHiddenEl(page, e))))
    : page.elements;
  if (isolated) { const iso = isolated; out = out.filter((e) => iso.has(e.id)); }
  interactiveCache.set(page, out);
  return out;
}

/** Elementos visíveis (camadas ocultas fora): miniaturas, exportações, camada de incorporados. */
const visibleCache = new WeakMap<Page, HirakuElement[]>();
export function visibleElements(page: Page): HirakuElement[] {
  const hit = visibleCache.get(page);
  if (hit) return hit;
  const hidden = new Set((page.layers ?? []).filter((l) => !l.visible).map((l) => l.id));
  const flagged = page.elements.some((e) => e.invisible) || (page.groups ?? []).some((g) => g.hidden);
  const out = hidden.size || flagged ? page.elements.filter((e) => !hidden.has(layerIdOf(page, e)) && !(flagged && isHiddenEl(page, e))) : page.elements;
  visibleCache.set(page, out); // mesma página → mesma lista (seletores do React não entram em laço)
  return out;
}

export const elementsOfLayer = (page: Page, layerId: ID): HirakuElement[] => page.elements.filter((e) => layerIdOf(page, e) === layerId);

// ---------- operações (devolvem uma página NOVA) ----------

export function addLayer(page: Page, aboveId?: ID): { page: Page; id: ID } {
  const used = new Set(page.layers.map((l) => l.name));
  let n = page.layers.length + 1;
  while (used.has(`Camada ${n}`)) n++;
  const layer = makeLayer(`Camada ${n}`);
  const layers = [...page.layers];
  const i = aboveId ? layers.findIndex((l) => l.id === aboveId) : layers.length - 1;
  layers.splice(i + 1, 0, layer);
  return { page: { ...page, layers }, id: layer.id };
}

export function patchLayer(page: Page, id: ID, patch: Partial<Omit<Layer, "id">>): Page {
  return { ...page, layers: page.layers.map((l) => (l.id === id ? { ...l, ...patch, name: (patch.name ?? l.name).trim().slice(0, 60) || l.name } : l)) };
}

/** Sobe (+1 = para cima na pilha) ou desce a camada. */
export function moveLayer(page: Page, id: ID, dir: -1 | 1): Page {
  const i = page.layers.findIndex((l) => l.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= page.layers.length) return page;
  const layers = [...page.layers];
  [layers[i], layers[j]] = [layers[j], layers[i]];
  return { ...page, layers };
}

/** Apaga a camada e o que está nela (a última camada nunca some). */
export function removeLayer(page: Page, id: ID): Page {
  if (page.layers.length <= 1) return page;
  const drop = new Set(page.elements.filter((e) => layerIdOf(page, e) === id).map((e) => e.id));
  const layers = page.layers.filter((l) => l.id !== id);
  return { ...page, layers, elements: page.elements.filter((e) => !drop.has(e.id)) };
}

/** Junta a camada com a de baixo (os elementos vão para a de baixo, por cima do que já estava lá). */
export function mergeDown(page: Page, id: ID): Page {
  const i = page.layers.findIndex((l) => l.id === id);
  if (i <= 0) return page;
  const below = page.layers[i - 1].id;
  const moved = page.elements.filter((e) => layerIdOf(page, e) === id).map((e) => ({ ...e, layerId: below }) as HirakuElement);
  const rest = page.elements.filter((e) => layerIdOf(page, e) !== id);
  return { ...page, layers: page.layers.filter((l) => l.id !== id), elements: [...rest, ...moved] };
}

export function duplicateLayer(page: Page, id: ID): { page: Page; id: ID } {
  const src = page.layers.find((l) => l.id === id);
  if (!src) return { page, id };
  const copy: Layer = { ...src, id: newId(), name: `${src.name} (cópia)`.slice(0, 60) };
  const els = reidentify(page.elements.filter((e) => layerIdOf(page, e) === id)).map((e) => ({ ...e, layerId: copy.id }) as HirakuElement);
  const layers = [...page.layers];
  layers.splice(page.layers.indexOf(src) + 1, 0, copy);
  return { page: { ...page, layers, elements: [...page.elements, ...els] }, id: copy.id };
}

/** Move elementos para outra camada (ficam por cima do que já estava nela). */
export function moveToLayer(page: Page, ids: ID[], layerId: ID): Page {
  const set = new Set(ids);
  const moved = page.elements.filter((e) => set.has(e.id)).map((e) => ({ ...e, layerId }) as HirakuElement);
  return { ...page, elements: [...page.elements.filter((e) => !set.has(e.id)), ...moved] };
}

export type ZMove = "front" | "back" | "forward" | "backward";
/** Ordem dentro da página (vale dentro de cada camada): trazer para frente, enviar para trás, um passo. */
export function reorder(elements: HirakuElement[], ids: ID[], how: ZMove): HirakuElement[] {
  const set = new Set(ids);
  if (!set.size) return elements;
  if (how === "front") return [...elements.filter((e) => !set.has(e.id)), ...elements.filter((e) => set.has(e.id))];
  if (how === "back") return [...elements.filter((e) => set.has(e.id)), ...elements.filter((e) => !set.has(e.id))];
  const out = [...elements];
  if (how === "forward") {
    for (let i = out.length - 2; i >= 0; i--) if (set.has(out[i].id) && !set.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]];
  } else {
    for (let i = 1; i < out.length; i++) if (set.has(out[i].id) && !set.has(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]];
  }
  return out;
}

// ---------- camada ativa (UI) ----------

interface LayerUI {
  /** Camada ativa por página. */
  active: Record<ID, ID>;
  setActive: (pageId: ID, layerId: ID) => void;
}

export const useLayerUI = create<LayerUI>((set) => ({
  active: {},
  setActive: (pageId, layerId) => set((s) => (s.active[pageId] === layerId ? s : { active: { ...s.active, [pageId]: layerId } })),
}));

/** Camada onde entram os elementos novos: a escolhida pelo usuário, ou a de cima. */
export function activeLayerId(page: Page): ID {
  const want = useLayerUI.getState().active[page.id];
  if (want && page.layers.some((l) => l.id === want)) return want;
  return page.layers[page.layers.length - 1]?.id ?? "";
}
