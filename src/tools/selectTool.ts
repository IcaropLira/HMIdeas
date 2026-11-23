// Ferramentas Selecionar (V) e Laço (L): clique, caixa, laço, mover, redimensionar, girar
// e edição de pontos de linhas/setas.
// Durante o gesto NADA é gravado no documento: só pré-visualização no renderer.
// No fim, um único updateElements → um único passo de desfazer.
import { Bindable, bindableAt, detachForeign, isBindable, makeBinding, reidentify, solveAffected, solveArrow } from "../core/binding";
import { exactGroup, expandToUnits, idsForHit, insideCtx, unitOf } from "../core/groups";
import { contextOutline, currentCtx, enterGroup, useGroupCtx } from "../core/groupActions";
import { addCopies } from "../core/actions";
import { Box, snapMove, unionBox } from "../core/align";
import { useUI } from "../core/ui";
import { connectArrow, siblingFor } from "../core/quickConnect";
import { screenToWorld } from "../core/camera";
import { elementHit } from "../core/geometry";
import { snapAngle } from "../core/linear";
import { HirakuElement, LinearElement, isLinear } from "../core/model";
import {
  ConnSide, Connector, Frame, HandleId, SIDE_DIR, SelectionUI, Xform, applyXform, boundsPolygon, boxSelect, connectorPoints, elementBounds,
  hitConnector, hitHandle, lassoSelect, moveXform, pointInFrame, resizeXform, rotateXform, selectionFrame,
} from "../core/selection";
import { Pt, outlinePath } from "../core/shapes";
import { selectActivePage, useDoc, useSel, useTool, useView } from "../core/store";
import { beginEditText, beginNewText } from "../core/textEdit";
import { beginLabel, settleMoved } from "../core/mapActions";
import { badgeCenter, childrenMap, rootOf, toggleCollapse, withDependents } from "../core/mindmap";
import { settleFrames } from "../core/frames";
import { interactiveElements } from "../core/layers";
import { blockFields, blockHitAt, blockTap, fieldAt } from "../core/blocks";
import { useBlockEdit, useBlockInline } from "../core/blockView";
import { usePageEdit } from "../core/pageEdit";
import { isVertex, makeEdge, makeVertex, nextVertexName, useEdgeLabel, useGraphTool, vertexAt } from "../core/graphEdit";
import { NodeElement } from "../core/model";
import { canvasMeasure, primsFor } from "../render/blockDraw";
import { Sample } from "../input/InputController";
import { Renderer } from "../render/Renderer";

type Gesture =
  | { kind: "move"; startP: Pt; startS: Pt; orig: HirakuElement[]; next: HirakuElement[]; extra: string[]; moved: boolean; candidate: string[] | null; dup: boolean; box: Box | null; others: Box[] | null }
  | { kind: "resize"; handle: Exclude<HandleId, "rot">; frame: Frame; startP: Pt; orig: HirakuElement[]; next: HirakuElement[]; extra: string[]; moved: boolean }
  | { kind: "rotate"; frame: Frame; startP: Pt; orig: HirakuElement[]; next: HirakuElement[]; extra: string[]; moved: boolean }
  | { kind: "vertex"; el: LinearElement; index: number; inserted: boolean; startS: Pt; next: LinearElement | null }
  | { kind: "box"; startP: Pt; startS: Pt; base: string[]; moved: boolean }
  | { kind: "lasso"; pts: Pt[]; base: string[] }
  | { kind: "connect"; from: Bindable; side: ConnSide; startS: Pt; P: Pt; target: Bindable | null; moved: boolean }
  /** Shift+arrastar de um vértice: aresta dirigida até outro (Ctrl+Shift: não dirigida); soltar no vazio cria um vértice. */
  | { kind: "gedge"; from: NodeElement; startS: Pt; P: Pt; target: NodeElement | null; moved: boolean; directed: boolean; unitIds: string[] };

const touchy = (s: Sample) => s.pointerType !== "mouse";

/** Último toque do Selecionar: dois toques rápidos = editar texto / criar texto. */
let lastTap: { t: number; x: number; y: number } | null = null;

export function createSelectController(renderer: Renderer) {
  let g: Gesture | null = null;
  /** Item sob o mouse (sem estar selecionado): mostra os pontos de conexão dele. */
  let hoverId: string | null = null;

  const page = () => selectActivePage(useDoc.getState());
  const cam = () => useView.getState().camera;
  const selectedEls = (): HirakuElement[] => {
    const ids = new Set(useSel.getState().ids);
    return page().elements.filter((e) => ids.has(e.id));
  };

  /** Pontos de conexão: do item selecionado (lados e/s/w — em cima fica a alça de girar) ou do item sob o mouse (4 lados). */
  const connectors = (els: HirakuElement[]): Connector[] => {
    if (g) return [];
    const c = cam();
    if (els.length === 1 && isBindable(els[0]) && !(els[0].type === "node" && els[0].hidden)) {
      const e = els[0];
      return connectorPoints(elementBounds(e), c, 26, e.type === "attachment" ? ["n", "e", "s", "w"] : ["e", "s", "w"]).map((k) => (k.side === "n" ? { ...k, y: k.y - 26 } : k));
    }
    const h = hoverId ? page().elements.find((x) => x.id === hoverId) : undefined;
    if (h && isBindable(h) && !els.some((x) => x.id === h.id)) return connectorPoints(elementBounds(h), c, 14);
    return [];
  };
  const connectorOwner = (els: HirakuElement[]): HirakuElement | null =>
    els.length === 1 && isBindable(els[0]) ? els[0] : (hoverId ? page().elements.find((x) => x.id === hoverId) ?? null : null);

  const buildUI = (
    marquee: SelectionUI["marquee"] = null,
    els: HirakuElement[] = selectedEls(),
    hint: Pt[] | null = null,
    guides: SelectionUI["guides"] = [],
  ): SelectionUI => {
    const p = page();
    // um grupo selecionado inteiro aparece como UM objeto (só a caixa dele, sem o contorno de cada membro)
    const asGroup = els.length > 1 && !!exactGroup(p, els.map((e) => e.id));
    return {
      bindHint: hint,
      connectors: marquee || asGroup ? [] : connectors(els),
      frame: selectionFrame(els),
      outlines: !asGroup && (els.length > 1 || (els.length === 1 && els[0].type === "node")) ? els.map((e) => boundsPolygon(elementBounds(e))) : [],
      marquee,
      lineEdit: els.length === 1 && isLinear(els[0]) ? { points: els[0].points } : null,
      context: contextOutline(p),
      guides,
    };
  };

  const refresh = (marquee: SelectionUI["marquee"] = null) => renderer.setSelectionUI(buildUI(marquee));

  const topHit = (P: Pt, tol: number): HirakuElement | null => {
    const els = interactiveElements(page()); // camadas ocultas/travadas não respondem
    for (let i = els.length - 1; i >= 0; i--) if (elementHit(els[i], P.x, P.y, tol)) return els[i];
    return null;
  };

  const preview = (gg: Extract<Gesture, { orig: HirakuElement[] }>, xf: Xform, guides: SelectionUI["guides"] = []) => {
    gg.next = gg.orig.map((el) => applyXform(el, xf));
    if (!gg.moved) useUI.getState().setBusy(true);
    gg.moved = true;
    gg.orig.forEach((el, i) => {
      if (el.type === "stroke") renderer.setNodeMatrix(el.id, xf.m); // traços: só matriz (barato)
      else renderer.redrawNode(el.id, gg.next[i]);                    // formas e linhas: redesenha (exato)
    });
    // Setas ligadas às formas em movimento seguem ao vivo (dentro ou fora da seleção).
    const solved = solveAffected(page().elements, gg.next);
    for (const a of solved) renderer.redrawNode(a.id, a);
    gg.extra = solved.map((a) => a.id);
    renderer.setSelectionUI(buildUI(null, gg.next, null, guides));
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

    /** Mouse parado sobre um item: mostra os pontos de conexão dele (fica enquanto o mouse estiver perto). */
    hover(s: Sample) {
      if (g) return;
      const c = cam(), P = screenToWorld(c, s.x, s.y);
      const cur = hoverId ? page().elements.find((x) => x.id === hoverId) : undefined;
      if (cur) {
        const b = elementBounds(cur), m = 34 / c.zoom;
        if (P.x >= b.minX - m && P.x <= b.maxX + m && P.y >= b.minY - m && P.y <= b.maxY + m) return;
      }
      const hit = topHit(P, 4 / c.zoom);
      const next = hit && isBindable(hit) && !(hit.type === "node" && hit.hidden) ? hit.id : null;
      if (next !== hoverId) { hoverId = next; refresh(); }
    },
    hoverEnd() {
      if (hoverId) { hoverId = null; if (!g) refresh(); }
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

      // -1) bolinha de "recolhido" de um nó: clique expande
      {
        const all = page().elements;
        const ch = childrenMap(all);
        for (const n of all) {
          if (n.type !== "node" || !n.collapsed || n.hidden || !(ch.get(n.id)?.length)) continue;
          const bc = badgeCenter(n, rootOf(all, n.id));
          if (Math.hypot(P.x - bc.x, P.y - bc.y) <= (touchy ? 16 : 12) / c.zoom) {
            lastTap = null;
            useDoc.getState().replaceElements(toggleCollapse(all, n.id, false));
            return;
          }
        }
      }

      // 0) linha/seta sozinha: editar pontos
      const lone = sel.length === 1 && isLinear(sel[0]) ? sel[0] : null;
      if (lone && dbl && elementHit(lone, P.x, P.y, hitTol * 2)) {
        // duplo toque na seta já selecionada (inclusive no ponto do meio): rótulo / peso
        lastTap = null;
        useEdgeLabel.getState().open(lone.id);
        return;
      }
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

      // 0.5) pontos de conexão rápida: arrastar puxa uma seta ligada
      if (!lasso && !s.shift) {
        const k = hitConnector(connectors(sel), s.x, s.y, touchy ? 22 : 11);
        const owner = k && connectorOwner(sel);
        if (k && owner && isBindable(owner)) {
          lastTap = null;
          g = { kind: "connect", from: owner, side: k.side, startS: { x: s.x, y: s.y }, P, target: null, moved: false };
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

      const beginMove = (candidate: string[] | null) => {
        // nós levam o ramo; quadros levam o conteúdo. Alt (ou Option) ao começar = arrasta uma CÓPIA.
        const all = page().elements;
        const set = withDependents(all, useSel.getState().ids);
        g = { kind: "move", startP: P, startS: { x: s.x, y: s.y }, orig: all.filter((e) => set.has(e.id)), next: [], extra: [], moved: false, candidate, dup: s.alt, box: null, others: null };
      };

      // 2) Selecionar: clique num elemento
      if (!lasso) {
        const hit = topHit(P, hitTol);
        if (hit) {
          // grupos: no contexto atual o clique pega o grupo de fora; fora do grupo aberto, volta para a página
          const pg = page();
          let ctx = currentCtx(pg);
          let unit = unitOf(pg, hit, ctx);
          if (!unit) { useGroupCtx.getState().set(null, pg.id); ctx = null; unit = unitOf(pg, hit, null)!; }
          if (dbl && unit.kind === "group" && !s.shift) {
            // duplo clique num grupo: entra nele SEM desagrupar e pega o filho sob o ponteiro (Esc sai)
            lastTap = null;
            enterGroup(unit.id, idsForHit(pg, hit, unit.id));
            refresh();
            return;
          }
          const unitIds = idsForHit(pg, hit, ctx);
          const inGroup = unit.kind === "group";
          if (s.shift && isVertex(hit, pg.elements)) {
            // grafos: Shift+arrastar de um vértice puxa uma aresta (só Shift+clique, sem arrastar, continua somando à seleção)
            lastTap = null;
            g = { kind: "gedge", from: hit, startS: { x: s.x, y: s.y }, P, target: null, moved: false, directed: !s.ctrl, unitIds };
            return;
          }
          // blocos: áreas com comportamento próprio (caixinha da tarefa, virar flashcard, alternativa, estrelas…) respondem a
          // um toque; duplo toque num texto edita ali mesmo; duplo toque fora de texto abre o editor do bloco
          if (hit.type === "attachment" && hit.kind === "block" && hit.block && !s.shift) {
            const lx = P.x - hit.x, ly = P.y - hit.y;
            if (dbl && !inGroup) {
              lastTap = null;
              useSel.getState().set([hit.id]);
              if (hit.block.kind === "page") { usePageEdit.getState().open(hit.id); return; }
              const fld = fieldAt(blockFields(hit.block, hit.w, hit.h, canvasMeasure), lx, ly);
              if (fld) useBlockInline.getState().open(hit.id, fld.key);
              else useBlockEdit.getState().open(hit.id);
              return;
            }
            const prims = primsFor(hit);
            const tap = prims && blockHitAt(prims, lx, ly);
            if (tap && tap.action === "open") { lastTap = null; useSel.getState().set([hit.id]); usePageEdit.getState().open(hit.id); return; }
            if (tap) {
              lastTap = null;
              useDoc.getState().updateElements([{ ...hit, block: blockTap(hit.block, tap) }]);
              useSel.getState().set([hit.id]);
              refresh();
              return;
            }
          }
          if (dbl && !inGroup && isLinear(hit)) {
            // duplo toque numa seta/linha: editar o rótulo (peso da aresta)
            lastTap = null;
            useSel.getState().set([hit.id]);
            useEdgeLabel.getState().open(hit.id);
            return;
          }
          if (dbl && !inGroup && (hit.type === "text" || hit.type === "node" || hit.type === "frame")) {
            lastTap = null;
            if (hit.type === "text") beginEditText(hit);
            else { useSel.getState().set([hit.id]); beginLabel(hit.id); }
            return;
          }
          const ids = useSel.getState().ids;
          const isSel = unitIds.every((i) => ids.includes(i));
          if (s.shift) {
            const drop = new Set(unitIds);
            useSel.getState().set(isSel ? ids.filter((i) => !drop.has(i)) : [...ids, ...unitIds]);
            refresh();
            if (isSel) return; // Shift+clique em selecionado = tirar da seleção
            beginMove(null);
            return;
          }
          if (!isSel) useSel.getState().set(unitIds);
          beginMove(isSel && ids.length > unitIds.length ? unitIds : null);
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

      // 4) área vazia: caixa (Selecionar) ou laço (Laço). Clicar fora do grupo aberto sai um nível.
      {
        const pg = page();
        const ctxBox = contextOutline(pg);
        if (ctxBox && !s.shift && (P.x < ctxBox[0].x || P.x > ctxBox[2].x || P.y < ctxBox[0].y || P.y > ctxBox[2].y)) {
          const parent = pg.groups?.find((x) => x.id === currentCtx(pg))?.parentId ?? null;
          useGroupCtx.getState().set(parent, pg.id);
        }
      }
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
          // encaixe: guias inteligentes (bordas/centros/espaço igual) e grade; Ctrl segurado desliga
          const t = useTool.getState();
          let guides: SelectionUI["guides"] = [];
          if (!s.ctrl && (t.smartGuides || t.snapGrid) && g.orig.length) {
            if (!g.box) {
              const moving = new Set(g.orig.map((e) => e.id));
              g.box = unionBox(g.orig.filter((e) => !(e.type === "node" && e.hidden)).map(elementBounds));
              // só objetos perto da área visível contam (página enorme continua leve)
              const vw = window.innerWidth / c.zoom, vh = window.innerHeight / c.zoom, vx = -c.x / c.zoom, vy = -c.y / c.zoom;
              g.others = t.smartGuides
                ? interactiveElements(page())
                    .filter((e) => !moving.has(e.id) && !(e.type === "node" && e.hidden) && !isLinear(e) && e.type !== "stroke")
                    .map(elementBounds)
                    .filter((b) => b.maxX > vx - vw * 0.25 && b.minX < vx + vw * 1.25 && b.maxY > vy - vh * 0.25 && b.minY < vy + vh * 1.25)
                    .slice(0, 400)
                : [];
            }
            if (g.box) {
              const sn = snapMove({ minX: g.box.minX + dx, maxX: g.box.maxX + dx, minY: g.box.minY + dy, maxY: g.box.maxY + dy }, g.others ?? [], 6 / c.zoom, t.snapGrid ? t.gridSize : 0);
              if (!(s.shift && Math.abs(P.x - g.startP.x) <= Math.abs(P.y - g.startP.y))) dx += sn.dx;
              if (!(s.shift && Math.abs(P.x - g.startP.x) > Math.abs(P.y - g.startP.y))) dy += sn.dy;
              guides = sn.guides;
            }
          }
          preview(g, moveXform(dx, dy), guides);
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
          // da esquerda para a direita: só o que está TOTALMENTE dentro; da direita para a esquerda: tudo que a caixa toca
          const mode = useTool.getState().boxMode;
          const cross = mode === "touch" || (mode === "auto" && P.x < g.startP.x);
          const pg = page();
          const ctx = currentCtx(pg);
          const pool = interactiveElements(pg).filter((e) => insideCtx(pg, e, ctx));
          const a = g.startP;
          const raw = cross
            ? lassoSelect(pool, [{ x: a.x, y: a.y }, { x: P.x, y: a.y }, { x: P.x, y: P.y }, { x: a.x, y: P.y }], "touch", c.zoom)
            : boxSelect(pool, a, P);
          useSel.getState().set([...g.base, ...expandToUnits(pg, raw, ctx, !cross)]);
          renderer.setSelectionUI(buildUI({ kind: "box", a: g.startP, b: P, cross }));
          break;
        }
        case "connect": {
          if (!g.moved && Math.hypot(s.x - g.startS.x, s.y - g.startS.y) < 4) return;
          g.moved = true;
          const all = page().elements, fromId = g.from.id;
          const target = bindableAt(interactiveElements(page()).filter((e) => e.id !== fromId && !(e.type === "node" && e.hidden)), P, (touchy(s) ? 14 : 8) / c.zoom);
          g.P = P;
          g.target = target;
          const t = useTool.getState();
          renderer.previewElement(connectArrow(g.from, g.side, P, target, { color: t.color, width: 2 }, all, "__connect"));
          renderer.setSelectionUI({ ...buildUI(null, [], target ? outlinePath(target) : null), connectors: [] });
          break;
        }
        case "gedge": {
          if (!g.moved && Math.hypot(s.x - g.startS.x, s.y - g.startS.y) < 5) return;
          g.moved = true;
          g.directed = !s.ctrl;
          const t = vertexAt(interactiveElements(page()), P, (touchy(s) ? 12 : 6) / c.zoom);
          g.target = t && t.id !== g.from.id ? t : null;
          g.P = P;
          const tip = g.target ?? makeVertex("", P, "ghost");
          const pv = makeEdge(g.from, tip, { directed: g.directed });
          renderer.previewElement(g.target ? pv : { ...pv, endBinding: null, points: [pv.points[0], P] });
          renderer.setSelectionUI({ ...buildUI(null, [], g.target ? outlinePath(g.target) : null), connectors: [] });
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

      useUI.getState().setBusy(false);
      if (done.kind === "move" && done.moved && done.dup) {
        // Alt+arrastar: o original volta para o lugar e a cópia fica onde foi solta (com os grupos recriados)
        restore(done.orig, done.extra);
        const ids = addCopies(done.orig, reidentify(done.next), page());
        useSel.getState().set(ids);
        refresh();
        return;
      }
      if (done.kind === "move" || done.kind === "resize" || done.kind === "rotate") {
        if (done.moved) {
          const nxt = detachForeign(done.next);
          const hasFrames = page().elements.some((e) => e.type === "frame");
          const special = hasFrames || nxt.some((e) => e.type === "node" || e.type === "frame");
          if (!special || done.kind === "rotate") useDoc.getState().updateElements(nxt);
          else if (done.kind === "move") useDoc.getState().replaceElements(settleMoved(nxt, nxt.map((e) => e.id)));
          else {
            const byId = new Map(nxt.map((e) => [e.id, e]));
            const all = page().elements.map((e) => byId.get(e.id) ?? e);
            useDoc.getState().replaceElements(settleFrames(all, all.map((e) => e.id)));
          }
        }
        else if (done.kind === "move" && done.candidate) useSel.getState().set(done.candidate);
      } else if (done.kind === "vertex") {
        if (done.next) useDoc.getState().updateElements([done.next]);
      } else if (done.kind === "connect") {
        renderer.previewElement(null);
        const all = page().elements;
        const t = useTool.getState();
        if (!done.moved) {
          // toque num ponto sem arrastar: cria o irmão já ligado do lado escolhido
          const fromC = elementBounds(done.from), d = SIDE_DIR[done.side];
          done.P = { x: (fromC.minX + fromC.maxX) / 2 + d.x * ((fromC.maxX - fromC.minX) + 80), y: (fromC.minY + fromC.maxY) / 2 + d.y * ((fromC.maxY - fromC.minY) + 80) };
        }
        let target: Bindable | null = done.target;
        const added: HirakuElement[] = [];
        if (!target) {
          const sib = siblingFor(done.from, done.side, done.P, all);
          if (sib && isBindable(sib)) { added.push(sib); target = sib; }
        }
        if (target) {
          const end = target === done.target ? done.P : { x: (elementBounds(target).minX + elementBounds(target).maxX) / 2, y: (elementBounds(target).minY + elementBounds(target).maxY) / 2 };
          const arrow = connectArrow(done.from, done.side, end, target, { color: t.color, width: 2 }, [...all, ...added]);
          useDoc.getState().addElements([...added, arrow]);
          if (added.length) {
            const n = added[0];
            useSel.getState().set([n.id]);
            if (n.type === "attachment" && n.block) {
              const f = blockFields(n.block, n.w, n.h, canvasMeasure)[0];
              if (f) useBlockInline.getState().open(n.id, f.key);
            } else if (n.type === "node") beginLabel(n.id, true);
            else if (n.type === "text") beginEditText(n);
          }
        }
      } else if (done.kind === "gedge") {
        renderer.previewElement(null);
        if (!done.moved) {
          // Shift+clique: soma/tira da seleção, como em qualquer objeto
          const ids = useSel.getState().ids;
          const on = done.unitIds.every((i) => ids.includes(i));
          const drop = new Set(done.unitIds);
          useSel.getState().set(on ? ids.filter((i) => !drop.has(i)) : [...ids, ...done.unitIds]);
        } else {
          const all = page().elements;
          const gt = useGraphTool.getState();
          const src = done.from.vertex ? done.from : { ...done.from, vertex: true };
          const label = gt.weighted ? "1" : undefined;
          let added: HirakuElement[];
          let edgeId: string;
          if (done.target) {
            const e = makeEdge(src, done.target, { directed: done.directed, label }, all);
            added = [e];
            edgeId = e.id;
          } else {
            const v = makeVertex(nextVertexName(all), done.P);
            const e = makeEdge(src, v, { directed: done.directed, label }, all);
            added = [v, e];
            edgeId = e.id;
          }
          if (!done.from.vertex) useDoc.getState().replaceElements([...all.map((x) => (x.id === src.id ? src : x)), ...added]);
          else useDoc.getState().addElements(added);
          useSel.getState().set([added[0].type === "node" ? added[0].id : done.from.id]);
          if (gt.weighted) useEdgeLabel.getState().open(edgeId);
        }
      } else if (done.kind === "lasso") {
        const pg = page();
        const ctx = currentCtx(pg);
        const mode = useTool.getState().lassoMode;
        const ids = lassoSelect(interactiveElements(pg).filter((e) => insideCtx(pg, e, ctx)), done.pts, mode, cam().zoom);
        useSel.getState().set([...done.base, ...expandToUnits(pg, ids, ctx, mode === "inside")]);
      }
      refresh();
    },

    cancel() {
      const done = g;
      g = null;
      useUI.getState().setBusy(false);
      if (done?.kind === "vertex") renderer.redrawNode(done.el.id, null);
      else if (done?.kind === "connect" || done?.kind === "gedge") renderer.previewElement(null);
      else if (done && "orig" in done) restore(done.orig, done.extra);
      refresh();
    },
  };
}
