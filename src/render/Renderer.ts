// Renderização com PixiJS (WebGL). Só DESENHA o modelo; nunca altera o documento.
// Camadas (de baixo para cima): papel (tela) → mundo [elementos + ao vivo] → seleção (tela) → cursor (tela).
import { Application, Container, Graphics, Matrix, Text } from "pixi.js";
import { Camera, defaultCamera } from "../core/camera";
import { DEFAULT_BACKGROUND, HirakuElement, InkPoint, LinearElement, PaperKind, ShapeElement, isLinear, isShape } from "../core/model";
import { Affine, SelectionUI, frameCornersScreen, handlePositions } from "../core/selection";
import { Pt } from "../core/shapes";
import { FONT_CSS, LINE_HEIGHT } from "../core/text";
import { drawLinearElement, drawShapeElement } from "./shapeDraw";
import { getBrush } from "../core/brushes";
import { InkStyle, applyBrushLook, drawInk, drawStrokeElement } from "./strokeDraw";

const LINE = "#1B2233";
const INDIGO = "#2F4B8F";

/** Graphics para traços/formas/linhas; Container (com um Text dentro) para textos. */
interface Node { g: Container; el: HirakuElement }

const drawEl = (g: Graphics, el: HirakuElement) => {
  if (el.type === "stroke") drawStrokeElement(g, el);
  else if (isLinear(el)) drawLinearElement(g, el);
  else if (isShape(el)) drawShapeElement(g, el);
};

export class Renderer {
  private app = new Application();
  private paperLayer = new Graphics();
  private world = new Container();
  private committed = new Container();
  private live = new Graphics();
  private selLayer = new Graphics();
  private overlay = new Graphics();

  private nodes = new Map<string, Node>();
  private ghosts = new Set<string>();
  private liveStyle: InkStyle | null = null;
  private pendingLivePoints: InkPoint[] | null = null;
  private liveDirty = false;
  private selUI: SelectionUI | null = null;
  private hiddenId: string | null = null;
  private resTimer: ReturnType<typeof setTimeout> | undefined;

  private cam: Camera = defaultCamera();
  private paper: { kind: PaperKind; bg: string } = { kind: "blank", bg: DEFAULT_BACKGROUND };
  private paperSize = { w: 0, h: 0 };
  ready = false;

  async init(canvas: HTMLCanvasElement, host: HTMLElement) {
    await this.app.init({
      canvas,
      resizeTo: host,
      background: DEFAULT_BACKGROUND,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      powerPreference: "high-performance",
    });
    this.world.addChild(this.committed, this.live);
    this.app.stage.addChild(this.paperLayer, this.world, this.selLayer, this.overlay);
    // Redesenha o papel se a janela mudar de tamanho.
    this.app.ticker.add(() => {
      const { width, height } = this.app.screen;
      if (width !== this.paperSize.w || height !== this.paperSize.h) this.drawPaper();
      // Eventos de ponteiro podem chegar muito mais rápido que a tela. Agrupa-os por frame:
      // evita redesenhar o polígono completo dezenas/centenas de vezes entre dois frames.
      if (this.liveDirty && this.liveStyle && this.pendingLivePoints) {
        this.liveDirty = false;
        this.live.clear();
        // Use a mesma geometria final durante o gesto e após soltar a caneta.
        // `last: false` muda a terminação do perfect-freehand e causa um salto visual no pointerup.
        drawInk(this.live, this.pendingLivePoints, this.liveStyle, true);
      }
    });
    this.ready = true;
  }

  // ---------------- câmera e papel ----------------

  setCamera(cam: Camera) {
    this.cam = cam;
    this.world.position.set(cam.x, cam.y);
    this.world.scale.set(cam.zoom);
    this.drawPaper();
    this.drawSelection();
    this.scheduleTextRes();
  }

  setPaper(kind: PaperKind, bg: string) {
    if (kind === this.paper.kind && bg === this.paper.bg) return;
    this.paper = { kind, bg };
    this.app.renderer.background.color = bg;
    this.drawPaper();
  }

  /** O papel é desenhado em espaço de TELA (só o que está visível) com nível de detalhe por zoom. */
  private drawPaper() {
    const g = this.paperLayer;
    const { x, y, zoom } = this.cam;
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    this.paperSize = { w: W, h: H };
    g.clear();
    const kind = this.paper.kind;
    if (kind === "blank") return;

    const base = kind === "ruled" ? 36 : 32;
    const minPx = kind === "dots" ? 14 : 9;
    let step = base;
    while (step * zoom < minPx) step *= 2; // zoom afastado → linhas mais espaçadas
    const sp = step * zoom;

    const firstX = x + Math.floor(-x / sp) * sp;
    const firstY = y + Math.floor(-y / sp) * sp;
    const snap = (v: number) => Math.round(v) + 0.5;

    if (kind === "dots") {
      for (let sx = firstX; sx < W + sp; sx += sp) {
        for (let sy = firstY; sy < H + sp; sy += sp) g.circle(sx, sy, 1.3);
      }
      g.fill({ color: LINE, alpha: 0.3 });
      return;
    }

    if (kind === "ruled") {
      for (let sy = firstY; sy < H + sp; sy += sp) g.moveTo(0, snap(sy)).lineTo(W, snap(sy));
      g.stroke({ width: 1, color: LINE, alpha: 0.14 });
      return;
    }

    // quadriculado: linha forte a cada 5 células
    for (let sx = firstX; sx < W + sp; sx += sp) {
      if (Math.round((sx - x) / sp) % 5 !== 0) g.moveTo(snap(sx), 0).lineTo(snap(sx), H);
    }
    for (let sy = firstY; sy < H + sp; sy += sp) {
      if (Math.round((sy - y) / sp) % 5 !== 0) g.moveTo(0, snap(sy)).lineTo(W, snap(sy));
    }
    g.stroke({ width: 1, color: LINE, alpha: 0.09 });
    for (let sx = firstX; sx < W + sp; sx += sp) {
      if (Math.round((sx - x) / sp) % 5 === 0) g.moveTo(snap(sx), 0).lineTo(snap(sx), H);
    }
    for (let sy = firstY; sy < H + sp; sy += sp) {
      if (Math.round((sy - y) / sp) % 5 === 0) g.moveTo(0, snap(sy)).lineTo(W, snap(sy));
    }
    g.stroke({ width: 1, color: LINE, alpha: 0.2 });
  }

  // ---------------- elementos gravados ----------------

  /** Reconcilia os nós do Pixi com a lista de elementos. Elementos são imutáveis: referência nova = redesenhar. */
  syncPage(elements: HirakuElement[]) {
    const alive = new Set<string>();
    for (const el of elements) {
      alive.add(el.id);
      const n = this.nodes.get(el.id);
      if (!n) {
        const g = el.type === "text" ? new Container() : new Graphics();
        this.paint(g, el);
        this.committed.addChild(g);
        this.nodes.set(el.id, { g, el });
      } else if (n.el !== el) {
        n.g.setFromMatrix(new Matrix()); // descarta qualquer pré-visualização por matriz
        n.g.alpha = 1;
        this.paint(n.g, el);
        n.el = el;
      }
    }
    for (const [id, n] of this.nodes) {
      if (!alive.has(id)) {
        n.g.destroy({ children: true });
        this.nodes.delete(id);
        this.ghosts.delete(id);
      }
    }
  }

  /** Pré-visualização barata: move/gira/escala o nó sem redesenhar (null restaura). */
  setNodeMatrix(id: string, m: Affine | null) {
    const n = this.nodes.get(id);
    if (n) n.g.setFromMatrix(m ? new Matrix(m.a, m.b, m.c, m.d, m.e, m.f) : new Matrix());
  }

  /** Redesenha um nó com outra versão do elemento (null = volta ao original). */
  redrawNode(id: string, el: HirakuElement | null) {
    const n = this.nodes.get(id);
    if (!n) return;
    n.g.setFromMatrix(new Matrix());
    this.paint(n.g, el ?? n.el);
  }

  /** Desenha o elemento no nó (Graphics) ou monta o Text (Container). */
  private paint(node: Container, el: HirakuElement) {
    if (el.type === "text") {
      for (const ch of node.removeChildren()) ch.destroy();
      const t = new Text({
        text: el.text,
        style: { fontFamily: FONT_CSS[el.fontFamily], fontSize: el.fontSize, fill: el.color, align: el.align, lineHeight: el.fontSize * LINE_HEIGHT },
      });
      t.resolution = this.textRes();
      t.pivot.set(el.w / 2, el.h / 2);
      t.position.set(el.x + el.w / 2, el.y + el.h / 2);
      t.rotation = el.angle;
      node.addChild(t);
      node.alpha = el.opacity;
    } else {
      const g = node as Graphics;
      g.clear();
      drawEl(g, el);
    }
  }

  // Texto é raster: ao dar zoom, rasteriza de novo em resolução maior (com atraso, para não travar o gesto).
  private textRes() {
    return Math.min(4, Math.max(1, (window.devicePixelRatio || 1) * this.cam.zoom));
  }

  private scheduleTextRes() {
    clearTimeout(this.resTimer);
    this.resTimer = setTimeout(() => {
      const r = this.textRes();
      for (const n of this.nodes.values()) {
        const t = n.el.type === "text" ? (n.g.children[0] as Text | undefined) : undefined;
        if (t && Math.abs(t.resolution - r) / r > 0.12) t.resolution = r;
      }
    }, 180);
  }

  /** Esconde um elemento enquanto ele é editado numa <textarea>. */
  setHidden(id: string | null) {
    if (this.hiddenId && this.hiddenId !== id) {
      const prev = this.nodes.get(this.hiddenId);
      if (prev) prev.g.visible = true;
    }
    this.hiddenId = id;
    if (id) {
      const n = this.nodes.get(id);
      if (n) n.g.visible = false;
    }
  }

  // ---------------- pré-visualização ao vivo ----------------
  // Refaz só o contorno do traço/forma EM ANDAMENTO (custo proporcional a ele, não à página).

  beginLive(style: InkStyle) {
    this.live.clear();
    this.liveStyle = style;
    this.pendingLivePoints = null;
    this.liveDirty = false;
    applyBrushLook(this.live, getBrush(style.brush), style.opacity);
  }

  updateLive(points: InkPoint[]) {
    if (!this.liveStyle) return;
    // Guarda a referência mais recente; o ticker renderiza no máximo uma vez por frame.
    this.pendingLivePoints = points;
    this.liveDirty = true;
  }

  previewElement(el: ShapeElement | LinearElement | null) {
    this.live.clear();
    this.live.alpha = 1;
    this.live.blendMode = "normal";
    if (!el) return;
    if (isLinear(el)) drawLinearElement(this.live, el);
    else drawShapeElement(this.live, el);
  }

  endLive() {
    this.live.clear();
    this.live.alpha = 1;
    this.live.blendMode = "normal";
    this.liveStyle = null;
    this.pendingLivePoints = null;
    this.liveDirty = false;
  }

  // ---------------- seleção (espaço de tela) ----------------

  setSelectionUI(ui: SelectionUI | null) {
    this.selUI = ui;
    this.drawSelection();
  }

  private w2s = (p: Pt): Pt => ({ x: p.x * this.cam.zoom + this.cam.x, y: p.y * this.cam.zoom + this.cam.y });
  private flat = (pts: Pt[]) => pts.flatMap((p) => [p.x, p.y]);

  private drawSelection() {
    const g = this.selLayer;
    g.clear();
    const ui = this.selUI;
    if (!ui) return;

    const m = ui.marquee;
    if (m?.kind === "box") {
      const a = this.w2s(m.a), b = this.w2s(m.b);
      g.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
        .fill({ color: INDIGO, alpha: 0.08 })
        .stroke({ width: 1, color: INDIGO, alpha: 0.7 });
    } else if (m?.kind === "lasso" && m.pts.length > 1) {
      const pts = m.pts.map(this.w2s);
      g.poly(this.flat(pts), true).fill({ color: INDIGO, alpha: 0.06 });
      g.poly(this.flat(pts), false).stroke({ width: 1.5, color: INDIGO, alpha: 0.85, cap: "round", join: "round" });
    }

    for (const o of ui.outlines) {
      g.poly(this.flat(o.map(this.w2s)), true).stroke({ width: 1, color: INDIGO, alpha: 0.45 });
    }

    if (ui.bindHint && ui.bindHint.length > 2) {
      g.poly(this.flat(ui.bindHint.map(this.w2s)), true).stroke({ width: 3, color: INDIGO, alpha: 0.5, join: "round" });
    }

    if (ui.lineEdit) {
      const pts = ui.lineEdit.points.map(this.w2s);
      for (let i = 0; i < pts.length - 1; i++) {
        g.circle((pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2, 4.5)
          .fill({ color: "#FFFFFF", alpha: 0.9 })
          .stroke({ width: 1.2, color: INDIGO, alpha: 0.8 });
      }
      for (const p of pts) g.rect(p.x - 5, p.y - 5, 10, 10).fill({ color: "#FFFFFF" }).stroke({ width: 1.5, color: INDIGO });
    }

    if (ui.frame) {
      const corners = frameCornersScreen(ui.frame, this.cam);
      g.poly(this.flat(corners), true).stroke({ width: 1.5, color: INDIGO, alpha: 0.9 });
      const hs = handlePositions(ui.frame, this.cam);
      const rot = hs.find((h) => h.id === "rot")!;
      const top = hs.find((h) => h.id === "n")!;
      g.moveTo(top.x, top.y).lineTo(rot.x, rot.y).stroke({ width: 1.5, color: INDIGO, alpha: 0.9 });
      for (const h of hs) {
        if (h.id === "rot") g.circle(h.x, h.y, 6.5);
        else g.rect(h.x - 5, h.y - 5, 10, 10);
        g.fill({ color: "#FFFFFF" }).stroke({ width: 1.5, color: INDIGO });
      }
    }
  }

  // ---------------- borracha ----------------

  /** Marca elementos que serão apagados (pré-visualização enquanto arrasta). */
  setGhosts(ids: Set<string>) {
    // Ao sair do "fantasma" volta à opacidade REAL do elemento (marca-texto, por exemplo, não é 1).
    for (const id of this.ghosts) if (!ids.has(id)) this.setAlpha(id, this.nodes.get(id)?.el.opacity ?? 1);
    for (const id of ids) this.setAlpha(id, 0.18);
    this.ghosts = new Set(ids);
  }

  private setAlpha(id: string, a: number) {
    const n = this.nodes.get(id);
    if (n) n.g.alpha = a;
  }

  /** Anel da borracha em coordenadas de TELA. */
  drawEraserCursor(sx: number, sy: number, radius: number) {
    this.overlay
      .clear()
      .circle(sx, sy, radius)
      .fill({ color: "#FFFFFF", alpha: 0.28 })
      .circle(sx, sy, radius)
      .stroke({ width: 1.5, color: LINE, alpha: 0.65 });
  }

  hideEraserCursor() {
    this.overlay.clear();
  }

  destroy() {
    if (!this.ready) return;
    this.ready = false;
    clearTimeout(this.resTimer);
    this.app.destroy(false, { children: true });
  }
}
