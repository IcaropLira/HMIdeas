import { useEffect, useRef, useState } from "react";
import { listBrushes, getBrush, hasBrush } from "../core/brushes";
import { CUSTOM_BRUSH_STORAGE_KEY, importBrushes, loadCustomBrushes, parseBrushPack, serializeBrushPack, serializeBrushPreset } from "../core/brushPresets";
import { useTool } from "../core/store";
import { useUI } from "../core/ui";
import { BrushPreview } from "./BrushPreview";

function downloadPreset(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Painel de pincéis: presets nativos, importados e exportação portátil. */
export function BrushPanel() {
  const t = useTool();
  const fileRef = useRef<HTMLInputElement>(null);
  const [, refresh] = useState(0);
  const brushes = listBrushes();
  const current = getBrush(t.brush);
  const custom = brushes.filter((b) => !["pen", "ballpoint", "ink", "marker", "highlighter", "brushpen"].includes(b.id));

  useEffect(() => {
    const saved = loadCustomBrushes(window.localStorage.getItem(CUSTOM_BRUSH_STORAGE_KEY));
    if (saved.length) {
      importBrushes(saved.filter((b) => !hasBrush(b.id)), listBrushes());
      refresh((v) => v + 1);
    }
  }, []);

  const saveCustom = () => {
    const items = listBrushes().filter((b) => !["pen", "ballpoint", "ink", "marker", "highlighter", "brushpen"].includes(b.id));
    window.localStorage.setItem(CUSTOM_BRUSH_STORAGE_KEY, JSON.stringify(items));
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const incoming = parseBrushPack(await file.text());
      const added = importBrushes(incoming, listBrushes());
      saveCustom();
      refresh((v) => v + 1);
      useUI.getState().showToast(`Importado${added.length === 1 ? "" : "s"}: ${added.map((b) => b.label).join(", ")}.`);
    } catch (err) {
      useUI.getState().showToast(err instanceof Error ? err.message : "Não foi possível importar o preset.");
    }
  };

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
              t.setTool("pen");
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
      <div className="brush-actions">
        <button className="chip" type="button" onClick={() => fileRef.current?.click()}>Importar preset</button>
        <button className="chip" type="button" onClick={() => downloadPreset(`${current.id}.hbrush.json`, serializeBrushPreset(current))}>Exportar selecionado</button>
        {custom.length > 0 && <button className="chip" type="button" onClick={() => downloadPreset("hmideas-brushes.json", serializeBrushPack(custom))}>Exportar meus pincéis ({custom.length})</button>}
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
      </div>
      <p className="hint">{current.hint} Espessura, pressão e afilamento ficam na barra e em “Ajustes da caneta”.</p>
      <p className="hint">Formato portátil: HMIdeas Brush v1 (.json). Arquivos nativos .kpp, .abr e .sut ainda precisam de conversor próprio; renomeá-los para .json não funciona.</p>
    </div>
  );
}
