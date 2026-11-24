// Camadas profissionais (0.19), parte pura: máscara de recorte, solo, mesclar visíveis, achatar, camada via cópia/recorte,
// filtro da lista e ciclo de modos de mesclagem (Shift + / Shift −, como no Photoshop).
import { HirakuElement, ID, LAYER_BLENDS, Layer, LayerBlend, Page, makeLayer, newId } from "./model";

/** Camada-base de uma camada recortada: desce pelas recortadas até a primeira que não é. null = não recorta (ou é a de baixo). */
export function clipBase(layers: Layer[], i: number): number | null {
  if (!layers[i]?.clip) return null;
  for (let j = i - 1; j >= 0; j--) if (!layers[j].clip) return j;
  return null;
}

/** Unidades de desenho, de baixo para cima: cada base com as camadas recortadas logo acima dela. */
export function clipUnits(layers: Layer[]): { base: Layer; clipped: Layer[] }[] {
  const out: { base: Layer; clipped: Layer[] }[] = [];
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (l.clip && out.length) out[out.length - 1].clipped.push(l);
    else out.push({ base: l, clipped: [] });
  }
  return out;
}

/** Elemento → camada (sem camada ou camada inexistente = a primeira). */
const layerOf = (page: Page, e: HirakuElement): ID => (e.layerId && page.layers.some((l) => l.id === e.layerId) ? e.layerId : page.layers[0]?.id ?? "");

/** Solo (Alt+clique no olho): mostra só esta; se já estava sozinha, mostra todas de volta. */
export function soloLayer(page: Page, id: ID): Page {
  const alone = page.layers.every((l) => (l.id === id ? l.visible : !l.visible));
  return { ...page, layers: page.layers.map((l) => ({ ...l, visible: alone ? true : l.id === id })) };
}

/** Leva a opacidade da camada para os elementos (para mesclar sem mudar a aparência). */
function bake(e: HirakuElement, k: number, layerId: ID): HirakuElement {
  const op = typeof (e as { opacity?: number }).opacity === "number" ? (e as { opacity: number }).opacity : 1;
  return { ...e, layerId, ...(k < 1 ? { opacity: Math.round(op * k * 1000) / 1000 } : {}) } as HirakuElement;
}

/** Mescla as camadas visíveis na mais baixa delas (as ocultas ficam como estão). Modos de mesclagem viram Normal. */
export function mergeVisible(page: Page): Page {
  const vis = page.layers.filter((l) => l.visible);
  if (vis.length < 2) return page;
  const target = vis[0];
  const by = new Map(page.layers.map((l) => [l.id, l]));
  const gone = new Set(vis.slice(1).map((l) => l.id));
  // primeiro na ordem das camadas ORIGINAIS (o conteúdo de cima continua por cima), depois muda a camada
  const elements = orderByLayers(page.elements, page.layers).map((e) => {
    const l = by.get(layerOf(page, e))!;
    return l.visible ? bake(e, l.opacity, target.id) : e;
  });
  // a base passa a ter opacidade 1 (já foi levada aos elementos)
  const layers = page.layers.filter((l) => !gone.has(l.id)).map((l) => (l.id === target.id ? { ...l, opacity: 1, blend: undefined, clip: undefined } : l));
  return { ...page, layers, elements };
}

/** Achata a imagem: tudo numa camada só ("Fundo"). O que está em camada oculta é descartado (como no Photoshop). */
export function flatten(page: Page): { page: Page; dropped: number } {
  const by = new Map(page.layers.map((l) => [l.id, l]));
  const bg = { ...makeLayer("Fundo"), id: page.layers[0]?.id ?? newId() };
  let dropped = 0;
  const elements: HirakuElement[] = [];
  for (const l of page.layers) {
    for (const e of page.elements) {
      if (layerOf(page, e) !== l.id) continue;
      if (!by.get(l.id)!.visible) { dropped++; continue; }
      elements.push(bake(e, l.opacity, bg.id));
    }
  }
  return { page: { ...page, layers: [bg], elements }, dropped };
}

/** Ordena os elementos pela ordem das camadas (mantém a ordem relativa dentro de cada uma). */
function orderByLayers(elements: HirakuElement[], layers: Layer[]): HirakuElement[] {
  const idx = new Map(layers.map((l, i) => [l.id, i]));
  const key = (e: HirakuElement) => idx.get(e.layerId && idx.has(e.layerId) ? e.layerId : layers[0]?.id ?? "") ?? 0;
  return elements.map((e, i) => ({ e, i })).sort((a, b) => key(a.e) - key(b.e) || a.i - b.i).map((x) => x.e);
}

/** Nova camada via recorte (Ctrl+Shift+J): os selecionados vão para uma camada nova logo acima da deles. */
export function layerViaCut(page: Page, ids: ID[]): { page: Page; id: ID } | null {
  const set = new Set(ids);
  const sel = page.elements.filter((e) => set.has(e.id));
  if (!sel.length) return null;
  const top = Math.max(...sel.map((e) => page.layers.findIndex((l) => l.id === layerOf(page, e))));
  const layer = makeLayer(nextName(page, "Camada"));
  const layers = [...page.layers];
  layers.splice(top + 1, 0, layer);
  const moved = sel.map((e) => ({ ...e, layerId: layer.id }) as HirakuElement);
  return { page: { ...page, layers, elements: [...page.elements.filter((e) => !set.has(e.id)), ...moved] }, id: layer.id };
}

/** Nova camada via cópia (Ctrl+J): cópias dos selecionados (ids novos via `reid`) numa camada nova acima. */
export function layerViaCopy(page: Page, ids: ID[], reid: (els: HirakuElement[]) => HirakuElement[]): { page: Page; id: ID; copies: ID[] } | null {
  const set = new Set(ids);
  const sel = page.elements.filter((e) => set.has(e.id));
  if (!sel.length) return null;
  const top = Math.max(...sel.map((e) => page.layers.findIndex((l) => l.id === layerOf(page, e))));
  const layer = makeLayer(nextName(page, "Camada"));
  const layers = [...page.layers];
  layers.splice(top + 1, 0, layer);
  const copies = reid(sel).map((e) => ({ ...e, layerId: layer.id }) as HirakuElement);
  return { page: { ...page, layers, elements: [...page.elements, ...copies] }, id: layer.id, copies: copies.map((e) => e.id) };
}

export function nextName(page: Page, base: string): string {
  const used = new Set(page.layers.map((l) => l.name));
  let n = page.layers.length + 1;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** Próximo/anterior modo de mesclagem na ordem do Photoshop. */
export function cycleBlend(cur: LayerBlend | undefined, dir: 1 | -1): LayerBlend {
  const i = LAYER_BLENDS.findIndex((b) => b.id === (cur ?? "normal"));
  return LAYER_BLENDS[(i + dir + LAYER_BLENDS.length) % LAYER_BLENDS.length].id;
}

/** `mix-blend-mode` do CSS/SVG equivalente (os que o navegador não tem caem no mais próximo). */
export function cssBlend(b: LayerBlend | undefined): string | null {
  switch (b ?? "normal") {
    case "normal": case "dissolve": return null;
    case "linear-burn": case "darker-color": return "darken";
    case "add": case "linear-dodge" as LayerBlend: return "plus-lighter";
    case "lighter-color": return "lighten";
    case "vivid-light": case "linear-light": case "pin-light": case "hard-mix": return "hard-light";
    case "subtract": case "divide": return "difference";
    default: return b!;
  }
}

/** Filtro da lista de camadas: nome (sem acento), modo, etiqueta, visíveis/ocultas/travadas/recortadas. */
export type LayerFilter = { text: string; kind: "all" | "visible" | "hidden" | "locked" | "clip" | "blend" | "color" };
export function filterLayers(layers: Layer[], f: LayerFilter): Layer[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(f.text.trim());
  const label = (b?: LayerBlend) => LAYER_BLENDS.find((x) => x.id === (b ?? "normal"))?.label ?? "";
  return layers.filter((l) => {
    if (f.kind === "visible" && !l.visible) return false;
    if (f.kind === "hidden" && l.visible) return false;
    if (f.kind === "locked" && !l.locked) return false;
    if (f.kind === "clip" && !l.clip) return false;
    if (f.kind === "blend" && !l.blend) return false;
    if (f.kind === "color" && !l.color) return false;
    return !q || norm(l.name).includes(q) || norm(label(l.blend)).includes(q);
  });
}
