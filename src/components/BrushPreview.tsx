// Pré-visualização de um brush: uma onda com pressão subindo e descendo, desenhada com a MESMA malha
// do traço de verdade (buildStrokeMesh), então reflete cor, pressão e afilamento atuais.
import { useMemo } from "react";
import { Brush, brushDyn } from "../core/brushes";
import { InkPoint } from "../core/model";
import { buildStrokeMesh, meshToSvgPath } from "../core/strokeMesh";

export const PREVIEW_W = 120;
export const PREVIEW_H = 34;

const SAMPLE: InkPoint[] = Array.from({ length: 40 }, (_, i) => {
  const t = i / 39;
  return { x: 10 + t * (PREVIEW_W - 20), y: PREVIEW_H / 2 + Math.sin(t * Math.PI * 2) * 7, p: 0.2 + 0.7 * Math.sin(Math.PI * t) };
});

interface Props {
  brush: Brush;
  color: string;
  /** Espessura escolhida no controle (antes do multiplicador do brush). */
  width: number;
  sens: number;
  taper: number;
  opacity: number;
}

export function BrushPreview({ brush, color, width, sens, taper, opacity }: Props) {
  const d = useMemo(() => {
    const w = Math.min(width * brush.size, PREVIEW_H * 0.5);
    const mesh = buildStrokeMesh(SAMPLE, { color, width: w, sens, taper: brush.taper ?? taper, brush: brush.id, opacity, dyn: brushDyn(brush) });
    return mesh ? meshToSvgPath(mesh) : "";
  }, [brush, color, width, sens, taper, opacity]);

  // Sem mix-blend-mode: ele força o navegador a recompor o canvas WebGL por baixo (lento em WebKitGTK).
  return (
    <svg className="bprev" viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`} aria-hidden="true">
      <path d={d} fill={color} fillRule="nonzero" opacity={brush.opacity * opacity} />
    </svg>
  );
}
