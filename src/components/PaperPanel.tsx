// Painel "Papel": padrão da folha com miniaturas reais (mesmo gerador do quadro), qualquer cor de fundo,
// cor das linhas e espaçamento. Pode aplicar só à página atual ou a todas.
import { PAGE_SIZES } from "../core/pageSize";
import { useRef, useState } from "react";
import { HsvField } from "./ColorPicker";
import { HirakuDoc, PAPER_COLORS, PAPER_KINDS, Page, PaperKind } from "../core/model";
import { MARGIN_COLOR, autoLineColor, layerAlpha, paperSvgPaths } from "../core/paper";
import { selectActivePage, useDoc } from "../core/store";

/** Miniatura de um papel. Usada no painel e na tela inicial (capa de caderno novo). */
export function PaperSwatch({ kind, bg, line, scale = 1, w = 96, h = 64, zoom = 0.55, slice }: { kind: PaperKind; bg: string; line?: string | null; scale?: number; w?: number; h?: number; zoom?: number; slice?: boolean }) {
  const p = paperSvgPaths(kind, w, h, scale, zoom);
  const color = line ?? autoLineColor(bg);
  const dark = autoLineColor(bg) !== "#1B2233";
  return (
    <svg className="paper-swatch" viewBox={`0 0 ${w} ${h}`} width={w} height={h} preserveAspectRatio={slice ? "xMidYMid slice" : undefined} aria-hidden="true">
      <rect width={w} height={h} fill={bg} />
      {p.thin && <path d={p.thin} stroke={color} strokeOpacity={layerAlpha(0, dark) * 1.6} strokeWidth={0.8} fill="none" />}
      {p.bold && <path d={p.bold} stroke={color} strokeOpacity={layerAlpha(1, dark) * 1.4} strokeWidth={0.9} fill="none" />}
      {p.accent && <path d={p.accent} stroke={kind === "margin" ? MARGIN_COLOR : color} strokeOpacity={0.8} strokeWidth={1.2} fill="none" />}
      {p.dots && <path d={p.dots} fill={color} fillOpacity={layerAlpha("dot", dark) * 1.5} />}
    </svg>
  );
}

type Patch = Partial<Pick<Page, "paper" | "background" | "paperScale" | "lineColor">>;

const LINE_PRESETS = ["#1B2233", "#2F4B8F", "#2F7D5B", "#C8372D", "#7B4FB5", "#F2F4FA"];

export function FormatIcon({ size }: { size: { w: number; h: number } | null }) {
  if (!size) return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8c2-4 4-4 6 0s4 4 6 0" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
  const k = 12 / Math.max(size.w, size.h), w = size.w * k, h = size.h * k;
  return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x={8 - w / 2} y={8 - h / 2} width={w} height={h} rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

export function PaperPanel() {
  const page = useDoc((s) => selectActivePage(s));
  const [all, setAll] = useState(false);
  const [custom, setCustom] = useState<null | "bg" | "line">(null);
  const base = useRef<HirakuDoc | null>(null);

  const apply = (patch: Patch) => (all ? useDoc.getState().setPaperAll(patch) : useDoc.getState().setPaper(patch));
  const live = (patch: Patch) => {
    if (!base.current) base.current = useDoc.getState().doc;
    useDoc.getState().previewPaper(patch);
  };
  const commit = (patch: Patch) => {
    const b = base.current;
    base.current = null;
    if (b) useDoc.getState().cancelPreview(b); // volta ao estado de antes e grava como UM passo
    apply(patch);
  };
  const isPreset = PAPER_COLORS.some((c) => c.value.toUpperCase() === page.background.toUpperCase());
  const scale = page.paperScale ?? 1;

  return (
    <div className="panel paperpanel" role="dialog" aria-label="Papel">
      <div className="sec-title">Formato do caderno</div>
      <div className="row tight wrap" role="radiogroup" aria-label="Formato das páginas">
        {PAGE_SIZES.map((f) => {
          const on = f.size ? page.size?.w === f.size.w && page.size?.h === f.size.h : !page.size;
          return (
            <button key={f.id} role="radio" aria-checked={on} className={on ? "chip sm on fmt" : "chip sm fmt"} title={f.size ? `${f.label}: páginas de tamanho fixo (todas as páginas)` : "Quadro infinito (todas as páginas)"} onClick={() => useDoc.getState().setPaperAll({ size: f.size ?? undefined })}>
              <FormatIcon size={f.size} /> {f.label}
            </button>
          );
        })}
      </div>
      <div className="sec-title">Padrão da folha</div>
      <div className="tiles three" role="radiogroup" aria-label="Estilo da folha">
        {PAPER_KINDS.map((k) => (
          <button key={k.id} role="radio" aria-checked={page.paper === k.id} className={page.paper === k.id ? "tile on" : "tile"} title={k.hint} onClick={() => apply({ paper: k.id })}>
            <PaperSwatch kind={k.id} bg={page.background} line={page.lineColor} scale={scale} />
            <span>{k.label}</span>
          </button>
        ))}
      </div>

      <div className="sec-title">Cor da folha</div>
      <div className="swatch-grid" role="radiogroup" aria-label="Cor da folha">
        {PAPER_COLORS.map((c) => (
          <button key={c.value} role="radio" aria-checked={page.background === c.value} aria-label={c.label} title={c.label} className={page.background.toUpperCase() === c.value.toUpperCase() ? "swatch on" : "swatch"} style={{ background: c.value }} onClick={() => apply({ background: c.value })} />
        ))}
        <button
          role="radio"
          aria-checked={!isPreset}
          aria-expanded={custom === "bg"}
          className={!isPreset || custom === "bg" ? "swatch more on" : "swatch more"}
          title="Qualquer cor"
          aria-label="Cor personalizada"
          onClick={() => setCustom(custom === "bg" ? null : "bg")}
        />
      </div>
      {custom === "bg" && <HsvField value={page.background} onLive={(c) => live({ background: c })} onCommit={(c) => commit({ background: c })} />}

      <div className="sec-title">Linhas</div>
      <div className="swatch-grid" role="radiogroup" aria-label="Cor das linhas">
        <button role="radio" aria-checked={!page.lineColor} className={!page.lineColor ? "chip sm on" : "chip sm"} onClick={() => apply({ lineColor: null })} title="Escura no papel claro, clara no papel escuro">Auto</button>
        {LINE_PRESETS.map((c) => (
          <button key={c} role="radio" aria-checked={page.lineColor === c} aria-label={`Linhas ${c}`} className={page.lineColor === c ? "swatch on" : "swatch"} style={{ background: c }} onClick={() => apply({ lineColor: c })} />
        ))}
        <button className={custom === "line" ? "swatch more on" : "swatch more"} aria-label="Cor das linhas personalizada" title="Qualquer cor" onClick={() => setCustom(custom === "line" ? null : "line")} />
      </div>
      {custom === "line" && <HsvField value={page.lineColor ?? autoLineColor(page.background)} onLive={(c) => live({ lineColor: c })} onCommit={(c) => commit({ lineColor: c })} />}
      <label className="slider">
        <span>Espaçamento</span>
        <input type="range" min={0.5} max={2} step={0.25} value={scale} onChange={(e) => apply({ paperScale: +e.target.value })} />
        <output>{scale === 1 ? "padrão" : `${scale}×`}</output>
      </label>

      <label className="check">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Aplicar às próximas mudanças em <b>todas as páginas</b>
      </label>
      {all && <button className="chip sm" onClick={() => useDoc.getState().setPaperAll({ paper: page.paper, background: page.background, paperScale: page.paperScale, lineColor: page.lineColor })}>Copiar este papel para todas agora</button>}
    </div>
  );
}
