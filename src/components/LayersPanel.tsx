// Painel de camadas: lista (de cima para baixo, como no Photoshop), miniatura de cada camada, ativa, visível, travada,
// opacidade, renomear, nova/duplicar/mesclar/apagar e mover a seleção. Tudo o que muda a página entra no desfazer;
// a camada ativa é só interface.
import { useState } from "react";
import { Icon } from "./Icon";
import { BLEND_GROUPS, LAYER_BLENDS, LAYER_COLORS, Layer } from "../core/model";
import { LayerFilter, clipBase, filterLayers } from "../core/layerPro";
import * as LA from "./layerActions";
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
  const [filter, setFilter] = useState<LayerFilter>({ text: "", kind: "all" });
  const shown = new Set(filterLayers(page.layers, filter).map((l) => l.id));
  const layers = [...page.layers].reverse().filter((l) => shown.has(l.id)); // de cima para baixo
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
          <button className="btn sm" disabled={idx >= page.layers.length - 1} title="Subir camada" aria-label="Subir camada" onClick={() => edit((p) => moveLayer(p, active, 1))}><Icon><path d="M12 19V5M6 11l6-6 6 6" /></Icon></button>
          <button className="btn sm" disabled={idx <= 0} title="Descer camada" aria-label="Descer camada" onClick={() => edit((p) => moveLayer(p, active, -1))}><Icon><path d="M12 5v14M6 13l6 6 6-6" /></Icon></button>
          <button className="btn sm danger" disabled={page.layers.length <= 1} title="Apagar camada (e o que está nela)" aria-label="Apagar camada" onClick={() => {
            const n = elementsOfLayer(page, active).length;
            edit((p) => removeLayer(p, active));
            useUI.getState().showToast(n ? `Camada apagada com ${n} ${n === 1 ? "elemento" : "elementos"}. Ctrl+Z desfaz.` : "Camada apagada.");
          }}><Icon><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></Icon></button>
        </div>
      </div>

      <div className="layer-tools">
        <button className="btn sm" title="Nova camada via cópia (Ctrl+J)" aria-label="Camada via cópia" onClick={LA.viaCopy}><Icon><rect x="4" y="4" width="11" height="11" rx="2" /><rect x="9" y="9" width="11" height="11" rx="2" /></Icon></button>
        <button className="btn sm" disabled={!sel.length} title="Nova camada via recorte (Ctrl+Shift+J)" aria-label="Camada via recorte" onClick={LA.viaCut}><Icon><circle cx="6" cy="7" r="2.5" /><circle cx="6" cy="17" r="2.5" /><path d="M8 8.5l12 7M8 15.5l12-7" /></Icon></button>
        <button className={cur.clip ? "btn sm on" : "btn sm"} disabled={idx <= 0 && !cur.clip} title="Máscara de recorte: só aparece onde a camada de baixo tem conteúdo (Ctrl+Alt+C)" aria-label="Máscara de recorte" aria-pressed={!!cur.clip} onClick={() => LA.toggleClip(active)}><Icon><path d="M7 4v9a3 3 0 003 3h9" /><path d="M15 12l4 4-4 4" /></Icon></button>
        <button className="btn sm" title="Mostrar só a camada ativa (Alt+clique no olho)" aria-label="Solo" onClick={() => LA.soloActive(active)}><Icon><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></Icon></button>
        <button className="btn sm" disabled={page.layers.filter((l) => l.visible).length < 2} title="Mesclar visíveis (Ctrl+Alt+Shift+E)" aria-label="Mesclar visíveis" onClick={LA.mergeAllVisible}><Icon><path d="M4 6h16M4 12h16" /><path d="M12 14v6M9 17l3 3 3-3" /></Icon></button>
        <button className="btn sm" disabled={page.layers.length < 2} title="Achatar imagem (tudo numa camada)" aria-label="Achatar imagem" onClick={LA.flattenImage}><Icon><path d="M4 16l8 4 8-4M4 12l8 4 8-4" /></Icon></button>
      </div>

      <div className="layer-filter">
        <input type="search" value={filter.text} placeholder="Procurar camada ou modo" aria-label="Procurar camada" onChange={(e) => setFilter({ ...filter, text: e.target.value })} />
        <select value={filter.kind} aria-label="Filtrar camadas" onChange={(e) => setFilter({ ...filter, kind: e.target.value as LayerFilter["kind"] })}>
          <option value="all">Todas</option><option value="visible">Visíveis</option><option value="hidden">Ocultas</option><option value="locked">Travadas</option>
          <option value="clip">Recortadas</option><option value="blend">Com mesclagem</option><option value="color">Com cor</option>
        </select>
      </div>

      <ul className="layer-list" role="listbox" aria-label="Camadas da página">
        {layers.map((l) => {
          const n = elementsOfLayer(page, l.id).length;
          const on = l.id === active;
          return (
            <li key={l.id} role="option" aria-selected={on} className={["layer", on && "on", clipBase(page.layers, page.layers.indexOf(l)) !== null && "clipped"].filter(Boolean).join(" ")} onClick={() => setActive(l.id)}
              style={l.color ? { boxShadow: `inset 4px 0 0 ${LAYER_COLORS.find((c) => c.id === l.color)?.hex}` } : undefined}>
              <button className={l.visible ? "lbtn" : "lbtn off"} aria-label={l.visible ? "Ocultar camada" : "Mostrar camada"} title={l.visible ? "Ocultar (Alt+clique: só esta)" : "Mostrar (Alt+clique: só esta)"}
                onClick={(e) => { e.stopPropagation(); if (e.altKey) { LA.soloActive(l.id); return; } edit((p) => patchLayer(p, l.id, { visible: !l.visible })); }}>
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
                <small>{n} {n === 1 ? "elemento" : "elementos"}{l.opacity < 1 ? ` · ${Math.round(l.opacity * 100)}%` : ""}{l.blend ? ` · ${LAYER_BLENDS.find((b) => b.id === l.blend)?.label}` : ""}</small>
              </div>
              <button className={l.locked ? "lbtn lock on" : "lbtn lock"} aria-label={l.locked ? "Destravar camada" : "Travar camada"} title={l.locked ? "Travada (não seleciona nem apaga)" : "Travar"}
                onClick={(e) => { e.stopPropagation(); edit((p) => patchLayer(p, l.id, { locked: !l.locked })); }}>
                <Icon size={16}>{l.locked ? <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></> : <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 017.5-2" /></>}</Icon>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="layer-props" aria-label={`Camada ativa: ${cur.name}`}>
        <label className="prow">
          <span>Opacidade</span>
          <input type="range" min={0} max={1} step={0.01} value={cur.opacity} onChange={(e) => edit((p) => patchLayer(p, active, { opacity: +e.target.value }))} aria-label={`Opacidade de ${cur.name}`} />
          <output>{Math.round(cur.opacity * 100)}%</output>
        </label>
        <label className="prow">
          <span>Mistura</span>
          <select className="ob-select" value={cur.blend ?? "normal"} aria-label="Mistura da camada"
            onChange={(e) => { const v = e.target.value; edit((p) => ({ ...p, layers: p.layers.map((l) => (l.id === active ? { ...l, blend: v === "normal" ? undefined : (v as typeof l.blend) } : l)) })); }}>
            {BLEND_GROUPS.map((g) => <optgroup key={g.label} label={g.label}>{g.modes.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</optgroup>)}
          </select>
        </label>
        <div className="prow layer-colors" role="radiogroup" aria-label="Cor da camada">
          <span>Cor</span>
          <button role="radio" aria-checked={!cur.color} className={!cur.color ? "lcol none on" : "lcol none"} title="Sem cor" aria-label="Sem cor" onClick={() => edit((p) => patchLayer(p, active, { color: undefined }))} />
          {LAYER_COLORS.map((c) => (
            <button key={c.id} role="radio" aria-checked={cur.color === c.id} className={cur.color === c.id ? "lcol on" : "lcol"} style={{ background: c.hex }} title={c.label} aria-label={c.label}
              onClick={() => edit((p) => patchLayer(p, active, { color: c.id }))} />
          ))}
        </div>
      </div>
      {sel.length > 0 && (
        <button className="chip wide" onClick={() => edit((p) => moveToLayer(p, sel, active))} title="Leva os elementos selecionados para a camada ativa">
          Mover {sel.length === 1 ? "o selecionado" : `os ${sel.length} selecionados`} para “{cur.name}”
        </button>
      )}
    </div>
  );
}
