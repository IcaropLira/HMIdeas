// Pré-visualização de um brush: uma onda com pressão subindo e descendo, desenhada com o MESMO
// contorno do traço de verdade (strokeOutline), então reflete cor, pressão e afilamento atuais.
import { useMemo } from "react";
import { Brush } from "../core/brushes";
import { InkPoint } from "../core/model";
import { strokeOutline } from "../core/ink";

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
    const flat = strokeOutline(SAMPLE, { color, width: w, sens, taper, brush: brush.id, opacity }, true);
    let path = "";
    for (let i = 0; i < flat.length; i += 2) path += (i ? "L" : "M") + flat[i].toFixed(1) + " " + flat[i + 1].toFixed(1);
    return flat.length >= 6 ? path + "Z" : "";
  }, [brush, color, width, sens, taper, opacity]);

  return (
    <svg className="bprev" viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`} aria-hidden="true">
      <path d={d} fill={color} opacity={brush.opacity * opacity} style={{ mixBlendMode: brush.blend }} />
    </svg>
  );
}
