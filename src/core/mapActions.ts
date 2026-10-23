// Ações de mapa mental e quadros ligadas ao store (teclado, barra de ferramentas, ferramentas do canvas).
// Toda operação grava com `replaceElements`: um único passo de desfazer, mesmo mexendo em vários nós.
import { create } from "zustand";
import { makeBinding, solveArrow } from "./binding";
import { Camera, clampZoom } from "./camera";
import { fitFrameToContent, framesOf, makeFrame, settleFrames, ungroupFrame, wrapInFrame } from "./frames";
import { BranchStyle, HirakuElement, ID, LinearElement, MapLayout, NodeElement, newId } from "./model";
import {
  Added, Measure, NodePatch, NODE_PRESETS, addChild, addSibling, ancestorsOf, childrenMap, detachToRoot, focusBranch, isNodeEl,
  mapFromOutline, neighbor, newRoot, nodesOf, parseOutline, refitAll, relayout, reparent, reorderByPosition, rootOf,
  setAllCollapsed, setNodeText, styleNodes, subtreeIds, toOutline, toggleCollapse, withDependents,
} from "./mindmap";
import { elementBounds } from "./selection";
import { selectActivePage, useDoc, useSel, useTool, useView } from "./store";
import { measureBlock } from "./text";
import { useUI } from "./ui";

const measure: Measure = (t, f, s) => measureBlock(t, f, s);

const els = () => selectActivePage(useDoc.getState()).elements;
const commit = (next: HirakuElement[]) => {
  if (next !== els()) useDoc.getState().replaceElements(next);
};
const selIds = () => useSel.getState().ids;
const selNodes = (): NodeElement[] => {
  const ids = new Set(selIds());
  return nodesOf(els()).filter((n) => ids.has(n.id));
};
const toast = (m: string) => useUI.getState().showToast(m);

// ---------- edição do texto de nós e do título de quadros ----------
export interface LabelSession { token: number; id: ID; kind: "node" | "frame"; text: string; isNew: boolean }
interface LabelState { session: LabelSession | null }
export const useLabel = create<LabelState>(() => ({ session: null }));
let labelCounter = 0;

export function beginLabel(id: ID, isNew = false) {
  commitLabel();
  const el = els().find((e) => e.id === id);
  if (!el || (el.type !== "node" && el.type !== "frame")) return;
  useLabel.setState({
    session: { token: ++labelCounter, id, kind: el.type, text: el.type === "node" ? el.text : el.title, isNew },
  });
}

export const patchLabel = (text: string) => useLabel.setState((s) => (s.session ? { session: { ...s.session, text } } : s));

/** Confirma a edição. Nó novo e vazio é descartado; nó existente com texto vazio mantém o texto antigo. */
export function commitLabel(token?: number, cancel = false) {
  const s = useLabel.getState().session;
  if (!s || (token !== undefined && token !== s.token)) return;
  useLabel.setState({ session: null });
  const cur = els().find((e) => e.id === s.id);
  if (!cur) return;
  const text = s.text.replace(/\s+$/, "");
  if (cur.type === "node") {
    if (!text.trim() || cancel) {
      if (s.isNew && !text.trim()) {
        useDoc.getState().removeElements([cur.id]);
        useSel.getState().set(cur.parentId ? [cur.parentId] : []);
      }
      return;
    }
    if (text !== cur.text) commit(setNodeText(els(), cur.id, text, measure));
  } else if (cur.type === "frame" && !cancel && text.trim() && text !== cur.title) {
    commit(els().map((e) => (e.id === cur.id ? { ...cur, title: text } : e)));
  }
}

// ---------- criar ----------
function finishAdd(a: Added | null, edit = true) {
  if (!a) return;
  // nós novos entram num quadro se a raiz estiver dentro de um
  commit(a.elements);
  useSel.getState().set([a.id]);
  if (edit) beginLabel(a.id, true);
}

/** Novo mapa no ponto P (centro do nó raiz). */
export function createRootAt(P: { x: number; y: number }) {
  const a = newRoot(els(), P.x, P.y, "Ideia central", measure);
  const withFrame = settleFrames(a.elements, [a.id]);
  commit(withFrame);
  useSel.getState().set([a.id]);
  useTool.getState().setTool("select");
  beginLabel(a.id, false);
}

/** Centro da área visível, em coordenadas do mundo. */
export function viewCenter(): { x: number; y: number } {
  const c = useView.getState().camera;
  return { x: (window.innerWidth / 2 - c.x) / c.zoom, y: (window.innerHeight / 2 - c.y) / c.zoom };
}

export function addChildToSelection(): boolean {
  const sel = selNodes();
  if (sel.length !== 1) {
    if (!sel.length && selIds().length === 0) {
      // Tab sem nada selecionado: começa um mapa novo no centro da tela
      createRootAt(viewCenter());
      return true;
    }
    return false;
  }
  finishAdd(addChild(els(), sel[0].id, "Tópico", measure));
  return true;
}

export function addSiblingToSelection(before = false): boolean {
  const sel = selNodes();
  if (sel.length !== 1) return false;
  finishAdd(addSibling(els(), sel[0].id, "Tópico", measure, before));
  return true;
}

/** Adiciona um filho a `id` (usado pelo clique da ferramenta Mapa). */
export function addChildTo(id: ID) {
  finishAdd(addChild(els(), id, "Tópico", measure));
}

export function editSelectedLabel(): boolean {
  const ids = selIds();
  if (ids.length !== 1) return false;
  const e = els().find((x) => x.id === ids[0]);
  if (!e || (e.type !== "node" && e.type !== "frame")) return false;
  beginLabel(e.id);
  return true;
}

// ---------- recolher / navegar ----------
export function toggleCollapseSelection() {
  const sel = selNodes();
  if (!sel.length) return;
  let out = els();
  const want = !sel.every((n) => n.collapsed);
  for (const n of sel) out = toggleCollapse(out, n.id, want);
  commit(out);
}

export function collapseMap(collapsed: boolean, fromLevel = 1) {
  const sel = selNodes();
  const roots = new Set(sel.map((n) => rootOf(els(), n.id)?.id).filter(Boolean) as ID[]);
  if (!roots.size) { toast("Selecione um nó do mapa."); return; }
  let out = els();
  for (const r of roots) out = setAllCollapsed(out, r, collapsed, fromLevel);
  commit(out);
}

export function focusSelection() {
  const sel = selNodes();
  if (sel.length !== 1) return;
  commit(focusBranch(els(), sel[0].id));
}

export function selectNeighbor(dir: "left" | "right" | "up" | "down"): boolean {
  const sel = selNodes();
  if (sel.length !== 1) return false;
  const id = neighbor(els(), sel[0].id, dir);
  if (id) useSel.getState().set([id]);
  return true;
}

/** Pai (Alt+↑ / Esc no nó) e primeiro filho (Alt+↓). */
export function selectParent(): boolean {
  const sel = selNodes();
  if (sel.length !== 1) return false;
  const a = ancestorsOf(els(), sel[0].id)[0];
  if (a) useSel.getState().set([a]);
  return true;
}

// ---------- estilo ----------
export function styleSelection(patch: NodePatch, withSubtree = false) {
  const sel = selNodes();
  if (!sel.length) return;
  // `layout`/`branchStyle` pertencem à raiz do mapa
  const { layout, branchStyle, ...rest } = patch;
  let out = els();
  if (Object.keys(rest).length) out = styleNodes(out, sel.map((n) => n.id), rest, measure, withSubtree);
  if (layout || branchStyle) {
    const roots = new Set(sel.map((n) => rootOf(out, n.id)?.id).filter(Boolean) as ID[]);
    out = styleNodes(out, [...roots], { ...(layout ? { layout } : {}), ...(branchStyle ? { branchStyle } : {}) }, measure);
  }
  commit(out);
}

export const setMapLayout = (layout: MapLayout) => styleSelection({ layout });
export const setBranchStyle = (branchStyle: BranchStyle) => styleSelection({ branchStyle });

/** Código visual pronto (prioridade alta, validado…). */
export function applyPreset(id: string, withSubtree = false) {
  const p = NODE_PRESETS.find((x) => x.id === id);
  if (!p) return;
  styleSelection({ fill: p.fill, stroke: p.stroke, color: p.color, branchColor: p.stroke }, withSubtree);
}

export function toggleDone() {
  const sel = selNodes();
  if (!sel.length) return;
  const want = !sel.every((n) => n.done);
  styleSelection({ done: want });
}

// ---------- estrutura ----------
export function detachSelection() {
  const sel = selNodes().filter((n) => n.parentId);
  if (!sel.length) return;
  let out = els();
  for (const n of sel) out = detachToRoot(out, n.id);
  commit(out);
}

/** Aplica o resultado de arrastar nós: reparenta pelo nó sob o centro ou reordena entre irmãos. */
export function settleMoved(next: HirakuElement[], draggedIds: ID[]): HirakuElement[] {
  const dragged = new Set(draggedIds);
  const byId = new Map(next.map((e) => [e.id, e]));
  let all = els().map((e) => byId.get(e.id) ?? e);
  const tops = nodesOf(all).filter((n) => dragged.has(n.id) && !(n.parentId && dragged.has(n.parentId)));
  for (const t of tops) {
    const cur = nodesOf(all).find((n) => n.id === t.id)!;
    const sub = subtreeIds(all, cur.id);
    const cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
    const target = nodesOf(all)
      .filter((n) => !sub.has(n.id) && !n.hidden && cx >= n.x && cx <= n.x + n.w && cy >= n.y && cy <= n.y + n.h)
      .pop();
    if (target) all = reparent(all, cur.id, target.id);
    else if (cur.parentId) all = reorderByPosition(all, cur.id);
    else all = relayout(all);
  }
  return settleFrames(all, [...dragged]);
}

// ---------- quadros ----------
export function wrapSelectionInFrame() {
  const ids = selIds();
  if (!ids.length) {
    // sem seleção: quadro vazio no centro da tela
    const c = viewCenter();
    const f = makeFrame(newId(), c.x - 240, c.y - 160, 480, 320);
    commit([f, ...els()]);
    useSel.getState().set([f.id]);
    beginLabel(f.id);
    return;
  }
  // se há quadros e nós, o filho de um nó selecionado já anda com o pai
  const r = wrapInFrame(els(), ids);
  if (!r) return;
  commit(r.elements);
  useSel.getState().set([r.id]);
  beginLabel(r.id);
}

export function ungroupSelection() {
  const ids = selIds();
  let out = els();
  for (const id of ids) out = ungroupFrame(out, id);
  commit(out);
  useSel.getState().set(ids.filter((id) => !framesOf(els()).some((f) => f.id === id)));
}

export function fitFrameSelection() {
  let out = els();
  for (const id of selIds()) out = fitFrameToContent(out, id);
  commit(out);
}

export function recolorFrames(color: string) {
  const ids = new Set(selIds());
  commit(els().map((e) => (e.type === "frame" && ids.has(e.id) ? { ...e, color } : e)));
}

/** Cria um quadro a partir de um retângulo arrastado; adota o que estiver dentro. */
export function createFrameFromBox(b: { x: number; y: number; w: number; h: number }) {
  const f = makeFrame(newId(), b.x, b.y, Math.max(80, b.w), Math.max(60, b.h));
  const all = settleFrames([f, ...els()], [...els().map((e) => e.id), f.id]);
  // só adota elementos que NÃO têm quadro mais interno: settle já escolhe o mais interno
  commit(all);
  useSel.getState().set([f.id]);
  useTool.getState().setTool("select");
  beginLabel(f.id);
}

/** Vai (câmera) até um quadro/seleção. */
export function fitToSelection(all = false) {
  const ids = new Set(selIds());
  const pool = all || !ids.size ? els() : els().filter((e) => ids.has(e.id) || e.frameId && ids.has(e.frameId));
  const list = pool.filter((e) => !(e.type === "node" && e.hidden));
  if (!list.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of list) {
    const b = elementBounds(e);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  const W = window.innerWidth, H = window.innerHeight;
  const pad = 90;
  const zoom = clampZoom(Math.min((W - pad * 2) / Math.max(1, maxX - minX), (H - pad * 2) / Math.max(1, maxY - minY), 2));
  const cam: Camera = { zoom, x: W / 2 - ((minX + maxX) / 2) * zoom, y: H / 2 - ((minY + maxY) / 2) * zoom };
  useView.getState().setCamera(cam);
}

// ---------- conectores livres ----------
/** Seta ligando dois elementos (nós de ramos diferentes, formas…): o par de seleção, na ordem em que foram marcados. */
export function connectSelection(): boolean {
  const ids = selIds();
  const all = els();
  const pair = ids.map((id) => all.find((e) => e.id === id)).filter((e): e is HirakuElement => !!e && (e.type === "node" || e.type === "text" || ["rect", "ellipse", "diamond"].includes(e.type)));
  if (pair.length !== 2) {
    toast("Selecione 2 nós (Shift+clique) para ligá-los com uma seta.");
    return false;
  }
  const [a, b] = pair as unknown as [NodeElement, NodeElement];
  const center = (e: NodeElement) => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 });
  const t = useTool.getState();
  const arrow: LinearElement = {
    id: newId(), type: "arrow", points: [center(a), center(b)],
    stroke: t.color, strokeWidth: 2.5, strokeStyle: "dashed", startHead: "none", endHead: "arrow", curved: false,
    startBinding: makeBinding(a, center(a)), endBinding: makeBinding(b, center(b)), opacity: 1,
  };
  const solved = solveArrow(arrow, new Map(all.map((e) => [e.id, e])));
  commit([...all, solved]);
  useSel.getState().set([solved.id]);
  return true;
}

// ---------- lista (outline) ----------
export function exportOutlineOfSelection(): string | null {
  const sel = selNodes();
  const root = sel.length ? rootOf(els(), sel[0].id) : nodesOf(els()).find((n) => !n.parentId);
  return root ? toOutline(els(), root.id) : null;
}

export function importOutlineText(text: string): boolean {
  const items = parseOutline(text);
  if (!items.length) return false;
  const a = mapFromOutline(els(), items, viewCenter(), measure);
  if (!a) return false;
  commit(a.elements);
  useSel.getState().set([a.id]);
  fitToSelectionSoon();
  return true;
}

function fitToSelectionSoon() {
  setTimeout(() => fitToSelection(false), 30);
}

/** Refaz tamanho e layout de todos os mapas (depois de abrir arquivo ou trocar de fonte). */
export function reflowAll() {
  commit(refitAll(els(), measure));
}

export const mapInfo = () => {
  const n = nodesOf(els());
  const roots = n.filter((x) => !x.parentId).length;
  return { nodes: n.length, maps: roots };
};

export { isNodeEl, childrenMap, withDependents };
