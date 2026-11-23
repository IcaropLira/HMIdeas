// Prévia em SVG de uma lista de elementos, com texto de verdade (diferente da miniatura de página, que troca texto
// por barras). Usada na galeria de modelos, nos modelos de mapa mental e nos exemplos de grafos/figuras.
import { HirakuElement, LinearElement, isLinear } from "../core/model";
import { linearPath } from "../core/linear";
import { elementBounds } from "../core/selection";
import { shapePath } from "../core/shapes";
import { FONT_CSS, LINE_HEIGHT } from "../core/text";
import { safeColor } from "../render/svgThumb";
import { figureSvg } from "../render/figureSvg";
import { blockSvg } from "../render/blockDraw";

const d = (pts: { x: number; y: number }[], close = true) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("") + (close ? "Z" : "");

function head(el: LinearElement, end: boolean) {
  const path = linearPath(el);
  if (path.length < 2) return null;
  const a = end ? path[path.length - 2] : path[1];
  const b = end ? path[path.length - 1] : path[0];
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const s = 8 + el.strokeWidth * 2;
  const p1 = { x: b.x - Math.cos(ang - 0.45) * s, y: b.y - Math.sin(ang - 0.45) * s };
  const p2 = { x: b.x - Math.cos(ang + 0.45) * s, y: b.y - Math.sin(ang + 0.45) * s };
  return <path d={d([p1, b, p2], true)} fill={safeColor(el.stroke, "#1B2233")} />;
}

function El({ el }: { el: HirakuElement }) {
  if (el.type === "text") {
    const lines = el.text.split("\n");
    const x = el.align === "center" ? el.x + el.w / 2 : el.align === "right" ? el.x + el.w : el.x;
    return (
      <text x={x} y={el.y} fontSize={el.fontSize} fontFamily={FONT_CSS[el.fontFamily]} fill={safeColor(el.color, "#1B2233")} textAnchor={el.align === "center" ? "middle" : el.align === "right" ? "end" : "start"} opacity={el.opacity}>
        {lines.map((l, i) => <tspan key={i} x={x} dy={i === 0 ? el.fontSize * 0.95 : el.fontSize * LINE_HEIGHT}>{l || " "}</tspan>)}
      </text>
    );
  }
  if (isLinear(el)) {
    const path = linearPath(el);
    const w = el.strokeWidth;
    const mid = path[Math.floor(path.length / 2)];
    return (
      <g>
        <path d={d(path, false)} fill="none" stroke={safeColor(el.stroke, "#1B2233")} strokeWidth={w} strokeLinecap="round" strokeDasharray={el.strokeStyle === "dashed" ? `${w * 4} ${w * 3}` : el.strokeStyle === "dotted" ? `0.1 ${w * 2.5}` : undefined} />
        {el.endHead !== "none" && head(el, true)}
        {el.startHead !== "none" && head(el, false)}
        {el.label && mid && <text x={mid.x} y={mid.y - 6} fontSize={14} textAnchor="middle" fill="#1B2233" stroke="#FFFFFF" strokeWidth={4} paintOrder="stroke">{el.label}</text>}
      </g>
    );
  }
  if (el.type === "frame") {
    return (
      <g>
        <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={8} fill={safeColor(el.color, "#5E6B7E")} fillOpacity={el.tint} stroke={safeColor(el.color, "#5E6B7E")} strokeWidth={el.strokeWidth} />
        <text x={el.x + 2} y={el.y - 8} fontSize={15} fontWeight={600} fill={safeColor(el.color, "#5E6B7E")}>{el.title}</text>
      </g>
    );
  }
  if (el.type === "node") {
    const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
    return (
      <g>
        {el.shape !== "none" && el.shape !== "underline" && <path d={d(shapePath(el))} fill={el.fill ? safeColor(el.fill, "none") : "none"} stroke={el.stroke ? safeColor(el.stroke, "none") : "none"} strokeWidth={el.strokeWidth} />}
        {el.shape === "underline" && <path d={`M${el.x} ${el.y + el.h}H${el.x + el.w}`} stroke={safeColor(el.branchColor, "#2F4B8F")} strokeWidth={el.strokeWidth} />}
        <text x={cx} y={cy} fontSize={el.fontSize} fontFamily={FONT_CSS[el.fontFamily]} fill={safeColor(el.color, "#1B2233")} textAnchor="middle" dominantBaseline="central">{(el.icon ? el.icon + " " : "") + el.text}</text>
      </g>
    );
  }
  if (el.type === "attachment") {
    if (el.kind === "figure" && el.figure) return <g dangerouslySetInnerHTML={{ __html: figureSvg(el) }} />;
    if (el.kind === "block" && el.block) return <g dangerouslySetInnerHTML={{ __html: blockSvg(el) }} />;
    return <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={8} fill="#F7F8FC" stroke="#9AA8C0" />;
  }
  if (el.type === "stroke") {
    return <path d={d(el.points, false)} fill="none" stroke={safeColor(el.color, "#1B2233")} strokeWidth={el.width} strokeLinecap="round" strokeLinejoin="round" opacity={el.opacity} />;
  }
  const w = el.strokeWidth;
  return (
    <path d={d(shapePath(el))} fill={el.fill ? safeColor(el.fill, "none") : "none"} stroke={w > 0 ? safeColor(el.stroke, "#1B2233") : "none"} strokeWidth={w}
      strokeDasharray={el.strokeStyle === "dashed" ? `${w * 4 + 4} ${w * 2 + 4}` : el.strokeStyle === "dotted" ? `0.1 ${w * 2 + 3}` : undefined} opacity={el.opacity} />
  );
}

/** Desenha os elementos ajustados a um quadro `w`×`h` (proporção mantida). */
export function ElementsPreview({ elements, w = 240, h = 160, pad = 16, bg }: { elements: HirakuElement[]; w?: number; h?: number; pad?: number; bg?: string }) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of elements) {
    const b = elementBounds(e);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY - (e.type === "frame" ? 24 : 0));
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }
  const bw = maxX - minX + pad * 2, bh = maxY - minY + pad * 2;
  const k = Math.max(bw / w, bh / h);
  const vw = w * k, vh = h * k;
  const vx = minX - pad - (vw - bw) / 2, vy = minY - pad - (vh - bh) / 2;
  return (
    <svg className="el-preview" viewBox={`${vx} ${vy} ${vw} ${vh}`} width={w} height={h} aria-hidden="true">
      {bg && <rect x={vx} y={vy} width={vw} height={vh} fill={bg} />}
      {elements.filter((e) => e.type === "frame").map((e) => <El key={e.id} el={e} />)}
      {elements.filter((e) => e.type !== "frame").map((e) => <El key={e.id} el={e} />)}
    </svg>
  );
}
