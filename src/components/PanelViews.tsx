// Conteúdo dos painéis acopláveis novos (Objetos, Propriedades, Transformação, Alinhamento, Histórico, Navegador,
// Ferramentas, Biblioteca, Materiais, Texto, Atalhos). Os painéis antigos (Camadas, Pincéis, Cores, Papel, Mapa,
// Ciências) são reaproveitados como estão.
import { ReactNode, useMemo, useRef, useState } from "react";
import { HirakuDoc, HirakuElement, Page } from "../core/model";
import { ToolId, selectActivePage, useDoc, useSel, useTool, useView } from "../core/store";
import { TreeItem, Unit, objectTree, placeUnits, unitLeaves } from "../core/groups";
import { currentCtx, renameUnit, selectUnit, setUnitFlag, useGroupCtx } from "../core/groupActions";
import { blockDef } from "../core/blocks";
import { pageThumb } from "../render/svgThumb";
import { clampZoom } from "../core/camera";
import { TEMPLATES, TEMPLATE_CATEGORIES } from "../core/templates";
import { insertTemplate } from "./TemplateGallery";
import { BlockTiles } from "./BlockGallery";
import { ElementsPreview } from "./ElementsPreview";
import { TextPanelBody } from "./TextControls";
import { ShortcutEditor } from "./ShortcutEditor";
import { AlignButtons, SelectionOptions, ToolOptions } from "./ToolOptions";
import { TransformFields } from "./ContextBar";
import { Icon } from "./Icon";
import { allCommands, runCommand, shortcutOf, withKey } from "./commands";
import { useUI } from "../core/ui";

// ---------------- Objetos ----------------

const TYPE_LABEL: Record<string, string> = {
  stroke: "Traço", rect: "Retângulo", ellipse: "Elipse", diamond: "Losango", line: "Linha", arrow: "Seta", text: "Texto", node: "Nó", frame: "Quadro",
};

export function elementLabel(e: HirakuElement): string {
  if (e.type === "text") return `“${e.text.split("\n")[0].slice(0, 28)}”`;
  if (e.type === "node") return `${e.vertex ? "Vértice" : "Nó"} “${e.text.slice(0, 24)}”`;
  if (e.type === "frame") return `Quadro “${e.title.slice(0, 24)}”`;
  if (e.type === "attachment") {
    if (e.kind === "block" && e.block) return blockDef(e.block.kind)?.label ?? "Bloco";
    return { image: "Imagem", video: "Vídeo", pdf: "PDF", link: "Link", file: "Arquivo", figure: "Figura" }[e.kind as string] ?? "Anexo";
  }
  if ((e.type === "arrow" || e.type === "line") && e.label) return `${TYPE_LABEL[e.type]} “${e.label.slice(0, 20)}”`;
  return TYPE_LABEL[e.type] ?? e.type;
}

const TYPE_ICON: Record<string, ReactNode> = {
  group: <><rect x="3.5" y="3.5" width="17" height="17" rx="2" strokeDasharray="3 2.5" /><rect x="7" y="7" width="10" height="10" rx="1.5" /></>,
  stroke: <path d="M4 17c4-8 7 3 10-4s4-2 6-3" />, rect: <rect x="4" y="6" width="16" height="12" rx="2" />, ellipse: <ellipse cx="12" cy="12" rx="8" ry="6" />,
  diamond: <path d="M12 4l8 8-8 8-8-8z" />, line: <path d="M5 19L19 5" />, arrow: <><path d="M5 19L19 5" /><path d="M11 5h8v8" /></>, text: <path d="M5 6h14M12 6v13" />,
  node: <rect x="4" y="8" width="16" height="8" rx="4" />, frame: <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /></>, attachment: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h5" /></>,
};

function ObjRow({ it, page, sel, onDrag, drop, collapsed, toggle }: {
  it: TreeItem; page: Page; sel: Set<string>; onDrag: (u: Unit) => void; drop: string | null; collapsed: Set<string>; toggle: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const leaves = unitLeaves(page, it.unit);
  const on = leaves.length > 0 && leaves.every((e) => sel.has(e.id));
  const key = `${it.unit.kind}:${it.unit.id}`;
  const isGroup = it.unit.kind === "group";
  const el = it.unit.kind === "el" ? page.elements.find((e) => e.id === it.unit.id) : null;
  const icon = isGroup ? TYPE_ICON.group : TYPE_ICON[el?.type ?? "attachment"] ?? TYPE_ICON.attachment;
  return (
    <>
      <div
        className={["obj-row", on && "on", drop === `${key}:before` && "drop-before", drop === `${key}:after` && "drop-after", drop === `${key}:inside` && "drop-inside", (it.hidden) && "dim"].filter(Boolean).join(" ")}
        style={{ paddingLeft: 6 + it.depth * 16 }}
        data-unit={key}
        role="treeitem"
        aria-selected={on}
        aria-expanded={isGroup ? !collapsed.has(it.unit.id) : undefined}
        aria-level={it.depth + 1}
        onPointerDown={(e) => { if ((e.target as HTMLElement).closest("button,input")) return; onDrag(it.unit); }}
        onClick={(e) => { if ((e.target as HTMLElement).closest("button,input")) return; selectUnit(it.unit, e.shiftKey || e.ctrlKey || e.metaKey); }}
        onDoubleClick={() => setEditing(true)}
      >
        {isGroup
          ? <button className="obj-tw" onClick={() => toggle(it.unit.id)} aria-label={collapsed.has(it.unit.id) ? "Expandir" : "Recolher"}>{collapsed.has(it.unit.id) ? "▸" : "▾"}</button>
          : <span className="obj-tw" />}
        <Icon size={15}>{icon}</Icon>
        {editing
          ? <input autoFocus defaultValue={it.name} className="obj-name-input" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(false); }}
              onBlur={(e) => { renameUnit(it.unit, e.target.value); setEditing(false); }} aria-label="Nome" />
          : <span className="obj-name" title="Duplo clique renomeia">{it.name}{isGroup && <small> · {leaves.length}</small>}</span>}
        <button className={it.hidden ? "obj-flag on" : "obj-flag"} onClick={() => setUnitFlag(it.unit, "hidden", !it.hidden)} aria-label={it.hidden ? "Mostrar" : "Ocultar"} title={it.hidden ? "Mostrar" : "Ocultar"}>
          <Icon size={15}>{it.hidden ? <><path d="M3 3l18 18" /><path d="M10.6 6.2A9 9 0 0112 6c5 0 8.5 4 9.5 6-.4.8-1.2 2-2.3 3.1M6.6 7.7C4.5 9 3.1 10.8 2.5 12c1 2 4.5 6 9.5 6 1.6 0 3-.4 4.2-1" /></> : <><path d="M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6z" /><circle cx="12" cy="12" r="2.5" /></>}</Icon>
        </button>
        <button className={it.locked ? "obj-flag on" : "obj-flag"} onClick={() => setUnitFlag(it.unit, "locked", !it.locked)} aria-label={it.locked ? "Destravar" : "Travar"} title={it.locked ? "Destravar" : "Travar"}>
          <Icon size={15}>{it.locked ? <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></> : <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 017.5-2" /></>}</Icon>
        </button>
      </div>
      {isGroup && !collapsed.has(it.unit.id) && it.children.map((c) => (
        <ObjRow key={`${c.unit.kind}:${c.unit.id}`} it={c} page={page} sel={sel} onDrag={onDrag} drop={drop} collapsed={collapsed} toggle={toggle} />
      ))}
    </>
  );
}

export function ObjectsPanel() {
  const page = useDoc((s) => selectActivePage(s));
  const ids = useSel((s) => s.ids);
  useGroupCtx((s) => s.ctx);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [drop, setDrop] = useState<string | null>(null);
  const tree = useMemo(() => objectTree(page, elementLabel), [page]);
  const sel = new Set(ids);
  const listRef = useRef<HTMLDivElement>(null);
  const toggle = (id: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // arrastar uma linha: acima/abaixo de outra (reordena) ou no meio de um grupo (entra nele)
  const startDrag = (u: Unit) => {
    let moved = false;
    let target: { unit: Unit; where: "before" | "after" | "inside" } | null = null;
    const move = (e: PointerEvent) => {
      moved = true;
      const row = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-unit]");
      if (!row || !listRef.current?.contains(row)) { target = null; setDrop(null); return; }
      const [kind, id] = row.dataset.unit!.split(":") as ["el" | "group", string];
      if (kind === u.kind && id === u.id) { target = null; setDrop(null); return; }
      const r = row.getBoundingClientRect();
      const f = (e.clientY - r.top) / r.height;
      const where = kind === "group" && f > 0.28 && f < 0.72 ? "inside" : f < 0.5 ? "before" : "after";
      target = { unit: { kind, id }, where };
      setDrop(`${kind}:${id}:${where}`);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrop(null);
      if (moved && target) {
        const t = target;
        const units = sel.size && unitLeaves(page, u).every((e) => sel.has(e.id)) ? null : [u];
        useDoc.getState().editPage((p) => placeUnits(p, units ?? [u], t.unit, t.where));
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const filter = (items: TreeItem[]): TreeItem[] => {
    const n = q.trim().toLowerCase();
    if (!n) return items;
    return items.flatMap((it) => {
      const kids = filter(it.children);
      return it.name.toLowerCase().includes(n) || kids.length ? [{ ...it, children: kids }] : [];
    });
  };
  const ctx = currentCtx(page);

  return (
    <div className="objpanel">
      <div className="row tight">
        <input className="kb-search" type="search" placeholder="Procurar objeto" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Procurar objeto" />
      </div>
      {ctx && <p className="hint small">Dentro de um grupo (Esc sai). Cliques no quadro pegam os filhos dele.</p>}
      <div className="obj-list" role="tree" aria-label="Objetos da página" ref={listRef}>
        {filter(tree).map((it) => (
          <ObjRow key={`${it.unit.kind}:${it.unit.id}`} it={it} page={page} sel={sel} onDrag={startDrag} drop={drop} collapsed={collapsed} toggle={toggle} />
        ))}
        {!tree.length && <p className="hint">A página está vazia.</p>}
      </div>
      <div className="row tight obj-actions">
        <button className="btn sm" onClick={() => runCommand("obj.group")} title={withKey("Agrupar", "obj.group")} aria-label="Agrupar"><Icon size={17}>{TYPE_ICON.group}</Icon></button>
        <button className="btn sm" onClick={() => runCommand("obj.ungroup")} title={withKey("Desagrupar", "obj.ungroup")} aria-label="Desagrupar"><Icon size={17}><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></Icon></button>
        <button className="btn sm" onClick={() => runCommand("obj.release")} title={withKey("Tirar do grupo", "obj.release")} aria-label="Tirar do grupo"><Icon size={17}><path d="M14 7l-5 5 5 5M20 12H9" /></Icon></button>
        <span className="ob-fill" />
        <button className="chip" onClick={() => runCommand("obj.showAll")}>Mostrar tudo</button>
        <button className="chip" onClick={() => runCommand("obj.unlockAll")}>Destravar tudo</button>
      </div>
      <p className="hint small">Arraste as linhas para reordenar ou para dentro de um grupo. Duplo clique renomeia. Shift/Ctrl soma à seleção.</p>
    </div>
  );
}

// ---------------- Propriedades / Transformação / Alinhamento ----------------

export function PropsPanel() {
  const hasSel = useSel((s) => s.ids.length > 0);
  return <div className="propspanel">{hasSel ? <SelectionOptions mode="panel" /> : <><p className="hint small">Opções da ferramenta ativa (selecione algo para ver as dele).</p><ToolOptions mode="panel" /></>}</div>;
}

export function TransformPanel() {
  return (
    <div className="propspanel">
      <TransformFields />
      <div className="sec-title">Girar e espelhar</div>
      <div className="row tight">
        <button className="chip" onClick={() => runCommand("arr.rotCCW")} title={withKey("Girar −90°", "arr.rotCCW")}>↺ 90°</button>
        <button className="chip" onClick={() => runCommand("arr.rotCW")} title={withKey("Girar 90°", "arr.rotCW")}>↻ 90°</button>
        <button className="chip" onClick={() => runCommand("arr.flipH")} title={withKey("Espelhar na horizontal", "arr.flipH")}>⇋ Horizontal</button>
        <button className="chip" onClick={() => runCommand("arr.flipV")} title={withKey("Espelhar na vertical", "arr.flipV")}>⇅ Vertical</button>
      </div>
      <div className="sec-title">Ordem</div>
      <div className="row tight">
        {(["arr.front", "arr.forward", "arr.backward", "arr.back"] as const).map((id) => (
          <button key={id} className="chip" onClick={() => runCommand(id)} title={withKey(allCommands().find((c) => c.id === id)!.label, id)}>{allCommands().find((c) => c.id === id)!.label}</button>
        ))}
      </div>
    </div>
  );
}

export function AlignPanel() {
  const t = useTool();
  const [cols, setCols] = useState(0);
  const [gap, setGap] = useState(24);
  return (
    <div className="propspanel">
      <div className="sec-title">Alinhar e distribuir</div>
      <AlignButtons big />
      <p className="hint small">Com um objeto só, alinha à folha (caderno com páginas) ou à área visível. Grupos contam como um objeto.</p>
      <div className="row tight">
        <button className="chip" onClick={() => runCommand("dist.hc")}>Centros ↔</button>
        <button className="chip" onClick={() => runCommand("dist.vc")}>Centros ↕</button>
        <button className="chip" onClick={() => runCommand("arr.center")} title={withKey("Centralizar na tela", "arr.center")}>Centralizar na tela</button>
      </div>
      <div className="sec-title">Igualar</div>
      <div className="row tight">
        <button className="chip" onClick={() => runCommand("eq.w")}>Larguras</button>
        <button className="chip" onClick={() => runCommand("eq.h")}>Alturas</button>
        <button className="chip" onClick={() => runCommand("eq.both")}>Tamanhos</button>
      </div>
      <div className="sec-title">Organizar em grade</div>
      <div className="row tight">
        <label className="tf-field"><span>Colunas</span><input type="number" min={0} max={20} value={cols} onChange={(e) => setCols(+e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Colunas (0 = automático)" /></label>
        <label className="tf-field"><span>Espaço</span><input type="number" min={0} max={400} value={gap} onChange={(e) => setGap(+e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Espaço" /></label>
        <button className="chip on" onClick={() => import("../core/alignActions").then((m) => m.arrangeGrid(cols || undefined, gap))}>Organizar</button>
      </div>
      <div className="sec-title">Encaixe</div>
      <button className="toggle" role="switch" aria-checked={t.smartGuides} onClick={() => t.set({ smartGuides: !t.smartGuides })}>
        <span className="toggle-text"><b>Guias inteligentes</b><small>Linhas de alinhamento e de espaço igual ao arrastar ({shortcutOf("view.smartGuides")}). Ctrl segurado desliga na hora.</small></span>
        <span className={t.smartGuides ? "switch on" : "switch"} aria-hidden="true"><i /></span>
      </button>
      <button className="toggle" role="switch" aria-checked={t.snapGrid} onClick={() => t.set({ snapGrid: !t.snapGrid })}>
        <span className="toggle-text"><b>Encaixar na grade</b><small>O canto do que você arrasta cai na grade ({shortcutOf("view.snapGrid")}).</small></span>
        <span className={t.snapGrid ? "switch on" : "switch"} aria-hidden="true"><i /></span>
      </button>
      <label className="slider">
        <span>Tamanho da grade</span>
        <input type="range" min={4} max={100} step={1} value={t.gridSize} onChange={(e) => t.set({ gridSize: +e.target.value })} />
        <output>{t.gridSize}</output>
      </label>
    </div>
  );
}

// ---------------- Histórico ----------------

function stepLabel(a: HirakuDoc, b: HirakuDoc): string {
  if (a.pages.length !== b.pages.length) return b.pages.length > a.pages.length ? "Nova página" : "Página excluída";
  const i = b.pages.findIndex((p, k) => p !== a.pages[k]);
  if (i < 0) return "Edição";
  const pa = a.pages[i], pb = b.pages[i];
  if (pa.name !== pb.name) return "Renomear página";
  if (pa.paper !== pb.paper || pa.background !== pb.background) return "Papel";
  if ((pa.groups?.length ?? 0) !== (pb.groups?.length ?? 0)) return (pb.groups?.length ?? 0) > (pa.groups?.length ?? 0) ? "Agrupar" : "Desagrupar";
  const d = pb.elements.length - pa.elements.length;
  if (d > 0) {
    const added = pb.elements.slice(-d);
    return d === 1 ? `Adicionar ${elementLabel(added[0]).toLowerCase()}` : `Adicionar ${d} objetos`;
  }
  if (d < 0) return -d === 1 ? "Apagar 1 objeto" : `Apagar ${-d} objetos`;
  const changed = pb.elements.filter((e, k) => e !== pa.elements[k]);
  if (!changed.length) return pa.layers !== pb.layers ? "Camadas" : "Edição";
  if (changed.length === 1) return `Editar ${elementLabel(changed[0]).toLowerCase()}`;
  return `Editar ${changed.length} objetos`;
}

export function HistoryPanel() {
  const past = useDoc((s) => s.past);
  const future = useDoc((s) => s.future);
  const doc = useDoc((s) => s.doc);
  const all = [...past, doc, ...future];
  const cur = past.length;
  const from = Math.max(1, all.length - 80);
  const go = (k: number) => {
    const st = useDoc.getState();
    if (k < cur) for (let i = 0; i < cur - k; i++) st.undo();
    else for (let i = 0; i < k - cur; i++) useDoc.getState().redo();
  };
  const rows: ReactNode[] = [];
  for (let k = all.length - 1; k >= from; k--) {
    rows.push(
      <button key={k} className={k === cur ? "hist-row on" : k > cur ? "hist-row future" : "hist-row"} onClick={() => go(k)} aria-current={k === cur ? "step" : undefined}>
        <span className="hist-n">{k}</span><span>{stepLabel(all[k - 1], all[k])}</span>
      </button>,
    );
  }
  return (
    <div className="histpanel">
      <div className="row tight">
        <button className="chip" disabled={!past.length} onClick={() => useDoc.getState().undo()} title={withKey("Desfazer", "edit.undo")}>↶ Desfazer</button>
        <button className="chip" disabled={!future.length} onClick={() => useDoc.getState().redo()} title={withKey("Refazer", "edit.redo")}>↷ Refazer</button>
      </div>
      <div className="hist-list" role="list">
        {rows}
        <button className={cur === 0 ? "hist-row on" : "hist-row"} onClick={() => go(0)}><span className="hist-n">0</span><span>Início (abriu o caderno)</span></button>
      </div>
      <p className="hint small">Clique num passo para voltar até ele. Passos em cinza podem ser refeitos.</p>
    </div>
  );
}

// ---------------- Navegador ----------------

export function NavigatorPanel() {
  const page = useDoc((s) => selectActivePage(s));
  const cam = useView((s) => s.camera);
  const thumb = useMemo(() => pageThumb(page), [page]);
  const ref = useRef<SVGSVGElement>(null);
  const [vx, vy, vw, vh] = thumb.viewBox.split(" ").map(Number);
  const W = window.innerWidth, H = window.innerHeight;
  const view = { x: -cam.x / cam.zoom, y: -cam.y / cam.zoom, w: W / cam.zoom, h: H / cam.zoom };
  // a caixa da miniatura inclui a área visível, para o retângulo nunca sumir
  const bx = Math.min(vx, view.x), by = Math.min(vy, view.y);
  const bw = Math.max(vx + vw, view.x + view.w) - bx, bh = Math.max(vy + vh, view.y + view.h) - by;
  const centerAt = (e: React.PointerEvent) => {
    const svg = ref.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const k = Math.max(bw / r.width, bh / r.height);
    const ox = (r.width - bw / k) / 2, oy = (r.height - bh / k) / 2;
    const wx = bx + (e.clientX - r.left - ox) * k, wy = by + (e.clientY - r.top - oy) * k;
    useView.getState().setCamera({ ...cam, x: W / 2 - wx * cam.zoom, y: H / 2 - wy * cam.zoom });
  };
  const z = Math.log2(cam.zoom);
  return (
    <div className="navpanel">
      <svg ref={ref} className="nav-thumb" viewBox={`${bx} ${by} ${bw} ${bh}`} preserveAspectRatio="xMidYMid meet" style={{ background: page.background }}
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); centerAt(e); }}
        onPointerMove={(e) => { if (e.buttons) centerAt(e); }} aria-label="Miniatura da página: clique ou arraste para ir até um lugar" role="img">
        {page.size && <rect x={0} y={0} width={page.size.w} height={page.size.h} fill="#fff" stroke="#0002" strokeWidth={bw / 300} />}
        {thumb.paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.fill || "none"} stroke={p.stroke ?? "none"} strokeWidth={p.sw} strokeDasharray={p.dash ?? undefined} opacity={p.alpha} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="var(--accent)" fillOpacity={0.08} stroke="var(--accent)" strokeWidth={bw / 160} />
      </svg>
      <label className="slider">
        <span>Zoom</span>
        <input type="range" min={-4} max={4} step={0.05} value={z}
          onChange={(e) => { const nz = clampZoom(2 ** +e.target.value); const cx = W / 2, cy = H / 2; const k = nz / cam.zoom; useView.getState().setCamera({ zoom: nz, x: cx - (cx - cam.x) * k, y: cy - (cy - cam.y) * k }); }} />
        <output>{Math.round(cam.zoom * 100)}%</output>
      </label>
      <div className="row tight">
        <button className="chip" onClick={() => runCommand("view.fitAll")}>Ver tudo</button>
        <button className="chip" onClick={() => runCommand("view.fitSel")}>Ver seleção</button>
        <button className="chip" onClick={() => runCommand("view.zoom100")}>100%</button>
      </div>
    </div>
  );
}

// ---------------- Ferramentas ----------------

const TOOL_GROUPS: { label: string; tools: ToolId[] }[] = [
  { label: "Selecionar", tools: ["select", "lasso", "hand"] },
  { label: "Desenhar", tools: ["pen", "eraser", "laser", "laserpen"] },
  { label: "Formas", tools: ["rect", "ellipse", "diamond", "arrow", "line", "text"] },
  { label: "Mapas e grafos", tools: ["mindmap", "frame", "vertex", "edge"] },
];

export function ToolsPanel() {
  const tool = useTool((s) => s.tool);
  const brush = useTool((s) => s.brush);
  const brushes = allCommands().filter((c) => c.cat === "Pincéis");
  return (
    <div className="toolspanel">
      {TOOL_GROUPS.map((g) => (
        <div key={g.label}>
          <div className="sec-title">{g.label}</div>
          <div className="tool-grid">
            {g.tools.map((t) => {
              const c = allCommands().find((x) => x.id === `tool.${t}`);
              return (
                <button key={t} className={tool === t ? "tool-cell on" : "tool-cell"} onClick={() => runCommand(`tool.${t}`)} aria-pressed={tool === t}>
                  <span>{c?.label}</span><kbd>{shortcutOf(`tool.${t}`)}</kbd>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="sec-title">Pincéis (subferramentas da caneta)</div>
      <div className="tool-grid">
        {brushes.map((c) => (
          <button key={c.id} className={tool === "pen" && `brush.${brush}` === c.id ? "tool-cell on" : "tool-cell"} onClick={() => runCommand(c.id)}>
            <span>{c.label.replace("Pincel: ", "")}</span><kbd>{shortcutOf(c.id)}</kbd>
          </button>
        ))}
      </div>
      <p className="hint small">Clique com o botão direito numa ferramenta da barra para ver as alternativas; troque qualquer atalho em Configurações → Atalhos.</p>
    </div>
  );
}

// ---------------- Biblioteca / Materiais / Texto / Atalhos ----------------

export const LibraryPanel = () => <div className="libpanel"><BlockTiles /></div>;

export function MaterialsPanel() {
  const [cat, setCat] = useState<string>(TEMPLATE_CATEGORIES[0].id);
  const list = TEMPLATES.filter((t) => t.category === cat);
  const previews = useMemo(() => new Map(list.map((t) => [t.id, t.build()])), [cat]);
  return (
    <div className="matpanel">
      <div className="kb-cats">
        {TEMPLATE_CATEGORIES.map((c) => <button key={c.id} className={cat === c.id ? "chip on" : "chip"} onClick={() => setCat(c.id)}>{c.label}</button>)}
      </div>
      <div className="mat-grid">
        {list.map((t) => (
          <button key={t.id} className="tile" title={t.hint} onClick={() => insertTemplate(t)}>
            <ElementsPreview elements={previews.get(t.id) ?? []} w={120} h={80} pad={6} />
            <span>{t.name}</span>
          </button>
        ))}
      </div>
      <button className="chip wide" onClick={() => useUI.getState().setTemplatesOpen(true, cat)}>Abrir a galeria completa</button>
    </div>
  );
}

export const TextPanel = () => <TextPanelBody />;
export const ShortcutsPanel = () => <ShortcutEditor compact />;
