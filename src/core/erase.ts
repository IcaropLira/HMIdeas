// Borracha de pixel: corta um traço em pedaços onde o círculo da borracha passa. Puro e testável em Node.
//
// O traço é vetorial: em vez de apagar pixels, o trecho tocado é removido da lista de pontos e o que sobra
// vira um ou mais traços novos, com a MESMA cor/largura/dinâmica. As pontas cortadas ficam retas e sem
// afilar (openStart/openEnd), como o corte de uma borracha de verdade.
import { HirakuElement, InkPoint, StrokeElement, newId } from "./model";
import { elementHit } from "./geometry";

/** Onde o segmento a→b (t = 0..1) está DENTRO do círculo (cx, cy, r)? null se não entra. */
export function segmentInCircle(a: InkPoint, b: InkPoint, cx: number, cy: number, r: number): [number, number] | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  const fx = a.x - cx, fy = a.y - cy;
  const A = dx * dx + dy * dy;
  if (A === 0) return fx * fx + fy * fy < r * r ? [0, 1] : null;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - r * r;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return null;
  const sq = Math.sqrt(disc);
  const t0 = (-B - sq) / (2 * A), t1 = (-B + sq) / (2 * A);
  if (t1 <= 0 || t0 >= 1) return null;
  return [Math.max(0, t0), Math.min(1, t1)];
}

const lerpPt = (a: InkPoint, b: InkPoint, t: number): InkPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  p: a.p + (b.p - a.p) * t,
});

const inside = (p: InkPoint, cx: number, cy: number, r: number) => (p.x - cx) ** 2 + (p.y - cy) ** 2 < r * r;

const lengthOf = (pts: InkPoint[]) => {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
};

/**
 * Corta `el` com um círculo da borracha. Devolve:
 *  • null  → o círculo não toca o traço (nada a fazer);
 *  • []    → o traço foi apagado por inteiro;
 *  • [...] → os pedaços que sobraram (o primeiro mantém o id do traço original).
 */
export function cutStroke(el: StrokeElement, cx: number, cy: number, radius: number): StrokeElement[] | null {
  // A borracha apaga também a meia-espessura do traço, para não sobrar uma "casca" fina ao lado do círculo.
  const r = radius + el.width * 0.25;
  if (!elementHit(el, cx, cy, radius)) return null; // descarte rápido (caixa + distância ao eixo)
  const pts = el.points;
  const n = pts.length;
  if (n === 0) return [];
  if (n === 1) return inside(pts[0], cx, cy, r) ? [] : null;

  interface Piece { pts: InkPoint[]; openStart: boolean; openEnd: boolean }
  const pieces: Piece[] = [];
  let cur: Piece | null = inside(pts[0], cx, cy, r) ? null : { pts: [pts[0]], openStart: !!el.openStart, openEnd: false };
  let touched = false;

  for (let i = 0; i < n - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const iv = segmentInCircle(a, b, cx, cy, r);
    if (!iv) {
      if (cur) cur.pts.push(b);
      continue;
    }
    touched = true;
    const aIn = inside(a, cx, cy, r), bIn = inside(b, cx, cy, r);
    if (!aIn && cur) {
      cur.pts.push(lerpPt(a, b, iv[0])); // termina exatamente na borda do círculo
      cur.openEnd = true;
      pieces.push(cur);
      cur = null;
    }
    if (!bIn) cur = { pts: [lerpPt(a, b, iv[1]), b], openStart: true, openEnd: false };
  }
  if (!touched) return null;
  if (cur) {
    cur.openEnd = !!el.openEnd;
    pieces.push(cur);
  }

  // Cacos minúsculos (menores que ~meia espessura) só atrapalham: somem.
  const keep = pieces.filter((pc) => pc.pts.length >= 2 && lengthOf(pc.pts) >= Math.max(0.5, el.width * 0.3));
  return keep.map((pc, i): StrokeElement => ({
    ...el,
    id: i === 0 ? el.id : newId(),
    points: pc.pts,
    openStart: pc.openStart || undefined,
    openEnd: pc.openEnd || undefined,
  }));
}

/**
 * Aplica um passo da borracha de pixel a uma lista de elementos. Traços são cortados; o resto (formas,
 * linhas, texto) é apagado por inteiro se o círculo o toca, como na borracha de traço.
 * Devolve a MESMA lista (mesma referência) se nada mudou, para o chamador evitar redesenhos.
 */
export function eraseStep(elements: HirakuElement[], cx: number, cy: number, radius: number): { elements: HirakuElement[]; removedIds: Set<string> } {
  const out: HirakuElement[] = [];
  const removedIds = new Set<string>();
  let changed = false;
  for (const el of elements) {
    if (el.type === "stroke") {
      const res = cutStroke(el, cx, cy, radius);
      if (!res) {
        out.push(el);
      } else {
        changed = true;
        out.push(...res);
        if (!res.length) removedIds.add(el.id);
      }
    } else if (el.type === "node" || el.type === "frame") {
      out.push(el); // nós e quadros têm estrutura: a borracha não os apaga (use Delete)
    } else if (elementHit(el, cx, cy, radius)) {
      changed = true;
      removedIds.add(el.id);
    } else {
      out.push(el);
    }
  }
  return { elements: changed ? out : elements, removedIds };
}
