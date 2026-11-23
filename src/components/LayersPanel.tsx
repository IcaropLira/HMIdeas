// Painel de camadas: lista (de cima para baixo, como no Photoshop), miniatura de cada camada, ativa, visível, travada,
// opacidade, renomear, nova/duplicar/mesclar/apagar e mover a seleção. Tudo o que muda a página entra no desfazer;
// a camada ativa é só interface.
import { useState } from "react";
import { Icon } from "./Icon";
import { Layer } from "../core/model";
import {
  ZMove, activeLayerId, addLayer, duplicateLayer, elementsOfLayer, mergeDown, moveLayer, moveToLayer, patchLayer, removeLayer, reorder, useLayerUI,
} from "../core/layers";
import { selectActivePage, useDoc, useSel } from "../core/store";
import { useUI } from "../core/ui";
import { thumbPath, thumbViewBox } from "../render/svgThumb";

function LayerThumb({ layer }: { layer: Layer }) {
  const page = useDoc((s) => selectActivePage(s));
  const all = page.elements.map(thumbPath);
  const vb = thumbViewBox(all);
  const mine = elementsOfLayer(page, layer.id).map(thumbPath);
  return (
    <svg className="layer-thumb" viewBox={vb} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x="-1e6" y="-1e6" width="2e6" height="2e6" fill={page.background} />
      {mine.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill} stroke={p.stroke ?? "none"} strokeWidth={p.sw} strokeLinecap="round" strokeLinejoin="round" opacity={p.alpha} strokeDasharray={p.dash ?? undefined} />
      ))}
    </svg>
  );
}

export function zSelection(how: ZMove) {
  const ids = useSel.getState().ids;
  if (!ids.length) return;
  useDoc.getState().editPage((p) => ({ ...p, elements: reorder(p.elements, ids, how) }));
}

export function LayersPanel() {
  const page = useDoc((s) => selectActivePage(s));
  useLayerUI((s) => s.active[page.id]); // re-renderiza quando a ativa muda
  const sel = useSel((s) => s.ids);
  const active = activeLayerId(page);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const edit = useDoc.getState().editPage;
  const setActive = (id: string) => useLayerUI.getState().setActive(page.id, id);
  const layers = [...page.layers].reverse(); // de cima para baixo
  const cur = page.layers.find((l) => l.id === active)!;
  const idx = page.layers.indexOf(cur);

  return (
    <div className="panel layerspanel" role="dialog" aria-label="Camadas">
      <div className="layer-head">
        <span className="sec-title">Camadas</span>
        <div className="row tight">
          <button className="btn sm" title="Nova camada (acima da ativa)" aria-label="Nova camada" onClick={() => {
            let id = "";
            edit((p) => { const r = addLayer(p, active); id = r.id; return r.page; });
            if (id) setActive(id);
          }}><Icon><path d="M12 5v14M5 12h14" /></Icon></button>
          <button className="btn sm" title="Duplicar camada" aria-label="Duplicar camada" onClick={() => {
            let id = "";
            edit((p) => { const r = duplicateLayer(p, active); id = r.id; return r.page; });
            if (id) setActive(id);
          }}><Icon><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15V6a1 1 0 011-1h9" /></Icon></button>
          <button className="btn sm" disabled={idx <= 0} title="Mesclar com a de baixo" aria-label="Mesclar com a de baixo" onClick={() => {
            const below = page.layers[idx - 1]?.id;
            edit((p) => mergeDown(p, active));
            if (below) setActive(below);
          }}><Icon><path d="M12 4v12M7 11l5 5 5-5M5 20h14" /></Icon></button>
          <button className="btn sm danger" disabled={page.layers.length <= 1} title="Apagar camada (e o que está nela)" aria-label="Apagar camada" onClick={() => {
            const n = elementsOfLayer(page, active).length;
            edit((p) => removeLayer(p, active));
            useUI.getState().showToast(n ? `Camada apagada com ${n} ${n === 1 ? "elemento" : "elementos"}. Ctrl+Z desfaz.` : "Camada apagada.");
          }}><Icon><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></Icon></button>
        </div>
      </div>

      <ul className="layer-list" role="listbox" aria-label="Camadas da página">
        {layers.map((l) => {
          const n = elementsOfLayer(page, l.id).length;
          const on = l.id === active;
          return (
            <li key={l.id} role="option" aria-selected={on} className={on ? "layer on" : "layer"} onClick={() => setActive(l.id)}>
              <button className={l.visible ? "lbtn" : "lbtn off"} aria-label={l.visible ? "Ocultar camada" : "Mostrar camada"} title={l.visible ? "Ocultar" : "Mostrar"}
                onClick={(e) => { e.stopPropagation(); edit((p) => patchLayer(p, l.id, { visible: !l.visible })); }}>
                <Icon size={18}>{l.visible
                  ? <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>
                  : <><path d="M4 4l16 16" /><path d="M9.9 5.8A9 9 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 01-3 3.7M6.3 7.6A17 17 0 002.5 12S6 18.5 12 18.5a9 9 0 004-.9" /></>}</Icon>
              </button>
              <LayerThumb layer={l} />
              <div className="layer-name">
                {editing === l.id ? (
                  <input className="rename" autoFocus value={name} onClick={(e) => e.stopPropagation()} onChange={(e) => setName(e.target.value)}
                    onBlur={() => { edit((p) => patchLayer(p, l.id, { name })); setEditing(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(null); }} />
                ) : (
                  <b onDoubleClick={(e) => { e.stopPropagation(); setEditing(l.id); setName(l.name); }} title="Duplo clique para renomear">{l.name}</b>
                )}
                <small>{n} {n === 1 ? "elemento" : "elementos"}{l.opacity < 1 ? ` · ${Math.round(l.opacity * 100)}%` : ""}</small>
              </div>
              <button className={l.locked ? "lbtn lock on" : "lbtn lock"} aria-label={l.locked ? "Destravar camada" : "Travar camada"} title={l.locked ? "Travada (não seleciona nem apaga)" : "Travar"}
                onClick={(e) => { e.stopPropagation(); edit((p) => patchLayer(p, l.id, { locked: !l.locked })); }}>
                <Icon size={16}>{l.locked ? <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></> : <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 017.5-2" /></>}</Icon>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="row tight">
        <button className="chip sm" disabled={idx >= page.layers.length - 1} onClick={() => edit((p) => moveLayer(p, active, 1))}>Subir camada</button>
        <button className="chip sm" disabled={idx <= 0} onClick={() => edit((p) => moveLayer(p, active, -1))}>Descer camada</button>
        <button className="chip sm" onClick={() => { setEditing(active); setName(cur.name); }}>Renomear</button>
      </div>
      <label className="slider">
        <span>Opacidade de “{cur.name}”</span>
        <input type="range" min={0.05} max={1} step={0.05} value={cur.opacity} onChange={(e) => edit((p) => patchLayer(p, active, { opacity: +e.target.value }))} />
        <output>{Math.round(cur.opacity * 100)}%</output>
      </label>

      <div className="sec-title">Seleção ({sel.length})</div>
      <div className="row tight">
        <button className="chip sm" disabled={!sel.length} onClick={() => edit((p) => moveToLayer(p, sel, active))} title="Leva os elementos selecionados para a camada ativa">Mover para “{cur.name}”</button>
      </div>
      <div className="row tight" aria-label="Ordem da seleção">
        <button className="chip sm" disabled={!sel.length} onClick={() => zSelection("front")} title="Ctrl+Shift+]">Trazer para frente</button>
        <button className="chip sm" disabled={!sel.length} onClick={() => zSelection("forward")} title="Ctrl+]">Avançar</button>
        <button className="chip sm" disabled={!sel.length} onClick={() => zSelection("backward")} title="Ctrl+[">Recuar</button>
        <button className="chip sm" disabled={!sel.length} onClick={() => zSelection("back")} title="Ctrl+Shift+[">Enviar para trás</button>
      </div>
      <p className="hint">O que você desenha entra na camada ativa (destacada). Camadas ocultas ou travadas não são selecionadas nem apagadas.</p>
    </div>
  );
}
