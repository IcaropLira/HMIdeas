// Opções contextuais da ferramenta ativa e da seleção. A mesma lógica aparece em dois formatos: "bar" (barra de opções
// embaixo do menu, uma linha) e "panel" (painel Propriedades, empilhado).
import { EnginePicker } from "./EnginePicker";
import { FavPens } from "./FavPens";
import { CATEGORIES, ElCategory } from "../core/handwriting";
import { ReactNode } from "react";
import { ARROW_HEADS, ArrowHead, HirakuElement, LineStyle, isLinear } from "../core/model";
import { selectActivePage, useDoc, useSel, useTool } from "../core/store";
import { getBrush, listBrushes } from "../core/brushes";
import { applyColor } from "../core/actions";
import { useGraphTool } from "../core/graphEdit";
import { selectedGroup, useGroupCtx, renameUnit } from "../core/groupActions";
import { groupMap } from "../core/groups";
import { useEdit } from "../core/textEdit";
import { showPanel } from "../core/workspace";
import { useUI } from "../core/ui";
import { TextBar, TextPanelBody } from "./TextControls";
import { Icon } from "./Icon";
import { runCommand, withKey } from "./commands";

type Mode = "bar" | "panel";

const COLORS = ["#1B2233", "#2F4B8F", "#C8372D", "#2F7D5B", "#D98A1F", "#7B4FB5"];
const FILLS: (string | null)[] = [null, "#C9D6F2", "#F6D5D2", "#CFE8DB", "#F7E3BD", "#DDE1EA", "#FFFFFF"];

function Field({ label, children, mode }: { label: string; children: ReactNode; mode: Mode }) {
  return mode === "bar"
    ? <div className="ob-field" title={label}><span className="ob-label">{label}</span>{children}</div>
    : <div className="pp-field"><div className="sec-title">{label}</div>{children}</div>;
}

function Range({ value, min, max, step, onChange, fmt, label }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string; label: string }) {
  return (
    <label className="ob-range">
      <span className="sr">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <output>{fmt(value)}</output>
    </label>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, ReactNode, string?][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l, tip]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? "seg-btn on" : "seg-btn"} onClick={() => onChange(v)} title={tip}>{l}</button>
      ))}
    </div>
  );
}

function Swatches({ value, onPick, list = COLORS, label, more }: { value: string | null; onPick: (c: string | null) => void; list?: (string | null)[]; label: string; more?: boolean }) {
  return (
    <div className="row tight" role="radiogroup" aria-label={label}>
      {list.map((c) => (
        <button key={String(c)} role="radio" aria-checked={(value ?? null)?.toUpperCase?.() === c?.toUpperCase() || value === c}
          aria-label={c ?? "Nenhum"} title={c ?? "Nenhum"}
          className={((value ?? null)?.toUpperCase?.() === c?.toUpperCase() || value === c ? "swatch sm on" : "swatch sm") + (c === null ? " none" : "")}
          style={c ? { background: c } : undefined} onClick={() => onPick(c)} />
      ))}
      {more && <button className="swatch sm more" onClick={() => showPanel("colors")} aria-label="Mais cores" title="Painel de cores" />}
    </div>
  );
}

const lineStyles: [LineStyle, ReactNode, string][] = [
  ["solid", <svg key="s" width="26" height="10"><path d="M2 5h22" stroke="currentColor" strokeWidth="2" /></svg>, "Contínuo"],
  ["dashed", <svg key="d" width="26" height="10"><path d="M2 5h22" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" /></svg>, "Tracejado"],
  ["dotted", <svg key="p" width="26" height="10"><path d="M2 5h22" stroke="currentColor" strokeWidth="2" strokeDasharray="0.1 4" strokeLinecap="round" /></svg>, "Pontilhado"],
];

/** Atualiza os selecionados com `fn` (um passo de desfazer). */
function patchSelection(fn: (e: HirakuElement) => HirakuElement | null) {
  const ids = new Set(useSel.getState().ids);
  const els = selectActivePage(useDoc.getState()).elements.filter((e) => ids.has(e.id));
  const out = els.map((e) => fn(e)).filter((e): e is HirakuElement => !!e && !els.includes(e));
  if (out.length) useDoc.getState().updateElements(out);
}

const headSel = (value: ArrowHead, onChange: (h: ArrowHead) => void, label: string) => (
  <select className="ob-select" value={value} onChange={(e) => onChange(e.target.value as ArrowHead)} aria-label={label}>
    {ARROW_HEADS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
  </select>
);

/** Opções da FERRAMENTA (sem seleção). */
/** Filtro por tipo (laço/caixa/borracha): nenhum marcado = tudo. */
function CatFilter({ value, onChange, label }: { value: ElCategory[]; onChange: (v: ElCategory[]) => void; label: string }) {
  return (
    <div className="cat-filter" role="group" aria-label={label}>
      <button className={!value.length ? "chip on" : "chip"} aria-pressed={!value.length} onClick={() => onChange([])}>Tudo</button>
      {CATEGORIES.map((c) => {
        const on = value.includes(c.id);
        return <button key={c.id} className={on ? "chip on" : "chip"} aria-pressed={on} title={c.hint} onClick={() => onChange(on ? value.filter((x) => x !== c.id) : [...value, c.id])}>{c.label}</button>;
      })}
    </div>
  );
}

export function ToolOptions({ mode }: { mode: Mode }) {
  const t = useTool();
  const graph = useGraphTool();
  const editing = useEdit((s) => !!s.session);
  const tool = t.tool;
  if (editing || tool === "text") return mode === "bar" ? <TextBar /> : <TextPanelBody />;

  if (tool === "pen") {
    const b = getBrush(t.brush);
    return (
      <>
        <Field label="Pincel" mode={mode}>
          <select className="ob-select" value={b.id} onChange={(e) => t.setBrush(e.target.value)} aria-label="Pincel">
            {listBrushes().map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </Field>
        <Field label="Motor" mode={mode}>{mode === "bar" ? <EnginePicker compact /> : <EnginePicker />}</Field>
        <Field label="Favoritas" mode={mode}><FavPens compact={mode === "bar"} /></Field>
        <Field label="Cor" mode={mode}><Swatches label="Cor" value={t.color} onPick={(c) => c && applyColor(c, { remember: false })} more /></Field>
        <Field label="Espessura" mode={mode}><Range label="Espessura" value={t.width} min={1} max={14} step={0.5} onChange={(v) => t.set({ width: v })} fmt={(v) => `${v}`} /></Field>
        <Field label="Opacidade" mode={mode}><Range label="Opacidade" value={t.opacity} min={0.05} max={1} step={0.05} onChange={(v) => t.set({ opacity: v })} fmt={(v) => `${Math.round(v * 100)}%`} /></Field>
        <Field label="Estabilizar" mode={mode}><Range label="Estabilização" value={t.smoothing} min={0} max={0.9} step={0.05} onChange={(v) => t.set({ smoothing: v })} fmt={(v) => `${Math.round((v / 0.9) * 100)}%`} /></Field>
        <button className={t.recognize ? "chip on" : "chip"} aria-pressed={t.recognize} onClick={() => t.set({ recognize: !t.recognize })} title={withKey("Reconhecer formas", "tool.recognize")}>Reconhecer formas</button>
        <button className={t.holdShape ? "chip on" : "chip"} aria-pressed={t.holdShape} onClick={() => t.set({ holdShape: !t.holdShape })} title="Pare a caneta no fim do traço por meio segundo: vira linha, círculo, retângulo…">Segurar = forma</button>
        <button className={t.scribbleErase ? "chip on" : "chip"} aria-pressed={t.scribbleErase} onClick={() => t.set({ scribbleErase: !t.scribbleErase })} title="Rabisque em vai-e-vem por cima de algo para apagar">Rabisco apaga</button>
        <button className="chip" onClick={() => runCommand("view.zoomWriter")} title={withKey("Janela de zoom para escrever", "view.zoomWriter")}>Janela de zoom</button>
        {mode === "panel" && <button className="chip" onClick={() => showPanel("brushes")}>Personalizar pincéis…</button>}
      </>
    );
  }
  if (tool === "eraser") {
    return (
      <>
        <Field label="Modo" mode={mode}><Seg label="Modo da borracha" value={t.eraserMode} onChange={(v) => t.set({ eraserMode: v })} options={[["stroke", "Traço inteiro"], ["pixel", "Pixel"]]} /></Field>
        <Field label="Tamanho" mode={mode}><Range label="Tamanho" value={t.eraserSize} min={10} max={80} step={2} onChange={(v) => t.set({ eraserSize: v })} fmt={(v) => `${v}px`} /></Field>
        <button className={t.eraserPressure ? "chip on" : "chip"} aria-pressed={t.eraserPressure} onClick={() => t.set({ eraserPressure: !t.eraserPressure })}>Pressão muda o tamanho</button>
        <Field label="Apaga" mode={mode}><CatFilter label="O que a borracha apaga" value={t.eraserFilter} onChange={(v) => t.set({ eraserFilter: v })} /></Field>
      </>
    );
  }
  if (tool === "rect" || tool === "ellipse" || tool === "diamond") {
    return (
      <>
        <Field label="Contorno" mode={mode}><Swatches label="Cor do contorno" value={t.color} onPick={(c) => c && applyColor(c, { remember: false })} more /></Field>
        <Field label="Preenchimento" mode={mode}><Swatches label="Preenchimento" value={t.fill} list={FILLS} onPick={(c) => t.set({ fill: c })} /></Field>
        <Field label="Traço" mode={mode}><Seg label="Estilo do contorno" value={t.lineStyle} onChange={(v) => t.set({ lineStyle: v })} options={lineStyles} /></Field>
        <Field label="Espessura" mode={mode}><Range label="Espessura" value={t.width} min={1} max={14} step={0.5} onChange={(v) => t.set({ width: v })} fmt={(v) => `${v}`} /></Field>
        {tool === "rect" && <button className={t.rounded ? "chip on" : "chip"} aria-pressed={t.rounded} onClick={() => t.set({ rounded: !t.rounded })}>Cantos arredondados</button>}
      </>
    );
  }
  if (tool === "arrow" || tool === "line") {
    return (
      <>
        <Field label="Cor" mode={mode}><Swatches label="Cor" value={t.color} onPick={(c) => c && applyColor(c, { remember: false })} more /></Field>
        <Field label="Início" mode={mode}>{headSel(t.startHead, (h) => t.set({ startHead: h }), "Ponta inicial")}</Field>
        <Field label="Fim" mode={mode}>{headSel(t.endHead, (h) => t.set({ endHead: h }), "Ponta final")}</Field>
        <Field label="Traço" mode={mode}><Seg label="Estilo da linha" value={t.lineStyle} onChange={(v) => t.set({ lineStyle: v })} options={lineStyles} /></Field>
        <Field label="Forma" mode={mode}><Seg label="Forma da linha" value={t.curved ? "c" : "r"} onChange={(v) => t.set({ curved: v === "c" })} options={[["r", "Reta"], ["c", "Curva"]]} /></Field>
        <Field label="Espessura" mode={mode}><Range label="Espessura" value={t.width} min={1} max={14} step={0.5} onChange={(v) => t.set({ width: v })} fmt={(v) => `${v}`} /></Field>
      </>
    );
  }
  if (tool === "laser" || tool === "laserpen") {
    return (
      <>
        <Field label="Tipo" mode={mode}><Seg label="Tipo de laser" value={tool} onChange={(v) => t.setTool(v)} options={[["laser", "● Ponteiro"], ["laserpen", "✎ Caneta laser"]]} /></Field>
        <Field label="Cor" mode={mode}><Swatches label="Cor do laser" value={t.laserColor} list={["#FF3B30", "#FF9500", "#FFD60A", "#34C759", "#0A84FF", "#BF5AF2"]} onPick={(c) => c && t.set({ laserColor: c })} /></Field>
        {tool === "laser"
          ? <Field label="Rastro" mode={mode}><Range label="Rastro" value={t.laserTrail} min={0} max={2000} step={50} onChange={(v) => t.set({ laserTrail: v })} fmt={(v) => (v === 0 ? "só a bolinha" : `${(v / 1000).toFixed(2)} s`)} /></Field>
          : <Field label="Some em" mode={mode}><Range label="Some em" value={t.laserHold} min={300} max={10000} step={100} onChange={(v) => t.set({ laserHold: v })} fmt={(v) => `${(v / 1000).toFixed(1)} s`} /></Field>}
      </>
    );
  }
  if (tool === "vertex" || tool === "edge") {
    return (
      <>
        <button className={graph.directed ? "chip on" : "chip"} aria-pressed={graph.directed} onClick={() => graph.set({ directed: !graph.directed })}>Direcionada (seta)</button>
        <button className={graph.weighted ? "chip on" : "chip"} aria-pressed={graph.weighted} onClick={() => graph.set({ weighted: !graph.weighted })}>Ponderada (peso)</button>
        <span className="ob-hint">{tool === "vertex" ? "Toque no vazio cria (1, 2, 3…); arraste de um vértice para ligar. Tab no vértice cria um vizinho." : "Arraste de um vértice a outro; soltar no vazio cria um vértice."} Com Selecionar: Shift+arrastar de um vértice = aresta dirigida, Ctrl+Shift = não dirigida.</span>
      </>
    );
  }
  if (tool === "mindmap" || tool === "frame") {
    return (
      <>
        <span className="ob-hint">{tool === "mindmap" ? "Clique no vazio = novo mapa; num nó = filho. Tab filho, Enter irmão." : "Arraste para criar um quadro; o que ficar dentro entra nele."}</span>
        <button className="chip" onClick={() => showPanel("map")}>Mapa & quadros…</button>
      </>
    );
  }
  if (tool === "tape") {
    return (
      <>
        <Field label="Cor" mode={mode}><Swatches label="Cor da fita" value={t.tapeColor} list={["#F2B33D", "#F07A8C", "#6CB6F0", "#7CCB8A", "#B49CF0", "#8A93A6", "#1B2233"]} onPick={(c) => c && t.set({ tapeColor: c })} /></Field>
        <Field label="Padrão" mode={mode}><Seg label="Padrão da fita" value={t.tapePattern} onChange={(v) => t.set({ tapePattern: v })} options={[["stripes", "Listras"], ["solid", "Lisa"], ["dots", "Bolinhas"]]} /></Field>
        <button className="chip" onClick={() => runCommand("tape.revealAll")}>Revelar todas</button>
        <button className="chip" onClick={() => runCommand("tape.hideAll")}>Esconder todas</button>
        <span className="ob-hint">Arraste por cima do que quer esconder. Com Selecionar, um toque na fita revela/esconde.</span>
      </>
    );
  }
  if (tool === "hand") {
    return <span className="ob-hint">Arraste para mover a tela. Roda do mouse + Ctrl ou pinça para zoom. Espaço segurado faz o mesmo em qualquer ferramenta.</span>;
  }
  // selecionar / laço sem seleção
  return (
    <>
      {tool === "lasso"
        ? <Field label="Laço" mode={mode}><Seg label="O que o laço pega" value={t.lassoMode} onChange={(v) => t.set({ lassoMode: v })} options={[["inside", "Só dentro"], ["touch", "Tocando"]]} /></Field>
        : <Field label="Caixa" mode={mode}><Seg label="O que a caixa pega" value={t.boxMode} onChange={(v) => t.set({ boxMode: v })} options={[["auto", "Pela direção", "→ só o que está dentro · ← tudo que a caixa toca"], ["inside", "Só dentro"], ["touch", "Tocando"]]} /></Field>}
      <Field label="Pega" mode={mode}><CatFilter label="O que o laço e a caixa pegam" value={t.selectFilter} onChange={(v) => t.set({ selectFilter: v })} /></Field>
      <button className={t.smartGuides ? "chip on" : "chip"} aria-pressed={t.smartGuides} onClick={() => t.set({ smartGuides: !t.smartGuides })} title={withKey("Guias inteligentes", "view.smartGuides")}>Guias inteligentes</button>
      <button className={t.snapGrid ? "chip on" : "chip"} aria-pressed={t.snapGrid} onClick={() => t.set({ snapGrid: !t.snapGrid })} title={withKey("Encaixar na grade", "view.snapGrid")}>Grade {t.gridSize}</button>
      {mode === "bar" && <span className="ob-hint">Shift soma à seleção · Shift+arrastar de um vértice cria aresta · Alt+arrastar duplica · duplo clique entra no grupo</span>}
    </>
  );
}

const ICONS = {
  alignL: <path d="M5 4v16M8 7h10v4H8zM8 13h6v4H8z" />, alignC: <path d="M12 4v16M6 7h12v4H6zM8 13h8v4H8z" />, alignR: <path d="M19 4v16M6 7h10v4H6zM10 13h6v4h-6z" />,
  alignT: <path d="M4 5h16M7 8h4v10H7zM13 8h4v6h-4z" />, alignM: <path d="M4 12h16M7 6h4v12H7zM13 8h4v8h-4z" />, alignB: <path d="M4 19h16M7 6h4v10H7zM13 10h4v6h-4z" />,
  distH: <path d="M4 4v16M20 4v16M9 8h6v8H9z" />, distV: <path d="M4 4h16M4 20h16M8 9h8v6H8z" />,
};

export const AlignButtons = ({ big = false }: { big?: boolean }) => (
  <div className={big ? "align-grid big" : "row tight"} role="toolbar" aria-label="Alinhar e distribuir">
    {([["align.left", ICONS.alignL, "Alinhar à esquerda"], ["align.hcenter", ICONS.alignC, "Centralizar na horizontal"], ["align.right", ICONS.alignR, "Alinhar à direita"],
      ["align.top", ICONS.alignT, "Alinhar em cima"], ["align.vcenter", ICONS.alignM, "Centralizar na vertical"], ["align.bottom", ICONS.alignB, "Alinhar embaixo"],
      ["dist.h", ICONS.distH, "Distribuir na horizontal"], ["dist.v", ICONS.distV, "Distribuir na vertical"]] as const).map(([id, ic, label]) => (
      <button key={id} className="btn sm" onClick={() => runCommand(id)} aria-label={label} title={withKey(label, id)}><Icon size={18}>{ic}</Icon></button>
    ))}
  </div>
);

/** Opções quando há SELEÇÃO (barra de opções). */
export function SelectionOptions({ mode }: { mode: Mode }) {
  const ids = useSel((s) => s.ids);
  useGroupCtx((s) => s.ctx);
  const page = useDoc((s) => selectActivePage(s));
  const idSet = new Set(ids);
  const els = page.elements.filter((e) => idSet.has(e.id));
  const grp = selectedGroup();
  const g = grp ? groupMap(page).get(grp) : null;
  const allText = els.length > 0 && els.every((e) => e.type === "text");
  const shapes = els.filter((e) => e.type === "rect" || e.type === "ellipse" || e.type === "diamond");
  const lines = els.filter(isLinear);
  const first = els[0];
  const color = first ? (first.type === "stroke" || first.type === "text" || first.type === "frame" ? first.color : first.type === "attachment" ? null : "stroke" in first ? first.stroke : null) : null;
  const opacity = first && "opacity" in first ? first.opacity : 1;

  return (
    <>
      {g && mode === "panel" && (
        <Field label="Grupo" mode={mode}>
          <input className="kb-search" defaultValue={g.name} key={g.id} onBlur={(e) => renameUnit({ kind: "group", id: g.id }, e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} aria-label="Nome do grupo" />
        </Field>
      )}
      {mode === "bar" && <span className="ob-count">{g ? `Grupo “${g.name}”` : `${els.length} ${els.length === 1 ? "objeto" : "objetos"}`}</span>}
      {allText ? (mode === "bar" ? <TextBar /> : <TextPanelBody />) : (
        <>
          {color !== null && <Field label="Cor" mode={mode}><Swatches label="Cor" value={color} onPick={(c) => c && applyColor(c)} more /></Field>}
          {shapes.length > 0 && (
            <>
              <Field label="Preenchimento" mode={mode}><Swatches label="Preenchimento" value={shapes[0].type !== "stroke" && "fill" in shapes[0] ? (shapes[0].fill as string | null) : null} list={FILLS}
                onPick={(c) => patchSelection((e) => (e.type === "rect" || e.type === "ellipse" || e.type === "diamond" ? { ...e, fill: c } : e))} /></Field>
              <Field label="Contorno" mode={mode}><Seg label="Estilo do contorno" value={"strokeStyle" in shapes[0] ? shapes[0].strokeStyle : "solid"} options={lineStyles}
                onChange={(v) => patchSelection((e) => (e.type === "rect" || e.type === "ellipse" || e.type === "diamond" ? { ...e, strokeStyle: v } : e))} /></Field>
            </>
          )}
          {lines.length > 0 && (
            <>
              <Field label="Início" mode={mode}>{headSel(lines[0].startHead, (h) => patchSelection((e) => (isLinear(e) ? { ...e, startHead: h } : e)), "Ponta inicial")}</Field>
              <Field label="Fim" mode={mode}>{headSel(lines[0].endHead, (h) => patchSelection((e) => (isLinear(e) ? { ...e, endHead: h } : e)), "Ponta final")}</Field>
              <Field label="Traço" mode={mode}><Seg label="Estilo da linha" value={lines[0].strokeStyle} options={lineStyles} onChange={(v) => patchSelection((e) => (isLinear(e) ? { ...e, strokeStyle: v } : e))} /></Field>
            </>
          )}
          {mode === "panel" && first && "opacity" in first && (
            <Field label="Opacidade" mode={mode}>
              <Range label="Opacidade" value={opacity} min={0.05} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => patchSelection((e) => ("opacity" in e ? ({ ...e, opacity: v } as HirakuElement) : e))} />
            </Field>
          )}
        </>
      )}
      {els.length > 1 && <AlignButtons />}
      {mode === "bar" && (
        <div className="row tight">
          {grp
            ? <button className="chip" onClick={() => runCommand("obj.ungroup")} title={withKey("Desagrupar", "obj.ungroup")}>Desagrupar</button>
            : els.length > 1 && <button className="chip" onClick={() => runCommand("obj.group")} title={withKey("Agrupar", "obj.group")}>Agrupar</button>}
          <button className="chip" onClick={() => runCommand("obj.lock")} title={withKey("Travar", "obj.lock")}>Travar</button>
        </div>
      )}
      {mode === "panel" && first?.type === "attachment" && first.kind === "block" && <button className="chip" onClick={() => runCommand("obj.edit")}>Editar bloco…</button>}
      {mode === "panel" && els.length > 0 && (
        <div className="row">
          <button className="chip" onClick={() => showPanel("transform")}>Transformação…</button>
          <button className="chip" onClick={() => showPanel("align")}>Alinhamento…</button>
          <button className="chip" onClick={() => showPanel("objects")}>Objetos…</button>
        </div>
      )}
    </>
  );
}

/** Barra de opções (embaixo do menu): seleção tem prioridade sobre a ferramenta. */
export function OptionsBar() {
  const hasSel = useSel((s) => s.ids.length > 0);
  const tool = useTool((s) => s.tool);
  const editing = useEdit((s) => !!s.session);
  const name = hasSel && !editing ? "Seleção" : ({ select: "Selecionar", lasso: "Laço", pen: "Caneta", eraser: "Borracha", hand: "Mão", text: "Texto", rect: "Retângulo", ellipse: "Elipse", diamond: "Losango", arrow: "Seta", line: "Linha", mindmap: "Mapa mental", frame: "Quadro", laser: "Laser", laserpen: "Caneta laser", tape: "Fita", vertex: "Vértice", edge: "Aresta" } as Record<string, string>)[tool] ?? tool;
  return (
    <div className="optionsbar" role="toolbar" aria-label={`Opções: ${name}`} data-text-ui={editing ? "" : undefined}>
      <button className="ob-name" onClick={() => showPanel("props")} title="Abrir o painel Propriedades">{name}</button>
      <span className="vsep" aria-hidden="true" />
      <div className="ob-body">{hasSel && !editing ? <SelectionOptions mode="bar" /> : <ToolOptions mode="bar" />}</div>
      <span className="ob-fill" />
      <button className="btn sm" onClick={() => useDoc.getState().undo()} aria-label="Desfazer" title={withKey("Desfazer", "edit.undo")}><Icon size={18}><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></Icon></button>
      <button className="btn sm" onClick={() => useDoc.getState().redo()} aria-label="Refazer" title={withKey("Refazer", "edit.redo")}><Icon size={18}><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 000 12h3" /></Icon></button>
      <button className="btn sm" onClick={() => useUI.getState().setLibraryOpen(true)} aria-label="Biblioteca" title={withKey("Biblioteca de blocos", "insert.library")}><Icon size={18}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><path d="M16.5 13v7M13 16.5h7" /></Icon></button>
    </div>
  );
}
