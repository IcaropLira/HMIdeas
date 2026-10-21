import { Brush, hasBrush, registerBrush } from "./brushes";

export const BRUSH_PRESET_FORMAT = "hmideas-brush";
export const BRUSH_PACK_FORMAT = "hmideas-brush-pack";
export const BRUSH_PRESET_VERSION = 1;
export const CUSTOM_BRUSH_STORAGE_KEY = "hmideas.custom-brushes.v1";

export interface BrushPack {
  format: typeof BRUSH_PACK_FORMAT;
  version: typeof BRUSH_PRESET_VERSION;
  brushes: Brush[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isUnit = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const isPositive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 100;
const isColor = (v: unknown): v is string => typeof v === "string" && /^#[\da-f]{6}$/i.test(v);

/** Valida um preset sem confiar no JSON importado. Rejeita tipos e valores fora da faixa. */
export function isBrushPreset(value: unknown): value is Brush {
  if (!isRecord(value)) return false;
  return value.kind === "outline" &&
    typeof value.id === "string" && /^[a-z0-9][a-z0-9_-]{0,47}$/i.test(value.id) &&
    typeof value.label === "string" && value.label.trim().length > 0 && value.label.length <= 48 &&
    isPositive(value.size) && isUnit(value.thinning) && isUnit(value.simThinning) &&
    isUnit(value.smoothing) && isUnit(value.streamline) &&
    (value.taper === null || isUnit(value.taper)) && typeof value.round === "boolean" &&
    isUnit(value.opacity) && (value.blend === "normal" || value.blend === "multiply") &&
    (value.defaultColor === undefined || isColor(value.defaultColor)) &&
    typeof value.hint === "string" && value.hint.length <= 240;
}

/** Aceita um preset único ou um pacote JSON exportado pelo HMIdeas. */
export function parseBrushPack(text: string): Brush[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("O arquivo não é um JSON válido.");
  }
  if (!isRecord(data) || data.version !== BRUSH_PRESET_VERSION) {
    throw new Error("Versão de preset não suportada. Esperado HMIdeas Brush v1.");
  }
  const brushes: unknown[] = data.format === BRUSH_PRESET_FORMAT
    ? [data.brush]
    : data.format === BRUSH_PACK_FORMAT && Array.isArray(data.brushes)
      ? data.brushes
      : [];
  if (!brushes.length || brushes.length > 100 || !brushes.every(isBrushPreset)) {
    throw new Error("Preset inválido. Importe um arquivo .json exportado pelo HMIdeas.");
  }
  return (brushes as Brush[]).map((b) => ({ ...b, defaultColor: b.defaultColor?.toUpperCase() }));
}

export function serializeBrushPreset(brush: Brush): string {
  return JSON.stringify({ format: BRUSH_PRESET_FORMAT, version: BRUSH_PRESET_VERSION, brush }, null, 2) + "\n";
}

export function serializeBrushPack(brushes: Brush[]): string {
  return JSON.stringify({ format: BRUSH_PACK_FORMAT, version: BRUSH_PRESET_VERSION, brushes }, null, 2) + "\n";
}

/** Carrega os presets locais, ignorando entradas corrompidas e IDs nativos. */
export function loadCustomBrushes(raw: string | null): Brush[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(isBrushPreset).filter((b) => !["pen", "ballpoint", "ink", "marker", "highlighter", "brushpen"].includes(b.id));
  } catch {
    return [];
  }
}

/** Registra cópias com IDs próprios; um arquivo importado nunca substitui pincéis nativos. */
export function importBrushes(incoming: Brush[], existing: Brush[]): Brush[] {
  const known = new Set(existing.map((b) => b.id));
  const added: Brush[] = [];
  for (const source of incoming) {
    const base = source.id.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 38) || "brush";
    let id = base;
    let suffix = 2;
    while (known.has(id) || hasBrush(id)) id = `${base.slice(0, 38)}-${suffix++}`;
    known.add(id);
    const brush = { ...source, id, label: source.label.trim().slice(0, 48), hint: source.hint.slice(0, 240) };
    registerBrush(brush);
    added.push(brush);
  }
  return added;
}
