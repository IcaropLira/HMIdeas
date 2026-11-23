// Algoritmos de grafos PASSO A PASSO (para ver a execução), geradores de grafos/árvores e matriz de adjacência.
// Puro. Um algoritmo devolve uma lista de `Step`: o que está sendo visitado, a fronteira (fila/pilha), arestas da árvore,
// distâncias e uma frase explicando o passo. A interface só "toca" a lista.
import { BoardGraph } from "./graph";
import { ID } from "./model";

export interface Step {
  note: string;
  /** Vértice em foco neste passo. */
  current?: ID;
  /** Já finalizados (cinza-esverdeado). */
  done: ID[];
  /** Descobertos e ainda na fila/pilha/heap (amarelo). */
  frontier: ID[];
  /** Aresta sendo examinada agora (índice em g.edges). */
  edge?: number;
  /** Arestas escolhidas (árvore de busca, caminho, árvore geradora…). */
  tree: number[];
  /** Arestas descartadas (formam ciclo, já visitado…). */
  rejected: number[];
  /** Rótulo extra por vértice (distância, ordem, low-link…). */
  labels: Record<ID, string>;
  /** Estrutura auxiliar mostrada no painel (fila, pilha, heap). */
  structure?: { name: string; items: string[] };
  /** Destaques finais (pontes, articulações, caminho). */
  highlight?: { vertices?: ID[]; edges?: number[] };
}

export type AlgoId = "bfs" | "dfs" | "dijkstra" | "prim" | "kruskal" | "topo" | "bridges" | "preorder" | "inorder" | "postorder" | "levelorder";

export const ALGORITHMS: { id: AlgoId; label: string; hint: string; needsStart: boolean; needsEnd?: boolean; group: "busca" | "caminho" | "arvore" | "estrutura" }[] = [
  { id: "bfs", label: "Busca em largura (BFS)", hint: "Visita por camadas usando uma fila", needsStart: true, group: "busca" },
  { id: "dfs", label: "Busca em profundidade (DFS)", hint: "Vai fundo usando uma pilha (recursão)", needsStart: true, group: "busca" },
  { id: "dijkstra", label: "Dijkstra", hint: "Menores distâncias a partir da origem (pesos ≥ 0)", needsStart: true, needsEnd: true, group: "caminho" },
  { id: "prim", label: "Prim", hint: "Árvore geradora mínima crescendo de um vértice", needsStart: true, group: "arvore" },
  { id: "kruskal", label: "Kruskal", hint: "Árvore geradora mínima pelas arestas mais leves", needsStart: false, group: "arvore" },
  { id: "topo", label: "Ordenação topológica", hint: "Kahn: tira quem não tem dependência", needsStart: false, group: "estrutura" },
  { id: "bridges", label: "Pontes e articulações", hint: "Tarjan: arestas e vértices cuja remoção desconecta", needsStart: false, group: "estrutura" },
  { id: "preorder", label: "Pré-ordem", hint: "Raiz, esquerda, direita", needsStart: true, group: "arvore" },
  { id: "inorder", label: "Em ordem", hint: "Esquerda, raiz, direita (BST sai ordenada)", needsStart: true, group: "arvore" },
  { id: "postorder", label: "Pós-ordem", hint: "Esquerda, direita, raiz", needsStart: true, group: "arvore" },
  { id: "levelorder", label: "Por nível", hint: "Árvore lida linha a linha", needsStart: true, group: "arvore" },
];

interface A { to: ID; w: number; edge: number }
function adj(g: BoardGraph, undirected: boolean): Map<ID, A[]> {
  const m = new Map<ID, A[]>(g.vertices.map((v) => [v.id, []]));
  g.edges.forEach((e, i) => {
    m.get(e.a)?.push({ to: e.b, w: e.w, edge: i });
    if (!e.directed || undirected) m.get(e.b)?.push({ to: e.a, w: e.w, edge: i });
  });
  const label = new Map(g.vertices.map((v) => [v.id, v.text]));
  for (const list of m.values()) list.sort((x, y) => (label.get(x.to) ?? "").localeCompare(label.get(y.to) ?? "", "pt", { numeric: true }));
  return m;
}

const fmtW = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 1000) / 1000).replace(".", ",") : "∞");

/** Monta os passos de um algoritmo. `name` dá o texto de cada vértice. */
export function runAlgorithm(g: BoardGraph, algo: AlgoId, start?: ID, end?: ID): Step[] {
  const name = (id: ID) => g.vertices.find((v) => v.id === id)?.text || "?";
  const steps: Step[] = [];
  const s0 = start && g.vertices.some((v) => v.id === start) ? start : g.vertices[0]?.id;
  if (!s0) return [{ note: "Grafo vazio.", done: [], frontier: [], tree: [], rejected: [], labels: {} }];
  const push = (st: Omit<Step, "labels"> & { labels?: Record<ID, string> }) =>
    steps.push({ ...st, done: [...st.done], frontier: [...st.frontier], tree: [...st.tree], rejected: [...st.rejected], labels: { ...(st.labels ?? {}) } });

  if (algo === "bfs" || algo === "levelorder") {
    const A = adj(g, algo === "levelorder");
    const seen = new Set([s0]);
    const queue: ID[] = [s0];
    const done: ID[] = [];
    const tree: number[] = [];
    const rejected: number[] = [];
    const labels: Record<ID, string> = { [s0]: "0" };
    const level = new Map([[s0, 0]]);
    push({ note: `Começa em ${name(s0)}: entra na fila com distância 0.`, current: s0, done, frontier: queue, tree, rejected, labels, structure: { name: "Fila", items: queue.map(name) } });
    while (queue.length) {
      const v = queue.shift()!;
      push({ note: `Tira ${name(v)} da fila e olha os vizinhos.`, current: v, done, frontier: queue, tree, rejected, labels, structure: { name: "Fila", items: queue.map(name) } });
      for (const a of A.get(v) ?? []) {
        if (seen.has(a.to)) {
          if (!tree.includes(a.edge)) rejected.push(a.edge);
          push({ note: `${name(a.to)} já foi descoberto: ignora.`, current: v, edge: a.edge, done, frontier: queue, tree, rejected, labels, structure: { name: "Fila", items: queue.map(name) } });
          continue;
        }
        seen.add(a.to);
        level.set(a.to, level.get(v)! + 1);
        labels[a.to] = String(level.get(a.to));
        tree.push(a.edge);
        queue.push(a.to);
        push({ note: `Descobre ${name(a.to)} (nível ${level.get(a.to)}) e põe no fim da fila.`, current: v, edge: a.edge, done, frontier: queue, tree, rejected, labels, structure: { name: "Fila", items: queue.map(name) } });
      }
      done.push(v);
    }
    push({ note: `Fim. Ordem de visita: ${done.map(name).join(" → ")}.`, done, frontier: [], tree, rejected, labels, highlight: { edges: tree } });
    return steps;
  }

  if (algo === "dfs") {
    const A = adj(g, false);
    const seen = new Set<ID>();
    const done: ID[] = [];
    const tree: number[] = [];
    const rejected: number[] = [];
    const labels: Record<ID, string> = {};
    const stack: ID[] = [];
    let t = 0;
    const visit = (v: ID) => {
      seen.add(v);
      stack.push(v);
      labels[v] = `${++t}`;
      push({ note: `Entra em ${name(v)} (descoberta #${t}).`, current: v, done, frontier: stack, tree, rejected, labels, structure: { name: "Pilha", items: [...stack].reverse().map(name) } });
      for (const a of A.get(v) ?? []) {
        if (seen.has(a.to)) {
          if (!tree.includes(a.edge)) rejected.push(a.edge);
          push({ note: `${name(a.to)} já visitado: volta.`, current: v, edge: a.edge, done, frontier: stack, tree, rejected, labels, structure: { name: "Pilha", items: [...stack].reverse().map(name) } });
          continue;
        }
        tree.push(a.edge);
        push({ note: `Desce por ${name(v)} → ${name(a.to)}.`, current: v, edge: a.edge, done, frontier: stack, tree, rejected, labels, structure: { name: "Pilha", items: [...stack].reverse().map(name) } });
        visit(a.to);
      }
      stack.pop();
      done.push(v);
      push({ note: `${name(v)} terminou (todos os vizinhos vistos); desempilha.`, current: v, done, frontier: stack, tree, rejected, labels, structure: { name: "Pilha", items: [...stack].reverse().map(name) } });
    };
    visit(s0);
    push({ note: `Fim. Descoberta: ${[...seen].map(name).join(" → ")}. Término: ${done.map(name).join(", ")}.`, done, frontier: [], tree, rejected, labels, highlight: { edges: tree } });
    return steps;
  }

  if (algo === "dijkstra" || algo === "prim") {
    const A = adj(g, algo === "prim");
    const key = new Map<ID, number>(g.vertices.map((v) => [v.id, Infinity]));
    const via = new Map<ID, number>();
    const prev = new Map<ID, ID>();
    key.set(s0, 0);
    const done: ID[] = [];
    const tree: number[] = [];
    const rejected: number[] = [];
    const lab = () => Object.fromEntries(g.vertices.map((v) => [v.id, fmtW(key.get(v.id)!)]));
    const heap = () => g.vertices.filter((v) => !done.includes(v.id) && Number.isFinite(key.get(v.id)!)).sort((a, b) => key.get(a.id)! - key.get(b.id)!);
    const word = algo === "dijkstra" ? "distância" : "custo de ligação";
    push({ note: `Começa em ${name(s0)} com ${word} 0; os outros começam com ∞.`, current: s0, done, frontier: [s0], tree, rejected, labels: lab(), structure: { name: "Fila de prioridade", items: heap().map((v) => `${v.text}:${fmtW(key.get(v.id)!)}`) } });
    for (;;) {
      const h = heap();
      if (!h.length) break;
      const u = h[0].id;
      done.push(u);
      if (via.has(u)) tree.push(via.get(u)!);
      push({ note: `Escolhe ${name(u)} (menor ${word}: ${fmtW(key.get(u)!)}) e o fixa.`, current: u, done, frontier: heap().map((v) => v.id), tree, rejected, labels: lab(), structure: { name: "Fila de prioridade", items: heap().map((v) => `${v.text}:${fmtW(key.get(v.id)!)}`) } });
      if (algo === "dijkstra" && u === end) break;
      for (const a of A.get(u) ?? []) {
        if (done.includes(a.to)) continue;
        const cand = algo === "dijkstra" ? key.get(u)! + Math.max(0, a.w) : a.w;
        if (cand < key.get(a.to)!) {
          const old = key.get(a.to)!;
          key.set(a.to, cand);
          if (via.has(a.to)) rejected.push(via.get(a.to)!);
          via.set(a.to, a.edge);
          prev.set(a.to, u);
          push({ note: `Relaxa ${name(u)} → ${name(a.to)}: ${fmtW(old)} vira ${fmtW(cand)}.`, current: u, edge: a.edge, done, frontier: heap().map((v) => v.id), tree, rejected, labels: lab(), structure: { name: "Fila de prioridade", items: heap().map((v) => `${v.text}:${fmtW(key.get(v.id)!)}`) } });
        } else {
          push({ note: `${name(u)} → ${name(a.to)} não melhora (${fmtW(cand)} ≥ ${fmtW(key.get(a.to)!)}).`, current: u, edge: a.edge, done, frontier: heap().map((v) => v.id), tree, rejected, labels: lab(), structure: { name: "Fila de prioridade", items: heap().map((v) => `${v.text}:${fmtW(key.get(v.id)!)}`) } });
        }
      }
    }
    if (algo === "dijkstra" && end && Number.isFinite(key.get(end)!)) {
      const path: ID[] = [end];
      const pe: number[] = [];
      while (path[0] !== s0) { pe.unshift(via.get(path[0])!); path.unshift(prev.get(path[0])!); }
      push({ note: `Menor caminho até ${name(end)}: ${path.map(name).join(" → ")} (custo ${fmtW(key.get(end)!)}).`, done, frontier: [], tree, rejected, labels: lab(), highlight: { vertices: path, edges: pe } });
    } else {
      const total = tree.reduce((s, i) => s + g.edges[i].w, 0);
      push({ note: algo === "prim" ? `Árvore geradora mínima pronta: peso total ${fmtW(total)}.` : "Todas as distâncias a partir da origem estão fixas.", done, frontier: [], tree, rejected, labels: lab(), highlight: { edges: tree } });
    }
    return steps;
  }

  if (algo === "kruskal") {
    const parent = new Map<ID, ID>(g.vertices.map((v) => [v.id, v.id]));
    const find = (x: ID): ID => (parent.get(x) === x ? x : find(parent.get(x)!));
    const order = g.edges.map((_, i) => i).sort((i, j) => g.edges[i].w - g.edges[j].w);
    const tree: number[] = [];
    const rejected: number[] = [];
    push({ note: `Ordena as ${order.length} arestas pelo peso e testa da mais leve para a mais pesada.`, done: [], frontier: [], tree, rejected, labels: {}, structure: { name: "Arestas ordenadas", items: order.map((i) => `${name(g.edges[i].a)}${name(g.edges[i].b)}:${fmtW(g.edges[i].w)}`) } });
    for (const i of order) {
      const e = g.edges[i];
      const ra = find(e.a), rb = find(e.b);
      if (ra === rb) {
        rejected.push(i);
        push({ note: `${name(e.a)}–${name(e.b)} (${fmtW(e.w)}) formaria ciclo: descarta.`, edge: i, done: [], frontier: [], tree, rejected, labels: {} });
      } else {
        parent.set(ra, rb);
        tree.push(i);
        push({ note: `${name(e.a)}–${name(e.b)} (${fmtW(e.w)}) liga dois grupos: entra na árvore.`, edge: i, done: [e.a, e.b], frontier: [], tree, rejected, labels: {} });
      }
    }
    push({ note: `Árvore geradora mínima: ${tree.length} arestas, peso ${fmtW(tree.reduce((s, i) => s + g.edges[i].w, 0))}.`, done: g.vertices.map((v) => v.id), frontier: [], tree, rejected, labels: {}, highlight: { edges: tree } });
    return steps;
  }

  if (algo === "topo") {
    const A = adj(g, false);
    const indeg = new Map<ID, number>(g.vertices.map((v) => [v.id, 0]));
    for (const e of g.edges) indeg.set(e.b, (indeg.get(e.b) ?? 0) + 1);
    const lab = () => Object.fromEntries([...indeg].map(([k, v]) => [k, `in ${v}`]));
    const q = g.vertices.filter((v) => indeg.get(v.id) === 0).map((v) => v.id);
    const done: ID[] = [];
    const tree: number[] = [];
    push({ note: `Grau de entrada de cada vértice. Sem dependências: ${q.map(name).join(", ") || "nenhum"}.`, done, frontier: q, tree, rejected: [], labels: lab(), structure: { name: "Fila", items: q.map(name) } });
    while (q.length) {
      const v = q.shift()!;
      done.push(v);
      push({ note: `${name(v)} é o #${done.length} da ordem.`, current: v, done, frontier: q, tree, rejected: [], labels: lab(), structure: { name: "Fila", items: q.map(name) } });
      for (const a of A.get(v) ?? []) {
        indeg.set(a.to, indeg.get(a.to)! - 1);
        tree.push(a.edge);
        if (indeg.get(a.to) === 0) q.push(a.to);
        push({ note: `Remove ${name(v)} → ${name(a.to)}; ${name(a.to)} fica com ${indeg.get(a.to)} dependência(s).`, current: v, edge: a.edge, done, frontier: q, tree, rejected: [], labels: lab(), structure: { name: "Fila", items: q.map(name) } });
      }
    }
    push({ note: done.length === g.vertices.length ? `Ordem topológica: ${done.map(name).join(" → ")}.` : "Sobraram vértices: o grafo tem ciclo, não há ordem topológica.", done, frontier: [], tree, rejected: [], labels: Object.fromEntries(done.map((v, i) => [v, `#${i + 1}`])) });
    return steps;
  }

  if (algo === "bridges") {
    const A = adj(g, true);
    const disc = new Map<ID, number>(), low = new Map<ID, number>();
    const bridges: number[] = [];
    const cuts = new Set<ID>();
    const tree: number[] = [];
    const done: ID[] = [];
    let t = 0;
    const lab = () => Object.fromEntries([...disc].map(([k, v]) => [k, `${v}/${low.get(k)}`]));
    const dfs = (u: ID, parentEdge: number) => {
      disc.set(u, ++t); low.set(u, t);
      let kids = 0;
      push({ note: `Visita ${name(u)}: descoberta ${t}, low ${t}.`, current: u, done, frontier: [], tree, rejected: bridges, labels: lab() });
      for (const a of A.get(u) ?? []) {
        if (a.edge === parentEdge) continue;
        if (disc.has(a.to)) {
          low.set(u, Math.min(low.get(u)!, disc.get(a.to)!));
          push({ note: `Aresta de volta ${name(u)} – ${name(a.to)}: low(${name(u)}) = ${low.get(u)}.`, current: u, edge: a.edge, done, frontier: [], tree, rejected: bridges, labels: lab() });
          continue;
        }
        kids++;
        tree.push(a.edge);
        dfs(a.to, a.edge);
        low.set(u, Math.min(low.get(u)!, low.get(a.to)!));
        if (low.get(a.to)! > disc.get(u)!) {
          bridges.push(a.edge);
          push({ note: `low(${name(a.to)}) > descoberta(${name(u)}): ${name(u)} – ${name(a.to)} é PONTE.`, current: u, edge: a.edge, done, frontier: [], tree, rejected: bridges, labels: lab() });
        }
        if (parentEdge !== -1 && low.get(a.to)! >= disc.get(u)!) cuts.add(u);
      }
      if (parentEdge === -1 && kids > 1) cuts.add(u);
      done.push(u);
    };
    for (const v of g.vertices) if (!disc.has(v.id)) dfs(v.id, -1);
    push({
      note: `${bridges.length} ponte(s): ${bridges.map((i) => `${name(g.edges[i].a)}–${name(g.edges[i].b)}`).join(", ") || "nenhuma"}. ${cuts.size} articulação(ões): ${[...cuts].map(name).join(", ") || "nenhuma"}.`,
      done, frontier: [], tree, rejected: [], labels: lab(), highlight: { edges: bridges, vertices: [...cuts] },
    });
    return steps;
  }

  // percursos de árvore: filhos = vizinhos ainda não vistos (o primeiro é a "esquerda")
  const A = adj(g, true);
  const order: ID[] = [];
  const tree: number[] = [];
  const kidsOf = new Map<ID, { id: ID; edge: number }[]>();
  const seen = new Set([s0]);
  const build = (v: ID) => {
    const kids: { id: ID; edge: number }[] = [];
    for (const a of A.get(v) ?? []) if (!seen.has(a.to)) { seen.add(a.to); kids.push({ id: a.to, edge: a.edge }); }
    // árvore binária de busca: menores à esquerda
    kids.sort((x, y) => { const nx = Number(name(x.id)), ny = Number(name(y.id)); return Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : 0; });
    kidsOf.set(v, kids);
    kids.forEach((k) => build(k.id));
  };
  build(s0);
  const visitNote = (v: ID) => { order.push(v); push({ note: `Visita ${name(v)} (#${order.length}).`, current: v, done: order, frontier: [], tree, rejected: [], labels: Object.fromEntries(order.map((x, i) => [x, `#${i + 1}`])) }); };
  const walk = (v: ID) => {
    const kids = kidsOf.get(v) ?? [];
    if (algo === "preorder") visitNote(v);
    if (algo === "inorder") {
      if (kids[0]) { tree.push(kids[0].edge); walk(kids[0].id); }
      visitNote(v);
      for (const k of kids.slice(1)) { tree.push(k.edge); walk(k.id); }
      return;
    }
    for (const k of kids) { tree.push(k.edge); walk(k.id); }
    if (algo === "postorder") visitNote(v);
  };
  push({ note: `Raiz: ${name(s0)}.`, current: s0, done: [], frontier: [], tree, rejected: [], labels: {} });
  walk(s0);
  push({ note: `${ALGORITHMS.find((x) => x.id === algo)?.label}: ${order.map(name).join(", ")}.`, done: order, frontier: [], tree, rejected: [], labels: Object.fromEntries(order.map((x, i) => [x, `#${i + 1}`])) });
  return steps;
}

// ---------------- geradores ----------------
export type GenId = "complete" | "cycle" | "path" | "star" | "wheel" | "grid" | "bintree" | "randtree" | "random" | "bipartite" | "hypercube" | "bst";

export const GENERATORS: { id: GenId; label: string; param: string; min: number; max: number; def: number; layout: "circle" | "force" | "tree" | "grid" | "layers" }[] = [
  { id: "complete", label: "Completo Kn", param: "n", min: 2, max: 10, def: 5, layout: "circle" },
  { id: "cycle", label: "Ciclo Cn", param: "n", min: 3, max: 16, def: 6, layout: "circle" },
  { id: "path", label: "Caminho Pn", param: "n", min: 2, max: 14, def: 6, layout: "force" },
  { id: "star", label: "Estrela", param: "folhas", min: 2, max: 14, def: 6, layout: "force" },
  { id: "wheel", label: "Roda", param: "n", min: 3, max: 14, def: 7, layout: "force" },
  { id: "grid", label: "Grade", param: "lado", min: 2, max: 6, def: 3, layout: "grid" },
  { id: "bintree", label: "Árvore binária", param: "níveis", min: 1, max: 5, def: 3, layout: "tree" },
  { id: "randtree", label: "Árvore aleatória", param: "n", min: 3, max: 20, def: 10, layout: "tree" },
  { id: "random", label: "Aleatório ponderado", param: "n", min: 3, max: 14, def: 7, layout: "force" },
  { id: "bipartite", label: "Bipartido Km,n", param: "m=n", min: 2, max: 5, def: 3, layout: "layers" },
  { id: "hypercube", label: "Hipercubo Qd", param: "d", min: 1, max: 4, def: 3, layout: "force" },
  { id: "bst", label: "Árvore de busca (BST)", param: "chaves", min: 3, max: 15, def: 9, layout: "tree" },
];

/** Gerador pseudoaleatório com semente (o mesmo `seed` dá o mesmo grafo: prévia = resultado). */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** Insere as chaves em ordem numa árvore binária de busca e devolve as arestas (pai - filho). */
export function bstEdges(keys: number[]): string {
  if (!keys.length) return "";
  const left = new Map<number, number>(), right = new Map<number, number>();
  const root = keys[0];
  const lines: string[] = [];
  const seen = new Set([root]);
  for (const k of keys.slice(1)) {
    if (seen.has(k)) continue;
    seen.add(k);
    let cur = root;
    for (;;) {
      const side = k < cur ? left : right;
      const nxt = side.get(cur);
      if (nxt === undefined) { side.set(cur, k); lines.push(`${cur} - ${k}`); break; }
      cur = nxt;
    }
  }
  return lines.length ? lines.join("\n") : String(root);
}

/** Lista de arestas (texto aceito por parseGraph) do grafo gerado. */
export function generate(id: GenId, n: number, seed = 1, directed = false): string {
  const r = rng(seed);
  // vértices numerados (1, 2, 3…), como em quase todo livro de grafos
  const L = (i: number) => String(i + 1);
  const op = directed ? "->" : "-";
  const out: string[] = [];
  const e = (a: string, b: string, w?: number) => out.push(`${a} ${op} ${b}${w !== undefined ? ` : ${w}` : ""}`);
  switch (id) {
    case "complete": for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) e(L(i), L(j)); break;
    case "cycle": for (let i = 0; i < n; i++) e(L(i), L((i + 1) % n)); break;
    case "path": for (let i = 0; i + 1 < n; i++) e(L(i), L(i + 1)); break;
    case "star": for (let i = 1; i <= n; i++) e("0", String(i)); break;
    case "wheel": for (let i = 0; i < n; i++) { e("0", String(i + 1)); e(String(i + 1), String(((i + 1) % n) + 1)); } break;
    case "grid": for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = `${y}${x}`; if (x + 1 < n) e(v, `${y}${x + 1}`); if (y + 1 < n) e(v, `${y + 1}${x}`); } break;
    case "bintree": { const total = 2 ** n - 1; for (let i = 1; 2 * i <= total; i++) { e(String(i), String(2 * i)); if (2 * i + 1 <= total) e(String(i), String(2 * i + 1)); } if (total === 1) out.push("1"); break; }
    case "randtree": for (let i = 1; i < n; i++) e(String(Math.floor(r() * i) + 1), String(i + 1)); break;
    case "random": {
      for (let i = 1; i < n; i++) e(L(Math.floor(r() * i)), L(i), 1 + Math.floor(r() * 9)); // conexo
      const extra = Math.round(n * 0.6);
      const has = new Set(out.map((l) => l.split(" : ")[0]));
      for (let k = 0; k < extra * 3 && out.length < n - 1 + extra; k++) {
        const a = Math.floor(r() * n), b = Math.floor(r() * n);
        if (a === b) continue;
        const key = `${L(Math.min(a, b))} ${op} ${L(Math.max(a, b))}`;
        if (has.has(key)) continue;
        has.add(key);
        e(L(Math.min(a, b)), L(Math.max(a, b)), 1 + Math.floor(r() * 9));
      }
      break;
    }
    case "bipartite": for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) e(`a${i}`, `b${j}`); break;
    case "hypercube": {
      const N = 2 ** n;
      const bits = (v: number) => v.toString(2).padStart(n, "0");
      for (let v = 0; v < N; v++) for (let b = 0; b < n; b++) { const u = v ^ (1 << b); if (u > v) e(bits(v), bits(u)); }
      if (N === 1) out.push("0");
      break;
    }
    case "bst": {
      const keys = Array.from({ length: n }, () => 1 + Math.floor(r() * 99));
      return bstEdges(keys);
    }
  }
  return out.join("\n");
}

/** Matriz de adjacência (pesos; 0 = sem aresta) como texto alinhado. */
export function adjacencyMatrix(g: BoardGraph): { names: string[]; rows: number[][]; text: string } {
  const names = g.vertices.map((v) => v.text || "?");
  const idx = new Map(g.vertices.map((v, i) => [v.id, i]));
  const rows = names.map(() => names.map(() => 0));
  for (const e of g.edges) {
    const i = idx.get(e.a)!, j = idx.get(e.b)!;
    rows[i][j] = e.w;
    if (!e.directed) rows[j][i] = e.w;
  }
  const w = Math.max(2, ...names.map((n) => n.length), ...rows.flat().map((v) => String(v).length));
  const pad = (s: string) => s.padStart(w);
  const text = [pad("") + " " + names.map(pad).join(" "), ...rows.map((r, i) => pad(names[i]) + " " + r.map((v) => pad(String(v))).join(" "))].join("\n");
  return { names, rows, text };
}

/** Lê uma matriz de adjacência (primeira linha opcional com nomes) e devolve a lista de arestas. */
export function matrixToEdges(text: string): string {
  const lines = text.trim().split(/\n/).map((l) => l.trim().split(/[\s,;]+/).filter(Boolean));
  if (!lines.length) return "";
  let names: string[];
  let body = lines;
  const numeric = (row: string[]) => row.every((c) => Number.isFinite(Number(c.replace(",", "."))));
  if (!numeric(lines[0])) { names = lines[0]; body = lines.slice(1).map((r) => (numeric(r) ? r : r.slice(1))); }
  else names = lines[0].map((_, i) => String(i + 1));
  const M = body.map((r) => r.map((c) => Number(c.replace(",", "."))));
  const n = Math.min(names.length, M.length);
  const sym = M.every((r, i) => r.every((v, j) => v === (M[j]?.[i] ?? v)));
  const out: string[] = [];
  for (let i = 0; i < n; i++) for (let j = sym ? i + 1 : 0; j < n; j++) {
    const v = M[i]?.[j] ?? 0;
    if (!v || (i === j && sym)) continue;
    out.push(`${names[i]} ${sym ? "-" : "->"} ${names[j]}${v !== 1 ? ` : ${v}` : ""}`);
  }
  for (let i = 0; i < n; i++) if (!out.some((l) => l.startsWith(names[i] + " ") || l.includes(" " + names[i]))) out.push(names[i]);
  return out.join("\n");
}
