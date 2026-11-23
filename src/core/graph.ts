// Grafos (teoria dos grafos / programação): ler uma lista de arestas, posicionar (círculo, força, camadas, grade, árvore),
// montar como elementos do quadro (vértices = nós circulares, arestas = setas ligadas com rótulo de peso) e analisar
// (BFS, DFS, menor caminho, componentes, ordenação topológica, coloração, árvore geradora mínima, bipartição).
// Puro: nada de Pixi/React/store.
import { HirakuElement, ID, LinearElement, NodeElement, newId } from "./model";
import { solveArrow } from "./binding";
import { makeNode } from "./mindmap";

export interface GEdge { a: string; b: string; directed: boolean; w?: number; label?: string }
export interface ParsedGraph { vertices: string[]; edges: GEdge[]; errors: string[] }

/**
 * Formatos aceitos (uma aresta por linha, ou separadas por ";"):
 *   A - B        não direcionada        A -> B   direcionada        A <- B   direcionada ao contrário
 *   A -- B : 4   peso 4                 A -> B 7 peso no fim         A, B, 3  CSV
 *   A: B C D     lista de adjacência    A        vértice isolado
 */
export function parseGraph(text: string, forceDirected?: boolean): ParsedGraph {
  const vertices: string[] = [];
  const edges: GEdge[] = [];
  const errors: string[] = [];
  const add = (v: string) => { const t = v.trim(); if (t && !vertices.includes(t)) vertices.push(t); return t; };
  const lines = text.split(/\n|;/).map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean);
  for (const line of lines) {
    // lista de adjacência "A: B C D" (sem seta)
    const adj = /^([^:,\-<>=]+):\s*([^:]+)$/.exec(line);
    if (adj && !/(->|<-|--|-|=>)/.test(adj[2]) && !/^\s*-?\d+([.,]\d+)?\s*$/.test(adj[2])) {
      const a = add(adj[1]);
      for (const b of adj[2].split(/[\s,]+/).filter(Boolean)) edges.push({ a, b: add(b), directed: forceDirected ?? true });
      continue;
    }
    const m = splitEdge(line);
    if (m) {
      const { l, op, r: right } = m;
      // peso/rótulo: "B : 4", "B = 4" ou número no fim "B 4"
      const wm = /^(.+?)\s*[:=]\s*(.+)$/.exec(right) ?? /^(.+?)\s+(-?\d+(?:[.,]\d+)?)$/.exec(right);
      const r = wm ? wm[1] : right;
      const wRaw = wm?.[2].trim();
      const wNum = wRaw !== undefined ? Number(wRaw.replace(",", ".")) : undefined;
      const directed = forceDirected ?? (op === "->" || op === "<-" || op === "=>" || op === "<->");
      const a = add(op === "<-" ? r : l), b = add(op === "<-" ? l : r);
      if (!a || !b) { errors.push(`Não entendi: “${line}”`); continue; }
      const wt = wRaw !== undefined ? (Number.isFinite(wNum) ? { w: wNum } : { label: wRaw }) : {};
      edges.push({ a, b, directed, ...wt });
      if (op === "<->") edges.push({ a: b, b: a, directed: true, ...wt });
      continue;
    }
    const csv = line.split(",").map((s) => s.trim());
    if (csv.length >= 2 && csv[0] && csv[1]) {
      const w = csv[2] !== undefined ? Number(csv[2].replace(",", ".")) : undefined;
      edges.push({ a: add(csv[0]), b: add(csv[1]), directed: forceDirected ?? false, ...(w !== undefined && Number.isFinite(w) ? { w } : {}) });
      continue;
    }
    if (/^[\w\p{L}\d .'"]+$/u.test(line)) add(line);
    else errors.push(`Não entendi: “${line}”`);
  }
  return { vertices, edges, errors };
}

/** Separa "esquerda OP direita" dando preferência às setas (nomes com hífen, como "Back-end", continuam inteiros). */
function splitEdge(line: string): { l: string; op: string; r: string } | null {
  for (const op of ["<->", "->", "<-", "=>", "--", "—", " - "]) {
    const i = line.indexOf(op);
    if (i > 0) return { l: line.slice(0, i).trim(), op: op.trim() || "-", r: line.slice(i + op.length).trim() };
  }
  const i = line.indexOf("-");
  if (i > 0 && !/\s/.test(line.slice(0, i)) && line.slice(i + 1).trim()) return { l: line.slice(0, i).trim(), op: "-", r: line.slice(i + 1).trim() };
  return null;
}

// ---------------- posicionamento ----------------
export type GraphLayout = "circle" | "force" | "layers" | "grid" | "tree";
export const GRAPH_LAYOUTS: { id: GraphLayout; label: string }[] = [
  { id: "circle", label: "Círculo" },
  { id: "force", label: "Força" },
  { id: "layers", label: "Camadas" },
  { id: "tree", label: "Árvore" },
  { id: "grid", label: "Grade" },
];

type Pos = Map<string, { x: number; y: number }>;

function neighbors(vs: string[], es: GEdge[], undirected = true) {
  const m = new Map<string, string[]>(vs.map((v) => [v, []]));
  for (const e of es) {
    m.get(e.a)?.push(e.b);
    if (undirected || !e.directed) m.get(e.b)?.push(e.a);
  }
  return m;
}

export function layoutGraph(g: Pick<ParsedGraph, "vertices" | "edges">, kind: GraphLayout, spacing = 140): Pos {
  const vs = g.vertices;
  const pos: Pos = new Map();
  const n = vs.length;
  if (!n) return pos;
  if (kind === "circle" || n <= 2) {
    const R = Math.max(spacing * 0.8, (spacing * n) / (2 * Math.PI));
    vs.forEach((v, i) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; pos.set(v, { x: Math.cos(a) * R, y: Math.sin(a) * R }); });
    return pos;
  }
  if (kind === "grid") {
    const cols = Math.ceil(Math.sqrt(n));
    vs.forEach((v, i) => pos.set(v, { x: (i % cols) * spacing, y: Math.floor(i / cols) * spacing }));
    return pos;
  }
  if (kind === "layers" || kind === "tree") {
    // camadas por BFS a partir das raízes (sem arestas chegando; senão o primeiro vértice)
    const indeg = new Map(vs.map((v) => [v, 0]));
    for (const e of g.edges) if (e.directed) indeg.set(e.b, (indeg.get(e.b) ?? 0) + 1);
    const nb = neighbors(vs, g.edges, kind === "tree" || !g.edges.some((e) => e.directed));
    const level = new Map<string, number>();
    const roots = vs.filter((v) => indeg.get(v) === 0 && g.edges.some((e) => e.directed));
    const queue: string[] = [];
    const seed = (v: string) => { level.set(v, 0); queue.push(v); };
    (roots.length ? roots : [vs[0]]).forEach(seed);
    const parent = new Map<string, string>();
    const visit = () => {
      while (queue.length) {
        const v = queue.shift()!;
        for (const w of nb.get(v) ?? []) if (!level.has(w)) { level.set(w, level.get(v)! + 1); parent.set(w, v); queue.push(w); }
      }
    };
    visit();
    for (const v of vs) if (!level.has(v)) { seed(v); visit(); }
    // DAG: empurra cada vértice para depois de todos os antecessores (caminho mais longo)
    if (kind === "layers" && g.edges.some((e) => e.directed)) {
      for (let it = 0; it < n; it++) {
        let changed = false;
        for (const e of g.edges) if (e.directed && e.a !== e.b && level.get(e.b)! <= level.get(e.a)! && level.get(e.a)! < n) { level.set(e.b, level.get(e.a)! + 1); changed = true; }
        if (!changed) break;
      }
    }
    const rows = new Map<number, string[]>();
    for (const v of vs) { const l = level.get(v)!; rows.set(l, [...(rows.get(l) ?? []), v]); }
    if (kind === "tree") {
      // largura proporcional às folhas de cada subárvore (árvore de BFS)
      const kids = new Map<string, string[]>();
      for (const [c, p] of parent) kids.set(p, [...(kids.get(p) ?? []), c]);
      const leaves = (v: string): number => { const k = kids.get(v) ?? []; return k.length ? k.reduce((s, c) => s + leaves(c), 0) : 1; };
      let cursor = 0;
      const place = (v: string, depth: number): number => {
        const k = kids.get(v) ?? [];
        let x: number;
        if (!k.length) { x = cursor; cursor += spacing * 0.8; }
        else { const xs = k.map((c) => place(c, depth + 1)); x = (xs[0] + xs[xs.length - 1]) / 2; }
        pos.set(v, { x, y: depth * spacing * 0.85 });
        return x;
      };
      for (const v of vs) if (!parent.has(v) && !pos.has(v)) { place(v, 0); cursor += spacing * 0.4; void leaves; }
      return pos;
    }
    for (const [l, row] of rows) row.forEach((v, i) => pos.set(v, { x: (i - (row.length - 1) / 2) * spacing, y: l * spacing * 0.85 }));
    return pos;
  }
  // força (Fruchterman–Reingold, determinístico: começa no círculo)
  const start = layoutGraph(g, "circle", spacing);
  const P = vs.map((v) => ({ ...start.get(v)! }));
  const idx = new Map(vs.map((v, i) => [v, i]));
  const k = spacing;
  let temp = spacing * 1.5;
  for (let it = 0; it < 300; it++) {
    const disp = P.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y;
      let d = Math.hypot(dx, dy);
      if (d < 0.01) { dx = 0.01 * (i - j); dy = 0.01; d = 0.015; }
      const f = (k * k) / d;
      disp[i].x += (dx / d) * f; disp[i].y += (dy / d) * f;
      disp[j].x -= (dx / d) * f; disp[j].y -= (dy / d) * f;
    }
    for (const e of g.edges) {
      const i = idx.get(e.a)!, j = idx.get(e.b)!;
      if (i === j) continue;
      const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y;
      const d = Math.max(0.01, Math.hypot(dx, dy));
      const f = (d * d) / k;
      disp[i].x -= (dx / d) * f; disp[i].y -= (dy / d) * f;
      disp[j].x += (dx / d) * f; disp[j].y += (dy / d) * f;
    }
    for (let i = 0; i < n; i++) {
      // leve gravidade para o centro (componentes soltas não fogem)
      disp[i].x -= P[i].x * 0.02; disp[i].y -= P[i].y * 0.02;
      const d = Math.hypot(disp[i].x, disp[i].y) || 1;
      P[i].x += (disp[i].x / d) * Math.min(d, temp);
      P[i].y += (disp[i].y / d) * Math.min(d, temp);
    }
    temp *= 0.985;
  }
  vs.forEach((v, i) => pos.set(v, P[i]));
  return pos;
}

// ---------------- montar no quadro ----------------
export const GRAPH_COLOR = "#2F4B8F";
const VERTEX_FILL = "#FFFFFF";
const EDGE_COLOR = "#52627A";

export function vertexStyle(): Partial<NodeElement> {
  return { shape: "ellipse", fill: VERTEX_FILL, stroke: GRAPH_COLOR, color: "#1B2233", fontSize: 18, strokeWidth: 2, branchColor: GRAPH_COLOR, icon: null, done: false };
}

export function edgeStyle(e: { directed: boolean }): Pick<LinearElement, "stroke" | "strokeWidth" | "endHead" | "startHead"> {
  return { stroke: EDGE_COLOR, strokeWidth: 2, startHead: "none", endHead: e.directed ? "triangle" : "none" };
}

/** Vértices (nós circulares) e arestas (setas ligadas com rótulo) prontos para inserir, com o centro em (0, 0). */
export function buildGraphElements(g: ParsedGraph, layout: GraphLayout, measure?: (t: string, size: number) => number): HirakuElement[] {
  const pos = layoutGraph(g, layout);
  let cx = 0, cy = 0;
  for (const p of pos.values()) { cx += p.x / pos.size; cy += p.y / pos.size; }
  const nodes = new Map<string, NodeElement>();
  for (const v of g.vertices) {
    const p = pos.get(v)!;
    const tw = measure ? measure(v, 18) : v.length * 10.5;
    const d = Math.max(48, tw + 26);
    nodes.set(v, makeNode(newId(), p.x - cx - d / 2, p.y - cy - 24, v, { ...vertexStyle(), w: d, h: 48 }));
  }
  const byId = new Map<ID, HirakuElement>([...nodes.values()].map((n) => [n.id, n]));
  const edges: LinearElement[] = [];
  const seenPair = new Map<string, number>();
  for (const e of g.edges) {
    const A = nodes.get(e.a)!, B = nodes.get(e.b)!;
    const pair = [e.a, e.b].sort().join("\u0000");
    const k = seenPair.get(pair) ?? 0;
    seenPair.set(pair, k + 1);
    const label = e.w !== undefined ? String(e.w).replace(".", ",") : e.label;
    if (A === B) {
      // laço: pequena volta acima do vértice
      const x = A.x + A.w / 2, y = A.y;
      edges.push({ id: newId(), type: "arrow", points: [{ x: x - 12, y }, { x: x - 22, y: y - 36 }, { x: x + 22, y: y - 36 }, { x: x + 12, y }], curved: true, strokeStyle: "solid", opacity: 1, ...edgeStyle(e), ...(label ? { label } : {}) });
      continue;
    }
    const bend = k > 0 ? (k % 2 ? 0.35 : -0.35) : 0; // arestas paralelas saem de focos diferentes
    const arrow: LinearElement = {
      id: newId(), type: "arrow", points: [{ x: A.x + A.w / 2, y: A.y + A.h / 2 }, { x: B.x + B.w / 2, y: B.y + B.h / 2 }],
      strokeStyle: "solid", curved: false, opacity: 1, ...edgeStyle(e),
      startBinding: { elementId: A.id, u: bend, v: -bend }, endBinding: { elementId: B.id, u: bend, v: -bend },
      ...(label ? { label } : {}),
    };
    edges.push(solveArrow(arrow, byId));
  }
  return [...edges, ...nodes.values()];
}

// ---------------- ler o grafo que está no quadro ----------------
export interface BoardGraph {
  vertices: NodeElement[];
  edges: { el: LinearElement; a: ID; b: ID; directed: boolean; w: number }[];
}

/** Grafo formado por nós ligados por setas. Com `ids`, só os selecionados (e as setas entre eles). */
export function graphFromElements(els: HirakuElement[], ids?: Set<ID>): BoardGraph {
  const isV = (e: HirakuElement): e is NodeElement => e.type === "node" && !e.hidden && (!ids || ids.has(e.id));
  const vs = els.filter(isV);
  const vset = new Set(vs.map((v) => v.id));
  const edges: BoardGraph["edges"] = [];
  for (const e of els) {
    if (e.type !== "arrow" || !e.startBinding || !e.endBinding) continue;
    const a = e.startBinding.elementId, b = e.endBinding.elementId;
    if (!vset.has(a) || !vset.has(b)) continue;
    const num = e.label !== undefined ? Number(e.label.replace(",", ".")) : NaN;
    edges.push({ el: e, a, b, directed: e.endHead !== "none" || e.startHead !== "none", w: Number.isFinite(num) ? num : 1 });
  }
  // sem seleção: só nós que participam de alguma aresta (não pega mapas mentais soltos)
  if (!ids) {
    const used = new Set(edges.flatMap((e) => [e.a, e.b]));
    return { vertices: vs.filter((v) => used.has(v.id)), edges };
  }
  return { vertices: vs, edges };
}

/** Lista de arestas em texto (para copiar/editar). */
export function graphToText(g: BoardGraph): string {
  const name = new Map(g.vertices.map((v) => [v.id, v.text || v.id.slice(0, 4)]));
  const lines = g.edges.map((e) => `${name.get(e.a)} ${e.directed ? "->" : "-"} ${name.get(e.b)}${e.w !== 1 || e.el.label ? ` : ${e.el.label ?? e.w}` : ""}`);
  const used = new Set(g.edges.flatMap((e) => [e.a, e.b]));
  for (const v of g.vertices) if (!used.has(v.id)) lines.push(name.get(v.id)!);
  return lines.join("\n");
}

// ---------------- algoritmos ----------------
interface Adj { to: ID; w: number; edge: number }
function adjacency(g: BoardGraph, undirected = false): Map<ID, Adj[]> {
  const m = new Map<ID, Adj[]>(g.vertices.map((v) => [v.id, []]));
  g.edges.forEach((e, i) => {
    m.get(e.a)?.push({ to: e.b, w: e.w, edge: i });
    if (!e.directed || undirected) m.get(e.b)?.push({ to: e.a, w: e.w, edge: i });
  });
  // ordem estável: pelo texto do vértice
  const label = new Map(g.vertices.map((v) => [v.id, v.text]));
  for (const list of m.values()) list.sort((x, y) => (label.get(x.to) ?? "").localeCompare(label.get(y.to) ?? "", "pt", { numeric: true }));
  return m;
}

export function bfs(g: BoardGraph, start: ID): { order: ID[]; edges: number[] } {
  const adj = adjacency(g);
  const seen = new Set([start]);
  const order: ID[] = [];
  const edges: number[] = [];
  const q = [start];
  while (q.length) {
    const v = q.shift()!;
    order.push(v);
    for (const a of adj.get(v) ?? []) if (!seen.has(a.to)) { seen.add(a.to); edges.push(a.edge); q.push(a.to); }
  }
  return { order, edges };
}

export function dfs(g: BoardGraph, start: ID): { order: ID[]; edges: number[] } {
  const adj = adjacency(g);
  const seen = new Set<ID>();
  const order: ID[] = [];
  const edges: number[] = [];
  const go = (v: ID) => {
    seen.add(v);
    order.push(v);
    for (const a of adj.get(v) ?? []) if (!seen.has(a.to)) { edges.push(a.edge); go(a.to); }
  };
  go(start);
  return { order, edges };
}

/** Dijkstra (pesos ≥ 0; sem peso = 1). */
export function shortestPath(g: BoardGraph, from: ID, to: ID): { dist: number; path: ID[]; edges: number[] } | null {
  const adj = adjacency(g);
  const dist = new Map<ID, number>(g.vertices.map((v) => [v.id, Infinity]));
  const prev = new Map<ID, { v: ID; edge: number }>();
  dist.set(from, 0);
  const done = new Set<ID>();
  for (;;) {
    let u: ID | null = null;
    let best = Infinity;
    for (const [v, d] of dist) if (!done.has(v) && d < best) { best = d; u = v; }
    if (u === null || u === to) break;
    done.add(u);
    for (const a of adj.get(u) ?? []) {
      const nd = best + Math.max(0, a.w);
      if (nd < (dist.get(a.to) ?? Infinity)) { dist.set(a.to, nd); prev.set(a.to, { v: u, edge: a.edge }); }
    }
  }
  const d = dist.get(to) ?? Infinity;
  if (!Number.isFinite(d)) return null;
  const path: ID[] = [to];
  const edges: number[] = [];
  let cur = to;
  while (cur !== from) { const p = prev.get(cur)!; edges.unshift(p.edge); cur = p.v; path.unshift(cur); }
  return { dist: d, path, edges };
}

export function components(g: BoardGraph): ID[][] {
  const adj = adjacency(g, true);
  const seen = new Set<ID>();
  const out: ID[][] = [];
  for (const v of g.vertices) {
    if (seen.has(v.id)) continue;
    const comp: ID[] = [];
    const st = [v.id];
    seen.add(v.id);
    while (st.length) { const x = st.pop()!; comp.push(x); for (const a of adj.get(x) ?? []) if (!seen.has(a.to)) { seen.add(a.to); st.push(a.to); } }
    out.push(comp);
  }
  return out;
}

/** Ordenação topológica (Kahn). null = tem ciclo. */
export function topoSort(g: BoardGraph): ID[] | null {
  const indeg = new Map<ID, number>(g.vertices.map((v) => [v.id, 0]));
  for (const e of g.edges) indeg.set(e.b, (indeg.get(e.b) ?? 0) + 1);
  const adj = adjacency(g);
  const q = g.vertices.filter((v) => indeg.get(v.id) === 0).map((v) => v.id);
  const out: ID[] = [];
  while (q.length) {
    const v = q.shift()!;
    out.push(v);
    for (const a of adj.get(v) ?? []) { indeg.set(a.to, indeg.get(a.to)! - 1); if (indeg.get(a.to) === 0) q.push(a.to); }
  }
  return out.length === g.vertices.length ? out : null;
}

/** Coloração gulosa (Welsh–Powell): cor de cada vértice (0, 1, 2…). */
export function colorGraph(g: BoardGraph): Map<ID, number> {
  const adj = adjacency(g, true);
  const order = [...g.vertices].sort((a, b) => (adj.get(b.id)?.length ?? 0) - (adj.get(a.id)?.length ?? 0));
  const color = new Map<ID, number>();
  for (const v of order) {
    const used = new Set((adj.get(v.id) ?? []).map((a) => color.get(a.to)).filter((c) => c !== undefined));
    let c = 0;
    while (used.has(c)) c++;
    color.set(v.id, c);
  }
  return color;
}

/** Árvore geradora mínima (Kruskal; trata as arestas como não direcionadas). */
export function mst(g: BoardGraph): { edges: number[]; total: number } {
  const parent = new Map<ID, ID>(g.vertices.map((v) => [v.id, v.id]));
  const find = (x: ID): ID => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  const order = g.edges.map((_, i) => i).sort((i, j) => g.edges[i].w - g.edges[j].w);
  const edges: number[] = [];
  let total = 0;
  for (const i of order) {
    const e = g.edges[i];
    const ra = find(e.a), rb = find(e.b);
    if (ra === rb) continue;
    parent.set(ra, rb);
    edges.push(i);
    total += e.w;
  }
  return { edges, total };
}

/** Bipartido? Devolve o lado (0/1) de cada vértice, ou null se houver ciclo ímpar. */
export function bipartite(g: BoardGraph): Map<ID, 0 | 1> | null {
  const adj = adjacency(g, true);
  const side = new Map<ID, 0 | 1>();
  for (const v of g.vertices) {
    if (side.has(v.id)) continue;
    side.set(v.id, 0);
    const q = [v.id];
    while (q.length) {
      const x = q.shift()!;
      for (const a of adj.get(x) ?? []) {
        if (!side.has(a.to)) { side.set(a.to, side.get(x) === 0 ? 1 : 0); q.push(a.to); }
        else if (side.get(a.to) === side.get(x)) return null;
      }
    }
  }
  return side;
}

export function degrees(g: BoardGraph): Map<ID, { in: number; out: number; total: number }> {
  const m = new Map(g.vertices.map((v) => [v.id, { in: 0, out: 0, total: 0 }]));
  for (const e of g.edges) {
    const a = m.get(e.a)!, b = m.get(e.b)!;
    a.out++; b.in++; a.total++; b.total++;
  }
  return m;
}

/** Tem ciclo? (direcionado: busca em profundidade com cores; não direcionado: aresta para vértice já visto que não é o pai). */
export function hasCycle(g: BoardGraph): boolean {
  if (g.edges.some((e) => e.directed)) return topoSort(g) === null;
  return g.edges.length > g.vertices.length - components(g).length;
}

// ---------------- exemplos ----------------
export const GRAPH_PRESETS: { id: string; name: string; text: string; layout: GraphLayout }[] = [
  { id: "weighted", name: "Ponderado (cidades)", layout: "force", text: "Recife - Olinda : 7\nRecife - Jaboatão : 12\nRecife - Paulista : 15\nOlinda - Paulista : 9\nJaboatão - Cabo : 20\nRecife - Cabo : 33\nPaulista - Igarassu : 14" },
  { id: "dag", name: "Dependências (DAG)", layout: "layers", text: "Requisitos -> Projeto\nProjeto -> Back-end\nProjeto -> Front-end\nBack-end -> Testes\nFront-end -> Testes\nTestes -> Deploy" },
  { id: "tree", name: "Árvore binária", layout: "tree", text: "8 - 4\n8 - 12\n4 - 2\n4 - 6\n12 - 10\n12 - 14\n2 - 1\n2 - 3" },
  { id: "k5", name: "Completo K5", layout: "circle", text: "A-B; A-C; A-D; A-E; B-C; B-D; B-E; C-D; C-E; D-E" },
  { id: "cycle", name: "Ciclo C6", layout: "circle", text: "1-2; 2-3; 3-4; 4-5; 5-6; 6-1" },
  { id: "bip", name: "Bipartido K3,3", layout: "layers", text: "a1 - b1; a1 - b2; a1 - b3; a2 - b1; a2 - b2; a2 - b3; a3 - b1; a3 - b2; a3 - b3" },
  { id: "petersen", name: "Petersen", layout: "force", text: "0-1;1-2;2-3;3-4;4-0;0-5;1-6;2-7;3-8;4-9;5-7;7-9;9-6;6-8;8-5" },
  { id: "automaton", name: "Autômato", layout: "circle", text: "q0 -> q1 : a\nq1 -> q2 : b\nq2 -> q0 : a\nq1 -> q1 : a\nq2 -> q2 : b" },
];
