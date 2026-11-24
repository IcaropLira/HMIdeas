// Janela de zoom para escrever (0.12, como a do GoodNotes): uma faixa ampliada embaixo onde se escreve com letra grande;
// o traço vai, em tamanho pequeno, para a caixa-alvo na página (realçada no quadro). A caixa avança sozinha pela linha.
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { brushDyn, getBrush } from "../core/brushes";
import { ZoomTarget, advanceTarget, newLine, padToWorld } from "../core/handwriting";
import { HirakuElement, InkPoint, newId } from "../core/model";
import { elementBounds } from "../core/selection";
import { screenToWorld } from "../core/camera";
import { selectActivePage, useDoc, useTool, useView } from "../core/store";
import { thumbPath } from "../render/svgThumb";
import { Icon } from "./Icon";

interface ZW {
  open: boolean;
  target: ZoomTarget | null;
  /** Começo da linha (x do mundo) para onde a caixa volta ao mudar de linha. */
  left: number;
  auto: boolean;
  toggle: () => void;
  set: (p: Partial<Omit<ZW, "toggle" | "set">>) => void;
}
export const useZoomWriter = create<ZW>((set, get) => ({
  open: false, target: null, left: 0, auto: true,
  toggle: () => set({ open: !get().open }),
  set: (p) => set(p),
}));

/** Revela ou esconde todas as fitas da página (um passo de desfazer). */
export function setAllTapes(revealed: boolean) {
  useDoc.getState().editPage((p) => {
    let changed = false;
    const elements = p.elements.map((e) => {
      if (e.type !== "attachment" || e.block?.kind !== "tape" || e.block.revealed === revealed) return e;
      changed = true;
      return { ...e, block: { ...e.block, revealed } } as HirakuElement;
    });
    return changed ? { ...p, elements } : p;
  });
}

const PAD_H = 190;

/** Onde o fim da linha fica: borda da folha (caderno com páginas) ou 4 caixas depois do começo (quadro infinito). */
const rightEdge = (t: ZoomTarget, left: number) => {
  const size = selectActivePage(useDoc.getState()).size;
  return size ? size.w - 24 : left + t.w * 4;
};

export function ZoomWriter() {
  const { open, target, left, auto } = useZoomWriter();
  const page = useDoc((s) => selectActivePage(s));
  const cam = useView((s) => s.camera);
  const padRef = useRef<HTMLDivElement>(null), liveRef = useRef<HTMLCanvasElement>(null);
  const [padW, setPadW] = useState(800);

  // caixa inicial: começo da linha no centro-esquerda da tela visível
  useEffect(() => {
    if (!open || target) return;
    const c = useView.getState().camera;
    const w = Math.max(60, Math.min(600, 260 / Math.max(0.3, c.zoom)));
    const a = screenToWorld(c, window.innerWidth * 0.3, window.innerHeight * 0.35);
    const size = selectActivePage(useDoc.getState()).size;
    const x = size ? Math.max(24, Math.min(a.x, size.w - w - 24)) : a.x;
    useZoomWriter.getState().set({ target: { x, y: a.y, w, h: (w * PAD_H) / 800 }, left: x });
  }, [open, target]);

  useEffect(() => {
    if (!open) return;
    const fit = () => setPadW(padRef.current?.clientWidth ?? 800);
    fit();
    const ro = new ResizeObserver(fit);
    if (padRef.current) ro.observe(padRef.current);
    return () => ro.disconnect();
  }, [open]);

  // altura da caixa acompanha a proporção da faixa
  const t = target && { ...target, h: (target.w * PAD_H) / padW };
  const scale = t ? padW / t.w : 1;

  const near = useMemo(() => {
    if (!t) return [];
    const m = t.w * 0.2;
    return page.elements.filter((e) => {
      if (e.invisible) return false;
      const b = elementBounds(e);
      return b.maxX > t.x - m && b.minX < t.x + t.w + m && b.maxY > t.y - m && b.minY < t.y + t.h + m;
    }).map(thumbPath);
  }, [page.elements, t?.x, t?.y, t?.w, t?.h]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !t) return null;
  const set = useZoomWriter.getState().set;
  const move = (dx: number) => set({ target: { ...t, x: t.x + dx * t.w * 0.5 } });
  const zoom = (k: number) => set({ target: { ...t, w: Math.max(30, Math.min(900, t.w * k)) } });

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget, r = el.getBoundingClientRect();
    el.setPointerCapture(e.pointerId);
    const tool = useTool.getState(), b = getBrush(tool.brush);
    const width = tool.width * b.size;
    const pts: InkPoint[] = [];
    const ctx = liveRef.current?.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    if (liveRef.current) { liveRef.current.width = r.width * dpr; liveRef.current.height = r.height * dpr; }
    let maxX = 0;
    const add = (ev: PointerEvent | React.PointerEvent) => {
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      const p = ev.pointerType === "pen" ? Math.max(0.05, ev.pressure || 0.5) : 0.5;
      const w = padToWorld(t, padW, x, y);
      const last = pts[pts.length - 1];
      if (last && Math.hypot(w.x - last.x, w.y - last.y) < 0.4 / scale) return;
      pts.push({ x: w.x, y: w.y, p });
      maxX = Math.max(maxX, x);
      if (ctx && last) {
        ctx.strokeStyle = tool.color; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.globalAlpha = b.opacity * tool.opacity;
        ctx.lineWidth = width * scale * dpr * (0.6 + 0.8 * p * tool.pressureSens + (1 - tool.pressureSens) * 0.4);
        ctx.beginPath(); ctx.moveTo((last.x - t.x) * scale * dpr, (last.y - t.y) * scale * dpr); ctx.lineTo(x * dpr, y * dpr); ctx.stroke();
      }
    };
    add(e);
    const mv = (ev: PointerEvent) => { if (ev.pointerId !== e.pointerId) return; (ev.getCoalescedEvents?.() ?? [ev]).forEach(add); };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      el.removeEventListener("pointermove", mv);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      ctx?.clearRect(0, 0, liveRef.current!.width, liveRef.current!.height);
      if (pts.length) {
        useDoc.getState().addElement({
          id: newId(), type: "stroke", points: pts.length === 1 ? [pts[0], { ...pts[0], x: pts[0].x + 0.01 }] : pts,
          color: tool.color, width, sens: tool.pressureSens, taper: b.taper ?? tool.taper, brush: b.id,
          opacity: b.opacity * tool.opacity, dyn: brushDyn(b),
        });
        // passou de 80% da faixa: a caixa anda (deixa uma sobra para emendar a palavra)
        if (useZoomWriter.getState().auto && maxX > padW * 0.8) set({ target: advanceTarget(t, left, rightEdge(t, left)) });
      }
    };
    el.addEventListener("pointermove", mv);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  // realce da caixa no quadro
  const box = { left: cam.x + t.x * cam.zoom, top: cam.y + t.y * cam.zoom, width: t.w * cam.zoom, height: t.h * cam.zoom };

  return <>
    <div className="zw-target" style={box} aria-hidden="true" />
    <section className="zoomwriter" aria-label="Janela de zoom">
      <div className="zw-bar">
        <strong>Janela de zoom</strong>
        <button className="btn sm" onClick={() => move(-1)} aria-label="Caixa para a esquerda" title="Caixa para a esquerda"><Icon size={18}><path d="M14 6l-6 6 6 6" /></Icon></button>
        <button className="btn sm" onClick={() => move(1)} aria-label="Caixa para a direita" title="Caixa para a direita"><Icon size={18}><path d="M10 6l6 6-6 6" /></Icon></button>
        <button className="btn sm" onClick={() => set({ target: newLine(t, left) })} aria-label="Nova linha" title="Nova linha (volta ao começo)"><Icon size={18}><path d="M19 5v7a3 3 0 01-3 3H6M10 11l-4 4 4 4" /></Icon></button>
        <span className="vsep" />
        <button className="btn sm" onClick={() => zoom(1.25)} aria-label="Letra menor" title="Letra menor (caixa maior)"><Icon size={18}><path d="M5 12h14" /></Icon></button>
        <button className="btn sm" onClick={() => zoom(0.8)} aria-label="Letra maior" title="Letra maior (caixa menor)"><Icon size={18}><path d="M12 5v14M5 12h14" /></Icon></button>
        <button className={auto ? "chip on" : "chip"} aria-pressed={auto} onClick={() => set({ auto: !auto })} title="Ao chegar perto do fim da faixa, a caixa anda sozinha">Avançar sozinho</button>
        <button className="chip" onClick={() => set({ left: t.x })} title="A linha recomeça daqui ao mudar de linha">Marcar margem</button>
        <button className="chip" onClick={() => { const c = useView.getState().camera; set({ target: { ...t, x: (window.innerWidth / 2 - c.x) / c.zoom - t.w / 2, y: (window.innerHeight * 0.4 - c.y) / c.zoom } }); }} title="Traz a caixa para o meio da tela">Trazer para a tela</button>
        <button className="btn sm zw-close" onClick={() => useZoomWriter.getState().set({ open: false })} aria-label="Fechar janela de zoom" title="Fechar (Ctrl+Alt+W)"><Icon size={18}><path d="M6 6l12 12M18 6L6 18" /></Icon></button>
      </div>
      <div className="zw-pad" ref={padRef} style={{ height: PAD_H }} onPointerDown={down} onContextMenu={(e) => e.preventDefault()}>
        <svg viewBox={`${t.x} ${t.y} ${t.w} ${t.h}`} preserveAspectRatio="none" aria-hidden="true">
          {near.map((p, i) => <path key={i} d={p.d} fill={p.fill} stroke={p.stroke ?? "none"} strokeWidth={p.sw} strokeLinecap="round" strokeLinejoin="round" opacity={p.alpha < 1 ? p.alpha : undefined} />)}
        </svg>
        <span className="zw-base" style={{ top: "72%" }} />
        <span className="zw-limit" style={{ left: "80%" }} title="Passou daqui, a caixa anda" />
        <canvas ref={liveRef} />
      </div>
    </section>
  </>;
}

