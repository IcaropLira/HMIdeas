// Novo documento (0.18): o diálogo do Photoshop/Clip Studio — categorias de predefinições em cima, cartões à esquerda e
// "Detalhes" à direita (nome, largura × altura com unidade, orientação, pranchetas, resolução, modo de cor, profundidade,
// fundo, papel e quadro infinito). Recentes e predefinições salvas ficam no localStorage; o documento vira um caderno novo.
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import {
  DEFAULT_SPEC, DOC_CATS, DOC_PRESETS, DocCat, DocPreset, DocSpec, MAX_PAGES, UNITS, Unit, changeUnit, cleanSpec, isLandscape,
  memLabel, ppi, presetSpec, sizeLabel, specErrors, specPx, specToDoc, swapOrientation, tidy,
} from "../core/docSetup";
import { PAPER_KINDS, newId } from "../core/model";
import { useUI } from "../core/ui";
import { Icon } from "./Icon";
import { createNotebookFromDoc } from "./NotebookManager";

const RECENT_KEY = "hm-ideas:doc-recent-v1", SAVED_KEY = "hm-ideas:doc-presets-v1";
type Saved = { id: string; label: string; spec: DocSpec };

const readList = <T,>(key: string, clean: (x: unknown) => T | null): T[] => {
  try { const raw = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(raw) ? raw.map(clean).filter((x): x is T => !!x) : []; } catch { return []; }
};
const writeList = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { useUI.getState().showToast("Sem espaço para guardar a predefinição."); } };
const loadRecents = () => readList(RECENT_KEY, cleanSpec).slice(0, 8);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadSaved = () => readList<Saved>(SAVED_KEY, (x: any) => { const spec = cleanSpec(x?.spec); return spec && typeof x.id === "string" ? { id: x.id, label: String(x.label || spec.name).slice(0, 60), spec } : null; });
const sameSize = (a: DocSpec, b: DocSpec) => a.width === b.width && a.height === b.height && a.unit === b.unit && ppi(a.resolution, a.resUnit) === ppi(b.resolution, b.resUnit) && !!a.infinite === !!b.infinite;

export const useNewDoc = create<{ open: boolean; set: (open: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openNewDocument = () => useNewDoc.getState().set(true);

/** Número com vírgula ou ponto; guarda o rascunho enquanto se digita. */
function NumField({ value, onChange, label, min = 0, step, unit }: { value: number; onChange: (v: number) => void; label: string; min?: number; step?: number; unit?: string }) {
  const [draft, setDraft] = useState(String(value).replace(".", ","));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(String(value).replace(".", ",")); }, [value]);
  return (
    <input className="nd-num" inputMode="decimal" aria-label={label} value={draft} step={step}
      onFocus={(e) => { focused.current = true; e.currentTarget.select(); }}
      onBlur={() => { focused.current = false; setDraft(String(value).replace(".", ",")); }}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = parseFloat(e.target.value.replace(",", "."));
        if (Number.isFinite(v) && v > min) onChange(v);
      }}
      title={unit ? `${label} (${unit})` : label} />
  );
}

function Thumb({ w, h, infinite }: { w: number; h: number; infinite?: boolean }) {
  const k = 44 / Math.max(w, h);
  const tw = Math.max(8, w * k), th = Math.max(8, h * k);
  return (
    <svg className="nd-thumb" width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
      {infinite
        ? <path d="M10 26c0-5 4-8 8-8 7 0 9 16 16 16 4 0 8-3 8-8s-4-8-8-8c-7 0-9 16-16 16-4 0-8-3-8-8z" fill="none" stroke="currentColor" strokeWidth="2.4" />
        : <rect x={(52 - tw) / 2} y={(52 - th) / 2} width={tw} height={th} rx="2" fill="var(--surface)" stroke="currentColor" strokeWidth="1.6" />}
    </svg>
  );
}

export function NewDocumentDialog() {
  const open = useNewDoc((s) => s.open);
  const [recents, setRecents] = useState<DocSpec[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [cat, setCat] = useState<DocCat>("photo");
  const [spec, setSpec] = useState<DocSpec>(DEFAULT_SPEC);
  const [picked, setPicked] = useState<string>(DOC_PRESETS[0].id);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const r = loadRecents();
    setRecents(r); setSaved(loadSaved());
    setCat(r.length ? "recent" : "photo");
    setSpec({ ...(r[0] ?? DEFAULT_SPEC), name: "Sem título-1" });
    setPicked(r.length ? "recent-0" : DOC_PRESETS[0].id);
    setTimeout(() => nameRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); useNewDoc.getState().set(false); } };
    document.addEventListener("keydown", k, true);
    return () => document.removeEventListener("keydown", k, true);
  }, [open]);

  const errors = useMemo(() => {
    const e = specErrors(spec);
    const px = specPx(spec);
    if (!spec.infinite && (px.w < 16 || px.h < 16)) e.push("Cada lado precisa ter pelo menos 16 px.");
    return e;
  }, [spec]);
  if (!open) return null;

  const close = () => useNewDoc.getState().set(false);
  const patch = (p: Partial<DocSpec>) => { setSpec((s) => ({ ...s, ...p })); setPicked(""); };
  const dpi = ppi(spec.resolution, spec.resUnit);
  const px = specPx(spec);

  type Card = { key: string; label: string; spec: DocSpec; sub: string; del?: () => void };
  const label = (s: DocSpec) => sizeLabel({ w: s.width, h: s.height, unit: s.unit, dpi: Math.round(ppi(s.resolution, s.resUnit)), infinite: s.infinite });
  const cards: Card[] = cat === "recent"
    ? recents.map((s, i) => ({ key: `recent-${i}`, label: s.name || "Sem título", spec: s, sub: label(s) }))
    : cat === "saved"
      ? saved.map((p) => ({ key: p.id, label: p.label, spec: p.spec, sub: label(p.spec), del: () => { const next = saved.filter((x) => x.id !== p.id); setSaved(next); writeList(SAVED_KEY, next); } }))
      : DOC_PRESETS.filter((p: DocPreset) => p.cat === cat).map((p) => ({ key: p.id, label: p.label, spec: presetSpec(p), sub: sizeLabel({ w: p.w, h: p.h, unit: p.unit, dpi: p.dpi, infinite: p.infinite }) }));

  const pick = (c: Card) => { setSpec({ ...c.spec, name: spec.name }); setPicked(c.key); };
  const savePreset = () => {
    if (errors.length) return;
    const p: Saved = { id: newId(), label: spec.name.trim() || label(spec), spec };
    const next = [p, ...saved].slice(0, 40);
    setSaved(next); writeList(SAVED_KEY, next); setCat("saved"); setPicked(p.id);
    useUI.getState().showToast(`Predefinição “${p.label}” salva.`);
  };
  const go = async () => {
    if (errors.length || busy) return;
    setBusy(true);
    try {
      const rec = [spec, ...recents.filter((r) => !sameSize(r, spec))].slice(0, 8);
      writeList(RECENT_KEY, rec);
      await createNotebookFromDoc(specToDoc(spec), spec.name.trim() || "Sem título");
      close();
    } finally { setBusy(false); }
  };
  const setRes = (v: number) => patch({ resolution: v });
  const setResUnit = (u: "ppi" | "ppcm") => patch({ resUnit: u, resolution: Math.round((u === "ppcm" ? dpi / 2.54 : dpi) * 100) / 100 });

  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <section className="newdoc dialog" role="dialog" aria-modal="true" aria-label="Novo documento"
        onKeyDown={(e) => { if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLSelectElement)) { e.preventDefault(); void go(); } }}>
        <header>
          <strong>Novo documento</strong>
          <nav className="nd-cats" role="tablist" aria-label="Categorias">
            {DOC_CATS.map((c) => (
              <button key={c.id} role="tab" aria-selected={cat === c.id} className={cat === c.id ? "on" : ""} onClick={() => setCat(c.id)}>{c.label}</button>
            ))}
          </nav>
          <button className="btn sm" onClick={close} aria-label="Fechar"><Icon><path d="M6 6l12 12M18 6L6 18" /></Icon></button>
        </header>

        <div className="nd-body">
          <div className="nd-presets">
            <h3>{cat === "recent" ? "Usados recentemente" : cat === "saved" ? "Suas predefinições" : `Predefinições em branco — ${DOC_CATS.find((c) => c.id === cat)?.label}`} <small>({cards.length})</small></h3>
            {cards.length === 0 && (
              <p className="nd-empty">{cat === "recent" ? "Os tamanhos que você criar aparecem aqui." : "Ajuste os detalhes e toque em “Salvar predefinição” para guardar um tamanho seu."}</p>
            )}
            <div className="nd-grid">
              {cards.map((c) => (
                <div key={c.key} className={picked === c.key ? "nd-card on" : "nd-card"}>
                  <button className="nd-card-main" onClick={() => pick(c)} onDoubleClick={() => { pick(c); }} aria-pressed={picked === c.key} title={`${c.label} — ${c.sub}`}>
                    <Thumb w={c.spec.width} h={c.spec.height} infinite={c.spec.infinite} />
                    <span className="nd-card-label">{c.label}</span>
                    <small>{c.sub}{c.spec.pages > 1 ? ` · ${c.spec.pages} pranchetas` : ""}</small>
                  </button>
                  {c.del && <button className="nd-card-del" onClick={c.del} aria-label={`Apagar predefinição ${c.label}`} title="Apagar predefinição"><Icon size={14}><path d="M6 6l12 12M18 6L6 18" /></Icon></button>}
                </div>
              ))}
            </div>
          </div>

          <aside className="nd-details" aria-label="Detalhes da predefinição">
            <h3>Detalhes da predefinição</h3>
            <div className="nd-name">
              <input ref={nameRef} value={spec.name} maxLength={80} onChange={(e) => setSpec((s) => ({ ...s, name: e.target.value }))} aria-label="Nome do documento" />
              <button className="btn sm" onClick={savePreset} disabled={!!errors.length} aria-label="Salvar predefinição" title="Salvar predefinição">
                <Icon><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></Icon>
              </button>
            </div>

            <label className="nd-check">
              <input type="checkbox" checked={!!spec.infinite} onChange={(e) => patch({ infinite: e.target.checked || undefined })} />
              Quadro infinito (sem folha)
            </label>

            <fieldset disabled={!!spec.infinite} className="nd-size">
              <label>Largura</label>
              <div className="nd-row">
                <NumField label="Largura" value={spec.width} onChange={(v) => patch({ width: v })} unit={spec.unit} />
                <select value={spec.unit} onChange={(e) => patch(changeUnit(spec, e.target.value as Unit))} aria-label="Unidade">
                  {UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
              </div>
              <div className="nd-row nd-row-3">
                <div>
                  <label>Altura</label>
                  <NumField label="Altura" value={spec.height} onChange={(v) => patch({ height: v })} unit={spec.unit} />
                </div>
                <div>
                  <label>Orientação</label>
                  <div className="nd-orient" role="radiogroup" aria-label="Orientação">
                    <button role="radio" aria-checked={!isLandscape(spec)} className={!isLandscape(spec) ? "on" : ""} onClick={() => { if (isLandscape(spec)) patch(swapOrientation(spec)); }} aria-label="Retrato" title="Retrato">
                      <Icon><rect x="7" y="3" width="10" height="18" rx="1.5" /></Icon>
                    </button>
                    <button role="radio" aria-checked={isLandscape(spec)} className={isLandscape(spec) ? "on" : ""} onClick={() => { if (!isLandscape(spec)) patch(swapOrientation(spec)); }} aria-label="Paisagem" title="Paisagem">
                      <Icon><rect x="3" y="7" width="18" height="10" rx="1.5" /></Icon>
                    </button>
                  </div>
                </div>
                <div>
                  <label>Pranchetas</label>
                  <NumField label="Pranchetas (páginas)" value={spec.pages} min={0} onChange={(v) => patch({ pages: Math.min(MAX_PAGES, Math.max(1, Math.round(v))) })} />
                </div>
              </div>
              <label>Resolução</label>
              <div className="nd-row">
                <NumField label="Resolução" value={spec.resolution} onChange={setRes} />
                <select value={spec.resUnit} onChange={(e) => setResUnit(e.target.value as "ppi" | "ppcm")} aria-label="Unidade da resolução">
                  <option value="ppi">Pixels/pol.</option>
                  <option value="ppcm">Pixels/cm</option>
                </select>
              </div>
            </fieldset>

            <label>Modo de cores</label>
            <div className="nd-row">
              <select value={spec.colorMode} onChange={(e) => patch({ colorMode: e.target.value as "rgb" | "gray" })} aria-label="Modo de cores">
                <option value="rgb">Cores RGB</option>
                <option value="gray">Escala de cinza</option>
              </select>
              <select value={spec.bitDepth} onChange={(e) => patch({ bitDepth: Number(e.target.value) as 8 | 16 | 32 })} aria-label="Profundidade de cor" title="Guardado no documento; a tela e as exportações usam 8 bits por canal">
                <option value={8}>8 bits</option>
                <option value={16}>16 bits</option>
                <option value={32}>32 bits</option>
              </select>
            </div>

            <label>Conteúdo do plano de fundo</label>
            <div className="nd-row">
              <select value={spec.bg} onChange={(e) => patch({ bg: e.target.value as DocSpec["bg"] })} aria-label="Plano de fundo">
                <option value="white">Branco</option>
                <option value="black">Preto</option>
                <option value="transparent" disabled={!!spec.infinite}>Transparente</option>
                <option value="custom">Personalizado</option>
              </select>
              <span className={`nd-swatch${spec.bg === "transparent" ? " clear" : ""}`} style={spec.bg === "transparent" ? undefined : { background: spec.bg === "black" ? "#000" : spec.bg === "custom" ? spec.bgColor : "#fff" }}>
                {spec.bg === "custom" && <input type="color" value={spec.bgColor} onChange={(e) => patch({ bgColor: e.target.value.toUpperCase() })} aria-label="Cor do fundo" />}
              </span>
            </div>

            <details className="nd-adv">
              <summary>Opções avançadas</summary>
              <label>Papel (linhas)</label>
              <select value={spec.paper} onChange={(e) => patch({ paper: e.target.value as DocSpec["paper"] })} aria-label="Papel">
                {PAPER_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </details>

            <p className="nd-info" aria-live="polite">
              {spec.infinite ? "Quadro sem bordas" : `${px.w.toLocaleString("pt-BR")} × ${px.h.toLocaleString("pt-BR")} px`}
              {spec.unit !== "px" && !spec.infinite && <> · {tidy(spec.width, spec.unit).toLocaleString("pt-BR")} × {tidy(spec.height, spec.unit).toLocaleString("pt-BR")} {UNITS.find((u) => u.id === spec.unit)?.label.toLowerCase()}</>}
              {!spec.infinite && <> · {memLabel(spec)}</>}
            </p>
            {errors.map((e) => <p key={e} className="nd-error" role="alert">{e}</p>)}
          </aside>
        </div>

        <footer>
          <button className="btn" onClick={close}>Fechar</button>
          <button className="btn primary" onClick={() => void go()} disabled={!!errors.length || busy}>{busy ? "Criando…" : "Criar"}</button>
        </footer>
      </section>
    </div>
  );
}
