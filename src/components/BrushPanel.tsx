import { ReactNode, useRef, useState } from "react";
import { Brush, DEFAULT_MIN_SIZE, DEFAULT_PRESSURE_CURVE, DEFAULT_TAPER_START, getBrush, isNativeBrush, listBrushes, registerBrush } from "../core/brushes";
import {
  customBrushes, deleteCustomBrush, duplicateBrush, importBrushes, parseBrushPack, saveCustomBrushes,
  serializeBrushPack, serializeBrushPreset,
} from "../core/brushPresets";
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

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  /** Texto do valor (padrão: porcentagem). */
  fmt?: (v: number) => string;
  hint?: ReactNode;
}

function Slider({ label, value, min, max, step, onChange, fmt, hint }: SliderProps) {
  return (
    <label className="slider" title={typeof hint === "string" ? hint : undefined}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <output>{fmt ? fmt(value) : `${Math.round(value * 100)}%`}</output>
    </label>
  );
}

/** Painel de pincéis: escolher, personalizar (cópia editável), importar e exportar. */
export function BrushPanel() {
  const t = useTool();
  const fileRef = useRef<HTMLInputElement>(null);
  const [, refresh] = useState(0);
  const bump = () => refresh((v) => v + 1);
  const brushes = listBrushes();
  const current = getBrush(t.brush);
  const custom = customBrushes();
  const editable = !isNativeBrush(current.id);

  /** Altera o brush personalizado ativo. Traços já feitos não mudam: guardam uma cópia da dinâmica. */
  const patch = (p: Partial<Brush>) => {
    if (!editable) return;
    registerBrush({ ...current, ...p });
    saveCustomBrushes();
    bump();
  };

  const fork = () => {
    const copy = duplicateBrush(current);
    saveCustomBrushes();
    t.setBrush(copy.id);
    t.setTool("pen");
    bump();
    useUI.getState().showToast(`Criado “${copy.label}”. Ajuste os controles abaixo.`);
  };

  const remove = () => {
    if (!editable) return;
    deleteCustomBrush(current.id);
    saveCustomBrushes();
    t.setBrush("pen");
    bump();
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const incoming = parseBrushPack(await file.text());
      const added = importBrushes(incoming, listBrushes());
      saveCustomBrushes();
      bump();
      useUI.getState().showToast(`Importado${added.length === 1 ? "" : "s"}: ${added.map((b) => b.label).join(", ")}.`);
    } catch (err) {
      useUI.getState().showToast(err instanceof Error ? err.message : "Não foi possível importar o preset.");
    }
  };

  const minSize = current.minSize ?? DEFAULT_MIN_SIZE;
  const taperStart = current.taperStart ?? DEFAULT_TAPER_START;
  const curve = current.pressureCurve ?? DEFAULT_PRESSURE_CURVE;

  return (
    <div className="panel brushpanel" role="dialog" aria-label="Pincéis">
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
      <p className="hint">{current.hint} Espessura, pressão e afilamento globais ficam na barra e em “Ajustes da caneta”.</p>

      <details className="editor" open={editable}>
        <summary>Personalizar este pincel</summary>
        {editable ? (
          <div className="editor-body">
            <label className="field">
              <span>Nome</span>
              <input
                type="text"
                maxLength={48}
                value={current.label}
                onChange={(e) => patch({ label: e.target.value.slice(0, 48) || "Pincel" })}
              />
            </label>
            <Slider label="Tamanho (× espessura)" value={current.size} min={0.2} max={8} step={0.1} fmt={(v) => `${v.toFixed(1)}×`} onChange={(v) => patch({ size: v })} />
            <Slider label="Pressão muda a espessura" value={current.thinning} min={0} max={1} step={0.05} onChange={(v) => patch({ thinning: v })} hint="Caneta de mesa: 0% = largura fixa" />
            <Slider label="Velocidade muda a espessura" value={current.simThinning} min={0} max={1} step={0.05} onChange={(v) => patch({ simThinning: v })} hint="Mouse e dedo: rápido = mais fino" />
            <Slider label="Espessura mínima" value={minSize} min={0} max={1} step={0.05} onChange={(v) => patch({ minSize: v })} />
            <Slider label="Curva da pressão" value={curve} min={0.4} max={2.5} step={0.1} fmt={(v) => (v < 0.95 ? "macia" : v > 1.05 ? "firme" : "linear")} onChange={(v) => patch({ pressureCurve: v })} hint="Macia: engrossa com pouca força. Firme: exige mais força." />
            <Slider label="Suavizar o caminho" value={current.smoothing} min={0} max={1} step={0.05} onChange={(v) => patch({ smoothing: v })} />
            <Slider label="Estabilizador" value={current.streamline} min={0} max={1} step={0.05} onChange={(v) => patch({ streamline: v })} hint="Segura o tremido sem atrasar a ponta em traços rápidos" />
            <div className="row" role="radiogroup" aria-label="Afilamento">
              <span className="rowlabel">Afilamento</span>
              <button role="radio" aria-checked={current.taper === null} className={current.taper === null ? "chip on" : "chip"} onClick={() => patch({ taper: null })}>Da barra</button>
              <button role="radio" aria-checked={current.taper !== null} className={current.taper !== null ? "chip on" : "chip"} onClick={() => patch({ taper: current.taper ?? 0.3 })}>Fixo</button>
            </div>
            {current.taper !== null && (
              <>
                <Slider label="Afilamento do fim" value={current.taper} min={0} max={1} step={0.05} onChange={(v) => patch({ taper: v })} />
                <Slider label="Afilamento do início" value={taperStart} min={0} max={1} step={0.05} onChange={(v) => patch({ taperStart: v })} />
              </>
            )}
            <div className="row" role="radiogroup" aria-label="Pontas">
              <span className="rowlabel">Pontas</span>
              <button role="radio" aria-checked={current.round} className={current.round ? "chip on" : "chip"} onClick={() => patch({ round: true })}>Redondas</button>
              <button role="radio" aria-checked={!current.round} className={!current.round ? "chip on" : "chip"} onClick={() => patch({ round: false })}>Retas</button>
            </div>
            <Slider label="Opacidade do pincel" value={current.opacity} min={0.05} max={1} step={0.05} onChange={(v) => patch({ opacity: v })} />
            <div className="row" role="radiogroup" aria-label="Mistura">
              <span className="rowlabel">Mistura</span>
              <button role="radio" aria-checked={current.blend === "normal"} className={current.blend === "normal" ? "chip on" : "chip"} onClick={() => patch({ blend: "normal" })}>Normal</button>
              <button role="radio" aria-checked={current.blend === "multiply"} className={current.blend === "multiply" ? "chip on" : "chip"} onClick={() => patch({ blend: "multiply" })}>Multiplicar</button>
            </div>
            <div className="row">
              <button className="chip" type="button" onClick={fork}>Duplicar</button>
              <button className="chip danger" type="button" onClick={remove}>Excluir pincel</button>
            </div>
          </div>
        ) : (
          <div className="editor-body">
            <p className="hint">Os pincéis nativos não mudam. Crie uma cópia para ajustar pressão, suavização, afilamento, pontas, opacidade e mistura.</p>
            <div className="row">
              <button className="chip" type="button" onClick={fork}>Duplicar para editar</button>
            </div>
          </div>
        )}
      </details>

      <div className="brush-actions">
        <button className="chip" type="button" onClick={() => fileRef.current?.click()}>Importar preset</button>
        <button className="chip" type="button" onClick={() => downloadPreset(`${current.id}.hbrush.json`, serializeBrushPreset(current))}>Exportar selecionado</button>
        {custom.length > 0 && <button className="chip" type="button" onClick={() => downloadPreset("hmideas-brushes.json", serializeBrushPack(custom))}>Exportar meus pincéis ({custom.length})</button>}
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
      </div>
      <p className="hint">Formato portátil: HMIdeas Brush v1 (.json). Arquivos nativos .kpp, .abr e .sut ainda precisam de conversor próprio; renomeá-los para .json não funciona.</p>
    </div>
  );
}
