// Edição de grafos à mão: ferramenta Vértice (toque no vazio cria vértice), ferramenta Aresta (arraste de um vértice a
// outro), Tab no vértice selecionado cria um vizinho já ligado. Puro: só listas de elementos entram e saem.
import { create } from "zustand";
import { solveArrow } from "./binding";
import { elementHit } from "./geometry";
import { edgeStyle, vertexStyle } from "./graph";
import { HirakuElement, ID, LinearElement, NodeElement, newId } from "./model";
import { makeNode } from "./mindmap";

/** Opções das ferramentas de grafo (UI, fora do documento). */
interface GraphToolState {
  directed: boolean;
  weighted: boolean;
  set: (p: Partial<Pick<GraphToolState, "directed" | "weighted">>) => void;
}
export const useGraphTool = create<GraphToolState>((set) => ({ directed: false, weighted: false, set: (p) => set(p) }));

/** Vértice = nó marcado como vértice, ou nó solto (sem pai, sem filhos) em forma de elipse ligado por setas (grafos antigos). */
export function isVertex(e: HirakuElement, all?: HirakuElement[]): e is NodeElement {
  if (e.type !== "node" || e.hidden) return false;
  if (e.vertex) return true;
  if (e.parentId || e.shape !== "ellipse" || !all) return false;
  return all.some((x) => x.type === "arrow" && (x.startBinding?.elementId === e.id || x.endBinding?.elementId === e.id)) && !all.some((x) => x.type === "node" && x.parentId === e.id);
}

/** Próximo nome livre: A…Z, depois A1…Z1, A2… */
export function nextVertexName(all: HirakuElement[]): string {
  const used = new Set(all.filter((e): e is NodeElement => e.type === "node").map((n) => n.text.trim()));
  for (let round = 0; ; round++) {
    for (let i = 0; i < 26; i++) {
      const name = String.fromCharCode(65 + i) + (round ? String(round) : "");
      if (!used.has(name)) return name;
    }
  }
}

const SIZE = 48;
const textW = (t: string) => t.length * 10.5;

export function makeVertex(name: string, center: { x: number; y: number }, id: ID = newId()): NodeElement {
  const d = Math.max(SIZE, textW(name) + 26);
  return makeNode(id, center.x - d / 2, center.y - SIZE / 2, name, { ...vertexStyle(), w: d, h: SIZE, vertex: true });
}

export interface EdgeOpts { directed: boolean; label?: string }

/** Aresta ligada aos dois vértices (segue os vértices quando eles se movem). */
export function makeEdge(a: NodeElement, b: NodeElement, o: EdgeOpts, all: HirakuElement[] = [], id: ID = newId()): LinearElement {
  // arestas paralelas entre o mesmo par saem de focos diferentes
  const k = all.filter((x) => x.type === "arrow" && ((x.startBinding?.elementId === a.id && x.endBinding?.elementId === b.id) || (x.startBinding?.elementId === b.id && x.endBinding?.elementId === a.id))).length;
  const bend = k ? (k % 2 ? 0.35 : -0.35) * Math.ceil(k / 2) : 0;
  const arrow: LinearElement = {
    id, type: "arrow", points: [{ x: a.x + a.w / 2, y: a.y + a.h / 2 }, { x: b.x + b.w / 2, y: b.y + b.h / 2 }],
    strokeStyle: "solid", curved: false, opacity: 1, ...edgeStyle({ directed: o.directed }),
    startBinding: { elementId: a.id, u: bend, v: -bend }, endBinding: { elementId: b.id, u: bend, v: -bend },
    ...(o.label ? { label: o.label } : {}),
  };
  return solveArrow(arrow, new Map<ID, HirakuElement>([[a.id, a], [b.id, b]]));
}

/** Vértice mais acima sob o ponto. */
export function vertexAt(all: HirakuElement[], P: { x: number; y: number }, tol: number): NodeElement | null {
  for (let i = all.length - 1; i >= 0; i--) {
    const e = all[i];
    if (e.type === "node" && !e.hidden && elementHit(e, P.x, P.y, tol)) return e;
  }
  return null;
}

const center = (n: NodeElement) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

/** Onde pôr o novo vizinho de `v`: na direção mais livre (longe das arestas que já saem dele e de outros vértices). */
export function freeSpotNear(all: HirakuElement[], v: NodeElement, dist = 150): { x: number; y: number } {
  const c = center(v);
  const byId = new Map(all.map((e) => [e.id, e]));
  const dirs: number[] = [];
  for (const e of all) {
    if (e.type !== "arrow") continue;
    const other = e.startBinding?.elementId === v.id ? e.endBinding?.elementId : e.endBinding?.elementId === v.id ? e.startBinding?.elementId : undefined;
    const o = other ? byId.get(other) : undefined;
    if (o && o.type === "node") { const oc = center(o); dirs.push(Math.atan2(oc.y - c.y, oc.x - c.x)); }
  }
  const others = all.filter((e): e is NodeElement => e.type === "node" && !e.hidden && e.id !== v.id).map(center);
  let best = { score: -Infinity, x: c.x + dist, y: c.y };
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = c.x + Math.cos(a) * dist, y = c.y + Math.sin(a) * dist;
    const angGap = dirs.length ? Math.min(...dirs.map((d) => Math.abs(Math.atan2(Math.sin(a - d), Math.cos(a - d))))) : Math.PI;
    const near = others.length ? Math.min(...others.map((o) => Math.hypot(o.x - x, o.y - y))) : 999;
    // prefere a direita e baixo quando empata (leitura natural)
    const score = angGap * 2 + Math.min(near, 220) / 60 - (i === 0 ? 0 : 0.001 * i);
    if (score > best.score) best = { score, x, y };
  }
  return { x: best.x, y: best.y };
}

/** Novo vértice ligado a `fromId` (Tab). Devolve os elementos a acrescentar e o id do novo vértice. */
export function connectedVertex(all: HirakuElement[], fromId: ID, o: EdgeOpts): { vertex: NodeElement; edge: LinearElement } | null {
  const from = all.find((e) => e.id === fromId);
  if (!from || from.type !== "node") return null;
  const vertex = makeVertex(nextVertexName(all), freeSpotNear(all, from));
  const edge = makeEdge(from.vertex ? from : { ...from, vertex: true }, vertex, o, all);
  return { vertex, edge };
}

/** Arestas presas a algum dos vértices apagados (apagar um vértice apaga as arestas dele). */
export function incidentEdges(all: HirakuElement[], vertexIds: Set<ID>): ID[] {
  return all.filter((e) => e.type === "arrow" && ((e.startBinding && vertexIds.has(e.startBinding.elementId)) || (e.endBinding && vertexIds.has(e.endBinding.elementId)))).map((e) => e.id);
}

/** Peso digitado → rótulo da aresta ("2,5" e "2.5" valem; vazio tira o rótulo). */
export function cleanWeight(s: string): string | undefined {
  const t = s.trim();
  return t ? t.slice(0, 40) : undefined;
}

/** Linha/seta com o rótulo (peso) em edição. */
interface EdgeLabelState { id: ID | null; open: (id: ID) => void; close: () => void }
export const useEdgeLabel = create<EdgeLabelState>((set) => ({ id: null, open: (id) => set({ id }), close: () => set({ id: null }) }));
