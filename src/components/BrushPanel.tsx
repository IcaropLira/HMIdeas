import { listBrushes, getBrush } from "../core/brushes";
import { useTool } from "../core/store";
import { BrushPreview } from "./BrushPreview";

/** Painel de pincéis: grade com pré-visualização + opacidade. */
export function BrushPanel() {
  const t = useTool();
  const brushes = listBrushes();
  const current = getBrush(t.brush);

  return (
    <div className="panel" role="dialog" aria-label="Pincéis">
      <div className="brushes" role="radiogroup" aria-label="Pincel">
        {brushes.map((b) => (
          <button
            key={b.id}
            role="radio"
            aria-checked={current.id === b.id}
            className={current.id === b.id ? "brush on" : "brush"}
            title={b.hint}
            onClick={() => {
              t.setBrush(b.id);
              t.setTool("pen"); // escolher um pincel é querer desenhar com ele
            }}
          >
            <BrushPreview brush={b} color={t.color} width={t.width} sens={t.pressureSens} taper={t.taper} opacity={t.opacity} />
            <span>{b.label}</span>
          </button>
        ))}
      </div>
      <label className="slider">
        <span>Opacidade</span>
        <input type="range" min={0.1} max={1} step={0.05} value={t.opacity} onChange={(e) => t.set({ opacity: +e.target.value })} />
        <output>{Math.round(t.opacity * 100)}%</output>
      </label>
      <p className="hint">{current.hint} Espessura, pressão e afilamento ficam na barra e em “Ajustes da caneta”.</p>
    </div>
  );
}
