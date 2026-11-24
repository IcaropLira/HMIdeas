// Canetas favoritas (0.12): um toque troca pincel + cor + espessura + opacidade de uma vez.
import { useState } from "react";
import { getBrush } from "../core/brushes";
import { useTool } from "../core/store";
import { activeFavPen, addFavPen, applyFavPen, removeFavPen, useToolKit } from "../core/toolKit";
import { useUI } from "../core/ui";
import { Icon } from "./Icon";

export function FavPens({ compact = false }: { compact?: boolean }) {
  const pens = useToolKit((k) => k.pens);
  useTool((t) => `${t.tool}|${t.brush}|${t.color}|${t.width}|${t.opacity}`); // redesenha ao trocar a caneta
  const [edit, setEdit] = useState(false);
  const on = activeFavPen();
  const add = () => {
    const p = addFavPen();
    useUI.getState().showToast(p ? "Caneta guardada nas favoritas." : "Essa caneta já está nas favoritas.");
  };
  return (
    <div className={compact ? "favpens compact" : "favpens"} role="group" aria-label="Canetas favoritas">
      {pens.map((p) => {
        const b = getBrush(p.brush);
        const d = Math.max(4, Math.min(20, p.width * b.size * 1.6));
        return (
          <span key={p.id} className="favpen-wrap">
            <button className={on === p.id ? "favpen on" : "favpen"} onClick={() => applyFavPen(p.id)} aria-label={`${b.label} ${p.color}, espessura ${p.width}`} title={`${b.label} · ${p.width} · ${Math.round(p.opacity * 100)}%`}>
              <span className="favpen-dot" style={{ width: d, height: d, background: p.color, opacity: Math.max(0.35, p.opacity * b.opacity) }} />
            </button>
            {edit && <button className="favpen-x" onClick={() => removeFavPen(p.id)} aria-label="Tirar das favoritas"><Icon size={12}><path d="M6 6l12 12M18 6L6 18" /></Icon></button>}
          </span>
        );
      })}
      <button className="favpen add" onClick={add} aria-label="Guardar a caneta atual" title="Guardar a caneta atual (pincel, cor, espessura)"><Icon size={16}><path d="M12 5v14M5 12h14" /></Icon></button>
      {pens.length > 0 && <button className={edit ? "favpen edit on" : "favpen edit"} onClick={() => setEdit(!edit)} aria-pressed={edit} aria-label="Editar favoritas" title="Tirar canetas"><Icon size={15}><path d="M4 20l4-1 11-11a2.1 2.1 0 00-3-3L5 16l-1 4z" /></Icon></button>}
    </div>
  );
}
