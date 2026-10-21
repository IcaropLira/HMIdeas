import { useEffect, useRef } from "react";
import { applyColor, elementColor } from "../core/actions";
import { getBrush } from "../core/brushes";
import { panBy, screenToWorld, zoomAt } from "../core/camera";
import { elementHit } from "../core/geometry";
import { bindableAt, makeBinding, solveArrow } from "../core/binding";
import { makeLinear, snapAngle } from "../core/linear";
import { ArrowBinding, ArrowHead, HirakuElement, InkPoint, LinearElement, LinearType, SHAPE_TYPES, ShapeElement, ShapeType, TextElement, newId } from "../core/model";
import { Box, Pt, boxFromDrag, makeShape, outlinePath } from "../core/shapes";
import { selectActivePage, useDoc, useSel, useTool, useView } from "../core/store";
import { beginEditText, beginNewText, commitText, useEdit } from "../core/textEdit";
import { InputController, Sample } from "../input/InputController";
import { Renderer } from "../render/Renderer";
import { InkStyle } from "../render/strokeDraw";
import { createSelectController } from "../tools/selectTool";

interface Smoothed { x: number; y: number; p: number }
type Mode = "ink" | "erase" | "shape" | "linear" | "select" | "text";

const isShapeTool = (t: string): t is ShapeType => (SHAPE_TYPES as string[]).includes(t);
const isLinearTool = (t: string): t is LinearType => t === "line" || t === "arrow";

export function CanvasView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tool = useTool((s) => s.tool);
  const picking = useTool((s) => s.picking);

  useEffect(() => {
    const host = hostRef.current!;
    const canvas = canvasRef.current!;
    const renderer = new Renderer();
    const selectCtl = createSelectController(renderer);
    const unsubs: Array<() => void> = [];
    let input: InputController | null = null;
    let disposed = false;

    // --- estado do gesto atual ---
    let mode: Mode = "ink";
    let points: InkPoint[] = [];
    let sm: Smoothed = { x: 0, y: 0, p: 0.5 }; // posição suavizada (tela)
    let raw: Smoothed = { x: 0, y: 0, p: 0.5 }; // última amostra real (tela)
    let style = {
      color: "#000", width: 2, sens: 1, smoothing: 0, taper: 0, brush: "pen", opacity: 1,
      lineStyle: "solid" as ShapeElement["strokeStyle"], fill: null as string | null, rounded: true,
      startHead: "none" as ArrowHead, endHead: "arrow" as ArrowHead, curved: false,
    };
    let erased = new Set<string>();
    let lastErase: Pt | null = null;
    let shapeType: ShapeType = "rect";
    let shapeStart: Pt = { x: 0, y: 0 };
    let shapeBox: Box | null = null;
    let linType: LinearType = "arrow";
    let linStart: Pt = { x: 0, y: 0 };
    let linEl: LinearElement | null = null;
    // setas: elementos da página no início do gesto, ligações das duas pontas e comprimento arrastado
    let linEls: HirakuElement[] = [];
    let linById = new Map<string, HirakuElement>();
    let linStartBind: ArrowBinding | null = null;
    let linEndBind: ArrowBinding | null = null;
    let linDragLen = 0;
    const bindTol = () => 8 / useView.getState().camera.zoom;
    const bindHintUI = (hint: Pt[] | null) =>
      renderer.setSelectionUI({ frame: null, outlines: [], marquee: null, lineEdit: null, bindHint: hint });

    const worldPoint = (x: number, y: number, p: number): InkPoint => {
      const w = screenToWorld(useView.getState().camera, x, y);
      return { x: w.x, y: w.y, p };
    };

    /** Estabilização: média móvel exponencial; pressão levemente suavizada para tirar tremida. */
    const smoothStep = (t: Smoothed): InkPoint => {
      const k = style.smoothing;
      sm = { x: sm.x + (t.x - sm.x) * (1 - k), y: sm.y + (t.y - sm.y) * (1 - k), p: sm.p + (t.p - sm.p) * 0.5 };
      return worldPoint(sm.x, sm.y, sm.p);
    };

    /** Só aceita o ponto se andou ao menos ~0.3px de tela (evita milhares de pontos idênticos). */
    const accept = (pt: InkPoint): boolean => {
      const last = points[points.length - 1];
      if (!last) return true;
      const min = 0.3 / useView.getState().camera.zoom;
      return Math.hypot(pt.x - last.x, pt.y - last.y) >= min;
    };

    /** Estilo da tinta: a largura guardada no traço já inclui o multiplicador do brush; opacidade = brush × usuário. */
    const inkStyle = (): InkStyle => {
      const b = getBrush(style.brush);
      return { color: style.color, width: style.width * b.size, sens: style.sens, taper: style.taper, brush: b.id, opacity: b.opacity * style.opacity };
    };

    /** Conta-gotas: pega a cor do elemento mais acima sob o toque (ou a do papel, se não houver nenhum). */
    const pickColorAt = (s: Sample) => {
      const cam = useView.getState().camera;
      const P = screenToWorld(cam, s.x, s.y);
      const page = selectActivePage(useDoc.getState());
      let color = page.background;
      for (let i = page.elements.length - 1; i >= 0; i--) {
        if (elementHit(page.elements[i], P.x, P.y, 3 / cam.zoom)) {
          color = elementColor(page.elements[i]);
          break;
        }
      }
      useTool.getState().set({ picking: false });
      applyColor(color);
    };

    const shapeFrom = (id: string, box: Box): ShapeElement =>
      makeShape(id, shapeType, box, {
        stroke: style.color,
        strokeWidth: style.width,
        strokeStyle: style.lineStyle,
        fill: style.fill,
        rounded: style.rounded,
      });

    const eraseTo = (s: Sample) => {
      const cam = useView.getState().camera;
      const radiusPx = useTool.getState().eraserSize / 2;
      const r = radiusPx / cam.zoom;
      const to = screenToWorld(cam, s.x, s.y);
      const from = lastErase ?? to;
      // Interpola entre amostras: arrastar rápido não "pula" elementos.
      const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (r * 0.5)));
      const elements = selectActivePage(useDoc.getState()).elements;
      for (let i = 1; i <= steps; i++) {
        const x = from.x + ((to.x - from.x) * i) / steps;
        const y = from.y + ((to.y - from.y) * i) / steps;
        for (const el of elements) {
          if (!erased.has(el.id) && elementHit(el, x, y, r)) erased.add(el.id);
        }
      }
      lastErase = to;
      renderer.setGhosts(erased);
      renderer.drawEraserCursor(s.x, s.y, radiusPx);
    };

    const syncDoc = () => {
      const page = selectActivePage(useDoc.getState());
      renderer.setPaper(page.paper, page.background);
      renderer.syncPage(page.elements);
      // Poda ids de elementos que não existem mais (apagados, desfeitos…).
      const alive = new Set(page.elements.map((e) => e.id));
      const ids = useSel.getState().ids;
      const kept = ids.filter((id) => alive.has(id));
      if (kept.length !== ids.length) useSel.getState().set(kept);
      selectCtl.refresh();
    };

    (async () => {
      await renderer.init(canvas, host);
      if (disposed) {
        renderer.destroy();
        return;
      }

      renderer.setCamera(useView.getState().camera);
      syncDoc();

      unsubs.push(
        useDoc.subscribe((s, prev) => {
          if (s.doc !== prev.doc || s.activePageId !== prev.activePageId) syncDoc();
        }),
        useView.subscribe((s) => renderer.setCamera(s.camera)),
        useSel.subscribe(() => selectCtl.refresh()),
        // O texto em edição some do canvas (a <textarea> o substitui).
        useEdit.subscribe((s) => renderer.setHidden(s.session?.id ?? null)),
        useTool.subscribe((s, prev) => {
          if (s.tool === prev.tool) return;
          commitText();
          if (s.tool !== "eraser") renderer.hideEraserCursor();
          // Trocar para uma ferramenta de desenho desfaz a seleção.
          if (s.tool !== "select" && s.tool !== "lasso") useSel.getState().clear();
        }),
      );

      input = new InputController(
        canvas,
        {
          drawStart(s) {
            const t = useTool.getState();
            style = {
              color: t.color, width: t.width, sens: t.pressureSens, smoothing: t.smoothing, taper: t.taper,
              brush: t.brush, opacity: t.opacity,
              lineStyle: t.lineStyle, fill: t.fill, rounded: t.rounded,
              startHead: t.startHead, endHead: t.endHead, curved: t.curved,
            };

            if (t.picking) {
              mode = "text"; // sem movimento/fim: só pega a cor e acabou
              pickColorAt(s);
            } else if (s.eraserTip || t.tool === "eraser") {
              mode = "erase";
              erased = new Set();
              lastErase = null;
              eraseTo(s);
            } else if (t.tool === "text") {
              // Clique num texto edita; clique no vazio cria um novo.
              mode = "text";
              const cam = useView.getState().camera;
              const P = screenToWorld(cam, s.x, s.y);
              const els = selectActivePage(useDoc.getState()).elements;
              let hit: TextElement | null = null;
              for (let i = els.length - 1; i >= 0 && !hit; i--) {
                const e = els[i];
                if (e.type === "text" && elementHit(e, P.x, P.y, 4 / cam.zoom)) hit = e;
              }
              if (hit) beginEditText(hit);
              else beginNewText(P);
            } else if (t.tool === "select" || t.tool === "lasso") {
              mode = "select";
              selectCtl.start(s, t.tool === "lasso");
            } else if (isLinearTool(t.tool)) {
              mode = "linear";
              linType = t.tool;
              linStart = screenToWorld(useView.getState().camera, s.x, s.y);
              linEl = null;
              linDragLen = 0;
              linEls = selectActivePage(useDoc.getState()).elements;
              linById = new Map(linEls.map((e) => [e.id, e]));
              const startShape = linType === "arrow" ? bindableAt(linEls, linStart, bindTol()) : null;
              linStartBind = startShape ? makeBinding(startShape, linStart) : null;
              linEndBind = null;
            } else if (isShapeTool(t.tool)) {
              mode = "shape";
              shapeType = t.tool;
              shapeStart = screenToWorld(useView.getState().camera, s.x, s.y);
              shapeBox = null;
            } else {
              mode = "ink";
              sm = { x: s.x, y: s.y, p: s.pressure };
              raw = { ...sm };
              points = [worldPoint(sm.x, sm.y, sm.p)];
              renderer.beginLive(inkStyle());
              renderer.updateLive(points);
            }
          },

          drawMove(samples) {
            if (mode === "text") return;
            if (mode === "select") {
              selectCtl.move(samples);
              return;
            }
            if (mode === "erase") {
              samples.forEach(eraseTo);
              return;
            }
            if (mode === "linear") {
              const s = samples[samples.length - 1];
              let to: Pt = screenToWorld(useView.getState().camera, s.x, s.y);
              if (s.shift) to = snapAngle(linStart, to); // Shift trava em passos de 15°
              // Seta: solta a ponta sobre uma forma para ligar (a ponta gruda no contorno).
              const endShape = linType === "arrow" ? bindableAt(linEls, to, bindTol()) : null;
              linEndBind = endShape ? makeBinding(endShape, to) : null;
              linDragLen = Math.hypot(to.x - linStart.x, to.y - linStart.y);
              linEl = solveArrow(
                {
                  ...makeLinear("preview", linType, linStart, to, {
                    stroke: style.color, strokeWidth: style.width, strokeStyle: style.lineStyle,
                    startHead: style.startHead, endHead: style.endHead, curved: style.curved,
                  }),
                  startBinding: linStartBind,
                  endBinding: linEndBind,
                },
                linById,
              );
              renderer.previewElement(linEl);
              bindHintUI(endShape ? outlinePath(endShape) : null);
              return;
            }
            if (mode === "shape") {
              const s = samples[samples.length - 1];
              const to = screenToWorld(useView.getState().camera, s.x, s.y);
              shapeBox = boxFromDrag(shapeStart, to, s.shift, s.alt);
              renderer.previewElement(shapeFrom("preview", shapeBox));
              return;
            }
            let added = false;
            for (const s of samples) {
              raw = { x: s.x, y: s.y, p: s.pressure };
              const pt = smoothStep(raw);
              if (accept(pt)) {
                points.push(pt);
                added = true;
              }
            }
            if (added) renderer.updateLive(points); // uma vez por evento, não por amostra
          },

          drawEnd() {
            if (mode === "text") return;
            if (mode === "select") {
              selectCtl.end();
              return;
            }
            if (mode === "erase") {
              useDoc.getState().removeElements([...erased]);
              erased = new Set();
              lastErase = null;
              renderer.setGhosts(erased);
              return;
            }
            if (mode === "linear") {
              const min = 3 / useView.getState().camera.zoom; // clique sem arrastar não cria linha
              if (linEl && linDragLen >= min) useDoc.getState().addElement({ ...linEl, id: newId() });
              renderer.previewElement(null);
              linEl = null;
              selectCtl.refresh(); // tira o realce da forma-alvo
              return;
            }
            if (mode === "shape") {
              const min = 2 / useView.getState().camera.zoom; // clique sem arrastar não cria forma
              if (shapeBox && (shapeBox.w >= min || shapeBox.h >= min)) {
                useDoc.getState().addElement(shapeFrom(newId(), shapeBox));
              }
              renderer.previewElement(null);
              shapeBox = null;
              return;
            }
            // O traço suavizado fica atrás da caneta; alcança o último ponto de forma gradual.
            for (let i = 0; i < 10; i++) {
              const pt = smoothStep(raw);
              if (accept(pt)) points.push(pt);
            }
            if (points.length) {
              const ink = inkStyle();
              useDoc.getState().addElement({
                id: newId(),
                type: "stroke",
                points,
                color: ink.color,
                width: ink.width,
                sens: ink.sens,
                taper: ink.taper,
                brush: ink.brush,
                opacity: ink.opacity,
              });
            }
            // Primeiro grava no documento (o sync desenha o traço final), depois limpa o ao vivo.
            renderer.endLive();
            points = [];
          },

          drawCancel() {
            if (mode === "text") return;
            if (mode === "select") {
              selectCtl.cancel();
              return;
            }
            if (mode === "erase") {
              erased = new Set();
              lastErase = null;
              renderer.setGhosts(erased);
            } else if (mode === "shape" || mode === "linear") {
              renderer.previewElement(null);
              shapeBox = null;
              linEl = null;
              selectCtl.refresh();
            } else {
              renderer.endLive();
              points = [];
            }
          },

          pan(dx, dy) {
            const v = useView.getState();
            v.setCamera(panBy(v.camera, dx, dy));
          },
          zoom(factor, cx, cy) {
            const v = useView.getState();
            v.setCamera(zoomAt(v.camera, factor, cx, cy));
          },

          hover(s) {
            const t = useTool.getState();
            if (t.tool === "eraser" || s.eraserTip) renderer.drawEraserCursor(s.x, s.y, t.eraserSize / 2);
            else renderer.hideEraserCursor();
          },
          hoverEnd() {
            renderer.hideEraserCursor();
          },
        },
        {
          getTool: () => useTool.getState().tool,
          // Com Selecionar, o dedo seleciona/arrasta; pan e zoom ficam com 2 dedos.
          getFingerDraws: () => useTool.getState().fingerDraws || useTool.getState().tool === "select",
        },
      );
    })();

    return () => {
      disposed = true;
      unsubs.forEach((u) => u());
      input?.destroy();
      renderer.destroy();
    };
  }, []);

  return (
    <div ref={hostRef} className="canvas-host">
      <canvas ref={canvasRef} className={`canvas ${tool}${picking ? " pick" : ""}`} />
    </div>
  );
}
