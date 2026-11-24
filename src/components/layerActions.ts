// Ações de camada (0.19) usadas pelo painel e pelos comandos. Cada uma é um passo de desfazer.
import { flatten, layerViaCopy, layerViaCut, mergeVisible, soloLayer, cycleBlend } from "../core/layerPro";
import { activeLayerId, addLayer, duplicateLayer, mergeDown, patchLayer, useLayerUI } from "../core/layers";
import { reidentify } from "../core/binding";
import { Page } from "../core/model";
import { selectActivePage, useDoc, useSel } from "../core/store";
import { useUI } from "../core/ui";

const toast = (m: string) => useUI.getState().showToast(m);
const page = () => selectActivePage(useDoc.getState());
const edit = (fn: (p: Page) => Page) => useDoc.getState().editPage(fn);
const setActive = (id: string) => useLayerUI.getState().setActive(page().id, id);

export function newLayer() {
  let id = "";
  edit((p) => { const r = addLayer(p, activeLayerId(p)); id = r.id; return r.page; });
  if (id) setActive(id);
}
export function duplicateActive() {
  let id = "";
  edit((p) => { const r = duplicateLayer(p, activeLayerId(p)); id = r.id; return r.page; });
  if (id) setActive(id);
}
export function viaCopy() {
  const ids = useSel.getState().ids;
  if (!ids.length) { duplicateActive(); return; }
  let r: ReturnType<typeof layerViaCopy> = null;
  edit((p) => { r = layerViaCopy(p, ids, reidentify); return r?.page ?? p; });
  const res = r as ReturnType<typeof layerViaCopy>;
  if (res) { setActive(res.id); useSel.getState().set(res.copies); toast("Camada via cópia."); }
}
export function viaCut() {
  const ids = useSel.getState().ids;
  if (!ids.length) { toast("Selecione o que vai para a camada nova."); return; }
  let id = "";
  edit((p) => { const r = layerViaCut(p, ids); id = r?.id ?? ""; return r?.page ?? p; });
  if (id) { setActive(id); toast("Camada via recorte."); }
}
export function mergeActiveDown() {
  const p = page(), i = p.layers.findIndex((l) => l.id === activeLayerId(p));
  if (i <= 0) { toast("Não há camada embaixo para mesclar."); return; }
  const below = p.layers[i - 1].id;
  edit((q) => mergeDown(q, activeLayerId(q)));
  setActive(below);
}
export function mergeAllVisible() {
  if (page().layers.filter((l) => l.visible).length < 2) { toast("Precisa de pelo menos duas camadas visíveis."); return; }
  edit(mergeVisible);
  toast("Camadas visíveis mescladas.");
}
export function flattenImage() {
  let dropped = 0;
  edit((p) => { const r = flatten(p); dropped = r.dropped; return r.page; });
  setActive(page().layers[0].id);
  toast(dropped ? `Imagem achatada; ${dropped} ${dropped === 1 ? "elemento oculto descartado" : "elementos ocultos descartados"} (Ctrl+Z desfaz).` : "Imagem achatada.");
}
export function toggleClip(id = activeLayerId(page())) {
  const p = page(), i = p.layers.findIndex((l) => l.id === id);
  if (i <= 0 && !p.layers[i]?.clip) { toast("A camada de baixo de todas não pode ser recortada."); return; }
  edit((q) => patchLayer(q, id, { clip: q.layers[i].clip ? undefined : true }));
}
export function soloActive(id = activeLayerId(page())) {
  edit((p) => soloLayer(p, id));
}
export function stepBlend(dir: 1 | -1) {
  const p = page(), id = activeLayerId(p), l = p.layers.find((x) => x.id === id);
  if (!l) return;
  const b = cycleBlend(l.blend, dir);
  edit((q) => patchLayer(q, id, { blend: b === "normal" ? undefined : b }));
}
export function stepActive(dir: 1 | -1) {
  const p = page(), i = p.layers.findIndex((l) => l.id === activeLayerId(p)), j = i + dir;
  if (j >= 0 && j < p.layers.length) setActive(p.layers[j].id);
}
