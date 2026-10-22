// Tinta: junta o traço do modelo com a malha (core/strokeMesh.ts). Puro: sem Pixi nem React.
// O MESMO cálculo serve ao traço ao vivo, ao gravado, à miniatura e à pré-visualização do brush.
import { getBrush } from "./brushes";
import { StrokeElement } from "./model";
import { InkStyle, buildStrokeMesh, dynOf, meshToSvgPath } from "./strokeMesh";

export type { InkStyle, StrokeMesh } from "./strokeMesh";
export { MAX_WIDTH_FACTOR, buildStrokeMesh, dynOf, meshToSvgPath } from "./strokeMesh";

/**
 * Estilo de tinta de um traço gravado. Traços antigos (sem `dyn`) valem o que o brush registrado diz,
 * inclusive o afilamento fixo do brush, que antes não era gravado no traço.
 */
export function styleOf(el: StrokeElement): InkStyle {
  const b = getBrush(el.brush);
  return {
    color: el.color,
    width: el.width,
    sens: el.sens,
    taper: el.dyn ? el.taper : (b.taper ?? el.taper),
    brush: b.id,
    opacity: el.opacity,
    dyn: el.dyn ?? dynOf({ brush: b.id }),
    openStart: el.openStart,
    openEnd: el.openEnd,
  };
}

/** Caminho SVG (preenchimento "nonzero") do traço; vazio se não há o que desenhar. */
export function strokeSvgPath(points: StrokeElement["points"], st: InkStyle, dx = 0, dy = 0): string {
  const mesh = buildStrokeMesh(points, st);
  return mesh ? meshToSvgPath(mesh, dx, dy) : "";
}

/**
 * Nível de detalhe do traço AO VIVO: strokes enormes (milhares de pontos) são refeitos a cada quadro, então
 * a prévia usa 1 ponto a cada 2^k (k cresce devagar com o tamanho) e mantém sempre o primeiro, o último e os
 * pontos recentes inteiros. O traço gravado usa todos os pontos.
 */
export function decimateForPreview<T>(points: T[], target = 1200, recent = 24): T[] {
  const n = points.length;
  if (n <= target) return points;
  let stride = 1;
  while (n / stride > target) stride *= 2;
  const out: T[] = [];
  const headEnd = n - recent;
  for (let i = 0; i < headEnd; i += stride) out.push(points[i]);
  for (let i = Math.max(0, headEnd); i < n; i++) out.push(points[i]);
  return out;
}
