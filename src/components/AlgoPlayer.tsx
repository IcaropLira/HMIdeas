// Player de algoritmo: barra flutuante para ver a execução passo a passo (voltar, tocar/pausar, avançar, velocidade),
// a frase do passo, a estrutura auxiliar (fila, pilha, heap) e a legenda de cores. O desenho por cima do grafo vem daqui
// (useAlgo.overlay) e o Renderer só pinta.
import { useEffect } from "react";
import { Icon } from "./Icon";
import { AlgoOverlay, useAlgo } from "../core/algoView";
import { linearPath } from "../core/linear";
import { HirakuElement } from "../core/model";
import { selectActivePage, useDoc } from "../core/store";

export const ALGO_COLORS = { current: "#F76B15", frontier: "#E5A400", done: "#30A46C", tree: "#30A46C", edge: "#F76B15", rejected: "#9AA3B2", highlight: "#E5484D", badge: "#3D4557" };

function buildOverlay(els: HirakuElement[]): AlgoOverlay | null {
  const { steps, index, vertexIds, edgeIds } = useAlgo.getState();
  const st = steps?.[index];
  if (!st) return null;
  const byId = new Map(els.map((e) => [e.id, e]));
  const ov: AlgoOverlay = { rings: [], edges: [], badges: [] };
  const edgePts = (i: number) => {
    const el = byId.get(edgeIds[i]);
    return el && (el.type === "arrow" || el.type === "line") ? linearPath(el) : null;
  };
  const addEdge = (i: number, color: string, width: number, alpha = 0.9) => { const p = edgePts(i); if (p) ov.edges.push({ pts: p, color, width, alpha }); };
  st.rejected.forEach((i) => addEdge(i, ALGO_COLORS.rejected, 6, 0.45));
  st.tree.forEach((i) => addEdge(i, ALGO_COLORS.tree, 7, 0.75));
  st.highlight?.edges?.forEach((i) => addEdge(i, ALGO_COLORS.highlight, 8, 0.85));
  if (st.edge !== undefined) addEdge(st.edge, ALGO_COLORS.edge, 9, 0.95);
  const ring = (id: string, color: string, width: number, fill?: string, pad = 7) => {
    const v = byId.get(id);
    if (!v || v.type !== "node") return;
    ov.rings.push({ cx: v.x + v.w / 2, cy: v.y + v.h / 2, rx: v.w / 2 + pad, ry: v.h / 2 + pad, color, width, fill });
  };
  st.done.forEach((id) => ring(id, ALGO_COLORS.done, 3, ALGO_COLORS.done));
  st.frontier.forEach((id) => ring(id, ALGO_COLORS.frontier, 4, ALGO_COLORS.frontier));
  st.highlight?.vertices?.forEach((id) => ring(id, ALGO_COLORS.highlight, 5, undefined, 10));
  if (st.current) ring(st.current, ALGO_COLORS.current, 6, undefined, 11);
  for (const [id, text] of Object.entries(st.labels)) {
    const v = byId.get(id);
    if (v && v.type === "node" && vertexIds.includes(id)) ov.badges.push({ x: v.x + v.w / 2, y: v.y - 16, text, color: id === st.current ? ALGO_COLORS.current : ALGO_COLORS.badge });
  }
  return ov;
}

export function AlgoPlayer() {
  const steps = useAlgo((s) => s.steps);
  const index = useAlgo((s) => s.index);
  const playing = useAlgo((s) => s.playing);
  const speed = useAlgo((s) => s.speed);
  const title = useAlgo((s) => s.title);
  const els = useDoc((s) => selectActivePage(s).elements);
  const A = useAlgo.getState();

  // desenha o passo atual (e redesenha se o grafo for movido)
  useEffect(() => { useAlgo.getState().setOverlay(steps ? buildOverlay(els) : null); }, [steps, index, els]);
  // tocar
  useEffect(() => {
    if (!playing || !steps) return;
    if (index >= steps.length - 1) { useAlgo.getState().setPlaying(false); return; }
    const t = setTimeout(() => useAlgo.getState().go(index + 1), 1000 / speed);
    return () => clearTimeout(t);
  }, [playing, index, speed, steps]);
  // teclado: ← → espaço, Esc fecha
  useEffect(() => {
    if (!steps) return;
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const a = useAlgo.getState();
      if (e.key === "Escape") { a.stop(); e.stopPropagation(); }
      else if (e.key === "ArrowRight" && e.shiftKey) { a.setPlaying(false); a.go(a.index + 1); e.preventDefault(); }
      else if (e.key === "ArrowLeft" && e.shiftKey) { a.setPlaying(false); a.go(a.index - 1); e.preventDefault(); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [steps]);

  if (!steps) return null;
  const st = steps[index];
  const at = (i: number) => { A.setPlaying(false); A.go(i); };
  return (
    <div className="algo-player" role="region" aria-label="Execução do algoritmo">
      <div className="algo-head">
        <b>{title}</b>
        <span className="algo-count">passo {index + 1} de {steps.length}</span>
        <button className="btn sm" onClick={() => A.stop()} aria-label="Fechar execução" title="Fechar (Esc)"><Icon><path d="M6 6l12 12M18 6L6 18" /></Icon></button>
      </div>
      <p className="algo-note">{st.note}</p>
      {st.structure && (
        <div className="algo-struct">
          <span>{st.structure.name}</span>
          {st.structure.items.length ? st.structure.items.map((x, i) => <i key={i}>{x}</i>) : <em>vazia</em>}
        </div>
      )}
      <input className="algo-scrub" type="range" min={0} max={steps.length - 1} value={index} onChange={(e) => at(+e.target.value)} aria-label="Passo" />
      <div className="algo-ctrl">
        <button className="btn sm" onClick={() => at(0)} aria-label="Início" title="Início"><Icon><path d="M6 5v14M18 6l-9 6 9 6z" /></Icon></button>
        <button className="btn sm" onClick={() => at(index - 1)} aria-label="Passo anterior" title="Anterior (Shift+←)"><Icon><path d="M15 6l-6 6 6 6" /></Icon></button>
        <button className="btn play" onClick={() => { if (index >= steps.length - 1) A.go(0); A.setPlaying(!playing); }} aria-label={playing ? "Pausar" : "Tocar"}>
          <Icon>{playing ? <path d="M8 5v14M16 5v14" /> : <path d="M7 5l12 7-12 7z" />}</Icon>
        </button>
        <button className="btn sm" onClick={() => at(index + 1)} aria-label="Próximo passo" title="Próximo (Shift+→)"><Icon><path d="M9 6l6 6-6 6" /></Icon></button>
        <button className="btn sm" onClick={() => at(steps.length - 1)} aria-label="Fim" title="Fim"><Icon><path d="M18 5v14M6 6l9 6-9 6z" /></Icon></button>
        <label className="algo-speed" title="Velocidade">
          <Icon size={16}><circle cx="12" cy="13" r="8" /><path d="M12 13l4-4M12 3v2" /></Icon>
          <input type="range" min={0.5} max={6} step={0.5} value={speed} onChange={(e) => A.setSpeed(+e.target.value)} aria-label="Velocidade" />
          <output>{speed}×</output>
        </label>
      </div>
      <div className="algo-legend">
        <span><i style={{ background: ALGO_COLORS.current }} />atual</span>
        <span><i style={{ background: ALGO_COLORS.frontier }} />na fila/pilha</span>
        <span><i style={{ background: ALGO_COLORS.done }} />concluído</span>
        <span><i style={{ background: ALGO_COLORS.rejected }} />descartada</span>
        <span><i style={{ background: ALGO_COLORS.highlight }} />resultado</span>
      </div>
    </div>
  );
}
