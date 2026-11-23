// Renderização com PixiJS (WebGL). Só DESENHA o modelo; nunca altera o documento.
// Camadas (de baixo para cima): papel (tela) → mundo [elementos + ao vivo] → seleção (tela) → cursor (tela).
import { Application, Container, Graphics, Matrix, Text, Sprite, Texture } from "pixi.js";
import { Camera, defaultCamera } from "../core/camera";
import { DEFAULT_BACKGROUND, Layer, HirakuElement, NodeElement, InkPoint, LinearElement, PaperKind, ShapeElement, isLinear, isShape } from "../core/model";
import { Affine, SelectionUI, frameCornersScreen, handlePositions } from "../core/selection";
import { Pt } from "../core/shapes";
import { FONT_CSS, LINE_HEIGHT } from "../core/text";
import { drawLinearElement, drawShapeElement } from "./shapeDraw";
import { linearPath } from "../core/linear";
import { decimateForPreview } from "../core/ink";
import { MARGIN_COLOR, PaperLayer, autoLineColor, drawPaperPattern, layerAlpha } from "../core/paper";
import { paintFrame, paintNode } from "./mindDraw";
import { InkNode, InkStyle, drawStrokeElement } from "./strokeDraw";
import { clampPage, clampScroll, fitContain, parseYouTube, scrollLayout, visiblePages, youtubeThumb } from "../core/embed";
import { useEmbedView } from "../core/embedView";
import { clearImageTextures, loadImageTexture, peekImageTexture } from "./imageTexture";
import { figurePrims } from "../core/figures";
import { arrowHead } from "./figureSvg";

const LINE = "#1B2233";
const INDIGO = "#2F4B8F";

/** Graphics para traços/formas/linhas; Container (com um Text dentro) para textos. */
interface Node {
  g: Container;
  el: HirakuElement;
  /** Versão em pré-visualização (arrastar um ramo): o desenho dos filhos usa esta em vez de `el`. */
  view?: HirakuElement;
  /** Dependências do desenho (pai, raiz, nº de filhos): mudou → repinta. */
  dep?: unknown[];
}

/** Ponto no meio do caminho (pelo comprimento). */
function pathMidpoint(pts: { x: number; y: number }[]) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + d >= total / 2 && d > 0) {
      const t = (total / 2 - acc) / d;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    acc += d;
  }
  return pts[0] ?? { x: 0, y: 0 };
}

const sameDep = (a?: unknown[], b?: unknown[]) => a === b || (!!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]));

const drawEl = (g: Graphics, el: HirakuElement) => {
  if (isLinear(el)) drawLinearElement(g, el);
  else if (isShape(el)) drawShapeElement(g, el);
};

export class Renderer {
  private app = new Application();
  private paperLayer = new Graphics();
  private world = new Container();
  /** Uma pilha por camada da página: [quadros (sempre abaixo), resto]. Ordem dos filhos = ordem das camadas. */
  private layerRoot = new Container();
  private layerBox = new Map<string, { root: Container; frames: Container; committed: Container }>();
  private live = new Graphics();
  private liveInk = new InkNode();
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
  private paper: { kind: PaperKind; bg: string; scale: number; line: string | null } = { kind: "blank", bg: DEFAULT_BACKGROUND, scale: 1, line: null };
  private paperSize = { w: 0, h: 0 };
  ready = false;

  async init(canvas: HTMLCanvasElement, host: HTMLElement) {
    await this.app.init({
      canvas,
      resizeTo: host,
      background: DEFAULT_BACKGROUND,
      preference: "webgl",
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      powerPreference: "high-performance",
    });
    this.world.addChild(this.layerRoot, this.live, this.liveInk);
    this.app.stage.addChild(this.paperLayer, this.world, this.selLayer, this.overlay);
    // Redesenha o papel se a janela mudar de tamanho.
    this.app.ticker.add(() => {
      const { width, height } = this.app.screen;
      if (width !== this.paperSize.w || height !== this.paperSize.h) this.drawPaper();
      // Eventos de ponteiro podem chegar muito mais rápido que a tela. Agrupa-os por frame:
      // evita redesenhar o polígono completo dezenas/centenas de vezes entre dois frames.
      if (this.liveDirty && this.liveStyle && this.pendingLivePoints) {
        this.liveDirty = false;
        // Mesma geometria durante o gesto e depois de soltar: nada "salta" no pointerup.
        this.liveInk.setStroke(decimateForPreview(this.pendingLivePoints), this.liveStyle);
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

  setPaper(kind: PaperKind, bg: string, scale = 1, line: string | null = null) {
    const p = this.paper;
    if (kind === p.kind && bg === p.bg && scale === p.scale && line === p.line) return;
    this.paper = { kind, bg, scale, line };
    this.app.renderer.background.color = bg;
    this.drawPaper();
  }

  /** O papel é desenhado em espaço de TELA (só o que está visível) com nível de detalhe por zoom (core/paper.ts). */
  private drawPaper() {
    const g = this.paperLayer;
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    this.paperSize = { w: W, h: H };
    g.clear();
    const { kind, bg, scale, line } = this.paper;
    if (kind === "blank") return;
    const color = line ?? autoLineColor(bg);
    const dark = autoLineColor(bg) !== "#1B2233";
    const snap = (v: number) => Math.round(v) + 0.5;
    const layers: number[][] = [[], [], []];
    const dots: number[] = [];
    drawPaperPattern(kind, this.cam, W, H, {
      line: (x1, y1, x2, y2, layer: PaperLayer) => {
        // retas horizontais/verticais caem no meio do pixel (nítidas); diagonais ficam como estão
        if (x1 === x2) { x1 = x2 = snap(x1); } else if (y1 === y2) { y1 = y2 = snap(y1); }
        layers[layer].push(x1, y1, x2, y2);
      },
      dot: (x, y, r) => dots.push(x, y, r),
    }, { scale });
    layers.forEach((arr, layer) => {
      if (!arr.length) return;
      for (let i = 0; i < arr.length; i += 4) g.moveTo(arr[i], arr[i + 1]).lineTo(arr[i + 2], arr[i + 3]);
      const accent = layer === 2;
      g.stroke({
        width: accent ? 1.5 : 1,
        color: accent && kind === "margin" ? MARGIN_COLOR : color,
        alpha: layerAlpha(layer as PaperLayer, dark),
      });
    });
    if (dots.length) {
      for (let i = 0; i < dots.length; i += 3) g.circle(dots[i], dots[i + 1], dots[i + 2]);
      g.fill({ color, alpha: layerAlpha("dot", dark) });
    }
  }

  // ---------------- elementos gravados ----------------

  /** Reconcilia os nós do Pixi com a lista de elementos. Elementos são imutáveis: referência nova = redesenhar. */
  syncPage(elements: HirakuElement[], layers: Layer[] = []) {
    const boxes = this.syncLayers(layers);
    const firstLayer = layers[0]?.id ?? "";
    const boxOf = (el: HirakuElement) => boxes.get(el.layerId && boxes.has(el.layerId) ? el.layerId : firstLayer)!;
    const alive = new Set<string>();
    // contexto de mapa: pai, raiz e nº de filhos (só calculado se houver nós)
    const byId = new Map<string, HirakuElement>();
    const kids = new Map<string, number>();
    let hasNodes = false;
    for (const el of elements) {
      byId.set(el.id, el);
      if (el.type === "node") {
        hasNodes = true;
        if (el.parentId) kids.set(el.parentId, (kids.get(el.parentId) ?? 0) + 1);
      }
    }
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      alive.add(el.id);
      let n = this.nodes.get(el.id);
      const dep = hasNodes && el.type === "node" ? this.nodeDep(el, byId, kids) : undefined;
      if (!n) {
        const g = el.type === "text" || el.type === "node" || el.type === "frame" || el.type === "attachment" || isLinear(el) ? new Container() : el.type === "stroke" ? new InkNode() : new Graphics();
        n = { g, el, dep };
        this.nodes.set(el.id, n);
        this.paint(g, el, n);
      } else if (n.el !== el || !sameDep(n.dep, dep)) {
        n.g.setFromMatrix(new Matrix()); // descarta qualquer pré-visualização por matriz
        n.g.alpha = 1;
        n.el = el;
        n.view = undefined;
        n.dep = dep;
        this.paint(n.g, el, n);
      }
      // camada certa (o elemento pode ter mudado de camada) e ordem dentro dela (trazer para frente/enviar para trás)
      const box = boxOf(el);
      const parent = el.type === "frame" ? box.frames : box.committed;
      if (n.g.parent !== parent) parent.addChild(n.g);
      if (n.g.zIndex !== i) n.g.zIndex = i;
    }
    for (const [id, n] of this.nodes) {
      if (!alive.has(id)) {
        n.g.destroy({ children: true });
        this.nodes.delete(id);
        this.ghosts.delete(id);
      }
    }
  }

  /** Cria/remove/ordena os contêineres das camadas e aplica visibilidade e opacidade. */
  private syncLayers(layers: Layer[]) {
    const list = layers.length ? layers : [{ id: "", name: "", visible: true, locked: false, opacity: 1 }];
    const keep = new Set(list.map((l) => l.id));
    for (const [id, b] of this.layerBox) {
      if (keep.has(id)) continue;
      // os nós que estavam aqui são reaproveitados (mudam de camada) ou destruídos pelo syncPage: só solta os filhos
      for (const c of [...b.frames.children, ...b.committed.children]) c.removeFromParent();
      b.root.destroy({ children: true });
      this.layerBox.delete(id);
    }
    list.forEach((l, i) => {
      let b = this.layerBox.get(l.id);
      if (!b) {
        const root = new Container();
        const frames = new Container();
        const committed = new Container();
        frames.sortableChildren = true;
        committed.sortableChildren = true;
        root.addChild(frames, committed);
        b = { root, frames, committed };
        this.layerBox.set(l.id, b);
        this.layerRoot.addChild(root);
      }
      if (this.layerRoot.getChildIndex(b.root) !== i) this.layerRoot.setChildIndex(b.root, i);
      b.root.visible = l.visible;
      b.root.alpha = l.opacity;
    });
    return this.layerBox;
  }

  private nodeDep(el: NodeElement, byId: Map<string, HirakuElement>, kids: Map<string, number>): unknown[] {
    const parent = el.parentId ? byId.get(el.parentId) : undefined;
    let root: HirakuElement = parent?.type === "node" ? parent : el;
    for (let i = 0; i < 64 && root.type === "node" && root.parentId; i++) {
      const up = byId.get(root.parentId);
      if (!up || up.type !== "node") break;
      root = up;
    }
    return [parent, root, kids.get(el.id) ?? 0];
  }

  /** Pai/raiz/filhos de um nó de mapa para o desenho, preferindo as versões em pré-visualização. */
  private nodeCtx(el: NodeElement) {
    const look = (id?: string | null) => {
      const n = id ? this.nodes.get(id) : undefined;
      const e = n ? n.view ?? n.el : undefined;
      return e && e.type === "node" ? e : null;
    };
    const parent = look(el.parentId);
    let root: NodeElement = parent ?? el;
    for (let i = 0; i < 64 && root.parentId; i++) {
      const up = look(root.parentId);
      if (!up) break;
      root = up;
    }
    let kids = 0;
    if (el.collapsed) for (const n of this.nodes.values()) if (n.el.type === "node" && this.isDescendant(n.el, el.id)) kids++;
    return { parent, root: root === el && !parent ? el : root, kids, res: this.textRes() };
  }

  private isDescendant(n: NodeElement, ancestor: string): boolean {
    let cur: NodeElement | null = n;
    for (let i = 0; i < 64 && cur; i++) {
      const pid: string | null | undefined = cur.parentId;
      if (!pid) return false;
      if (pid === ancestor) return true;
      const up: Node | undefined = this.nodes.get(pid);
      cur = up && up.el.type === "node" ? up.el : null;
    }
    return false;
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
    n.view = el ?? undefined;
    this.paint(n.g, el ?? n.el, n);
  }

  /** Desenha o elemento no nó (Graphics) ou monta o Text (Container). */
  private paint(node: Container, el: HirakuElement, _n?: Node) {
    if (el.type === "node") {
      paintNode(node, el, this.nodeCtx(el));
    } else if (el.type === "frame") {
      paintFrame(node, el, this.textRes());
    } else if (el.type === "attachment") {
      for (const ch of node.removeChildren()) ch.destroy({ children: true });
      node.alpha = el.opacity;
      if (el.kind === "image" && el.data) {
        this.paintImage(node, el);
      } else if (el.kind === "video" && parseYouTube(el.url)) {
        this.paintVideo(node, el);
        node.eventMode = "none";
      } else if (el.kind === "figure" && el.figure) {
        this.paintFigure(node, el);
        node.eventMode = "none";
      } else if (el.kind === "pdf" && el.data) {
        this.paintPdf(node, el);
        node.eventMode = "none";
      } else {
        const card = new Graphics().roundRect(el.x, el.y, el.w, el.h, 12).fill({ color: 0xF7F8FC }).stroke({ color: 0x9AA8C0, width: 1.5 });
        card.roundRect(el.x + 12, el.y + 12, 36, 36, 8).fill({ color: el.kind === "link" ? 0xDCE8FF : 0xE8E4F8 });
        node.addChild(card);
        const badge = new Text({ text: el.kind === "link" ? "↗" : "↧", style: { fontFamily: "Arial", fontSize: 22, fill: 0x2F4B8F } });
        badge.position.set(el.x + 21, el.y + 17); node.addChild(badge);
        const title = new Text({ text: el.title || (el.kind === "link" ? "Link" : "Arquivo anexado"), style: { fontFamily: "Arial", fontSize: 17, fontWeight: "bold", fill: 0x1B2233, wordWrap: true, wordWrapWidth: Math.max(80, el.w - 28) } });
        title.position.set(el.x + 14, el.y + 60); node.addChild(title);
        const detail = new Text({ text: el.url, style: { fontFamily: "Arial", fontSize: 12, fill: 0x52627A, wordWrap: true, wordWrapWidth: Math.max(80, el.w - 28) } });
        detail.position.set(el.x + 14, el.y + 88); node.addChild(detail);
        if ((el.kind === "link" && /^https?:\/\//i.test(el.url)) || (el.kind === "file" && el.data)) {
          node.eventMode = "static"; node.cursor = "pointer";
          node.removeAllListeners("pointertap");
          node.on("pointertap", () => {
            if (el.kind === "link") window.open(el.url, "_blank", "noopener,noreferrer");
            else if (el.data) { const a = document.createElement("a"); a.href = el.data; a.download = el.title || "anexo"; a.click(); }
          });
        } else { node.eventMode = "none"; }
      }
    } else if (el.type === "text") {
      for (const ch of node.removeChildren()) ch.destroy();
      const t = new Text({
        text: el.text,
        style: { fontFamily: FONT_CSS[el.fontFamily], fontSize: el.fontSize, fill: el.color, align: el.align, lineHeight: el.fontSize * LINE_HEIGHT },
      });
      t.resolution = this.textRes();
      if (el.angle === 0) {
        t.pivot.set(0, 0);
        t.position.set(el.x, el.y);
      } else {
        t.pivot.set(el.w / 2, el.h / 2);
        t.position.set(el.x + el.w / 2, el.y + el.h / 2);
        t.rotation = el.angle;
      }
      node.addChild(t);
      node.alpha = el.opacity;
    } else if (isLinear(el)) {
      // linha/seta + rótulo opcional no meio (peso de aresta, condição de fluxograma)
      for (const ch of node.removeChildren()) ch.destroy({ children: true });
      const g = new Graphics();
      drawLinearElement(g, el);
      node.addChild(g);
      if (el.label) {
        const mid = pathMidpoint(linearPath(el));
        const t = new Text({ text: el.label, style: { fontFamily: "Inter, system-ui, sans-serif", fontSize: 15, fontWeight: "600", fill: el.stroke } });
        t.resolution = this.textRes();
        t.anchor.set(0.5);
        t.position.set(mid.x, mid.y);
        const pad = 4;
        const bg = new Graphics().roundRect(mid.x - t.width / 2 - pad, mid.y - t.height / 2 - pad / 2, t.width + pad * 2, t.height + pad, 6).fill({ color: 0xffffff, alpha: 0.92 }).stroke({ color: el.stroke, width: 1, alpha: 0.35 });
        node.addChild(bg, t);
      }
      node.alpha = 1;
    } else if (el.type === "stroke") {
      drawStrokeElement(node as InkNode, el);
    } else {
      const g = node as Graphics;
      g.clear();
      drawEl(g, el);
    }
  }

  /** Imagem anexada: com a textura já em cache desenha na hora; senão mostra um quadro "Carregando…"
   *  e troca pelo sprite quando a imagem terminar de decodificar (sem depender de novo repaint). */
  private imageKey = new WeakMap<Container, string>();

  private paintImage(node: Container, el: Extract<HirakuElement, { type: "attachment" }>) {
    const src = el.data as string;
    const put = (tex: Texture) => {
      const sprite = new Sprite(tex);
      sprite.position.set(el.x, el.y);
      sprite.width = el.w; sprite.height = el.h; // só depois de a textura ter tamanho real
      node.addChild(sprite);
    };
    this.imageKey.set(node, src);
    const hit = peekImageTexture(src);
    if (hit) { put(hit); return; }
    const hold = new Graphics().roundRect(el.x, el.y, el.w, el.h, 6).fill({ color: 0xEEF1F7 }).stroke({ color: 0xB4BED0, width: 1 });
    node.addChild(hold);
    void loadImageTexture(src).then((tex) => {
      // o nó pode ter sido destruído, repintado com outra imagem ou apagado enquanto carregava
      if (node.destroyed || this.imageKey.get(node) !== src) return;
      for (const ch of node.removeChildren()) ch.destroy({ children: true });
      if (tex) put(tex);
      else {
        const bad = new Graphics().roundRect(el.x, el.y, el.w, el.h, 6).fill({ color: 0xFBECEC }).stroke({ color: 0xD9A0A0, width: 1 });
        node.addChild(bad);
        const t = new Text({ text: "Imagem inválida", style: { fontFamily: "Arial", fontSize: 14, fill: 0x8A3B3B } });
        t.position.set(el.x + 10, el.y + 10); node.addChild(t);
      }
    });
  }

  private pdf: typeof import("./pdfDoc") | null = null;

  /** Repinta um anexo (ex.: virou a página do PDF) com a versão mais recente do elemento. */
  refreshAttachment(id: string) {
    const n = this.nodes.get(id);
    if (!n || n.g.destroyed) return;
    this.paint(n.g, n.view ?? n.el, n);
  }

  /**
   * PDF: carrossel (uma página por vez) ou rolagem (páginas empilhadas dentro do quadro, com máscara).
   * As páginas viram textura só quando aparecem; ao ficarem prontas o nó é repintado sozinho.
   */
  private paintPdf(node: Container, el: Extract<HirakuElement, { type: "attachment" }>) {
    const src = el.data as string;
    const count = Math.max(1, el.pages ?? 1);
    const ratio = el.ratio ?? 1.414;
    const view = useEmbedView.getState();
    node.addChild(new Graphics().roundRect(el.x, el.y, el.w, el.h, 6).fill({ color: 0xFFFFFF }).stroke({ color: 0xB4BED0, width: 1 }));

    const pdf = this.pdf;
    if (!pdf) { // módulo do pdf.js ainda não carregou: carrega e repinta
      void import("./pdfDoc").then((m) => { this.pdf = m; this.refreshAttachment(el.id); });
      this.note(node, el, "Abrindo PDF…");
      return;
    }
    const want = (p: number) => { // pede a página e repinta quando chegar
      if (pdf.peekPage(src, p) || pdf.pageFailed(src, p)) return;
      void pdf.loadPage(src, p).then(() => { this.refreshAttachment(el.id); });
    };
    const drawPage = (p: number, x: number, y: number, w: number, h: number, into: Container) => {
      const tex = pdf.peekPage(src, p);
      if (tex) {
        const f = fitContain(w, h, tex.width, tex.height);
        const sp = new Sprite(tex);
        sp.position.set(x + f.x, y + f.y);
        sp.width = f.w; sp.height = f.h; // textura já tem tamanho real
        into.addChild(sp);
      } else {
        const t = new Text({ text: pdf.pageFailed(src, p) ? "Página indisponível" : "Carregando página…", style: { fontFamily: "Arial", fontSize: 14, fill: 0x52627A } });
        t.position.set(x + (w - t.width) / 2, y + Math.min(h, 120) / 2);
        into.addChild(t);
      }
    };

    if (el.mode === "scroll") {
      const L = scrollLayout(el.w, ratio, count);
      const scroll = clampScroll(view.scroll[el.id] ?? 0, L.total, el.h);
      const clip = new Graphics().rect(el.x, el.y, el.w, el.h).fill({ color: 0xFFFFFF });
      const body = new Container();
      node.addChild(clip, body);
      body.mask = clip;
      for (const p of visiblePages(scroll, el.h, L.step, count)) {
        const y = el.y + (p - 1) * L.step - scroll;
        body.addChild(new Graphics().rect(el.x, y, el.w, L.slot).fill({ color: 0xFFFFFF }).stroke({ color: 0xDDE3EE, width: 1 }));
        drawPage(p, el.x, y, el.w, L.slot, body);
        want(p);
      }
      const maxS = L.total - el.h;
      if (maxS > 0) { // barra de rolagem
        const bh = Math.max(24, el.h * (el.h / L.total));
        const by = el.y + (scroll / maxS) * (el.h - bh);
        body.addChild(new Graphics().roundRect(el.x + el.w - 8, by, 4, bh, 2).fill({ color: 0x1B2233, alpha: 0.35 }));
      }
    } else {
      const page = clampPage(view.page[el.id] ?? 1, count);
      drawPage(page, el.x, el.y, el.w, el.h, node);
      want(page);
      if (page < count) want(page + 1); // adianta a vizinha para a virada ser instantânea
      if (page > 1) want(page - 1);
    }
  }

  /** Figura matemática: as mesmas primitivas das prévias SVG (core/figures.ts), desenhadas com Graphics + Text. */
  private paintFigure(node: Container, el: Extract<HirakuElement, { type: "attachment" }>) {
    const p = figurePrims(el.figure!, el.w, el.h);
    const g = new Graphics();
    g.position.set(el.x, el.y);
    node.addChild(g);
    for (const q of p.polys) g.poly(q.pts.flatMap((v) => [v.x, v.y]), true).fill({ color: q.fill, alpha: q.alpha });
    for (const l of p.lines) {
      const pts = l.closed ? [...l.pts, l.pts[0]] : l.pts;
      if (l.dash) {
        // tracejado manual (o Pixi não tem dash): segmentos de 3w com intervalo 2.5w
        const on = l.width * 3, off = l.width * 2.5;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          for (let t = 0; t < len; t += on + off) {
            const t2 = Math.min(len, t + on);
            g.moveTo(a.x + ((b.x - a.x) * t) / len, a.y + ((b.y - a.y) * t) / len).lineTo(a.x + ((b.x - a.x) * t2) / len, a.y + ((b.y - a.y) * t2) / len);
          }
        }
      } else {
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      }
      g.stroke({ width: l.width, color: l.color, alpha: l.alpha ?? 1, cap: "round", join: "round" });
    }
    for (const a of p.arrows) g.poly(arrowHead(a.from, a.to, a.size).flatMap((v) => [v.x, v.y]), true).fill({ color: a.color });
    for (const d of p.dots) g.circle(d.x, d.y, d.r).fill({ color: d.color });
    const res = this.textRes();
    for (const t of p.texts) {
      const tx = new Text({ text: t.text, style: { fontFamily: "Inter, system-ui, sans-serif", fontSize: t.size, fill: t.color, fontWeight: t.bold ? "600" : "400" } });
      tx.resolution = res;
      tx.anchor.set(t.anchor === "start" ? 0 : t.anchor === "middle" ? 0.5 : 1, t.base === "top" ? 0 : t.base === "middle" ? 0.5 : 1);
      tx.position.set(el.x + t.x, el.y + t.y);
      node.addChild(tx);
    }
  }

  private note(node: Container, el: Extract<HirakuElement, { type: "attachment" }>, msg: string) {
    const t = new Text({ text: msg, style: { fontFamily: "Arial", fontSize: 14, fill: 0x52627A } });
    t.position.set(el.x + (el.w - t.width) / 2, el.y + el.h / 2 - t.height / 2);
    node.addChild(t);
  }

  /** Vídeo do YouTube parado: miniatura (quando carrega) + botão de play. O player real é um iframe na camada DOM. */
  private paintVideo(node: Container, el: Extract<HirakuElement, { type: "attachment" }>) {
    const yt = parseYouTube(el.url);
    if (!yt) return;
    const thumb = youtubeThumb(yt.id);
    this.imageKey.set(node, thumb);
    node.addChild(new Graphics().roundRect(el.x, el.y, el.w, el.h, 10).fill({ color: 0x0F1420 }));
    // miniatura entra logo acima do fundo (índice 1) e é cortada pelo contorno arredondado do cartão
    const putThumb = (tex: Texture) => {
      const k = Math.max(el.w / tex.width, el.h / tex.height); // cobrir o cartão, sem esticar
      const sp = new Sprite(tex);
      sp.scale.set(k);
      sp.position.set(el.x + (el.w - tex.width * k) / 2, el.y + (el.h - tex.height * k) / 2);
      const mask = new Graphics().roundRect(el.x, el.y, el.w, el.h, 10).fill({ color: 0xFFFFFF });
      node.addChildAt(mask, 1);
      node.addChildAt(sp, 2);
      sp.mask = mask;
    };
    const hit = peekImageTexture(thumb);
    if (hit) putThumb(hit);
    else void loadImageTexture(thumb).then((tex) => {
      if (!tex || node.destroyed || this.imageKey.get(node) !== thumb) return;
      putThumb(tex);
    });
    // faixa com o título + botão de play
    const barH = Math.min(30, el.h * 0.2);
    node.addChild(new Graphics().roundRect(el.x, el.y + el.h - barH, el.w, barH, 10).fill({ color: 0x000000, alpha: 0.55 }));
    const title = new Text({ text: el.title || "Vídeo do YouTube", style: { fontFamily: "Arial", fontSize: Math.max(10, Math.min(14, barH * 0.5)), fill: 0xFFFFFF } });
    title.position.set(el.x + 10, el.y + el.h - barH + (barH - title.height) / 2);
    node.addChild(title);
    const cx = el.x + el.w / 2, cy = el.y + el.h / 2, r = Math.max(16, Math.min(46, Math.min(el.w, el.h) * 0.13));
    node.addChild(new Graphics().circle(cx, cy, r).fill({ color: 0xE62117, alpha: 0.92 }));
    node.addChild(new Graphics().poly([cx - r * 0.28, cy - r * 0.42, cx - r * 0.28, cy + r * 0.42, cx + r * 0.5, cy]).fill({ color: 0xFFFFFF }));
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
        if (n.el.type === "node" || n.el.type === "frame" || (n.el.type === "attachment" && n.el.kind === "figure") || (isLinear(n.el) && n.el.label)) {
          for (const c of n.g.children) if (c instanceof Text && Math.abs(c.resolution - r) / r > 0.12) c.resolution = r;
          continue;
        }
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
    this.liveInk.setStroke([], style); // só aplica cor/opacidade/mistura
    this.liveStyle = style;
    this.pendingLivePoints = null;
    this.liveDirty = false;
  }

  updateLive(points: InkPoint[], predicted?: InkPoint[]) {
    if (!this.liveStyle) return;
    // Guarda os pontos mais recentes; o ticker renderiza no máximo uma vez por frame.
    this.pendingLivePoints = predicted?.length ? [...points, ...predicted] : points;
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
    this.liveInk.setStroke([], { color: "#000000", width: 1, sens: 0, taper: 0, brush: "pen", opacity: 1 });
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
    for (const id of this.ghosts) {
      const el = this.nodes.get(id)?.el;
      // Traço: a opacidade vive no filtro de grupo do próprio nó, então o alpha do contêiner volta a 1.
      if (!ids.has(id)) this.setAlpha(id, el && el.type !== "stroke" ? el.opacity : 1);
    }
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
    clearImageTextures();
    this.pdf?.clearPdf();
  }
}
