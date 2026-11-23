// Painel "Grafos e matemática": grafos (criar por lista, exemplos, algoritmos), sólidos e figuras, gráficos de
// funções e calculadora. Tudo vira elemento nativo do quadro (nós/setas ou figura), editável e desfazível.
import { useEffect, useMemo, useRef, useState } from "react";
import { ElementsPreview } from "./ElementsPreview";
import { insertElements } from "./TemplateGallery";
import { AttachmentElement, HirakuDoc, HirakuElement, ID, LinearElement, NodeElement, newId } from "../core/model";
import {
  BoardGraph, GRAPH_LAYOUTS, GRAPH_PRESETS, GraphLayout, bipartite, buildGraphElements, colorGraph, components, degrees,
  edgeStyle, graphFromElements, graphToText, hasCycle, layoutGraph, mst, parseGraph, shortestPath, vertexStyle,
} from "../core/graph";
import {
  FIGURE_KINDS, FigureSpec, PLOT_COLORS, SOLIDS, SolidId, defaultFigure, defaultFigureSize, figureErrors, figureTitle, plotPrims, revolutionVolume,
} from "../core/figures";
import { calc, fmt } from "../core/expr";
import { ALGORITHMS, AlgoId, GENERATORS, GenId, adjacencyMatrix, generate, matrixToEdges, runAlgorithm } from "../core/graphAlgo";
import { useAlgo } from "../core/algoView";
import { add as addM, angle, cross, det, distance, dot, eigenvalues, eigenvector, formatMatrix, inverse, multiply, norm, parseMatrix, parseVector, projection, rref, solve, transpose } from "../core/linalg";
import { viewCenter } from "../core/mapActions";
import { selectActivePage, useDoc, useSel, useTool } from "../core/store";
import { makeText, measureBlock } from "../core/text";
import { useUI } from "../core/ui";
import { BRANCH_PALETTE } from "../core/mindmap";

type Tab = "grafos" | "geometria" | "funcoes" | "algebra" | "calc";

// ---------------- utilidades ----------------
const toast = (m: string) => useUI.getState().showToast(m);

/** Edição ao vivo sem encher o histórico: arrastar um controle = 1 passo de desfazer ao soltar. */
function useLive() {
  const base = useRef<HirakuDoc | null>(null);
  return {
    live(el: HirakuElement) {
      if (!base.current) base.current = useDoc.getState().doc;
      const els = selectActivePage(useDoc.getState()).elements.map((e) => (e.id === el.id ? el : e));
      useDoc.getState().previewElements(els);
    },
    commit() {
      if (base.current) useDoc.getState().endPreview(base.current);
      base.current = null;
    },
  };
}

function makeFigure(spec: FigureSpec, at?: { x: number; y: number }): AttachmentElement {
  const { w, h } = defaultFigureSize(spec);
  const c = at ?? viewCenter();
  return { id: newId(), type: "attachment", frameId: null, x: c.x - w / 2, y: c.y - h / 2, w, h, kind: "figure", title: figureTitle(spec), url: "", mime: "application/x-hm-figure", figure: spec, opacity: 1 };
}

function insertFigure(spec: FigureSpec) {
  const el = makeFigure(spec);
  useDoc.getState().addElement(el);
  useSel.getState().set([el.id]);
  useTool.getState().setTool("select");
}

const measure = (t: string, size: number) => measureBlock(t, "sans", size).w;

// ---------------- grafos ----------------
const HL = { path: "#D2453A", visit: "#2E9B5F", soft: "#DAF1E2" };
const CLASS_COLORS = BRANCH_PALETTE;

function GraphTab() {
  const ids = useSel((s) => s.ids);
  const els = useDoc((s) => selectActivePage(s).elements);
  const [mode, setMode] = useState<"gerar" | "lista" | "matriz">("gerar");
  const [text, setText] = useState("A - B : 4\nA - C : 2\nB - C : 1\nB - D : 5\nC - D : 8\nD - E : 3");
  const [matrix, setMatrix] = useState("   A B C D\nA  0 1 1 0\nB  1 0 1 1\nC  1 1 0 1\nD  0 1 1 0");
  const [layout, setLayout] = useState<GraphLayout>("force");
  const [dir, setDir] = useState<"auto" | "yes" | "no">("auto");
  const [gen, setGen] = useState<GenId>("random");
  const [param, setParam] = useState<Record<string, number>>({});
  const [seed, setSeed] = useState(7);
  const [algo, setAlgo] = useState<AlgoId>("dijkstra");
  const [from, setFrom] = useState<ID>("");
  const [to, setTo] = useState<ID>("");
  const [result, setResult] = useState<string>("");

  const G = GENERATORS.find((x) => x.id === gen)!;
  const pv = (id: GenId) => param[id] ?? GENERATORS.find((x) => x.id === id)!.def;
  const genText = (id: GenId) => generate(id, pv(id), seed, dir === "yes");
  const genPreviews = useMemo(() => GENERATORS.map((x) => ({ x, els: buildGraphElements(parseGraph(generate(x.id, param[x.id] ?? x.def, seed, dir === "yes")), x.layout) })), [param, seed, dir]);

  const selSet = useMemo(() => new Set(ids), [ids]);
  const selNodes = els.filter((e) => e.type === "node" && selSet.has(e.id)).length;
  const g: BoardGraph = useMemo(() => graphFromElements(els, selNodes >= 2 ? selSet : undefined), [els, selSet, selNodes]);
  const name = (id: ID) => g.vertices.find((v) => v.id === id)?.text || "?";
  const src = g.vertices.some((v) => v.id === from) ? from : g.vertices[0]?.id ?? "";
  const dst = g.vertices.some((v) => v.id === to) ? to : g.vertices[g.vertices.length - 1]?.id ?? "";
  const loneArrow = ids.length === 1 ? els.find((e): e is LinearElement => e.id === ids[0] && (e.type === "arrow" || e.type === "line")) : undefined;
  const A0 = ALGORITHMS.find((x) => x.id === algo)!;

  const create = (t: string, l: GraphLayout) => {
    const parsed = parseGraph(t, dir === "auto" ? undefined : dir === "yes");
    if (parsed.errors.length) toast(parsed.errors[0]);
    if (!parsed.vertices.length) { toast("Escreva arestas como “A - B” ou “A -> B : 3”."); return; }
    insertElements(buildGraphElements(parsed, l, measure));
    toast(`Grafo com ${parsed.vertices.length} vértices e ${parsed.edges.length} arestas. Duplo clique num vértice renomeia.`);
  };

  /** Aplica destaques fixos (gravados no desenho): nós e arestas. Um passo de desfazer. */
  const paint = (nodes: Map<ID, Partial<NodeElement>>, edges: Map<number, string>, msg: string) => {
    const edgeById = new Map<ID, string>();
    edges.forEach((c, i) => edgeById.set(g.edges[i].el.id, c));
    const inGraph = new Set([...g.vertices.map((v) => v.id), ...g.edges.map((e) => e.el.id)]);
    const next = els.map((e) => {
      if (!inGraph.has(e.id)) return e;
      if (e.type === "node") return { ...e, ...vertexStyle(), ...(nodes.get(e.id) ?? {}) };
      if (e.type === "arrow") {
        const directed = e.endHead !== "none";
        const c = edgeById.get(e.id);
        return { ...e, ...edgeStyle({ directed }), ...(c ? { stroke: c, strokeWidth: 4 } : {}) };
      }
      return e;
    });
    useDoc.getState().replaceElements(next);
    setResult(msg);
  };
  const need = () => { if (!g.vertices.length) { toast("Nenhum grafo: crie um acima ou selecione nós ligados por setas."); return false; } return true; };

  const play = () => {
    if (!need()) return;
    const steps = runAlgorithm(g, algo, src, dst);
    useAlgo.getState().start(A0.label, steps, g.vertices.map((v) => v.id), g.edges.map((e) => e.el.id));
    useSel.getState().clear();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); // fecha o painel para ver o grafo
  };

  const quick = (what: string) => {
    if (!need()) return;
    const nodes = new Map<ID, Partial<NodeElement>>();
    const edges = new Map<number, string>();
    if (what === "comp") {
      const cs = components(g);
      cs.forEach((c, k) => c.forEach((id) => nodes.set(id, { fill: CLASS_COLORS[k % CLASS_COLORS.length] + "33", stroke: CLASS_COLORS[k % CLASS_COLORS.length] })));
      paint(nodes, edges, `${cs.length} ${cs.length === 1 ? "componente conexa" : "componentes conexas"}: ${cs.map((c) => `{${c.map(name).join(", ")}}`).join(" ")}`);
    } else if (what === "color") {
      const c = colorGraph(g);
      const k = new Set(c.values()).size;
      c.forEach((ci, id) => nodes.set(id, { fill: CLASS_COLORS[ci % CLASS_COLORS.length], stroke: CLASS_COLORS[ci % CLASS_COLORS.length], color: "#FFFFFF" }));
      paint(nodes, edges, `Coloração gulosa com ${k} ${k === 1 ? "cor" : "cores"} (vizinhos nunca têm a mesma cor).`);
    } else if (what === "bip") {
      const side = bipartite(g);
      if (!side) { paint(nodes, edges, "Não é bipartido (tem ciclo de tamanho ímpar)."); return; }
      side.forEach((sd, id) => nodes.set(id, { fill: sd ? "#DCE6FB" : "#FFF1B8", stroke: sd ? "#4D6FC4" : "#D9A92A" }));
      paint(nodes, edges, "É bipartido: os dois lados estão em azul e amarelo.");
    } else if (what === "deg") {
      const d = degrees(g);
      const directed = g.edges.some((e) => e.directed);
      d.forEach((v, id) => nodes.set(id, { icon: directed ? `${v.in}/${v.out}` : String(v.total) }));
      paint(nodes, edges, directed ? "Graus marcados como entrada/saída." : `Graus marcados. Soma = ${[...d.values()].reduce((s2, v) => s2 + v.total, 0)} (= 2 × arestas).`);
    } else if (what === "path") {
      const r = shortestPath(g, src, dst);
      if (!r) { paint(nodes, edges, `Não há caminho de ${name(src)} até ${name(dst)}.`); return; }
      r.path.forEach((id) => nodes.set(id, { fill: "#FBDDDA", stroke: HL.path }));
      r.edges.forEach((i) => edges.set(i, HL.path));
      paint(nodes, edges, `Menor caminho: ${r.path.map(name).join(" → ")} · custo ${fmt(r.dist)}`);
    } else if (what === "mst") {
      const r = mst(g);
      r.edges.forEach((i) => edges.set(i, HL.visit));
      paint(nodes, edges, `Árvore geradora mínima: ${r.edges.length} arestas, peso total ${fmt(r.total)}.`);
    } else if (what === "clear") paint(nodes, edges, "");
  };

  const relayout = (l: GraphLayout) => {
    if (!need()) return;
    const pos = layoutGraph({ vertices: g.vertices.map((v) => v.id), edges: g.edges.map((e) => ({ a: e.a, b: e.b, directed: e.directed })) }, l);
    let cx = 0, cy = 0;
    for (const v of g.vertices) { cx += (v.x + v.w / 2) / g.vertices.length; cy += (v.y + v.h / 2) / g.vertices.length; }
    let px = 0, py = 0;
    for (const p of pos.values()) { px += p.x / pos.size; py += p.y / pos.size; }
    useDoc.getState().replaceElements(els.map((e) => {
      const p = e.type === "node" ? pos.get(e.id) : undefined;
      return p && e.type === "node" ? { ...e, x: cx + p.x - px - e.w / 2, y: cy + p.y - py - e.h / 2 } : e;
    }));
  };

  return (
    <>
      <div className="sec-title">Criar grafo</div>
      <div className="seg small">
        {([["gerar", "Gerar"], ["lista", "Lista de arestas"], ["matriz", "Matriz"]] as const).map(([v, l]) => <button key={v} className={mode === v ? "on" : ""} onClick={() => setMode(v)}>{l}</button>)}
      </div>

      {mode === "gerar" && (
        <>
          <div className="tiles four compact">
            {genPreviews.map(({ x, els: p }) => (
              <button key={x.id} className={gen === x.id ? "tile on" : "tile"} onClick={() => setGen(x.id)} title={x.label}>
                <ElementsPreview elements={p} w={90} h={62} pad={16} bg="#FFFFFF" />
                <span>{x.label}</span>
              </button>
            ))}
          </div>
          <label className="slider">
            <span>{G.label}: {G.param}</span>
            <input type="range" min={G.min} max={G.max} value={pv(gen)} onChange={(e) => setParam({ ...param, [gen]: +e.target.value })} />
            <output>{pv(gen)}</output>
          </label>
          <div className="row tight">
            {(gen === "random" || gen === "randtree" || gen === "bst") && <button className="chip sm" onClick={() => setSeed(seed + 1)}>🎲 Sortear outro</button>}
            <button className={dir === "yes" ? "chip sm on" : "chip sm"} onClick={() => setDir(dir === "yes" ? "auto" : "yes")}>Direcionado</button>
            <button className="chip sm" onClick={() => { setText(genText(gen)); setMode("lista"); }}>Editar como lista</button>
          </div>
          <button className="btn primary" onClick={() => create(genText(gen), G.layout)}>Criar {G.label.toLowerCase()}</button>
        </>
      )}

      {mode === "lista" && (
        <>
          <textarea className="outline-in" rows={6} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
            placeholder={"A - B : 4   (não direcionada, peso 4)\nA -> C       (direcionada)\nC: D E       (lista de adjacência)"} />
          <div className="row tight">
            <span className="rowlabel">Exemplos</span>
            {GRAPH_PRESETS.map((p) => <button key={p.id} className="chip sm" onClick={() => { setText(p.text); setLayout(p.layout); }}>{p.name}</button>)}
          </div>
          <div className="row tight">
            <span className="rowlabel">Arestas</span>
            {([["auto", "Como escrito"], ["yes", "Direcionadas"], ["no", "Sem direção"]] as const).map(([v, l]) => (
              <button key={v} className={dir === v ? "chip sm on" : "chip sm"} onClick={() => setDir(v)}>{l}</button>
            ))}
          </div>
          <div className="row tight">
            <span className="rowlabel">Layout</span>
            {GRAPH_LAYOUTS.map((l) => <button key={l.id} className={layout === l.id ? "chip sm on" : "chip sm"} onClick={() => setLayout(l.id)}>{l.label}</button>)}
          </div>
          <button className="btn primary" onClick={() => create(text, layout)}>Criar grafo</button>
        </>
      )}

      {mode === "matriz" && (
        <>
          <textarea className="outline-in" rows={6} value={matrix} onChange={(e) => setMatrix(e.target.value)} spellCheck={false} placeholder={"0 1 1\n1 0 1\n1 1 0"} />
          <p className="hint">Uma linha por vértice; 0 = sem aresta, outro número = peso. Matriz simétrica vira grafo sem direção. A primeira linha pode ter os nomes.</p>
          <div className="row tight">
            <button className="btn primary" onClick={() => create(matrixToEdges(matrix), layout)}>Criar da matriz</button>
            <button className="chip sm" onClick={() => { if (need()) setMatrix(adjacencyMatrix(g).text); }}>Ver matriz do grafo atual</button>
          </div>
        </>
      )}

      <div className="sec-title">Ver o algoritmo rodar {selNodes >= 2 ? "(seleção)" : ""}</div>
      <p className="hint">{g.vertices.length} vértices · {g.edges.length} arestas{g.vertices.length > 0 && <> · {components(g).length === 1 ? "conexo" : `${components(g).length} componentes`} · {hasCycle(g) ? "com ciclo" : "sem ciclo"}</>}</p>
      <div className="algo-grid" role="radiogroup" aria-label="Algoritmo">
        {(["busca", "caminho", "arvore", "estrutura"] as const).map((grp) => (
          <div key={grp} className="algo-col">
            <small>{grp === "busca" ? "Buscas" : grp === "caminho" ? "Caminhos" : grp === "arvore" ? "Árvores" : "Estrutura"}</small>
            {ALGORITHMS.filter((x) => x.group === grp).map((x) => (
              <button key={x.id} role="radio" aria-checked={algo === x.id} className={algo === x.id ? "algo-opt on" : "algo-opt"} onClick={() => setAlgo(x.id)} title={x.hint}>{x.label}</button>
            ))}
          </div>
        ))}
      </div>
      {g.vertices.length > 0 && (A0.needsStart || A0.needsEnd) && (
        <div className="row tight">
          {A0.needsStart && <label className="mini-field">{A0.group === "arvore" && algo !== "prim" ? "Raiz" : "Origem"} <select value={src} onChange={(e) => setFrom(e.target.value)}>{g.vertices.map((v) => <option key={v.id} value={v.id}>{v.text}</option>)}</select></label>}
          {A0.needsEnd && <label className="mini-field">Destino <select value={dst} onChange={(e) => setTo(e.target.value)}>{g.vertices.map((v) => <option key={v.id} value={v.id}>{v.text}</option>)}</select></label>}
        </div>
      )}
      <p className="hint">{A0.hint}.</p>
      <button className="btn primary" onClick={play}>▶ Executar passo a passo</button>

      <details className="editor">
        <summary>Análises rápidas e organização</summary>
        <div className="editor-body">
          <div className="row tight">
            <button className="chip sm" onClick={() => quick("path")}>Marcar menor caminho</button>
            <button className="chip sm" onClick={() => quick("mst")}>Marcar árvore mínima</button>
            <button className="chip sm" onClick={() => quick("comp")}>Componentes</button>
            <button className="chip sm" onClick={() => quick("color")}>Colorir</button>
            <button className="chip sm" onClick={() => quick("bip")}>Bipartido?</button>
            <button className="chip sm" onClick={() => quick("deg")}>Graus</button>
            <button className="chip sm danger" onClick={() => quick("clear")}>Limpar marcas</button>
          </div>
          {result && <div className="result-box">{result}</div>}
          <div className="row tight">
            <span className="rowlabel">Reorganizar</span>
            {GRAPH_LAYOUTS.map((l) => <button key={l.id} className="chip sm" onClick={() => relayout(l.id)}>{l.label}</button>)}
          </div>
          <div className="row tight">
            <button className="chip sm" onClick={() => { if (need()) { setText(graphToText(g)); setMode("lista"); } }}>Trazer para a lista</button>
            <button className="chip sm" onClick={() => { if (need()) void navigator.clipboard?.writeText(graphToText(g)).then(() => toast("Lista de arestas copiada."), () => toast("Não consegui copiar.")); }}>Copiar lista</button>
          </div>
        </div>
      </details>
      {loneArrow && (
        <label className="slider">
          <span>Peso / rótulo da aresta selecionada</span>
          <input className="cp-hex fn-in" defaultValue={loneArrow.label ?? ""} key={loneArrow.id} placeholder="ex.: 5 ou a"
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            onBlur={(e) => { const v = e.target.value.trim().slice(0, 80); if (v !== (loneArrow.label ?? "")) useDoc.getState().updateElements([{ ...loneArrow, label: v || undefined }]); }} />
        </label>
      )}
    </>
  );
}

// ---------------- geometria ----------------
function figurePreview(spec: FigureSpec): HirakuElement[] {
  const s = defaultFigureSize(spec);
  return [{ ...makeFigure(spec, { x: s.w / 2, y: s.h / 2 }), id: "preview" }];
}

function FigureEditor({ el }: { el: AttachmentElement }) {
  const L = useLive();
  const f = el.figure!;
  const set = (patch: Partial<FigureSpec>, live = false) => {
    const next = { ...el, figure: { ...f, ...patch } as FigureSpec };
    if (live) L.live(next);
    else useDoc.getState().updateElements([next]);
  };
  const angle = (label: string, key: "yaw" | "pitch", min: number, max: number) => (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={1} value={Math.round(((f as { yaw: number; pitch: number })[key] * 180) / Math.PI)}
        onChange={(e) => set({ [key]: (+e.target.value * Math.PI) / 180 } as Partial<FigureSpec>, true)} onPointerUp={L.commit} onKeyUp={L.commit} onBlur={L.commit} />
      <output>{Math.round(((f as { yaw: number; pitch: number })[key] * 180) / Math.PI)}°</output>
    </label>
  );
  const colors = ["#4D6FC4", "#D2453A", "#2E9B5F", "#C98612", "#7B4FC9", "#0E8A9B", "#5E6B7E"];
  return (
    <div className="fig-editor">
      <div className="sec-title">Editar: {figureTitle(f)}</div>
      {(f.kind === "solid" || f.kind === "space" || f.kind === "revolution" || f.kind === "surface") && (<>{angle("Girar", "yaw", -180, 180)}{angle("Inclinar", "pitch", -85, 85)}</>)}
      {f.kind === "revolution" && (
        <>
          <div className="fn-row"><span className="fn-name">y =</span>
            <input className="cp-hex fn-in" defaultValue={f.expr} key={el.id + f.expr} spellCheck={false} onBlur={(e) => e.target.value !== f.expr && set({ expr: e.target.value } as Partial<FigureSpec>)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
          </div>
          <div className="row tight">
            {(["a", "b"] as const).map((k) => (
              <label key={k} className="mini-field">{k === "a" ? "x de" : "até"}
                <input type="number" defaultValue={f[k]} key={el.id + k + f[k]} onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== f[k]) set({ [k]: v } as Partial<FigureSpec>); }} />
              </label>
            ))}
            <button className={f.axis === "x" ? "chip sm on" : "chip sm"} onClick={() => set({ axis: "x" } as Partial<FigureSpec>)}>Eixo x</button>
            <button className={f.axis === "y" ? "chip sm on" : "chip sm"} onClick={() => set({ axis: "y" } as Partial<FigureSpec>)}>Eixo y</button>
            <button className={f.slices ? "chip sm on" : "chip sm"} onClick={() => set({ slices: !f.slices } as Partial<FigureSpec>)}>Malha</button>
          </div>
          <div className="row tight">
            {["sqrt(x)", "x", "x^2", "sin(x)+1.5", "1/x", "sqrt(4-x^2)", "e^(-x)"].map((ex) => <button key={ex} className="chip sm" onClick={() => set({ expr: ex, ...(ex === "sqrt(4-x^2)" ? { a: -2, b: 2 } : ex === "1/x" ? { a: 1, b: 5 } : ex === "sin(x)+1.5" ? { a: 0, b: 6.283 } : { a: 0, b: 4 }) } as Partial<FigureSpec>)}>{ex}</button>)}
          </div>
          <div className="result-box">Volume ≈ <b>{fmt(revolutionVolume(f), 6)}</b> {f.axis === "x" ? "· método dos discos: V = π∫ f(x)² dx" : "· método das cascas: V = 2π∫ |x·f(x)| dx"}</div>
        </>
      )}
      {f.kind === "surface" && (
        <>
          <div className="fn-row"><span className="fn-name">z =</span>
            <input className="cp-hex fn-in" defaultValue={f.expr} key={el.id + f.expr} spellCheck={false} onBlur={(e) => e.target.value !== f.expr && set({ expr: e.target.value } as Partial<FigureSpec>)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
          </div>
          <div className="row tight">
            {[["Ondas", "sin(x) * cos(y)"], ["Paraboloide", "x^2 + y^2"], ["Sela", "x^2 - y^2"], ["Sombreiro", "sin(sqrt(x^2+y^2)) / sqrt(x^2+y^2+0.01)"], ["Gaussiana", "3e^(-(x^2+y^2)/2)"], ["Plano", "x + y/2"]].map(([n2, ex]) => <button key={n2} className="chip sm" onClick={() => set({ expr: ex } as Partial<FigureSpec>)}>{n2}</button>)}
          </div>
          <div className="row tight">
            {(["xmin", "xmax", "ymin", "ymax"] as const).map((k) => (
              <label key={k} className="mini-field">{k.replace("min", " mín").replace("max", " máx")}
                <input type="number" defaultValue={f[k]} key={el.id + k + f[k]} onBlur={(e) => { const v = Number(e.target.value); const nx = { ...f, [k]: v }; if (Number.isFinite(v) && nx.xmax > nx.xmin && nx.ymax > nx.ymin) set({ [k]: v } as Partial<FigureSpec>); }} />
              </label>
            ))}
          </div>
        </>
      )}
      {f.kind === "vectors" && <VectorsEditor el={el} />}
      {f.kind === "points" && <PointsEditor el={el} />}
      {f.kind === "solid" && (
        <div className="row tight">
          <button className={f.hidden ? "chip sm on" : "chip sm"} onClick={() => set({ hidden: !f.hidden })}>Arestas ocultas</button>
          <button className={f.labels ? "chip sm on" : "chip sm"} onClick={() => set({ labels: !f.labels })}>Rótulos</button>
          <select className="mini-select" value={f.solid} onChange={(e) => set({ solid: e.target.value as SolidId })}>{SOLIDS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </div>
      )}
      {f.kind === "space" && (
        <div className="row tight">
          <span className="rowlabel">Plano</span>
          {(["none", "xy", "xz", "yz"] as const).map((p) => <button key={p} className={f.plane === p ? "chip sm on" : "chip sm"} onClick={() => set({ plane: p })}>{p === "none" ? "Nenhum" : p}</button>)}
        </div>
      )}
      {f.kind === "numberline" && (
        <div className="row tight">
          {(["min", "max", "step"] as const).map((k) => (
            <label key={k} className="mini-field">{k === "min" ? "De" : k === "max" ? "Até" : "Passo"}
              <input type="number" defaultValue={f[k]} key={el.id + k + f[k]} onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) set({ [k]: v } as Partial<FigureSpec>); }} />
            </label>
          ))}
        </div>
      )}
      {f.kind === "unitcircle" && <button className="chip sm" onClick={() => set({ radians: !f.radians })}>{f.radians ? "Mostrar graus" : "Mostrar radianos"}</button>}
      {"color" in f && (
        <div className="swatch-grid">
          {colors.map((c) => <button key={c} className={f.color === c ? "swatch on" : "swatch"} style={{ background: c }} aria-label={`Cor ${c}`} onClick={() => set({ color: c } as Partial<FigureSpec>)} />)}
        </div>
      )}
      {f.kind === "plot" && <p className="hint">Edite as funções na aba <b>Funções</b>.</p>}
      {figureErrors(f).map((e) => <p key={e} className="hint err">{e}</p>)}
    </div>
  );
}

const MATRIX_PRESETS: [string, [number, number, number, number]][] = [
  ["Rotação 90°", [0, -1, 1, 0]], ["Rotação 45°", [0.7071, -0.7071, 0.7071, 0.7071]], ["Reflexão em y=x", [0, 1, 1, 0]],
  ["Cisalhamento", [1, 1, 0, 1]], ["Escala 2×", [2, 0, 0, 2]], ["Projeção em x", [1, 0, 0, 0]], ["Esticar", [2, 1, 1, 2]],
];

function VectorsEditor({ el }: { el: AttachmentElement }) {
  const f = el.figure as Extract<FigureSpec, { kind: "vectors" }>;
  const set = (patch: Partial<typeof f>) => useDoc.getState().updateElements([{ ...el, figure: { ...f, ...patch } }]);
  const num = (v: string, d: number) => { const r = calc(v); return r.ok ? r.value : d; };
  return (
    <>
      {f.vectors.map((v, i) => (
        <div key={i} className="fn-row">
          <span className="fn-dot" style={{ background: v.color }} />
          <input className="cp-hex fn-in vec-name" defaultValue={v.name} key={el.id + "n" + i + v.name} onBlur={(e) => set({ vectors: f.vectors.map((x, k) => (k === i ? { ...x, name: e.target.value.slice(0, 6) || x.name } : x)) })} />
          <span className="fn-name">=(</span>
          <input className="cp-hex fn-in" defaultValue={String(v.x)} key={el.id + "x" + i + v.x} onBlur={(e) => set({ vectors: f.vectors.map((x, k) => (k === i ? { ...x, x: num(e.target.value, x.x) } : x)) })} />
          <span className="fn-name">;</span>
          <input className="cp-hex fn-in" defaultValue={String(v.y)} key={el.id + "y" + i + v.y} onBlur={(e) => set({ vectors: f.vectors.map((x, k) => (k === i ? { ...x, y: num(e.target.value, x.y) } : x)) })} />
          <span className="fn-name">)</span>
          <button className="btn sm" aria-label="Remover vetor" onClick={() => set({ vectors: f.vectors.filter((_, k) => k !== i) })}>×</button>
        </div>
      ))}
      <div className="row tight">
        <button className="chip sm" disabled={f.vectors.length >= 6} onClick={() => set({ vectors: [...f.vectors, { name: String.fromCharCode(117 + f.vectors.length), x: 1, y: -1, color: PLOT_COLORS[(f.vectors.length + 2) % PLOT_COLORS.length] }] })}>+ Vetor</button>
        <button className={f.sum ? "chip sm on" : "chip sm"} onClick={() => set({ sum: !f.sum })}>Soma</button>
        <button className={f.proj ? "chip sm on" : "chip sm"} onClick={() => set({ proj: !f.proj })}>Projeção</button>
        <label className="mini-field">Alcance <input type="number" defaultValue={f.range} key={el.id + "r" + f.range} onBlur={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= 50) set({ range: v }); }} /></label>
      </div>
      <div className="sec-title">Transformação linear (matriz 2×2)</div>
      <div className="row tight">
        <button className={!f.matrix ? "chip sm on" : "chip sm"} onClick={() => set({ matrix: null })}>Nenhuma</button>
        {MATRIX_PRESETS.map(([n2, m]) => <button key={n2} className={f.matrix?.join() === m.join() ? "chip sm on" : "chip sm"} onClick={() => set({ matrix: m })}>{n2}</button>)}
      </div>
      {f.matrix && (
        <div className="matrix-in">
          {f.matrix.map((v, i) => (
            <input key={el.id + i + v} className="cp-hex fn-in" defaultValue={String(v)} onBlur={(e) => { const m = [...f.matrix!] as [number, number, number, number]; m[i] = num(e.target.value, v); set({ matrix: m }); }} />
          ))}
        </div>
      )}
    </>
  );
}

function PointsEditor({ el }: { el: AttachmentElement }) {
  const f = el.figure as Extract<FigureSpec, { kind: "points" }>;
  const set = (patch: Partial<typeof f>) => useDoc.getState().updateElements([{ ...el, figure: { ...f, ...patch } }]);
  const text = f.points.map((p) => `${fmt(p.x, 6)}; ${fmt(p.y, 6)}`).join("\n");
  return (
    <>
      <textarea className="outline-in" rows={4} defaultValue={text} key={el.id + text} spellCheck={false} placeholder={"1; 2\n3; 5\n…"}
        onBlur={(e) => {
          const pts = e.target.value.split("\n").map((l) => l.trim().replace(/[()]/g, "").split(/\s*[;\s]\s*/).map((c) => Number(c.replace(",", ".")))).filter((p) => p.length >= 2 && p.every(Number.isFinite)).map(([x, y]) => ({ x, y }));
          if (pts.length && e.target.value !== text) set({ points: pts.slice(0, 300) });
        }} />
      <div className="row tight">
        <button className="chip sm" onClick={() => set({ points: Array.from({ length: 14 }, () => ({ x: Math.round(Math.random() * 100) / 10, y: Math.round(Math.random() * 100) / 10 })) })}>🎲 Pontos aleatórios</button>
        <button className={f.hull ? "chip sm on" : "chip sm"} onClick={() => set({ hull: !f.hull })}>Fecho convexo</button>
        <button className={f.tri ? "chip sm on" : "chip sm"} onClick={() => set({ tri: !f.tri })}>Delaunay</button>
        <button className={f.closest ? "chip sm on" : "chip sm"} onClick={() => set({ closest: !f.closest })}>Par mais próximo</button>
        <button className={f.circle ? "chip sm on" : "chip sm"} onClick={() => set({ circle: !f.circle })}>Círculo mínimo</button>
      </div>
      <p className="hint">Um ponto por linha (x; y). Clique fora da caixa para aplicar.</p>
    </>
  );
}

function GeometryTab({ sel }: { sel: AttachmentElement | null }) {
  const solids = useMemo(() => SOLIDS.map((s) => ({ ...s, spec: defaultFigure(s.id) })), []);
  const others = useMemo(() => FIGURE_KINDS.filter((k) => k.id !== "plot").map((k) => ({ ...k, spec: defaultFigure(k.id) })), []);
  const three = others.filter((k) => ["space", "revolution", "surface"].includes(k.id));
  const two = others.filter((k) => !["space", "revolution", "surface"].includes(k.id));
  return (
    <>
      {sel && sel.figure && sel.figure.kind !== "plot" && <FigureEditor el={sel} />}
      <div className="sec-title">Sólidos geométricos</div>
      <div className="tiles four">
        {solids.map((s) => (
          <button key={s.id} className="tile" onClick={() => insertFigure(s.spec)} title={`Inserir ${s.label}`}>
            <ElementsPreview elements={figurePreview(s.spec)} w={80} h={70} pad={4} bg="#FFFFFF" />
            <span>{s.label}</span>
          </button>
        ))}
      </div>
      <div className="sec-title">3D: espaço, revolução e superfícies</div>
      <div className="tiles three">
        {three.map((k) => (
          <button key={k.id} className="tile" onClick={() => insertFigure(k.spec)} title={k.hint}>
            <ElementsPreview elements={figurePreview(k.spec)} w={120} h={90} pad={4} bg="#FFFFFF" />
            <span>{k.label}</span>
          </button>
        ))}
      </div>
      <div className="sec-title">2D: vetores, pontos e instrumentos</div>
      <div className="tiles">
        {two.map((k) => (
          <button key={k.id} className="tile" onClick={() => insertFigure(k.spec)} title={k.hint}>
            <ElementsPreview elements={figurePreview(k.spec)} w={150} h={90} pad={4} bg="#FFFFFF" />
            <span>{k.label}</span>
          </button>
        ))}
      </div>
      <p className="hint">Figuras são objetos: mova, redimensione e gire a vista nos controles acima (com a figura selecionada). Arestas escondidas aparecem tracejadas. Para desenhar por cima, use o papel <b>Isométrico</b> ou <b>Plano cartesiano</b>.</p>
    </>
  );
}

// ---------------- funções ----------------
function FunctionsTab({ sel }: { sel: AttachmentElement | null }) {
  const L = useLive();
  const plot = sel?.figure?.kind === "plot" ? (sel.figure as Extract<FigureSpec, { kind: "plot" }>) : null;
  const [draft, setDraft] = useState<Extract<FigureSpec, { kind: "plot" }>>(() => defaultFigure("plot") as Extract<FigureSpec, { kind: "plot" }>);
  const spec = plot ?? draft;
  const apply = (next: Extract<FigureSpec, { kind: "plot" }>, live = false) => {
    if (sel && plot) {
      const el = { ...sel, figure: next };
      if (live) L.live(el); else useDoc.getState().updateElements([el]);
    } else setDraft(next);
  };
  const errors = useMemo(() => plotPrims(spec, 200, 150).errors, [spec]);
  const [pt, setPt] = useState("");
  return (
    <>
      <div className="sec-title">{plot ? "Editando o gráfico selecionado" : "Novo gráfico"}</div>
      {spec.fns.map((fn, i) => (
        <div key={i} className="fn-row">
          <span className="fn-dot" style={{ background: fn.color }} />
          <span className="fn-name">f{i + 1}(x) =</span>
          <input className="cp-hex fn-in" value={fn.expr} spellCheck={false}
            onChange={(e) => apply({ ...spec, fns: spec.fns.map((f, k) => (k === i ? { ...f, expr: e.target.value } : f)) }, true)}
            onBlur={L.commit} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
          <button className="btn sm" aria-label="Remover função" onClick={() => apply({ ...spec, fns: spec.fns.filter((_, k) => k !== i) })}>×</button>
        </div>
      ))}
      {errors.map((e) => <p key={e} className="hint err">{e}</p>)}
      <div className="row tight">
        <button className="chip sm" disabled={spec.fns.length >= 6} onClick={() => apply({ ...spec, fns: [...spec.fns, { expr: "", color: PLOT_COLORS[spec.fns.length % PLOT_COLORS.length] }] })}>+ Função</button>
        {["x", "x^2", "x^3", "sqrt(x)", "1/x", "abs(x)", "sin(x)", "cos(x)", "tan(x)", "2^x", "ln(x)", "e^(-x^2)"].map((ex) => (
          <button key={ex} className="chip sm" onClick={() => apply({ ...spec, fns: [...spec.fns.slice(0, 5), { expr: ex, color: PLOT_COLORS[spec.fns.length % PLOT_COLORS.length] }] })}>{ex}</button>
        ))}
      </div>
      <AreasEditor spec={spec} apply={apply} />
      <div className="row tight">
        {(["xmin", "xmax", "ymin", "ymax"] as const).map((k) => (
          <label key={k} className="mini-field">{k.replace("min", " mín").replace("max", " máx")}
            <input type="number" defaultValue={spec[k]} key={(sel?.id ?? "d") + k + spec[k]} onBlur={(e) => {
              const v = Number(e.target.value);
              const next = { ...spec, [k]: v };
              if (Number.isFinite(v) && next.xmax > next.xmin && next.ymax > next.ymin) apply(next);
            }} />
          </label>
        ))}
      </div>
      <div className="row tight">
        <button className={spec.grid ? "chip sm on" : "chip sm"} onClick={() => apply({ ...spec, grid: !spec.grid })}>Grade</button>
        <button className="chip sm" onClick={() => apply({ ...spec, xmin: -10, xmax: 10, ymin: -10, ymax: 10 })}>±10</button>
        <button className="chip sm" onClick={() => apply({ ...spec, xmin: -2 * Math.PI, xmax: 2 * Math.PI, ymin: -2, ymax: 2 })}>Trigonométrico</button>
        <button className="chip sm" onClick={() => apply({ ...spec, xmin: -1, xmax: 10, ymin: -1, ymax: 10 })}>1º quadrante</button>
      </div>
      <div className="row tight">
        <input className="cp-hex fn-in" placeholder="Ponto: 2; 3  ou  A = (2, 3)" value={pt} onChange={(e) => setPt(e.target.value)} onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          const m = /^\s*(?:([^=()]+?)\s*=\s*)?\(?\s*(-?[\d.,]+)\s*[;,\s]\s*(-?[\d.,]+)\s*\)?\s*$/.exec(pt);
          if (!m) { toast("Escreva o ponto como 2; 3 ou A = (2, 3)."); return; }
          const x = Number(m[2].replace(",", ".")), y = Number(m[3].replace(",", "."));
          apply({ ...spec, points: [...spec.points, { x, y, label: m[1]?.trim() ? `${m[1].trim()} (${fmt(x, 4)}; ${fmt(y, 4)})` : undefined }] });
          setPt("");
        }} />
        {spec.points.length > 0 && <button className="chip sm" onClick={() => apply({ ...spec, points: [] })}>Limpar pontos</button>}
      </div>
      {!plot && (
        <>
          <ElementsPreview elements={[{ ...makeFigure(spec, { x: 220, y: 180 }), id: "p" }]} w={340} h={250} pad={2} bg="#FFFFFF" />
          <button className="btn primary" onClick={() => insertFigure(spec)}>Inserir gráfico</button>
        </>
      )}
      <p className="hint">Escreva como na calculadora: <code>x^2 - 3x + 2</code>, <code>2sen(x)</code>, <code>sqrt(x)</code>, <code>ln x</code>, <code>|x|</code> como <code>abs(x)</code>. Multiplicação implícita vale (<code>2x</code>, <code>3(x+1)</code>).</p>
    </>
  );
}

type PlotSpec = Extract<FigureSpec, { kind: "plot" }>;
/** Área entre curvas: escolhe f, g (ou o eixo x) e o intervalo; a área e a integral aparecem no gráfico. */
function AreasEditor({ spec, apply }: { spec: PlotSpec; apply: (s: PlotSpec) => void }) {
  const [f, setF] = useState(0);
  const [g, setG] = useState(-1);
  const [a, setA] = useState("0");
  const [b, setB] = useState("2");
  const areas = spec.areas ?? [];
  return (
    <details className="editor" open={areas.length > 0}>
      <summary>Área entre curvas / integral {areas.length ? `(${areas.length})` : ""}</summary>
      <div className="editor-body">
        <div className="row tight">
          <label className="mini-field">Entre <select value={f} onChange={(e) => setF(+e.target.value)}>{spec.fns.map((_, i) => <option key={i} value={i}>f{i + 1}</option>)}</select></label>
          <label className="mini-field">e <select value={g} onChange={(e) => setG(+e.target.value)}><option value={-1}>eixo x</option>{spec.fns.map((_, i) => <option key={i} value={i}>f{i + 1}</option>)}</select></label>
          <label className="mini-field">de <input value={a} onChange={(e) => setA(e.target.value)} /></label>
          <label className="mini-field">até <input value={b} onChange={(e) => setB(e.target.value)} /></label>
        </div>
        <div className="row tight">
          <button className="chip sm" onClick={() => {
            const A = calc(a), B = calc(b);
            if (!A.ok || !B.ok || A.value === B.value) { toast("Intervalo inválido (use números ou expressões como pi/2)."); return; }
            apply({ ...spec, areas: [...areas, { f, g, a: A.value, b: B.value, color: PLOT_COLORS[(areas.length + 2) % PLOT_COLORS.length] }] });
          }}>+ Sombrear área</button>
          {areas.length > 0 && <button className="chip sm danger" onClick={() => apply({ ...spec, areas: [] })}>Tirar áreas</button>}
        </div>
        <p className="hint">Mostra a área (∫|f − g|) e a integral com sinal. Os limites aceitam expressões: <code>pi</code>, <code>sqrt(2)</code>.</p>
      </div>
    </details>
  );
}

// ---------------- álgebra linear ----------------
function AlgebraTab() {
  const [A, setA] = useState("2 1\n1 3");
  const [B, setB] = useState("1 0\n0 1");
  const [bv, setBv] = useState("3 5");
  const [u, setU] = useState("3 1");
  const [v, setV] = useState("1 2");
  const [out, setOut] = useState<{ title: string; text: string } | null>(null);
  const run = (title: string, fn: () => string) => {
    try { setOut({ title, text: fn() }); } catch (e) { setOut({ title, text: e instanceof Error ? e.message : "Erro" }); }
  };
  const M = (t: string) => parseMatrix(t);
  const V = (t: string) => parseVector(t);
  const fv = (x: number[]) => `(${x.map((c) => fmt(c, 6)).join("; ")})`;
  const insertText = () => {
    if (!out) return;
    const c = viewCenter();
    const t = makeText(newId(), c.x, c.y, `${out.title}\n${out.text}`, { fontSize: 20, fontFamily: "mono", align: "left", color: useTool.getState().color });
    useDoc.getState().addElement({ ...t, x: c.x - t.w / 2, y: c.y - t.h / 2 });
    toast("Resultado inserido no quadro.");
  };
  const visualize = () => {
    try {
      const vu = V(u), vv = V(v);
      const m = (() => { try { const a = M(A); return a.length === 2 && a[0].length === 2 ? ([a[0][0], a[0][1], a[1][0], a[1][1]] as [number, number, number, number]) : null; } catch { return null; } })();
      const img = (x: number[]) => (m ? [m[0] * x[0] + m[1] * (x[1] ?? 0), m[2] * x[0] + m[3] * (x[1] ?? 0)] : x);
      const r = Math.max(3, Math.ceil(Math.max(...[...img(vu), ...img(vv), ...vu, ...vv].map(Math.abs)) * 1.25));
      insertFigure({ kind: "vectors", vectors: [{ name: "u", x: vu[0], y: vu[1] ?? 0, color: "#D2453A" }, { name: "v", x: vv[0], y: vv[1] ?? 0, color: "#2F5BD3" }], matrix: m, range: r, sum: true, proj: true });
    } catch (e) { toast(e instanceof Error ? e.message : "Vetores inválidos"); }
  };
  return (
    <>
      <div className="sec-title">Matrizes</div>
      <div className="mat-pair">
        <label className="mat-box"><span>A</span><textarea className="outline-in" rows={3} value={A} onChange={(e) => setA(e.target.value)} spellCheck={false} /></label>
        <label className="mat-box"><span>B</span><textarea className="outline-in" rows={3} value={B} onChange={(e) => setB(e.target.value)} spellCheck={false} /></label>
      </div>
      <div className="row tight">
        <button className="chip sm" onClick={() => run("det(A)", () => fmt(det(M(A)), 10))}>det A</button>
        <button className="chip sm" onClick={() => run("A⁻¹", () => formatMatrix(inverse(M(A))))}>A⁻¹</button>
        <button className="chip sm" onClick={() => run("Aᵀ", () => formatMatrix(transpose(M(A))))}>Aᵀ</button>
        <button className="chip sm" onClick={() => run("A·B", () => formatMatrix(multiply(M(A), M(B))))}>A·B</button>
        <button className="chip sm" onClick={() => run("A + B", () => formatMatrix(addM(M(A), M(B))))}>A+B</button>
        <button className="chip sm" onClick={() => run("A − B", () => formatMatrix(addM(M(A), M(B), -1)))}>A−B</button>
        <button className="chip sm" onClick={() => run("Escalonada de A", () => { const r = rref(M(A)); return `${formatMatrix(r.R)}\nposto = ${r.rank}`; })}>Escalonar</button>
        <button className="chip sm" onClick={() => run("Autovalores de A", () => {
          const a = M(A);
          return eigenvalues(a).map((e, i) => {
            const val = Math.abs(e.im) < 1e-9 ? fmt(e.re, 8) : `${fmt(e.re, 6)} ${e.im < 0 ? "−" : "+"} ${fmt(Math.abs(e.im), 6)}i`;
            const vec = Math.abs(e.im) < 1e-9 ? eigenvector(a, e.re) : null;
            return `λ${i + 1} = ${val}${vec ? `   v = ${fv(vec)}` : ""}`;
          }).join("\n");
        })}>Autovalores</button>
      </div>
      <div className="row tight">
        <label className="mini-field">b = <input className="wide" value={bv} onChange={(e) => setBv(e.target.value)} /></label>
        <button className="chip sm" onClick={() => run("Sistema A·x = b", () => {
          const r = solve(M(A), V(bv));
          return r.kind === "unique" ? `x = ${fv(r.x)}` : r.kind === "none" ? "Sistema impossível (sem solução)." : `Infinitas soluções (${r.free} variável${r.free > 1 ? "is" : ""} livre${r.free > 1 ? "s" : ""}, posto ${r.rank}).`;
        })}>Resolver A·x = b</button>
      </div>

      <div className="sec-title">Vetores</div>
      <div className="row tight">
        <label className="mini-field">u = <input className="wide" value={u} onChange={(e) => setU(e.target.value)} /></label>
        <label className="mini-field">v = <input className="wide" value={v} onChange={(e) => setV(e.target.value)} /></label>
      </div>
      <div className="row tight">
        <button className="chip sm" onClick={() => run("u · v", () => fmt(dot(V(u), V(v)), 10))}>u·v</button>
        <button className="chip sm" onClick={() => run("u × v", () => fv(cross(V(u), V(v))))}>u×v</button>
        <button className="chip sm" onClick={() => run("|u|, |v|", () => `|u| = ${fmt(norm(V(u)), 8)}\n|v| = ${fmt(norm(V(v)), 8)}`)}>Normas</button>
        <button className="chip sm" onClick={() => run("Ângulo entre u e v", () => { const t = angle(V(u), V(v)); return `${fmt((t * 180) / Math.PI, 8)}°  (${fmt(t, 8)} rad)`; })}>Ângulo</button>
        <button className="chip sm" onClick={() => run("proj_v u", () => fv(projection(V(u), V(v))))}>Projeção</button>
        <button className="chip sm" onClick={() => run("Distância entre os pontos u e v", () => fmt(distance(V(u), V(v)), 10))}>Distância</button>
      </div>
      {out && (
        <div className="result-box mono">
          <b>{out.title}</b>
          <pre>{out.text}</pre>
          <div className="row tight">
            <button className="chip sm" onClick={insertText}>Inserir no quadro</button>
            <button className="chip sm" onClick={() => void navigator.clipboard?.writeText(out.text)}>Copiar</button>
          </div>
        </div>
      )}
      <button className="btn primary" onClick={visualize}>Visualizar u, v e a transformação A</button>
      <p className="hint">Matrizes: uma linha por linha, números separados por espaço (aceita <code>sqrt(2)</code>, <code>pi/4</code>). Vetores: <code>3 1</code> ou <code>(1, 2, 3)</code>. “Visualizar” desenha u, v, a soma, a projeção e, se A for 2×2, a malha transformada com o determinante.</p>
    </>
  );
}

// ---------------- calculadora ----------------
const KEYS = ["7", "8", "9", "/", "sqrt(", "4", "5", "6", "*", "^", "1", "2", "3", "-", "(", "0", ",", "pi", "+", ")", "sin(", "cos(", "tan(", "ln(", "log(", "!", "e", "abs(", "%", "C"];

function CalcTab() {
  const [expr, setExpr] = useState("");
  const [hist, setHist] = useState<{ e: string; v: string }[]>([]);
  const r = expr.trim() ? calc(expr) : null;
  const insert = (text: string) => {
    const c = viewCenter();
    const t = makeText(newId(), c.x, c.y, text, { fontSize: 24, fontFamily: "mono", align: "left", color: useTool.getState().color });
    useDoc.getState().addElement({ ...t, x: c.x - t.w / 2, y: c.y - t.h / 2 });
    toast("Resultado inserido no quadro.");
  };
  const done = () => { if (r?.ok) { setHist([{ e: expr, v: fmt(r.value) }, ...hist].slice(0, 12)); } };
  return (
    <>
      <input className="calc-in" value={expr} placeholder="Digite: 2^10 / 3 + sqrt(2)" spellCheck={false} autoFocus
        onChange={(e) => setExpr(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") done(); }} />
      <div className={r && !r.ok ? "calc-out err" : "calc-out"}>{r ? (r.ok ? `= ${fmt(r.value)}` : r.error) : "= "}</div>
      <div className="calc-keys">
        {KEYS.map((k) => (
          <button key={k} className={/[0-9,]/.test(k) && k.length === 1 ? "ck num" : k === "C" ? "ck danger" : "ck"} onClick={() => setExpr(k === "C" ? "" : expr + k)}>
            {k === "sqrt(" ? "√" : k === "pi" ? "π" : k === "*" ? "×" : k === "/" ? "÷" : k.length > 1 ? k.replace("(", "") : k}
          </button>
        ))}
      </div>
      <div className="row tight">
        <button className="btn primary" disabled={!r?.ok} onClick={() => { if (r?.ok) { done(); insert(`${expr} = ${fmt(r.value)}`); } }}>Inserir no quadro</button>
        <button className="chip sm" disabled={!r?.ok} onClick={() => { if (r?.ok) void navigator.clipboard?.writeText(fmt(r.value)); }}>Copiar</button>
      </div>
      {hist.length > 0 && (
        <ul className="calc-hist">
          {hist.map((h, i) => <li key={i}><button onClick={() => setExpr(h.e)}>{h.e}</button><b>= {h.v}</b></li>)}
        </ul>
      )}
      <p className="hint">Ângulos em radianos (use <code>rad(30)</code> para converter de graus). Funções: sin/sen, cos, tan, asin, acos, atan, sqrt, cbrt, abs, ln, log, log2, exp, floor, ceil, round, min, max, fatorial com <code>!</code>.</p>
    </>
  );
}

export function SciencePanel() {
  const [tab, setTab] = useState<Tab>("grafos");
  const ids = useSel((s) => s.ids);
  const els = useDoc((s) => selectActivePage(s).elements);
  const sel = ids.length === 1 ? (els.find((e) => e.id === ids[0] && e.type === "attachment" && e.kind === "figure") as AttachmentElement | undefined) ?? null : null;
  // selecionar uma figura abre a aba que a edita (uma vez por seleção; depois o usuário troca à vontade)
  const selId = sel?.id ?? null;
  const selKind = sel?.figure?.kind;
  useEffect(() => { if (selId) setTab(selKind === "plot" ? "funcoes" : "geometria"); }, [selId, selKind]);
  const effective = tab;
  const TABS: [Tab, string][] = [["grafos", "Grafos"], ["geometria", "Geometria"], ["funcoes", "Funções"], ["algebra", "Álgebra"], ["calc", "Calc."]];
  return (
    <div className="panel sciencepanel" role="dialog" aria-label="Grafos e matemática">
      <div className="seg" role="tablist">
        {TABS.map(([id, l]) => <button key={id} role="tab" aria-selected={effective === id} className={effective === id ? "on" : ""} onClick={() => setTab(id)}>{l}</button>)}
      </div>
      {effective === "grafos" && <GraphTab />}
      {effective === "geometria" && <GeometryTab sel={sel} />}
      {effective === "funcoes" && <FunctionsTab sel={sel} />}
      {effective === "algebra" && <AlgebraTab />}
      {effective === "calc" && <CalcTab />}
    </div>
  );
}
