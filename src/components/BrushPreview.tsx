// Pré-visualização de um brush: uma onda com pressão subindo e descendo, desenhada com a MESMA malha
// do traço de verdade (buildStrokeMesh), então reflete cor, pressão e afilamento atuais.
import { useMemo } from "react";
import { Brush, brushDyn } from "../core/brushes";
import { InkPoint } from "../core/model";
import { buildStrokeDabs, buildStrokeMesh, meshToSvgPath } from "../core/strokeMesh";
import { EngineCfg } from "../core/engine";

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
  /** Motor ativo (decide fita ou carimbos e a dinâmica). */
  cfg?: EngineCfg;
}

export function BrushPreview({ brush, color, width, sens, taper, opacity, cfg }: Props) {
  const { d, dabs, soft } = useMemo(() => {
    const w = Math.min(width * brush.size, PREVIEW_H * 0.5);
    const dyn = brushDyn(brush, cfg);
    const st = { color, width: w, sens, taper: brush.taper ?? taper, brush: brush.id, opacity, dyn };
    if (dyn.render === "dab") return { d: "", dabs: buildStrokeDabs(SAMPLE, st), soft: (dyn.tip?.hardness ?? 1) < 0.6, round: dyn.tip?.roundness ?? 1 };
    const mesh = buildStrokeMesh(SAMPLE, st);
    return { d: mesh ? meshToSvgPath(mesh) : "", dabs: null, soft: false };
  }, [brush, color, width, sens, taper, opacity, cfg]);
  const gid = `bp-${brush.id}`;
  if (dabs) {
    const dyn = brushDyn(brush, cfg), rnd = dyn.tip?.roundness ?? 1;
    return (
      <svg className="bprev" viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`} aria-hidden="true">
        {soft && <defs><radialGradient id={gid}><stop offset="0" stopColor={color} /><stop offset="1" stopColor={color} stopOpacity="0" /></radialGradient></defs>}
        {dabs.filter((_, i) => i % Math.max(1, Math.floor(dabs.length / 160)) === 0).map((q, i) => (
          <ellipse key={i} cx={q.x} cy={q.y} rx={q.r} ry={q.r * rnd} transform={`rotate(${(q.rot * 180) / Math.PI} ${q.x} ${q.y})`} fill={soft ? `url(#${gid})` : color} opacity={Math.min(1, q.a * brush.opacity * opacity * (dabs.length > 160 ? Math.max(1, dabs.length / 160) * 0.7 : 1))} />
        ))}
      </svg>
    );
  }

  // Sem mix-blend-mode: ele força o navegador a recompor o canvas WebGL por baixo (lento em WebKitGTK).
  return (
    <svg className="bprev" viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`} aria-hidden="true">
      <path d={d} fill={color} fillRule="nonzero" opacity={brush.opacity * opacity} />
    </svg>
  );
}
