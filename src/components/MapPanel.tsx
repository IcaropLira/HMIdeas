import { useState } from "react";
import { BRANCH_STYLES, MAP_LAYOUTS, NODE_SHAPES, NodeElement } from "../core/model";
import { FRAME_COLORS } from "../core/frames";
import {
  addChildToSelection, addSiblingToSelection, applyPreset, collapseMap, connectSelection, createRootAt,
  detachSelection, exportOutlineOfSelection, fitFrameSelection, fitToSelection, focusSelection, importOutlineText,
  recolorFrames, setBranchStyle, setMapLayout, styleSelection, toggleCollapseSelection, toggleDone, ungroupSelection,
  viewCenter, wrapSelectionInFrame,
} from "../core/mapActions";
import { BRANCH_PALETTE, NODE_ICONS, NODE_PRESETS, rootOf } from "../core/mindmap";
import { selectActivePage, useDoc, useSel } from "../core/store";
import { useUI } from "../core/ui";

const Chip = ({ on, onClick, children, title }: { on?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) => (
  <button className={on ? "chip sm on" : "chip sm"} onClick={onClick} title={title}>{children}</button>
);

/** Painel "Mapa & quadros": criar, layout, formas, códigos visuais, recolher, quadros, lista de texto. */
export function MapPanel() {
  const ids = useSel((s) => s.ids);
  const els = useDoc((s) => selectActivePage(s).elements);
  const [sub, setSub] = useState(true);
  const [text, setText] = useState("");
  const sel = els.filter((e) => ids.includes(e.id));
  const nodes = sel.filter((e): e is NodeElement => e.type === "node");
  const frames = sel.filter((e) => e.type === "frame");
  const n0 = nodes[0];
  const root = n0 ? rootOf(els, n0.id) : null;
  const same = <K extends keyof NodeElement>(k: K) => (nodes.length && nodes.every((n) => n[k] === n0[k]) ? n0[k] : undefined);

  return (
    <div className="panel mappanel" role="dialog" aria-label="Mapa mental e quadros">
      <div className="row">
        <span className="rowlabel">Criar</span>
        <Chip onClick={() => createRootAt(viewCenter())} title="Novo mapa no centro da tela (ou Tab sem seleção)">Novo mapa</Chip>
        <Chip onClick={() => addChildToSelection()} title="Tab">Filho</Chip>
        <Chip onClick={() => addSiblingToSelection()} title="Enter">Irmão</Chip>
        <Chip onClick={wrapSelectionInFrame} title="Ctrl+G">Quadro</Chip>
        <Chip onClick={() => connectSelection()} title="K: seta ligando 2 nós de qualquer ramo">Ligar 2 nós</Chip>
      </div>

      {nodes.length > 0 && (
        <>
          <div className="row" role="radiogroup" aria-label="Forma do nó">
            <span className="rowlabel">Forma</span>
            {NODE_SHAPES.map((s) => <Chip key={s.id} on={same("shape") === s.id} onClick={() => styleSelection({ shape: s.id }, sub)}>{s.label}</Chip>)}
          </div>
          <div className="row" aria-label="Códigos visuais">
            <span className="rowlabel">Código</span>
            {NODE_PRESETS.map((p) => (
              <button key={p.id} className="chip sm" title={p.label} style={{ background: p.fill ?? "#fff", borderColor: p.stroke, color: p.color }} onClick={() => applyPreset(p.id, sub)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="row" aria-label="Cor do ramo">
            <span className="rowlabel">Ramo</span>
            {BRANCH_PALETTE.map((c) => (
              <button key={c} className={same("branchColor") === c ? "swatch on" : "swatch"} aria-label={`Cor do ramo ${c}`} style={{ background: c }} onClick={() => styleSelection({ branchColor: c, ...(n0.stroke ? { stroke: c } : {}) }, sub)} />
            ))}
          </div>
          <div className="row" aria-label="Marcador">
            <span className="rowlabel">Marcar</span>
            <Chip on={same("icon") === null} onClick={() => styleSelection({ icon: null })}>Nenhum</Chip>
            {NODE_ICONS.map((i) => <Chip key={i} on={same("icon") === i} onClick={() => styleSelection({ icon: i })}>{i}</Chip>)}
            <Chip on={!!same("done")} onClick={toggleDone} title="Riscar o texto">Concluído</Chip>
          </div>
          <div className="row">
            <label className="chip sm"><input type="checkbox" checked={sub} onChange={(e) => setSub(e.target.checked)} /> Aplicar ao ramo todo</label>
          </div>
          {root && (
            <>
              <div className="row" role="radiogroup" aria-label="Layout do mapa">
                <span className="rowlabel">Layout</span>
                {MAP_LAYOUTS.map((l) => <Chip key={l.id} on={root.layout === l.id} onClick={() => setMapLayout(l.id)}>{l.label}</Chip>)}
              </div>
              <div className="row" role="radiogroup" aria-label="Estilo dos ramos">
                <span className="rowlabel">Linhas</span>
                {BRANCH_STYLES.map((b) => <Chip key={b.id} on={root.branchStyle === b.id} onClick={() => setBranchStyle(b.id)}>{b.label}</Chip>)}
              </div>
            </>
          )}
          <div className="row">
            <span className="rowlabel">Ramos</span>
            <Chip onClick={toggleCollapseSelection} title="C">Recolher/expandir</Chip>
            <Chip onClick={() => collapseMap(true)} title="Shift+C">Recolher tudo</Chip>
            <Chip onClick={() => collapseMap(true, 2)}>Só 1º nível</Chip>
            <Chip onClick={() => collapseMap(false)}>Expandir tudo</Chip>
            <Chip onClick={focusSelection}>Foco neste ramo</Chip>
            <Chip onClick={detachSelection}>Separar do mapa</Chip>
          </div>
          <div className="row">
            <span className="rowlabel">Lista</span>
            <Chip onClick={() => {
              const o = exportOutlineOfSelection();
              if (o) void navigator.clipboard?.writeText(o).then(() => useUI.getState().showToast("Mapa copiado como lista."), () => useUI.getState().showToast("Não consegui copiar."));
            }}>Copiar como lista</Chip>
          </div>
        </>
      )}

      {frames.length > 0 && (
        <div className="row">
          <span className="rowlabel">Quadro</span>
          {FRAME_COLORS.map((c) => <button key={c} className="swatch" aria-label={`Cor do quadro ${c}`} style={{ background: c }} onClick={() => recolorFrames(c)} />)}
          <Chip onClick={fitFrameSelection}>Ajustar ao conteúdo</Chip>
          <Chip onClick={ungroupSelection} title="Ctrl+Shift+G">Desfazer quadro</Chip>
          <Chip onClick={() => fitToSelection(false)}>Ir até ele</Chip>
        </div>
      )}

      <div className="row">
        <span className="rowlabel">Vista</span>
        <Chip onClick={() => fitToSelection(true)} title="Shift+1">Ver tudo</Chip>
        <Chip onClick={() => fitToSelection(false)} title="Shift+2">Ver seleção</Chip>
      </div>

      <label className="slider" style={{ display: "block" }}>
        <span>Criar mapa de uma lista (recuo = nível)</span>
        <textarea className="outline-in" rows={4} value={text} placeholder={"Tema\n  Ramo A\n    detalhe\n  Ramo B"} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="row"><Chip onClick={() => { if (importOutlineText(text)) setText(""); else useUI.getState().showToast("Escreva uma lista com recuo."); }}>Criar mapa</Chip></div>
      <p className="hint">Tab = filho, Enter = irmão, Shift+Enter = irmão acima, F2 = editar, C = recolher, setas = navegar, K = ligar 2 nós com seta (arraste também uma seta de um nó a outro). Arraste um nó sobre outro para mudar de pai; o layout se reorganiza sozinho. Arraste a bolinha numerada para expandir.</p>
    </div>
  );
}
