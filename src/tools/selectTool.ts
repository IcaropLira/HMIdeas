// Ferramentas Selecionar (V) e Laço (L): clique, caixa, laço, mover, redimensionar, girar
// e edição de pontos de linhas/setas.
// Durante o gesto NADA é gravado no documento: só pré-visualização no renderer.
// No fim, um único updateElements → um único passo de desfazer.
import { bindableAt, detachForeign, makeBinding, solveAffected, solveArrow } from "../core/binding";
import { screenToWorld } from "../core/camera";
import { elementHit } from "../core/geometry";
import { snapAngle } from "../core/linear";
import { HirakuElement, LinearElement } from "../core/model";
import {
  Frame, HandleId, SelectionUI, Xform, applyXform, boundsPolygon, boxSelect, elementBounds,
  hitHandle, lassoSelect, moveXform, pointInFrame, resizeXform, rotateXform, selectionFrame,
} from "../core/selection";
import { Pt, outlinePath } from "../core/shapes";
import { selectActivePage, useDoc, useSel, useTool, useView } from "../core/store";
import { beginEditText, beginNewText } from "../core/textEdit";
import { Sample } from "../input/InputController";
import { Renderer } from "../render/Renderer";

type Gesture =
  | { kind: "move"; startP: Pt; startS: Pt; orig: HirakuElement[]; next: HirakuElement[]; extra: string[]; moved: boolean; candidate: string | null }
  | { kind: "resize"; handle: Exclude<HandleId, "rot">; frame: Frame; startP: Pt; orig: HirakuElement[]; next: HirakuElement[]; extra: string[]; moved: boolean }
  | { kind: "rotate"; frame: Frame; startP: Pt; orig: HirakuElement[]; next: HirakuElement[]; extra: string[]; moved: boolean }
  | { kind: "vertex"; el: LinearElement; index: number; inserted: boolean; startS: Pt; next: LinearElement | null }
  | { kind: "box"; startP: Pt; startS: Pt; base: string[]; moved: boolean }
  | { kind: "lasso"; pts: Pt[]; base: string[] };

const isLinear = (el: HirakuElement): el is LinearElement => el.type === "line" || el.type === "arrow";
const touchy = (s: Sample) => s.pointerType !== "mouse";

/** Último toque do Selecionar: dois toques rápidos = editar texto / criar texto. */
let lastTap: { t: number; x: number; y: number } | null = null;

export function createSelectController(renderer: Renderer) {
  let g: Gesture | null = null;

  const page = () => selectActivePage(useDoc.getState());
  const cam = () => useView.getState().camera;
  const selectedEls = (): HirakuElement[] => {
    const ids = new Set(useSel.getState().ids);
    return page().elements.filter((e) => ids.has(e.id));
  };

  const buildUI = (
    marquee: SelectionUI["marquee"] = null,
    els: HirakuElement[] = selectedEls(),
    hint: Pt[] | null = null,
  ): SelectionUI => ({
    bindHint: hint,
    frame: selectionFrame(els),
    outlines: els.length > 1 ? els.map((e) => boundsPolygon(elementBounds(e))) : [],
    marquee,
    lineEdit: els.length === 1 && isLinear(els[0]) ? { points: els[0].points } : null,
  });

  const refresh = (marquee: SelectionUI["marquee"] = null) => renderer.setSelectionUI(buildUI(marquee));

  const topHit = (P: Pt, tol: number): HirakuElement | null => {
    const els = page().elements;
    for (let i = els.length - 1; i >= 0; i--) if (elementHit(els[i], P.x, P.y, tol)) return els[i];
    return null;
  };

  const preview = (gg: Extract<Gesture, { orig: HirakuElement[] }>, xf: Xform) => {
    gg.next = gg.orig.map((el) => applyXform(el, xf));
    gg.moved = true;
    gg.orig.forEach((el, i) => {
      if (el.type === "stroke") renderer.setNodeMatrix(el.id, xf.m); // traços: só matriz (barato)
      else renderer.redrawNode(el.id, gg.next[i]);                    // formas e linhas: redesenha (exato)
    });
    // Setas ligadas às formas em movimento seguem ao vivo (dentro ou fora da seleção).
    const solved = solveAffected(page().elements, gg.next);
    for (const a of solved) renderer.redrawNode(a.id, a);
    gg.extra = solved.map((a) => a.id);
    renderer.setSelectionUI(buildUI(null, gg.next));
  };

  const restore = (orig: HirakuElement[], extra: string[] = []) => {
    for (const el of orig) {
      if (el.type === "stroke") renderer.setNodeMatrix(el.id, null);
      else renderer.redrawNode(el.id, null);
    }
    for (const id of extra) renderer.redrawNode(id, null);
  };

  /** Alça de ponto/ponto-médio de uma linha sob o ponteiro (coordenadas de tela). */
  const hitLineHandle = (el: LinearElement, s: Sample, tol: number) => {
    const c = cam();
    const sp = el.points.map((p) => ({ x: p.x * c.zoom + c.x, y: p.y * c.zoom + c.y }));
    let vertex = -1;
    let best = tol;
    sp.forEach((p, i) => {
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d <= best) { best = d; vertex = i; }
    });
    if (vertex >= 0) return { vertex, mid: -1 };
    best = tol;
    let mid = -1;
    for (let i = 0; i < sp.length - 1; i++) {
      const d = Math.hypot((sp[i].x + sp[i + 1].x) / 2 - s.x, (sp[i].y + sp[i + 1].y) / 2 - s.y);
      if (d <= best) { best = d; mid = i; }
    }
    return { vertex: -1, mid };
  };

  return {
    refresh: () => {
      if (!g) refresh(); // durante um gesto o próprio gesto desenha a UI
    },

    start(s: Sample, lasso: boolean) {
      const c = cam();
      const P = screenToWorld(c, s.x, s.y);
      const touchy = s.pointerType !== "mouse";
      const sel = selectedEls();
      const frame = selectionFrame(sel);
      const hitTol = (touchy ? 10 : 6) / c.zoom;
      const now = performance.now();
      const dbl = !lasso && !!lastTap && now - lastTap.t < 380 && Math.hypot(s.x - lastTap.x, s.y - lastTap.y) < 8;
      lastTap = { t: now, x: s.x, y: s.y };

      // 0) linha/seta sozinha: editar pontos
      const lone = sel.length === 1 && isLinear(sel[0]) ? sel[0] : null;
      if (lone) {
        const h = hitLineHandle(lone, s, touchy ? 24 : 11);
        if (h.vertex >= 0) {
          if (s.alt && lone.points.length > 2) {
            // Alt+clique remove o ponto
            const last = lone.points.length - 1;
            const trimmed: LinearElement = {
              ...lone,
              points: lone.points.filter((_, i) => i !== h.vertex),
              startBinding: h.vertex === 0 ? null : lone.startBinding,
              endBinding: h.vertex === last ? null : lone.endBinding,
            };
            useDoc.getState().updateElements([solveArrow(trimmed, new Map(page().elements.map((e) => [e.id, e])))]);
            return;
          }
          g = { kind: "vertex", el: lone, index: h.vertex, inserted: false, startS: { x: s.x, y: s.y }, next: null };
          return;
        }
        if (h.mid >= 0) {
          g = { kind: "vertex", el: lone, index: h.mid + 1, inserted: true, startS: { x: s.x, y: s.y }, next: null };
          return;
        }
      }

      // 1) alças da seleção atual
      if (frame) {
        const h = hitHandle(frame, c, s.x, s.y, touchy ? 24 : 11);
        if (h === "rot") {
          g = { kind: "rotate", frame, startP: P, orig: sel, next: sel, extra: [], moved: false };
          return;
        }
        if (h) {
          g = { kind: "resize", handle: h, frame, startP: P, orig: sel, next: sel, extra: [], moved: false };
          return;
        }
      }

      const beginMove = (candidate: string | null) => {
        g = { kind: "move", startP: P, startS: { x: s.x, y: s.y }, orig: selectedEls(), next: [], extra: [], moved: false, candidate };
      };

      // 2) Selecionar: clique num elemento
      if (!lasso) {
        const hit = topHit(P, hitTol);
        if (hit) {
          if (dbl && hit.type === "text") {
            lastTap = null;
            beginEditText(hit);
            return;
          }
          const ids = useSel.getState().ids;
          const isSel = ids.includes(hit.id);
          if (s.shift) {
            useSel.getState().set(isSel ? ids.filter((i) => i !== hit.id) : [...ids, hit.id]);
            refresh();
            if (isSel) return; // Shift+clique em selecionado = tirar da seleção
            beginMove(null);
            return;
          }
          if (!isSel) useSel.getState().set([hit.id]);
          beginMove(isSel && ids.length > 1 ? hit.id : null);
          return;
        }
      }

      // 3) arrastar de dentro da seleção move tudo (quadro, ou o próprio elemento para linhas)
      const inside = frame
        ? pointInFrame(frame, P, 4 / c.zoom)
        : sel.some((el) => elementHit(el, P.x, P.y, hitTol));
      if (inside) {
        beginMove(null);
        return;
      }

      if (dbl) {
        lastTap = null;
        beginNewText(P); // duplo toque no vazio cria texto
        return;
      }

      // 4) área vazia: caixa (Selecionar) ou laço (Laço)
      const base = s.shift ? useSel.getState().ids : [];
      useSel.getState().set(base);
      g = lasso
        ? { kind: "lasso", pts: [P], base }
        : { kind: "box", startP: P, startS: { x: s.x, y: s.y }, base, moved: false };
    },

    move(samples: Sample[]) {
      if (!g) return;
      const s = samples[samples.length - 1];
      const c = cam();
      const P = screenToWorld(c, s.x, s.y);

      switch (g.kind) {
        case "move": {
          if (!g.moved && Math.hypot(s.x - g.startS.x, s.y - g.startS.y) < 3) return;
          let dx = P.x - g.startP.x;
          let dy = P.y - g.startP.y;
          if (s.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
          preview(g, moveXform(dx, dy));
          break;
        }
        case "resize":
          preview(g, resizeXform(g.frame, g.handle, P, s.shift, s.alt));
          break;
        case "rotate":
          preview(g, rotateXform(g.frame, g.startP, P, s.shift));
          break;
        case "vertex": {
          if (!g.next && Math.hypot(s.x - g.startS.x, s.y - g.startS.y) < 3) return;
          const { el, index } = g;
          const base = g.inserted
            ? [...el.points.slice(0, index), P, ...el.points.slice(index)]
            : [...el.points];
          let q: Pt = P;
          if (s.shift) {
            const ref = base[index - 1] ?? base[index + 1]; // Shift trava o ângulo em relação ao vizinho
            if (ref) q = snapAngle(ref, P);
          }
          const points = base.map((p, i) => (i === index ? { x: q.x, y: q.y } : p));
          let draft: LinearElement = { ...el, points };
          let hint: Pt[] | null = null;
          const all = page().elements;
          // Ponta de seta solta sobre uma forma = liga (e gruda no contorno); solta no vazio = desliga.
          if (el.type === "arrow" && !g.inserted && (index === 0 || index === el.points.length - 1)) {
            const target = bindableAt(all.filter((e) => e.id !== el.id), q, (touchy(s) ? 14 : 8) / c.zoom);
            const binding = target ? makeBinding(target, q) : null;
            draft = index === 0 ? { ...draft, startBinding: binding } : { ...draft, endBinding: binding };
            hint = target ? outlinePath(target) : null;
          }
          const next = solveArrow(draft, new Map(all.map((e) => [e.id, e])));
          g.next = next;
          renderer.redrawNode(el.id, next);
          renderer.setSelectionUI(buildUI(null, [next], hint));
          break;
        }
        case "box": {
          if (!g.moved && Math.hypot(s.x - g.startS.x, s.y - g.startS.y) < 3) return;
          g.moved = true;
          const inside = boxSelect(page().elements, g.startP, P);
          useSel.getState().set([...g.base, ...inside]);
          renderer.setSelectionUI(buildUI({ kind: "box", a: g.startP, b: P }));
          break;
        }
        case "lasso": {
          const last = g.pts[g.pts.length - 1];
          for (const sm of samples) {
            const q = screenToWorld(c, sm.x, sm.y);
            if (Math.hypot(q.x - last.x, q.y - last.y) * c.zoom >= 1.5) g.pts.push(q);
          }
          renderer.setSelectionUI(buildUI({ kind: "lasso", pts: g.pts }));
          break;
        }
      }
    },

    end() {
      const done = g;
      g = null;
      if (!done) return;

      if (done.kind === "move" || done.kind === "resize" || done.kind === "rotate") {
        if (done.moved) useDoc.getState().updateElements(detachForeign(done.next));
        else if (done.kind === "move" && done.candidate) useSel.getState().set([done.candidate]);
      } else if (done.kind === "vertex") {
        if (done.next) useDoc.getState().updateElements([done.next]);
      } else if (done.kind === "lasso") {
        const ids = lassoSelect(page().elements, done.pts, useTool.getState().lassoMode, cam().zoom);
        useSel.getState().set([...done.base, ...ids]);
      }
      refresh();
    },

    cancel() {
      const done = g;
      g = null;
      if (done?.kind === "vertex") renderer.redrawNode(done.el.id, null);
      else if (done && "orig" in done) restore(done.orig, done.extra);
      refresh();
    },
  };
}
