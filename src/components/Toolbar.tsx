import { BlockTiles } from "./BlockGallery";
import { Fragment, MouseEvent as ReactMouseEvent, ReactNode, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { defaultCamera } from "../core/camera";
import { ARROW_HEADS, LineStyle, SHAPE_TYPES } from "../core/model";
import { resetPageCameras } from "../core/pageView";
import { downloadDoc, parseDoc } from "../core/serialize";
import { applyColor } from "../core/actions";
import { ToolId, useDoc, useTool, useView } from "../core/store";
import { useUI } from "../core/ui";
import { BrushPanel } from "./BrushPanel";
import { ColorPicker } from "./ColorPicker";
import { MapPanel } from "./MapPanel";
import { PaperPanel } from "./PaperPanel";
import { LayersPanel } from "./LayersPanel";
import { SciencePanel } from "./SciencePanel";
import { APP_VERSION } from "../core/repo";
import { checkForUpdates, isTauri } from "../core/updater";
import { isInsideAny } from "../core/outside";
import { Bar, ItemId, barsOn, clampPosition, floatingBars, isVertical, itemLabel, rotateBar, setBarPos, useLayout } from "../core/layout";
import { useBarDrag } from "./BarDrag";
import { PropsPanel } from "./PanelViews";
import { Settings } from "./Settings";
import { ToolGroupBtn, ToolItem } from "./ToolGroup";
import { usePalette, withKey } from "./commands";
import { TextPanelBody } from "./TextControls";
import { listBrushes } from "../core/brushes";
import { useTheme } from "../core/theme";
import { addAttachmentFile, pasteFromButton, worldPoint } from "./clipboard";

const COLORS = ["#1B2233", "#2F4B8F", "#C8372D", "#2F7D5B", "#D98A1F"];
const FILLS: { value: string | null; label: string }[] = [
  { value: null, label: "Sem preenchimento" },
  { value: "#C9D6F2", label: "Azul" },
  { value: "#F6D5D2", label: "Vermelho" },
  { value: "#CFE8DB", label: "Verde" },
  { value: "#F7E3BD", label: "Âmbar" },
  { value: "#DDE1EA", label: "Cinza" },
];
const LINE_STYLES: { id: LineStyle; label: string }[] = [
  { id: "solid", label: "Contínuo" },
  { id: "dashed", label: "Tracejado" },
  { id: "dotted", label: "Pontilhado" },
];

/** Desenho pequeno 44×28 para os painéis (opções com prévia, não só texto). */
const Pic = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 44 28" width="44" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const HEAD_ICON: Record<string, ReactNode> = {
  none: <path d="M6 14h32" />,
  arrow: <><path d="M6 14h32" /><path d="M30 8l8 6-8 6" /></>,
  triangle: <><path d="M6 14h26" /><path d="M30 8l9 6-9 6z" fill="currentColor" /></>,
  dot: <><path d="M6 14h28" /><circle cx="35" cy="14" r="3.5" fill="currentColor" /></>,
  bar: <><path d="M6 14h32" /><path d="M38 7v14" /></>,
};

const SHAPE_META: Record<string, { label: string; key: string; icon: ReactNode }> = {
  rect: { label: "Retângulo", key: "R", icon: <rect x="4" y="6" width="16" height="12" rx="2" /> },
  ellipse: { label: "Elipse", key: "O", icon: <ellipse cx="12" cy="12" rx="8" ry="6" /> },
  diamond: { label: "Losango", key: "D", icon: <path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z" /> },
};

const ICON = {
  select: <path d="M5 3l14 7-6 2-2 6L5 3z" />,
  lasso: <><path d="M12 4c5 0 8 2 8 5s-3 5-8 5-8-2-8-5 3-5 8-5z" strokeDasharray="3 2.5" /><path d="M9 14c-1 2 0 4 3 5" /></>,
  pen: <><path d="M4 20l4-1 11-11a2.1 2.1 0 00-3-3L5 16l-1 4z" /><path d="M14 7l3 3" /></>,
  text: <path d="M5 6h14M12 6v13M9 19h6" />,
  eraser: <><path d="M7 21h11" /><path d="M5.6 14.4l8.5-8.5a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L11.5 19H8.8l-3.2-3.2a2 2 0 010-1.4z" /><path d="M9 11l5 5" /></>,
  eraserPx: <><path d="M7 21h11" /><path d="M5.6 14.4l8.5-8.5a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L11.5 19H8.8l-3.2-3.2a2 2 0 010-1.4z" /><path d="M14 16l2 2M17 13l2 2" strokeDasharray="1.5 1.5" /></>,
  laser: <><circle cx="16" cy="8" r="3" /><circle cx="16" cy="8" r="6" opacity=".35" /><path d="M11 12.5C8 15 6 17 4 20" strokeDasharray="2 2.5" /></>,
  laserpen: <><path d="M4 20l3.5-1 9-9a2 2 0 00-2.8-2.8l-9 9L4 20z" /><path d="M15 4.5c2 .5 3.8 2.3 4.5 4.5" strokeDasharray="1.5 2" /></>,
  hand: <path d="M8 12V5a1.5 1.5 0 013 0v6m0-1V4a1.5 1.5 0 013 0v7m0-4a1.5 1.5 0 013 0v7a6 6 0 01-6 6h-1a6 6 0 01-5-3l-2-3a1.5 1.5 0 012.4-1.7L8 14" />,
  arrow: <><path d="M5 19L19 5" /><path d="M10 5h9v9" /></>,
  line: <path d="M5 19L19 5" />,
};
const BRUSH_ICON: Record<string, ReactNode> = {
  pen: ICON.pen,
  ballpoint: <><path d="M5 19l2-6 9-9 3 3-9 9z" /><path d="M5 19l2-.5" /></>,
  ink: <><path d="M12 3l4 7-4 11-4-11z" /><path d="M12 10v4" /></>,
  marker: <><path d="M6 18l3-8 8-6 3 3-6 8z" /><path d="M4 20h7" /></>,
  highlighter: <><path d="M8 14l7-9 4 3-7 9z" /><path d="M5 20h14" strokeWidth="4" opacity=".45" /></>,
  writer: <><path d="M4 20l4-1 11-11a2.1 2.1 0 00-3-3L5 16l-1 4z" /><path d="M3 22h8" /></>,
  brushpen: <><path d="M20 4l-8.5 8.5" /><path d="M11.5 12.5c-2.5-.5-4.5 1-4.5 3.5 0 1.5-1 2.5-3 3 2.5 2 7.5 1 8-1.5.4-2-.2-3.8-.5-5z" /></>,
};

type DockSide = "bottom" | "left" | "right" | "float";
type Panel = null | "options" | "blocks" | "paper" | "feel" | "shape" | "text" | "brush" | "color" | "eraser" | "laser" | "map" | "templates" | "insert" | "layers" | "science";

export function Toolbar() {
  const t = useTool();
  const canUndo = useDoc((s) => s.past.length > 0);
  const canRedo = useDoc((s) => s.future.length > 0);
  const zoom = useView((s) => s.camera.zoom);
  const [panel, setPanel] = useState<Panel>(null);
  const [panelPosition, setPanelPosition] = useState<{ x: number; y: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (!moreOpen) return;
    const off = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest(".more-wrap")) setMoreOpen(false); };
    window.addEventListener("pointerdown", off);
    return () => window.removeEventListener("pointerdown", off);
  }, [moreOpen]);
  const dragging = useUI((s) => s.dragging);
  const dropHint = useUI((s) => s.dropHint);
  const dockRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const floatsRef = useRef<HTMLDivElement>(null);
  const layout = useLayout((s) => s.layout);
  /** Último botão clicado e em qual barra ele está: o painel que ele abrir aparece junto dele. */
  const anchorRef = useRef<{ side: DockSide; rect: DOMRect } | null>(null);
  const noteAnchor = (side: DockSide) => (e: ReactMouseEvent) => {
    const el = (e.target as HTMLElement).closest?.("button, label, input");
    anchorRef.current = el ? { side, rect: el.getBoundingClientRect() } : null;
  };

  // Fecha o painel ao tocar fora (inclusive no canvas e nas faixas vazias ao lado do painel); as barras laterais contam como dentro.
  useEffect(() => {
    if (!panel) return;
    const close = (e: PointerEvent) => {
      if (!isInsideAny(e.target as Node | null, [dockRef.current, leftRef.current, rightRef.current, floatsRef.current, floatRef.current])) setPanel(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", esc);
    };
  }, [panel]);

  /** Põe o painel flutuante em (x, y), mantendo-o dentro da janela (estimativa conservadora do tamanho máximo). */
  const placePanel = (x: number, y: number) => {
    const margin = 8;
    const width = Math.min(440, window.innerWidth - margin * 2);
    const height = Math.min(680, window.innerHeight - margin * 2);
    setPanelPosition({
      x: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
      y: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
    });
  };

  // Botão direito no canvas pede um painel (ver CanvasView.contextTap).
  const panelRequest = useUI((s) => s.panelRequest);
  useEffect(() => {
    if (!panelRequest) return;
    setPanel(panelRequest.panel as Exclude<Panel, null>);
    placePanel(panelRequest.x, panelRequest.y);
  }, [panelRequest]);

  const toggle = (p: Exclude<Panel, null>) => {
    const a = anchorRef.current;
    anchorRef.current = null;
    setPanel((cur) => (cur === p ? null : p));
    if (a && a.side !== "bottom") {
      // Botão de uma barra lateral ou flutuante: o painel abre ao lado dele, para o lado onde há mais espaço.
      const w = Math.min(440, window.innerWidth - 16);
      const toRight = a.side === "left" || (a.side === "float" && a.rect.left + a.rect.width / 2 < window.innerWidth / 2);
      placePanel(toRight ? a.rect.right + 8 : a.rect.left - w - 8, a.rect.top);
    } else {
      setPanelPosition(null);
    }
  };

  const open = async (file: File | undefined) => {
    if (!file) return;
    try {
      const doc = parseDoc(await file.text());
      resetPageCameras();
      useDoc.getState().loadDoc(doc);
      useView.getState().setCamera(defaultCamera());
    } catch (err) {
      useUI.getState().showToast(err instanceof Error ? err.message : "Não foi possível abrir o arquivo.");
    }
  };

  const erasing = t.tool === "eraser";
  const sizeMin = erasing ? 10 : 1;
  const sizeMax = erasing ? 80 : 14;
  const sizeStep = erasing ? 2 : 0.5;
  const sizeValue = erasing ? t.eraserSize : t.width;
  // dica com o atalho ATUAL (o usuário pode ter trocado): "Mapa mental (M) — clique no vazio…"
  const toolBtn = (id: ToolId, label: string, icon: ReactNode, hint = label) => (
    <button key={id} className={t.tool === id ? "btn on" : "btn"} onClick={() => t.setTool(id)} aria-label={label} aria-pressed={t.tool === id}
      title={withKey(label, `tool.${id}`) + (hint.includes(":") ? ` — ${hint.split(":").slice(1).join(":").trim()}` : "")}>
      <Icon>{icon}</Icon>
    </button>
  );

  const ti = (id: ToolId, label: string, icon: ReactNode): ToolItem => ({ id, label, icon, cmd: `tool.${id}`, active: t.tool === id, run: () => t.setTool(id) });

  const opt = (p: Exclude<Panel, null>, label: string, icon: ReactNode, cmd?: string) => (
    <button className={panel === p ? "btn on" : "btn"} onClick={() => toggle(p)} aria-expanded={panel === p} aria-label={label} title={cmd ? withKey(label, cmd) : label}>
      <Icon>{icon}</Icon>
    </button>
  );

  // Cada BLOQUINHO (item) é uma ferramenta ou um botão; o usuário monta as barras arrastando-os (core/layout.ts).
  const items: Record<ItemId, ReactNode> = {
    select: <ToolGroupBtn group="select" label="Seleção" items={[ti("select", "Selecionar", ICON.select), ti("lasso", "Laço", ICON.lasso)]} />,
    pen: <ToolGroupBtn group="pen" label="Caneta e pincéis" items={listBrushes().map((b) => ({
      id: b.id, label: b.label, icon: BRUSH_ICON[b.id] ?? ICON.pen, cmd: `brush.${b.id}`,
      active: t.tool === "pen" && t.brush === b.id, run: () => { t.setTool("pen"); t.setBrush(b.id); },
    }))} />,
    text: <ToolGroupBtn group="text" label="Texto" items={[ti("text", "Texto", ICON.text)]} />,
    eraser: <ToolGroupBtn group="eraser" label="Borracha" items={[
      { id: "stroke", label: "Borracha de traço inteiro", icon: ICON.eraser, cmd: "tool.eraser", active: t.tool === "eraser" && t.eraserMode === "stroke", run: () => { t.setTool("eraser"); t.set({ eraserMode: "stroke" }); } },
      { id: "pixel", label: "Borracha de pixel (só o trecho)", icon: ICON.eraserPx, cmd: "tool.eraserMode", active: t.tool === "eraser" && t.eraserMode === "pixel", run: () => { t.setTool("eraser"); t.set({ eraserMode: "pixel" }); } },
    ]} />,
    laser: <ToolGroupBtn group="laser" label="Laser" items={[ti("laser", "Ponteiro laser", ICON.laser), ti("laserpen", "Caneta laser", ICON.laserpen)]} />,
    hand: <ToolGroupBtn group="hand" label="Navegar" items={[ti("hand", "Mover tela", ICON.hand)]} />,
    shape: <ToolGroupBtn group="shape" label="Formas" items={SHAPE_TYPES.map((sh) => ti(sh, SHAPE_META[sh].label, SHAPE_META[sh].icon))} />,
    line: <ToolGroupBtn group="line" label="Linhas e setas" items={[ti("arrow", "Seta", ICON.arrow), ti("line", "Linha", ICON.line)]} />,
    mindmap: toolBtn("mindmap", "Mapa mental", <><circle cx="12" cy="12" r="2.5" /><circle cx="5" cy="6" r="1.8" /><circle cx="5" cy="18" r="1.8" /><circle cx="19" cy="9" r="1.8" /><circle cx="19" cy="16" r="1.8" /><path d="M10 11L6.5 7M10 13l-3.5 4M14.4 11l3-1.4M14.4 13l3 2" /></>, "Mapa mental (M): clique no vazio = novo mapa; clique num nó = filho"),
    frame: toolBtn("frame", "Quadro", <><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3" /><rect x="8" y="9" width="8" height="6" rx="1" /></>, "Quadro (F): arraste para criar; o que ficar dentro entra"),
    vertex: toolBtn("vertex", "Vértice", <><circle cx="12" cy="12" r="5.5" /><path d="M12 9.5v5M9.5 12h5" /></>, "Vértice (N): toque no vazio cria; arraste de um vértice para ligar"),
    edge: toolBtn("edge", "Aresta", <><circle cx="5.5" cy="17.5" r="2.5" /><circle cx="18.5" cy="6.5" r="2.5" /><path d="M7.5 15.8l9-7.6" /></>, "Aresta (G): arraste de um vértice a outro"),
    undo: (
      <button className="btn" disabled={!canUndo} onClick={() => useDoc.getState().undo()} aria-label="Desfazer" title={withKey("Desfazer", "edit.undo")}>
        <Icon><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></Icon>
      </button>
    ),
    redo: (
      <button className="btn" disabled={!canRedo} onClick={() => useDoc.getState().redo()} aria-label="Refazer" title={withKey("Refazer", "edit.redo")}>
        <Icon><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 000 12h3" /></Icon>
      </button>
    ),
    options: opt("options", "Opções da ferramenta", <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>, "panel.props"),
    brushes: opt("brush", "Pincéis", <><path d="M20 4l-8.5 8.5" /><path d="M11.5 12.5c-2.5-.5-4.5 1-4.5 3.5 0 1.5-1 2.5-3 3 2.5 2 7.5 1 8-1.5.4-2-.2-3.8-.5-5z" /></>),
    blocks: opt("blocks", "Blocos", <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><path d="M16.5 13v7M13 16.5h7" /></>, "insert.library"),
    insert: opt("insert", "Imagem, arquivo e link", <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="M4 17l5-4.5 3.5 3L16 12l4.5 4.5" /></>, "file.attach"),
    templates: (
      <button className="btn" onClick={() => { setPanel(null); useUI.getState().setTemplatesOpen(true); }} aria-label="Modelos prontos" title={withKey("Modelos prontos", "insert.templates")}>
        <Icon><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Icon>
      </button>
    ),
    science: opt("science", "Grafos e matemática", <><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="7" r="2.2" /><circle cx="11" cy="18" r="2.2" /><path d="M8 6.4l7.8.4M7 7.8l3 8.3M16.9 9l-4.6 7.2" /></>),
    mapPanel: opt("map", "Mapa & quadros", <><circle cx="12" cy="12" r="2.5" /><path d="M9.5 12H4M14.5 12H20M12 9.5V4M12 14.5V20" strokeDasharray="2 2" /></>),
    layers: opt("layers", "Camadas", <><path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z" /><path d="M3.5 12L12 16.5 20.5 12" /><path d="M3.5 16L12 20.5 20.5 16" /></>),
    paper: opt("paper", "Papel", <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M4 15h16M10 4v16M15 4v16" /></>),
    finger: (
      <button className={t.fingerDraws ? "btn on" : "btn"} onClick={() => t.set({ fingerDraws: !t.fingerDraws })} aria-pressed={t.fingerDraws} aria-label="Desenhar com o dedo" title={t.fingerDraws ? "Dedo desenha" : "Dedo só move a tela"}>
        <Icon><path d="M9 11V6a1.5 1.5 0 013 0v5m0 0V8a1.5 1.5 0 013 0v5a6 6 0 01-6 6 6 6 0 01-5-3l-1.5-2.5A1.5 1.5 0 016.4 12L9 14" /></Icon>
      </button>
    ),
    colors: (
      <div className="swatches" role="radiogroup" aria-label="Cor do traço" data-text-ui onMouseDown={(e) => e.preventDefault()}>
        {COLORS.map((c) => (
          <button key={c} role="radio" aria-checked={t.color.toUpperCase() === c} aria-label={`Cor ${c}`}
            className={t.color.toUpperCase() === c ? "swatch on" : "swatch"} style={{ background: c }} onClick={() => applyColor(c, { remember: false })} />
        ))}
        {!COLORS.includes(t.color.toUpperCase()) && (
          <button role="radio" aria-checked aria-label={`Cor ${t.color}`} title={t.color} className="swatch on" style={{ background: t.color }} onClick={() => toggle("color")} />
        )}
        <button className={panel === "color" ? "swatch more on" : "swatch more"} onClick={() => toggle("color")} aria-expanded={panel === "color"} aria-label="Mais cores" title="Mais cores" />
      </div>
    ),
    size: (
      <label className="sizeitem" data-nodrag>
        <span className="sr">{erasing ? "Tamanho da borracha" : "Espessura do traço"}</span>
        <input type="range" min={sizeMin} max={sizeMax} step={sizeStep} value={sizeValue} disabled={t.tool === "hand"}
          onChange={(e) => t.set(erasing ? { eraserSize: +e.target.value } : { width: +e.target.value })} />
        <span className="preview">
          {erasing
            ? <span className="ring" style={{ width: Math.min(sizeValue, 30), height: Math.min(sizeValue, 30) }} />
            : <span className="dot" style={{ width: Math.min(sizeValue + 4, 22), height: Math.min(sizeValue + 4, 22), background: t.color }} />}
        </span>
      </label>
    ),
  };

  const drag = useBarDrag(layout);
  const sideOf = (bar: Bar): DockSide => bar.dock ?? "float";
  const renderBar = (bar: Bar) => {
    const v = isVertical(bar);
    const ins = dropHint?.startsWith(`into:${bar.id}:`) ? +dropHint.split(":")[2] : -1;
    const cls = ["toolbar", "tbar", v ? "vbar" : "hbar", dragging === `bar:${bar.id}` ? "drag-src" : ""].filter(Boolean).join(" ");
    const style = bar.dock ? undefined : { left: bar.x, top: bar.y };
    return (
      <div key={bar.id} className={cls} data-bar={bar.id} style={style} role="toolbar" aria-orientation={v ? "vertical" : "horizontal"}
        aria-label={`Barra: ${bar.items.map(itemLabel).join(", ")}`}
        onClickCapture={noteAnchor(sideOf(bar))}
        onPointerDown={(e) => drag.start(e, bar)}
        onDoubleClick={(e) => { if (!bar.dock && e.target === e.currentTarget) useLayout.getState().update((L) => rotateBar(L, bar.id)); }}>
        {bar.items.map((id, i) => (
          <Fragment key={id}>
            {ins === i && <i className="ins-mark" aria-hidden="true" />}
            <div className={dragging === `item:${id}` ? "titem drag-src" : "titem"} data-item={id}>{items[id]}</div>
          </Fragment>
        ))}
        {ins === bar.items.length && <i className="ins-mark" aria-hidden="true" />}
      </div>
    );
  };
  const left = barsOn(layout, "left"), right = barsOn(layout, "right"), bottom = barsOn(layout, "bottom"), floats = floatingBars(layout);

  // As barras laterais empurram a barra de baixo para não ficarem uma em cima da outra (ver .dock no CSS).
  useEffect(() => {
    const s = document.body.style;
    s.setProperty("--railL", left.length ? "68px" : "0px");
    s.setProperty("--railR", right.length ? "68px" : "0px");
  }, [left.length, right.length]);

  // Barras soltas nunca ficam fora da tela: reajusta ao abrir, ao redimensionar e quando o tamanho delas muda.
  const floatKey = floats.map((b) => `${b.id}:${b.x},${b.y},${b.vertical},${b.items.length}`).join("|");
  useEffect(() => {
    if (!floats.length) return;
    const fix = () => {
      const L = useLayout.getState().layout;
      let n = L;
      for (const b of floatingBars(L)) {
        const el = document.querySelector<HTMLElement>(`[data-bar="${b.id}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const c = clampPosition({ x: b.x, y: b.y }, { w: r.width, h: r.height }, { w: window.innerWidth, h: window.innerHeight });
        if (Math.abs(c.x - b.x) > 0.5 || Math.abs(c.y - b.y) > 0.5) n = setBarPos(n, b.id, c.x, c.y);
      }
      if (n !== L) useLayout.getState().setLayout(n);
    };
    fix();
    window.addEventListener("resize", fix);
    return () => window.removeEventListener("resize", fix);
  }, [floatKey]);

  // Painéis (pincéis, cores, borracha…): ficam em cima da barra de baixo ou, se abertos por um botão da lateral/botão direito, junto dele.
  const panelsNode = (
    <>
      {panel === "paper" && <PaperPanel />}

      {panel === "brush" && <BrushPanel />}
      {panel === "layers" && <LayersPanel />}
      {panel === "science" && <SciencePanel />}
      {panel === "map" && <MapPanel />}

      {panel === "eraser" && (
        <div className="panel" role="dialog" aria-label="Borracha">
          <div className="row" role="radiogroup" aria-label="Modo da borracha">
            <button role="radio" aria-checked={t.eraserMode === "stroke"} className={t.eraserMode === "stroke" ? "chip on" : "chip"} onClick={() => t.set({ eraserMode: "stroke" })}>Traço inteiro</button>
            <button role="radio" aria-checked={t.eraserMode === "pixel"} className={t.eraserMode === "pixel" ? "chip on" : "chip"} onClick={() => t.set({ eraserMode: "pixel" })}>Só o trecho (pixel)</button>
          </div>
          <label className="slider">
            <span>Tamanho</span>
            <input type="range" min={10} max={80} step={2} value={t.eraserSize} onChange={(e) => t.set({ eraserSize: +e.target.value })} />
            <output>{t.eraserSize}px</output>
          </label>
          <div className="row" role="radiogroup" aria-label="Pressão da caneta">
            <button role="radio" aria-checked={t.eraserPressure} className={t.eraserPressure ? "chip on" : "chip"} onClick={() => t.set({ eraserPressure: true })}>Pressão muda o tamanho</button>
            <button role="radio" aria-checked={!t.eraserPressure} className={!t.eraserPressure ? "chip on" : "chip"} onClick={() => t.set({ eraserPressure: false })}>Tamanho fixo</button>
          </div>
          <p className="hint">Traço inteiro (como no Excalidraw) apaga o desenho todo que o anel tocar. “Só o trecho” (como no Photoshop) corta o traço onde o anel passa e deixa o resto; um gesto = um passo de desfazer. A ponta-borracha da caneta usa o mesmo modo. Formas e textos são apagados inteiros nos dois modos.</p>
        </div>
      )}

      {panel === "laser" && (
        <div className="panel" role="dialog" aria-label="Laser">
          <div className="row" role="radiogroup" aria-label="Tipo de laser">
            <button role="radio" aria-checked={t.tool === "laser"} className={t.tool === "laser" ? "chip on" : "chip"} onClick={() => t.setTool("laser")}>● Ponteiro</button>
            <button role="radio" aria-checked={t.tool === "laserpen"} className={t.tool === "laserpen" ? "chip on" : "chip"} onClick={() => t.setTool("laserpen")}>✎ Caneta laser</button>
          </div>
          <div className="sec-title">Cor</div>
          <div className="swatch-grid" role="radiogroup" aria-label="Cor do laser">
            {["#FF3B30", "#FF9500", "#FFD60A", "#34C759", "#0A84FF", "#BF5AF2", "#FF2D92", "#FFFFFF"].map((c) => (
              <button key={c} role="radio" aria-checked={t.laserColor === c} aria-label={`Laser ${c}`} className={t.laserColor === c ? "swatch on" : "swatch"} style={{ background: c }} onClick={() => t.set({ laserColor: c })} />
            ))}
          </div>
          <label className="slider">
            <span>Rastro do ponteiro</span>
            <input type="range" min={0} max={2000} step={50} value={t.laserTrail} onChange={(e) => t.set({ laserTrail: +e.target.value })} />
            <output>{t.laserTrail === 0 ? "só a bolinha" : `${(t.laserTrail / 1000).toFixed(2).replace(/0$/, "")} s`}</output>
          </label>
          <label className="slider">
            <span>Caneta some em</span>
            <input type="range" min={300} max={10000} step={100} value={t.laserHold} onChange={(e) => t.set({ laserHold: +e.target.value })} />
            <output>{(t.laserHold / 1000).toFixed(1)} s</output>
          </label>
          <p className="hint">O <b>ponteiro</b> é uma bolinha que acompanha o mouse (ou o dedo/caneta) sem riscar nada; com rastro 0 fica só a bolinha. A <b>caneta laser</b> escreve por cima de tudo — para grifar, circular ou fazer uma conta rápida — e o que foi escrito some sozinho depois do tempo escolhido sem escrever. Nada disso entra no caderno.</p>
        </div>
      )}

      {panel === "color" && (
        <ColorPicker
          onEyedropper={() => {
            setPanel(null);
            t.set({ picking: true });
            useUI.getState().showToast("Toque num desenho para pegar a cor dele (ou na folha, para pegar a cor do papel).");
          }}
        />
      )}

      {panel === "feel" && (
        <div className="panel" role="dialog" aria-label="Ajustes da caneta">
          <label className="slider">
            <span>Sensibilidade à pressão</span>
            <input type="range" min={0} max={1} step={0.05} value={t.pressureSens} onChange={(e) => t.set({ pressureSens: +e.target.value })} />
            <output>{Math.round(t.pressureSens * 100)}%</output>
          </label>
          <label className="slider">
            <span>Estabilização do traço</span>
            <input type="range" min={0} max={0.9} step={0.05} value={t.smoothing} onChange={(e) => t.set({ smoothing: +e.target.value })} />
            <output>{Math.round((t.smoothing / 0.9) * 100)}%</output>
          </label>
          <label className="slider">
            <span>Afilamento das pontas</span>
            <input type="range" min={0} max={1} step={0.05} value={t.taper} onChange={(e) => t.set({ taper: +e.target.value })} />
            <output>{Math.round(t.taper * 100)}%</output>
          </label>
          <p className="hint">Mouse e dedo não enviam pressão: nesses casos a espessura varia só com a velocidade do traço.</p>
        </div>
      )}

      {panel === "text" && (
        <div className="panel" role="dialog" aria-label="Estilo do texto" data-text-ui>
          <TextPanelBody />
          <p className="hint">Com a ferramenta Texto, clique no canvas para escrever. Enter quebra a linha; Esc, Ctrl+Enter ou clicar fora confirma. Ctrl+B/I/U formatam enquanto escreve.</p>
        </div>
      )}

      {panel === "shape" && (
        <div className="panel scroll" role="dialog" aria-label="Estilo das formas">
          <div className="sec-title">Contorno</div>
          <div className="tiles three" role="radiogroup" aria-label="Estilo do contorno">
            {LINE_STYLES.map((l) => (
              <button key={l.id} role="radio" aria-checked={t.lineStyle === l.id} className={t.lineStyle === l.id ? "tile icon on" : "tile icon"} onClick={() => t.set({ lineStyle: l.id })}>
                <Pic><path d="M6 14h32" strokeWidth="2.4" strokeDasharray={l.id === "dashed" ? "7 5" : l.id === "dotted" ? "0.1 5" : undefined} /></Pic><span>{l.label}</span>
              </button>
            ))}
          </div>
          <div className="sec-title">Preenchimento</div>
          <div className="swatch-grid" role="radiogroup" aria-label="Preenchimento">
            {FILLS.map((f) => (
              <button
                key={f.label}
                role="radio"
                aria-checked={t.fill === f.value}
                aria-label={f.label}
                title={f.label}
                className={(t.fill === f.value ? "swatch on" : "swatch") + (f.value === null ? " none" : "")}
                style={f.value ? { background: f.value } : undefined}
                onClick={() => t.set({ fill: f.value })}
              />
            ))}
          </div>
          <div className="sec-title">Cantos do retângulo</div>
          <div className="tiles" role="radiogroup" aria-label="Cantos do retângulo">
            <button role="radio" aria-checked={!t.rounded} className={!t.rounded ? "tile icon on" : "tile icon"} onClick={() => t.set({ rounded: false })}><Pic><rect x="8" y="5" width="28" height="18" /></Pic><span>Retos</span></button>
            <button role="radio" aria-checked={t.rounded} className={t.rounded ? "tile icon on" : "tile icon"} onClick={() => t.set({ rounded: true })}><Pic><rect x="8" y="5" width="28" height="18" rx="6" /></Pic><span>Arredondados</span></button>
          </div>
          {(["startHead", "endHead"] as const).map((key) => (
            <div key={key}>
              <div className="sec-title">{key === "startHead" ? "Ponta inicial" : "Ponta final"}</div>
              <div className="tiles five" role="radiogroup" aria-label={key === "startHead" ? "Ponta inicial da seta" : "Ponta final da seta"}>
                {ARROW_HEADS.map((h) => (
                  <button
                    key={h.id}
                    role="radio"
                    aria-checked={t[key] === h.id}
                    title={h.label}
                    className={t[key] === h.id ? "tile icon on" : "tile icon"}
                    onClick={() => t.set(key === "startHead" ? { startHead: h.id } : { endHead: h.id })}
                  >
                    <Pic><g transform={key === "startHead" ? "translate(44 0) scale(-1 1)" : undefined}>{HEAD_ICON[h.id]}</g></Pic>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="sec-title">Linha</div>
          <div className="tiles" role="radiogroup" aria-label="Forma da linha">
            <button role="radio" aria-checked={!t.curved} className={!t.curved ? "tile icon on" : "tile icon"} onClick={() => t.set({ curved: false })}><Pic><path d="M6 22l12-12 8 8 12-12" /></Pic><span>Reta</span></button>
            <button role="radio" aria-checked={t.curved} className={t.curved ? "tile icon on" : "tile icon"} onClick={() => t.set({ curved: true })}><Pic><path d="M6 22C12 4 20 6 24 14s12 8 14-8" /></Pic><span>Curva</span></button>
          </div>
          <p className="hint">Shift: quadrado, círculo ou ângulo de 15°. Alt: desenha a partir do centro. Solte a ponta de uma seta sobre uma forma para conectá-la. Selecione uma linha para arrastar os pontos; arraste a bolinha do meio para criar um ponto novo e use Alt+clique num ponto para remover.</p>
        </div>
      )}

      {panel === "options" && (
        <div className="panel scroll optpanel" role="dialog" aria-label="Opções da ferramenta" data-text-ui><PropsPanel /></div>
      )}

      {panel === "blocks" && (
        <div className="panel" role="dialog" aria-label="Blocos">
          <div className="sec-title">Blocos</div>
          <BlockTiles onPick={() => setPanel(null)} />
        </div>
      )}

      {panel === "insert" && (
        <div className="panel insertpanel" role="dialog" aria-label="Imagem, arquivo e link">
          <div className="sec-title">Trazer de fora</div>
          <div className="ins-list" role="menu">
            <button role="menuitem" className="ins-item" onClick={() => { void pasteFromButton(); setPanel(null); }}>
              <Icon><rect x="7" y="4" width="10" height="16" rx="2" /><path d="M9.5 4V3h5v1M10 10h4M10 14h3" /></Icon>
              <span><b>Colar</b><small>Print, imagem, link ou texto copiado (Ctrl+V)</small></span>
            </button>
            <button role="menuitem" className="ins-item" onClick={() => { attachRef.current?.click(); setPanel(null); }}>
              <Icon><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="M4 17l5-4.5 3.5 3L16 12l4.5 4.5" /></Icon>
              <span><b>Imagem, PDF ou arquivo</b><small>Do computador ou do tablet (até 15 MB)</small></span>
            </button>
            <button role="menuitem" className="ins-item" onClick={() => { setPanel(null); useUI.getState().showToast("Copie o link (YouTube, site…) e cole com Ctrl+V no quadro."); }}>
              <Icon><rect x="3.5" y="5.5" width="17" height="13" rx="3" /><path d="M10.5 9.5l4 2.5-4 2.5z" /></Icon>
              <span><b>Vídeo ou link</b><small>Links do YouTube viram vídeo; outros viram cartão</small></span>
            </button>
          </div>
          <p className="hint small">Também dá para arrastar arquivos e links direto para o quadro.</p>
        </div>
      )}
    </>
  );

  return (
    <>
      <div className="topbar" role="toolbar" aria-label="Arquivo e visualização">
        <button className="btn text zoom" onClick={() => useView.getState().setCamera(defaultCamera())} title="Voltar para 100%">
          {Math.round(zoom * 100)}%
        </button>
        <span className="vsep" aria-hidden="true" />
        <button className="btn tb" onClick={() => downloadDoc(useDoc.getState().doc)} aria-label="Salvar" title="Salvar arquivo .hiraku">
          <Icon size={20}><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></Icon><span className="lbl">Salvar</span>
        </button>
        <button className="btn tb" onClick={() => fileRef.current?.click()} aria-label="Abrir" title="Abrir arquivo .hiraku">
          <Icon size={20}><path d="M3.5 7a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2h-13a2 2 0 01-2-2z" /></Icon><span className="lbl">Abrir</span>
        </button>
        <div className="more-wrap">
          <button className={moreOpen ? "btn on" : "btn"} onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen} aria-label="Mais opções" title="Mais opções">
            <Icon><circle cx="5.5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18.5" cy="12" r="1.2" /></Icon>
          </button>
          {moreOpen && (
            <div className="menu" role="menu" onClick={() => setMoreOpen(false)}>
              {!isTauri() && <a role="menuitem" href={`${import.meta.env.BASE_URL}download.html`}>Baixar o app</a>}
              <button role="menuitem" onClick={() => void checkForUpdates(true)}>Verificar atualizações · v{APP_VERSION}</button>
              <button role="menuitem" onClick={() => useUI.getState().setNotebooksOpen(true)}>Tela inicial (cadernos)</button>
              <button role="menuitem" onClick={() => useTheme.getState().setFocus(true)}>Modo foco (Ctrl+.)</button>
              <button role="menuitem" onClick={() => useUI.getState().setSettingsTab("aparencia")}>Tema e aparência…</button>
              <button role="menuitem" onClick={() => useUI.getState().setSettingsTab("atalhos")}>Atalhos de teclado</button>
              <button role="menuitem" onClick={() => useUI.getState().setSettingsTab("areas")}>Áreas de trabalho (menus e painéis)…</button>
              <button role="menuitem" onClick={() => usePalette.getState().setOpen(true)}>{withKey("Procurar comando", "help.palette")}</button>
            </div>
          )}
        </div>
        <button className="btn" onClick={() => useUI.getState().setSettingsOpen(true)} aria-label="Configurações" title="Configurações">
          <Icon><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></Icon>
        </button>
        <input ref={attachRef} id="hm-attach-input" type="file" multiple hidden onChange={(e) => { Array.from(e.target.files ?? []).forEach((f, i) => { const c = worldPoint(); void addAttachmentFile(f, { x: c.x + i * 24, y: c.y + i * 24 }); }); e.target.value = ""; }} />
        <input ref={fileRef} id="hm-open-input" type="file" accept=".hiraku,application/json" hidden onChange={(e) => { void open(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {left.length > 0 && (
        <div className="bars-side left" ref={leftRef} data-rail="left">{left.map(renderBar)}</div>
      )}
      {right.length > 0 && (
        <div className="bars-side right" ref={rightRef} data-rail="right">{right.map(renderBar)}</div>
      )}

      <div className="dock" ref={dockRef}>
        {!panelPosition && panelsNode}
        {bottom.length > 0 && <div className="bars-row" data-rail="bottom">{bottom.map(renderBar)}</div>}
      </div>

      {floats.length > 0 && (
        <div className="float-layer" ref={floatsRef}>{floats.map(renderBar)}</div>
      )}

      {panel && panelPosition && (
        <div className="panel-float" ref={floatRef} style={{ left: panelPosition.x, top: panelPosition.y }}>
          {panelsNode}
        </div>
      )}

      {dragging && (
        <div className="dropzones" aria-hidden="true">
          {(["left", "bottom", "right"] as const).map((side) => (
            <div key={side} className={dropHint === `dock:${side}` ? "dz on" : "dz"} data-side={side} />
          ))}
        </div>
      )}
      {drag.ghost}

      <Settings />
    </>
  );
}
