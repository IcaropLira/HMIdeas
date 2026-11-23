import { editSelectedBlock } from "../core/blockView";
import { BlockTiles } from "./BlockGallery";
import { useGraphTool } from "../core/graphEdit";
import { MouseEvent as ReactMouseEvent, ReactNode, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { defaultCamera } from "../core/camera";
import { ARROW_HEADS, LineStyle, SHAPE_TYPES } from "../core/model";
import { resetPageCameras } from "../core/pageView";
import { downloadDoc, parseDoc } from "../core/serialize";
import { applyColor, deleteSelection, duplicateSelection, restyleText } from "../core/actions";
import { ToolId, selectActivePage, useDoc, useSel, useTool, useView } from "../core/store";
import { FONTS, FONT_SIZES } from "../core/text";
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
import { BLOCKS, BlockId, DockSide, blocksOn, clampPosition, defaultFloat, floatLeaders, groupMembers, useLayout } from "../core/layout";
import { BarHandle, BlockHandle } from "./BlockHandle";
import { Settings } from "./Settings";
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

type Panel = null | "paper" | "feel" | "shape" | "text" | "brush" | "color" | "eraser" | "map" | "templates" | "insert" | "layers" | "science";

export function Toolbar() {
  const t = useTool();
  const canUndo = useDoc((s) => s.past.length > 0);
  const canRedo = useDoc((s) => s.future.length > 0);
  const zoom = useView((s) => s.camera.zoom);
  const selCount = useSel((s) => s.ids.length);
  const graph = useGraphTool();
  const oneSel = useSel((s) => (s.ids.length === 1 ? s.ids[0] : null));
  const selBlock = useDoc((s) => {
    if (!oneSel) return false;
    const ids = [oneSel];
    const e = selectActivePage(s).elements.find((x) => x.id === ids[0]);
    return !!e && e.type === "attachment" && e.kind === "block";
  });
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
  const toolBtn = (id: ToolId, label: string, icon: ReactNode, hint = label) => (
    <button key={id} className={t.tool === id ? "btn on" : "btn"} onClick={() => t.setTool(id)} aria-label={label} aria-pressed={t.tool === id} title={hint}>
      <Icon>{icon}</Icon>
    </button>
  );

  // Cada BLOCO é um grupo de botões que o usuário posiciona (embaixo, esquerda, direita ou oculto) em Configurações.
  const blocks: Record<BlockId, ReactNode> = {
    tools: (
      <>
        <div className="group">
          {toolBtn("select", "Selecionar", <path d="M5 3l14 7-6 2-2 6L5 3z" />, "Selecionar (V)")}
          {toolBtn("lasso", "Laço", <><path d="M12 4c5 0 8 2 8 5s-3 5-8 5-8-2-8-5 3-5 8-5z" strokeDasharray="3 2.5" /><path d="M9 14c-1 2 0 4 3 5" /></>, "Laço (L)")}
          {toolBtn("pen", "Caneta", <><path d="M4 20l4-1 11-11a2.1 2.1 0 00-3-3L5 16l-1 4z" /><path d="M14 7l3 3" /></>, "Caneta (P)")}
          {toolBtn("text", "Texto", <path d="M5 6h14M12 6v13M9 19h6" />, "Texto (T ou 8)")}
          {toolBtn("eraser", "Borracha", <><path d="M7 21h11" /><path d="M5.6 14.4l8.5-8.5a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L11.5 19H8.8l-3.2-3.2a2 2 0 010-1.4z" /><path d="M9 11l5 5" /></>, "Borracha (E)")}
          {erasing && (
            <button className={panel === "eraser" ? "btn on" : "btn"} onClick={() => toggle("eraser")} aria-expanded={panel === "eraser"} aria-label="Opções da borracha" title="Opções da borracha">
              <Icon><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Icon>
            </button>
          )}
          {toolBtn("laser", "Laser", <><circle cx="17" cy="7" r="2.6" /><path d="M15 9.5C11 13 7 15 4 20" strokeDasharray="2 2.5" /></>, "Ponteiro laser (apresentar sem riscar)")}
          {toolBtn("hand", "Mover tela", <path d="M8 12V5a1.5 1.5 0 013 0v6m0-1V4a1.5 1.5 0 013 0v7m0-4a1.5 1.5 0 013 0v7a6 6 0 01-6 6h-1a6 6 0 01-5-3l-2-3a1.5 1.5 0 012.4-1.7L8 14" />, "Mover tela (H ou Espaço)")}
        </div>
        {t.tool === "pen" && (
          <div className="group">
            <button className={t.recognize ? "btn text on" : "btn text"} onClick={() => t.set({ recognize: !t.recognize })} aria-pressed={t.recognize}
              title="Reconhecer formas: o traço vira linha, retângulo, círculo, losango ou triângulo perfeitos">
              <Icon><path d="M4 17c3-9 6-11 9-6s5 5 7-3" strokeDasharray="2 2" /><rect x="13" y="13" width="8" height="7" rx="1" /></Icon>
            </button>
          </div>
        )}
        {t.tool === "lasso" && (
          <div className="group">
            <button
              className="btn text"
              onClick={() => t.set({ lassoMode: t.lassoMode === "inside" ? "touch" : "inside" })}
              title="Alternar o que o laço seleciona"
            >
              {t.lassoMode === "inside" ? "Só dentro" : "Tocando"}
            </button>
          </div>
        )}
      </>
    ),
    shapes: (
      <div className="group">
        {SHAPE_TYPES.map((s) => toolBtn(s, SHAPE_META[s].label, SHAPE_META[s].icon, `${SHAPE_META[s].label} (${SHAPE_META[s].key})`))}
        {toolBtn("arrow", "Seta", <><path d="M5 19L19 5" /><path d="M10 5h9v9" /></>, "Seta (A ou 5)")}
        {toolBtn("line", "Linha", <path d="M5 19L19 5" />, "Linha (6)")}
        <button className={panel === "shape" ? "btn on" : "btn"} onClick={() => toggle("shape")} aria-expanded={panel === "shape"} aria-label="Estilo das formas" title="Estilo das formas">
          <Icon><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Icon>
        </button>
      </div>
    ),
    history: (
      <div className="group">
        <button className="btn" disabled={!canUndo} onClick={() => useDoc.getState().undo()} aria-label="Desfazer" title="Desfazer (Ctrl+Z)">
          <Icon><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></Icon>
        </button>
        <button className="btn" disabled={!canRedo} onClick={() => useDoc.getState().redo()} aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)">
          <Icon><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 000 12h3" /></Icon>
        </button>
      </div>
    ),
    insert: (
      <div className="group">
        <button className={panel === "insert" ? "btn on" : "btn"} onClick={() => toggle("insert")} aria-expanded={panel === "insert"} aria-label="Inserir" title="Inserir: blocos (post-it, tarefas, tabela…), imagem, arquivo, colar (Ctrl+V)">
          <Icon><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="M4 17l5-4.5 3.5 3L16 12l4.5 4.5" /></Icon>
        </button>
      </div>
    ),
    brush: (
      <div className="group">
                  <button className={panel === "brush" ? "btn on" : "btn"} onClick={() => toggle("brush")} aria-expanded={panel === "brush"} aria-label="Pincéis" title="Pincéis">
                    <Icon><path d="M20 4l-8.5 8.5" /><path d="M11.5 12.5c-2.5-.5-4.5 1-4.5 3.5 0 1.5-1 2.5-3 3 2.5 2 7.5 1 8-1.5.4-2-.2-3.8-.5-5z" /></Icon>
                  </button>
      </div>
    ),
    colors: (
      <div className="group" role="radiogroup" aria-label="Cor do traço" data-text-ui onMouseDown={(e) => e.preventDefault()}>
        {COLORS.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={t.color.toUpperCase() === c}
            aria-label={`Cor ${c}`}
            className={t.color.toUpperCase() === c ? "swatch on" : "swatch"}
            style={{ background: c }}
            onClick={() => applyColor(c, { remember: false })}
          />
        ))}
        {!COLORS.includes(t.color.toUpperCase()) && (
          <button role="radio" aria-checked aria-label={`Cor ${t.color}`} title={t.color} className="swatch on" style={{ background: t.color }} onClick={() => toggle("color")} />
        )}
        <button className={panel === "color" ? "swatch more on" : "swatch more"} onClick={() => toggle("color")} aria-expanded={panel === "color"} aria-label="Mais cores" title="Mais cores" />
      </div>
    ),
    size: (
      <label className="group size">
        <span className="sr">{erasing ? "Tamanho da borracha" : "Espessura do traço"}</span>
        <input
          type="range"
          min={sizeMin}
          max={sizeMax}
          step={sizeStep}
          value={sizeValue}
          disabled={t.tool === "hand"}
          onChange={(e) => t.set(erasing ? { eraserSize: +e.target.value } : { width: +e.target.value })}
        />
        <span className="preview">
          {erasing ? (
            <span className="ring" style={{ width: Math.min(sizeValue, 36), height: Math.min(sizeValue, 36) }} />
          ) : (
            <span className="dot" style={{ width: sizeValue + 4, height: sizeValue + 4, background: t.color }} />
          )}
        </span>
      </label>
    ),
    map: (
      <div className="group">
        {toolBtn("mindmap", "Mapa mental", <><circle cx="12" cy="12" r="2.5" /><circle cx="5" cy="6" r="1.8" /><circle cx="5" cy="18" r="1.8" /><circle cx="19" cy="9" r="1.8" /><circle cx="19" cy="16" r="1.8" /><path d="M10 11L6.5 7M10 13l-3.5 4M14.4 11l3-1.4M14.4 13l3 2" /></>, "Mapa mental (M): clique no vazio = novo mapa; clique num nó = filho")}
        {toolBtn("frame", "Quadro", <><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3" /><rect x="8" y="9" width="8" height="6" rx="1" /></>, "Quadro (F): arraste para criar; o que ficar dentro entra")}
        <button className={panel === "map" ? "btn on" : "btn"} onClick={() => toggle("map")} aria-expanded={panel === "map"} aria-label="Mapa e quadros" title="Mapa & quadros: layout, formas, códigos de cor, recolher">
          <Icon><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Icon>
        </button>
        <button className="btn" onClick={() => { setPanel(null); useUI.getState().setTemplatesOpen(true); }} aria-label="Modelos prontos" title="Modelos prontos: Kanban, SWOT, Cornell, fluxograma, slides…">
          <Icon><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Icon>
        </button>
      </div>
    ),
    layers: (
      <div className="group">
        <button className={panel === "layers" ? "btn on" : "btn"} onClick={() => toggle("layers")} aria-expanded={panel === "layers"} aria-label="Camadas" title="Camadas">
          <Icon><path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z" /><path d="M3.5 12L12 16.5 20.5 12" /><path d="M3.5 16L12 20.5 20.5 16" /></Icon>
        </button>
      </div>
    ),
    science: (
      <div className="group">
        <button className={panel === "science" ? "btn on" : "btn"} onClick={() => toggle("science")} aria-expanded={panel === "science"} aria-label="Grafos e matemática" title="Grafos, sólidos, planos, gráficos e calculadora">
          <Icon><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="7" r="2.2" /><circle cx="11" cy="18" r="2.2" /><path d="M8 6.4l7.8.4M7 7.8l3 8.3M16.9 9l-4.6 7.2" /></Icon>
        </button>
        {toolBtn("vertex", "Vértice", <><circle cx="12" cy="12" r="5.5" /><path d="M12 9.5v5M9.5 12h5" /></>, "Vértice (N): toque no vazio cria; arraste de um vértice para ligar. Tab no vértice selecionado cria um vizinho ligado")}
        {toolBtn("edge", "Aresta", <><circle cx="5.5" cy="17.5" r="2.5" /><circle cx="18.5" cy="6.5" r="2.5" /><path d="M7.5 15.8l9-7.6" /></>, "Aresta (G): arraste de um vértice a outro; soltar no vazio cria um vértice novo")}
        {(t.tool === "vertex" || t.tool === "edge") && (
          <>
            <button className={graph.directed ? "btn on" : "btn"} onClick={() => graph.set({ directed: !graph.directed })} aria-pressed={graph.directed} aria-label="Aresta direcionada" title={graph.directed ? "Direcionada (seta) — toque para não direcionada" : "Não direcionada — toque para direcionada (seta)"}>
              <Icon>{graph.directed ? <><path d="M5 19L19 5" /><path d="M11 5h8v8" /></> : <path d="M5 19L19 5" />}</Icon>
            </button>
            <button className={graph.weighted ? "btn text on" : "btn text"} onClick={() => graph.set({ weighted: !graph.weighted })} aria-pressed={graph.weighted} aria-label="Aresta ponderada" title={graph.weighted ? "Ponderada: ao criar, digite o peso" : "Sem peso — toque para ponderada"}>
              {graph.weighted ? "Peso ✓" : "Peso"}
            </button>
          </>
        )}
      </div>
    ),
    page: (
      <div className="group">
        <button className={panel === "paper" ? "btn on" : "btn"} onClick={() => toggle("paper")} aria-expanded={panel === "paper"} aria-label="Papel" title="Papel">
          <Icon><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M4 15h16M10 4v16M15 4v16" /></Icon>
        </button>
        <button className={panel === "feel" ? "btn on" : "btn"} onClick={() => toggle("feel")} aria-expanded={panel === "feel"} aria-label="Ajustes da caneta" title="Ajustes da caneta">
          <Icon><path d="M4 20l4-1 11-11a2.1 2.1 0 00-3-3L5 16l-1 4z" /><path d="M3 22h5" /></Icon>
        </button>
        <button className={panel === "text" ? "btn on" : "btn"} onClick={() => toggle("text")} aria-expanded={panel === "text"} aria-label="Estilo do texto" title="Estilo do texto">
          <Icon><path d="M3 18l4.5-11L12 18M4.8 14h5.4" /><path d="M14 18l3-7 3 7M15 16h4" /></Icon>
        </button>
        <button className={t.fingerDraws ? "btn on" : "btn"} onClick={() => t.set({ fingerDraws: !t.fingerDraws })} aria-pressed={t.fingerDraws} aria-label="Desenhar com o dedo" title={t.fingerDraws ? "Dedo desenha" : "Dedo só move a tela"}>
          <Icon><path d="M9 11V6a1.5 1.5 0 013 0v5m0 0V8a1.5 1.5 0 013 0v5a6 6 0 01-6 6 6 6 0 01-5-3l-1.5-2.5A1.5 1.5 0 016.4 12L9 14" /></Icon>
        </button>
      </div>
    ),
  };

  const renderBlock = (id: BlockId) => (
    <div key={id} className={dropHint?.startsWith(`block:${id}:`) ? `blk drop-${dropHint.endsWith("b") ? "before" : "after"}` : "blk"} data-block={id}>
      <BlockHandle id={id} />
      {blocks[id]}
    </div>
  );
  const renderBlocks = (side: "bottom" | "left" | "right") => blocksOn(layout, side).map(renderBlock);
  const floatIds = floatLeaders(layout);
  const leftIds = blocksOn(layout, "left");
  const rightIds = blocksOn(layout, "right");
  const bottomIds = blocksOn(layout, "bottom");

  // As barras laterais empurram a barra de baixo para não ficarem uma em cima da outra (ver .dock no CSS).
  useEffect(() => {
    const s = document.body.style;
    s.setProperty("--railL", leftIds.length ? "72px" : "0px");
    s.setProperty("--railR", rightIds.length ? "72px" : "0px");
  }, [leftIds.length, rightIds.length]);

  // Blocos flutuantes nunca ficam fora da tela: reajusta ao abrir (a janela pode ser menor que na última vez), ao redimensionar/girar o aparelho
  // e quando o tamanho do bloco muda (girar o bloco, trocar de ferramenta, abrir a barra de páginas).
  const floatKey = floatIds.map((id) => `${id}:${layout.floats[id]?.x},${layout.floats[id]?.y},${layout.floats[id]?.vertical}`).join("|");
  useEffect(() => {
    if (!floatIds.length) return;
    const fix = () => {
      const st = useLayout.getState();
      for (const id of floatLeaders(st.layout)) {
        const pos = st.layout.floats[id];
        const el = document.querySelector<HTMLElement>(`[data-fbar="${id}"]`);
        if (!pos || !el) continue;
        const r = el.getBoundingClientRect();
        const c = clampPosition(pos, { w: r.width, h: r.height }, { w: window.innerWidth, h: window.innerHeight });
        if (Math.abs(c.x - pos.x) > 0.5 || Math.abs(c.y - pos.y) > 0.5) st.setFloat(id, { ...pos, x: c.x, y: c.y });
      }
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
        <div className="panel" role="dialog" aria-label="Estilo do texto" data-text-ui onMouseDown={(e) => e.preventDefault()}>
          <div className="row" role="radiogroup" aria-label="Fonte">
            {FONTS.map((f) => (
              <button
                key={f.id}
                role="radio"
                aria-checked={t.fontFamily === f.id}
                className={t.fontFamily === f.id ? "chip on" : "chip"}
                style={{ fontFamily: f.css }}
                onClick={() => { t.set({ fontFamily: f.id }); restyleText({ fontFamily: f.id }); }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="row" role="radiogroup" aria-label="Tamanho">
            <span className="rowlabel">Tamanho</span>
            {FONT_SIZES.map((z) => (
              <button
                key={z.value}
                role="radio"
                aria-checked={t.fontSize === z.value}
                className={t.fontSize === z.value ? "chip on" : "chip"}
                onClick={() => { t.set({ fontSize: z.value }); restyleText({ fontSize: z.value }); }}
              >
                {z.label}
              </button>
            ))}
          </div>
          <div className="row" role="radiogroup" aria-label="Alinhamento">
            <span className="rowlabel">Alinhar</span>
            {([["left", "Esquerda"], ["center", "Centro"], ["right", "Direita"]] as const).map(([id, label]) => (
              <button
                key={id}
                role="radio"
                aria-checked={t.textAlign === id}
                className={t.textAlign === id ? "chip on" : "chip"}
                onClick={() => { t.set({ textAlign: id }); restyleText({ align: id }); }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="hint">Com a ferramenta Texto, clique no canvas para escrever. Enter quebra a linha; Esc, Ctrl+Enter ou clicar fora confirma. Com Selecionar: duplo toque num texto edita e no vazio cria. Estilo e cor mudam o texto selecionado.</p>
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

      {panel === "insert" && (
        <div className="panel" role="dialog" aria-label="Inserir">
          <div className="sec-title">Blocos</div>
          <BlockTiles onPick={() => setPanel(null)} />
          <div className="sec-title">Mais</div>
          <div className="tiles three" role="toolbar" aria-label="Inserir no quadro">
            <button className="tile icon" onClick={() => { void pasteFromButton(); setPanel(null); }} title="Cola o que está na área de transferência (Ctrl+V também funciona)">
              <Pic><rect x="13" y="5" width="18" height="20" rx="2" /><path d="M18 5V3h8v2M17 13h10M17 18h7" /></Pic><span>Colar</span>
            </button>
            <button className="tile icon" onClick={() => { attachRef.current?.click(); setPanel(null); }} title="Imagem, PDF ou qualquer arquivo">
              <Pic><rect x="9" y="4" width="26" height="20" rx="3" /><circle cx="17" cy="11" r="2.5" /><path d="M10 22l8-7 5 4 4-3 7 6" /></Pic><span>Imagem/arquivo</span>
            </button>
            <button className="tile icon" onClick={() => { setPanel(null); useTool.getState().set({ tool: "text" }); }} title="Ferramenta Texto (T)">
              <Pic><path d="M12 6h20M22 6v17M18 23h8" /></Pic><span>Texto</span>
            </button>
            <button className="tile icon" onClick={() => { setPanel(null); useUI.getState().setTemplatesOpen(true); }} title="Kanban, SWOT, Cornell, fluxograma…">
              <Pic><rect x="8" y="4" width="12" height="9" rx="2" /><rect x="24" y="4" width="12" height="9" rx="2" /><rect x="8" y="16" width="12" height="9" rx="2" /><rect x="24" y="16" width="12" height="9" rx="2" /></Pic><span>Modelo</span>
            </button>
            <button className="tile icon" onClick={() => { setPanel(null); useUI.getState().setTemplatesOpen(true, "mapas"); }} title="Mapa mental pronto">
              <Pic><rect x="17" y="11" width="10" height="6" rx="3" /><path d="M17 14c-4 0-4-7-8-7M17 14c-4 0-4 7-8 7M27 14c4 0 4-7 8-7M27 14c4 0 4 7 8 7" /></Pic><span>Mapa mental</span>
            </button>
            <button className="tile icon" onClick={() => toggle("science")} title="Grafos, sólidos, gráficos, calculadora">
              <Pic><circle cx="12" cy="8" r="3" /><circle cx="32" cy="9" r="3" /><circle cx="22" cy="22" r="3" /><path d="M15 8h14M14 11l6 9M30 12l-6 8" /></Pic><span>Grafo/figura</span>
            </button>
          </div>
          <p className="hint">Dica: tire um print e aperte <b>Ctrl+V</b> com o quadro em foco. Links do YouTube viram vídeo; PDFs viram objeto com páginas. Também dá para arrastar arquivos e links para o quadro.</p>
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
            </div>
          )}
        </div>
        <button className="btn" onClick={() => useUI.getState().setSettingsOpen(true)} aria-label="Configurações" title="Configurações">
          <Icon><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></Icon>
        </button>
        <input ref={attachRef} type="file" multiple hidden onChange={(e) => { Array.from(e.target.files ?? []).forEach((f, i) => { const c = worldPoint(); void addAttachmentFile(f, { x: c.x + i * 24, y: c.y + i * 24 }); }); e.target.value = ""; }} />
        <input ref={fileRef} type="file" accept=".hiraku,application/json" hidden onChange={(e) => { void open(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {leftIds.length > 0 && (
        <div className="toolbar rail vbar rail-left" data-rail="left" ref={leftRef} role="toolbar" aria-orientation="vertical" aria-label="Ferramentas (esquerda)" onClickCapture={noteAnchor("left")}>
          {leftIds.length > 1 && <BarHandle side="left" vertical />}
          {renderBlocks("left")}
        </div>
      )}
      {rightIds.length > 0 && (
        <div className="toolbar rail vbar rail-right" data-rail="right" ref={rightRef} role="toolbar" aria-orientation="vertical" aria-label="Ferramentas (direita)" onClickCapture={noteAnchor("right")}>
          {rightIds.length > 1 && <BarHandle side="right" vertical />}
          {renderBlocks("right")}
        </div>
      )}

      <div className="dock" ref={dockRef}>
        {!panelPosition && panelsNode}
        {selCount > 0 && (
          <div className="toolbar selbar" role="toolbar" aria-label="Ações da seleção" onClickCapture={() => { anchorRef.current = null; }}>
            <span className="count">{selCount} {selCount === 1 ? "selecionado" : "selecionados"}</span>
            {selBlock && <button className="btn text" onClick={() => editSelectedBlock()}>Editar</button>}
            <button className="btn text" onClick={() => toggle("map")}>Mapa…</button>
            <button className="btn text" onClick={duplicateSelection}>Duplicar</button>
            <button className="btn text danger" onClick={deleteSelection}>Apagar</button>
            <button className="btn text" onClick={() => useSel.getState().clear()}>Desmarcar</button>
          </div>
        )}

        {bottomIds.length > 0 && (
          <div className="toolbar" data-rail="bottom" role="toolbar" aria-label="Ferramentas" onClickCapture={noteAnchor("bottom")}>
            {bottomIds.length > 1 && <BarHandle side="bottom" vertical={false} />}
            {renderBlocks("bottom")}
          </div>
        )}
      </div>

      {floatIds.length > 0 && (
        <div className="float-layer" ref={floatsRef}>
          {floatIds.map((id) => {
            const f = layout.floats[id] ?? defaultFloat(layout);
            const members = groupMembers(layout, id);
            const name = members.map((m) => BLOCKS.find((b) => b.id === m)?.label ?? m).join(", ");
            return (
              <div
                key={id}
                data-fbar={id}
                className={f.vertical ? "toolbar fbar vbar" : "toolbar fbar"}
                style={{ left: f.x, top: f.y }}
                role="toolbar"
                aria-orientation={f.vertical ? "vertical" : "horizontal"}
                aria-label={`Barra flutuante: ${name}`}
                onClickCapture={noteAnchor("float")}
              >
                {members.length > 1 && <BarHandle leader={id} vertical={f.vertical} />}
                {members.map(renderBlock)}
                <button className="btn fdock" onClick={() => useLayout.getState().homeGroup(id)} aria-label={`Encaixar ${name} de volta`} title="Encaixar de volta nas barras">
                  <Icon size={16}><path d="M12 4v10M7.5 10l4.5 4.5 4.5-4.5M5 19h14" /></Icon>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {panel && panelPosition && (
        <div className="panel-float" ref={floatRef} style={{ left: panelPosition.x, top: panelPosition.y }}>
          {panelsNode}
        </div>
      )}

      {dragging && (
        <div className="dropzones" aria-hidden="true">
          {([["left", "Esquerda"], ["bottom", "Embaixo"], ["right", "Direita"]] as const).map(([side, label]) => (
            <div key={side} data-dropzone={side} className={dropHint === `zone:${side}` ? "dz on" : "dz"} data-side={side}>
              <span>Encaixar · {label}</span>
            </div>
          ))}
        </div>
      )}

      <Settings />
    </>
  );
}
