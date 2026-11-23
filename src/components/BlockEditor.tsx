// Editor flutuante do bloco selecionado (duplo toque fora de um texto, Enter ou "Editar"). Os campos vêm da definição de
// cada tipo (BlockDef.form). Mudanças aparecem AO VIVO (previewElements); fechar grava tudo como UM passo de desfazer.
// O menu "Transformar em" troca o tipo sem perder o conteúdo (e transforma em mapa mental).
import { ReactNode, useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { useBlockEdit } from "../core/blockView";
import { usePageEdit } from "../core/pageEdit";
import { BLOCK_COLORS, BLOCK_KINDS, BlockKind, BlockSpec, FormField, STICKY_COLORS, blockDef, fitBlock, getAt, setAt } from "../core/blocks";
import { LIBRARY, LIB_CATEGORIES } from "../core/blocks/library";
import { blockToMap, transformed } from "../core/blockActions";
import { rebindAfterChange } from "../core/binding";
import { AttachmentElement, HirakuDoc } from "../core/model";
import { selectActivePage, useDoc } from "../core/store";
import { canvasMeasure } from "../render/blockDraw";

const X = () => <Icon size={18}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
const Del = ({ onClick, label }: { onClick: () => void; label: string }) => <button className="btn sm" aria-label={label} title={label} onClick={onClick}><X /></button>;

/** Tipos agrupados pela categoria da biblioteca (para o menu "Transformar em"). */
export const KIND_GROUPS = LIB_CATEGORIES.map((c) => ({ label: c.label, kinds: BLOCK_KINDS.filter((k) => LIBRARY.find((i) => i.kind === k.id)?.cat === c.id) })).filter((g) => g.kinds.length);

export function BlockEditor() {
  const id = useBlockEdit((s) => s.id);
  const el = useDoc((s) => (id ? selectActivePage(s).elements.find((e) => e.id === id) : undefined)) as AttachmentElement | undefined;
  const base = useRef<HirakuDoc | null>(null);

  const commit = () => {
    if (base.current) useDoc.getState().endPreview(base.current);
    base.current = null;
  };
  const close = () => { commit(); useBlockEdit.getState().close(); };

  useEffect(() => { if (id && (!el || el.kind !== "block")) { base.current = null; useBlockEdit.getState().close(); } }, [id, el]);
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); commit(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id || !el || el.kind !== "block" || !el.block) return null;
  const spec = el.block;
  const def = blockDef(spec.kind);

  const preview = (upd: AttachmentElement) => {
    if (!base.current) base.current = useDoc.getState().doc;
    const els = selectActivePage(useDoc.getState()).elements.map((e) => (e.id === el.id ? upd : e));
    useDoc.getState().previewElements(rebindAfterChange(els, new Set([el.id])));
  };
  const set = (next: BlockSpec) => {
    const size = fitBlock(spec, next, el.w, el.h, canvasMeasure);
    preview({ ...el, block: next, w: size.w, h: size.h });
  };
  const val = (key: string) => getAt(spec, key);
  const put = (key: string, v: unknown) => set(setAt(spec, key, v));
  const palette = def.palette === "none" ? [] : def.palette === "sticky" ? STICKY_COLORS : BLOCK_COLORS;

  const turn = (kind: string) => {
    if (kind === "__map") { commit(); useBlockEdit.getState().close(); blockToMap(el.id); return; }
    preview(transformed(el as AttachmentElement & { block: BlockSpec }, kind as BlockKind, canvasMeasure));
  };

  return (
    <div className="block-editor" role="dialog" aria-label={`Editar ${def.label}`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="be-head">
        <b>{def.label}</b>
        <select className="be-turn" value="" onChange={(e) => turn(e.target.value)} aria-label="Transformar em outro tipo de bloco" title="Transformar em outro tipo (o conteúdo vai junto)">
          <option value="" disabled>Transformar em…</option>
          {KIND_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.kinds.filter((k) => k.id !== spec.kind).map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </optgroup>
          ))}
          <optgroup label="Mapas"><option value="__map">Mapa mental (título + ramos)</option></optgroup>
        </select>
        <button className="btn sm" aria-label="Fechar editor" title="Fechar (Esc)" onClick={close}><X /></button>
      </div>
      <div className="be-body">
        {palette.length > 0 && (
          <div className="swatch-grid" role="radiogroup" aria-label="Cor">
            {palette.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={spec.color === c} aria-label={`Cor ${c}`} className={"swatch" + (spec.color === c ? " on" : "")} style={{ background: c }} onClick={() => put("color", c)} />
            ))}
            <label className="swatch custom" title="Outra cor"><input type="color" value={spec.color} onChange={(e) => put("color", e.target.value.toUpperCase())} aria-label="Outra cor" /></label>
          </div>
        )}
        {spec.kind === "page" && (
          <button className="chip" onClick={() => { close(); usePageEdit.getState().open(el.id); }}>📄 Abrir o editor da página</button>
        )}
        {def.form.map((f, i) => <Field key={i} f={f} spec={spec} val={val} put={put} set={set} />)}
      </div>
      <div className="be-foot">
        <span className="be-hint">Duplo toque num texto do bloco edita ali mesmo</span>
        <button className="chip sm" onClick={close}>Pronto</button>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
function Field({ f, spec, val, put, set }: { f: FormField; spec: BlockSpec; val: (k: string) => unknown; put: (k: string, v: unknown) => void; set: (s: BlockSpec) => void }): ReactNode {
  const s = spec as Any;
  switch (f.t) {
    case "text": return <label className="field">{f.label}<input value={String(val(f.key) ?? "")} placeholder={f.ph} onChange={(e) => put(f.key, e.target.value)} /></label>;
    case "area": return <label className="field">{f.label}<textarea className={"be-area" + (f.font ? " " + f.font : "")} rows={f.rows ?? 3} spellCheck={f.font !== "mono"} value={String(val(f.key) ?? "")} placeholder={f.ph} onChange={(e) => put(f.key, e.target.value)}
      onKeyDown={f.font === "mono" ? (e) => { if (e.key !== "Tab") return; e.preventDefault(); const t = e.currentTarget, a = t.selectionStart, b = t.selectionEnd, v = String(val(f.key) ?? ""); put(f.key, v.slice(0, a) + "    " + v.slice(b)); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = a + 4; }); } : undefined} /></label>;
    case "number": return <label className="field">{f.label}<input type="number" min={f.min} max={f.max} step={f.step ?? 1} value={Number(val(f.key) ?? 0)} onChange={(e) => put(f.key, Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, Number(e.target.value) || 0)))} /></label>;
    case "select": return <label className="field">{f.label}<select value={String(val(f.key))} onChange={(e) => { const o = f.options.find((x) => String(x[0]) === e.target.value); put(f.key, o ? o[0] : e.target.value); }}>{f.options.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}</select></label>;
    case "bool": return <label className="be-check"><input type="checkbox" checked={!!val(f.key)} onChange={(e) => put(f.key, e.target.checked)} />{f.label}</label>;
    case "icon": return (
      <div className="field">{f.label}
        <div className="row tight wrap">{f.options.map((ic) => <button key={ic || "none"} className={"chip sm" + (val(f.key) === ic ? " on" : "")} aria-pressed={val(f.key) === ic} onClick={() => put(f.key, ic)}>{ic || "—"}</button>)}</div>
      </div>
    );
    case "lines": {
      const list = (val(f.key) as string[]) ?? [];
      return (
        <div className="field">{f.label}
          <div className="be-list">
            {list.map((t, i) => (
              <div className="be-item" key={i}>
                <input value={t} placeholder={f.ph ?? "Item"} autoFocus={i === list.length - 1 && !t}
                  onChange={(e) => put(`${f.key}.${i}`, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const n = [...list]; n.splice(i + 1, 0, ""); put(f.key, n); } }} />
                <Del label="Remover" onClick={() => put(f.key, list.filter((_, j) => j !== i))} />
              </div>
            ))}
            <button className="chip sm" onClick={() => put(f.key, [...list, ""])}>{f.add}</button>
          </div>
        </div>
      );
    }
    case "checklist": {
      const list = (val(f.key) as { text: string; done: boolean }[]) ?? [];
      return (
        <div className="field">{f.label}
          <div className="be-list">
            {list.map((it, i) => (
              <div className="be-item" key={i}>
                <input type="checkbox" checked={it.done} aria-label="Feita" onChange={() => put(`${f.key}.${i}.done`, !it.done)} />
                <input value={it.text} placeholder="Tarefa" autoFocus={i === list.length - 1 && !it.text} onChange={(e) => put(`${f.key}.${i}.text`, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const n = [...list]; n.splice(i + 1, 0, { text: "", done: false }); put(f.key, n); } }} />
                <Del label="Remover tarefa" onClick={() => put(f.key, list.filter((_, j) => j !== i))} />
              </div>
            ))}
            <button className="chip sm" onClick={() => put(f.key, [...list, { text: "", done: false }])}>+ Tarefa</button>
          </div>
        </div>
      );
    }
    case "pairs": {
      const list = (val(f.key) as Record<string, unknown>[]) ?? [];
      const [ka, la] = f.a, [kb, lb] = f.b;
      return (
        <div className="field">{f.label}
          <div className="be-list">
            {list.map((it, i) => (
              <div className={"be-item" + (f.bArea ? " stack" : "")} key={i}>
                <input className={f.bArea ? "" : "short"} type={f.aNum ? "number" : "text"} value={String(it[ka] ?? "")} placeholder={la} aria-label={la} onChange={(e) => put(`${f.key}.${i}.${ka}`, f.aNum ? Number(e.target.value) || 0 : e.target.value)} />
                {f.bArea
                  ? <textarea className="be-area" rows={2} value={String(it[kb] ?? "")} placeholder={lb} aria-label={lb} onChange={(e) => put(`${f.key}.${i}.${kb}`, e.target.value)} />
                  : <input value={String(it[kb] ?? "")} placeholder={lb} aria-label={lb} onChange={(e) => put(`${f.key}.${i}.${kb}`, e.target.value)} />}
                <Del label="Remover" onClick={() => put(f.key, list.filter((_, j) => j !== i))} />
              </div>
            ))}
            <button className="chip sm" onClick={() => put(f.key, [...list, { [ka]: f.aNum ? (list.length ? Number(list[list.length - 1][ka]) + 1 : 1) : "", [kb]: "" }])}>{f.add}</button>
          </div>
        </div>
      );
    }
    case "table": {
      const rows = (val(f.key) as string[][]) ?? [[""]];
      const cols = rows[0]?.length ?? 1;
      return (
        <>
          <div className="be-table" style={{ gridTemplateColumns: `repeat(${cols}, minmax(60px, 1fr))` }}>
            {rows.map((row, r) => row.map((cell, c) => (
              <input key={`${r}-${c}`} className={s.header && r === 0 ? "head" : ""} value={cell} aria-label={`Linha ${r + 1}, coluna ${c + 1}`} onChange={(e) => put(`${f.key}.${r}.${c}`, e.target.value)} />
            )))}
          </div>
          <div className="row tight wrap">
            <button className="chip sm" onClick={() => put(f.key, [...rows, rows[0].map(() => "")])}>+ Linha</button>
            <button className="chip sm" disabled={rows.length < 2} onClick={() => put(f.key, rows.slice(0, -1))}>− Linha</button>
            <button className="chip sm" onClick={() => put(f.key, rows.map((r) => [...r, ""]))}>+ Coluna</button>
            <button className="chip sm" disabled={cols < 2} onClick={() => put(f.key, rows.map((r) => r.slice(0, -1)))}>− Coluna</button>
            {"header" in s && <button className={"chip sm" + (s.header ? " on" : "")} aria-pressed={!!s.header} onClick={() => put("header", !s.header)}>Cabeçalho</button>}
          </div>
        </>
      );
    }
    case "columns": {
      const cols = (val(f.key) as { title: string; cards: string[] }[]) ?? [];
      return (
        <div className="be-cols">
          {cols.map((col, i) => (
            <div className="be-col" key={i}>
              <div className="be-item">
                <input value={col.title} aria-label="Título da coluna" onChange={(e) => put(`${f.key}.${i}.title`, e.target.value)} />
                <Del label="Remover coluna" onClick={() => cols.length > 1 && put(f.key, cols.filter((_, j) => j !== i))} />
              </div>
              <textarea className="be-area" rows={4} value={col.cards.join("\n")} placeholder="Um cartão por linha" aria-label={`Cartões de ${col.title}`} onChange={(e) => put(`${f.key}.${i}.cards`, e.target.value.split("\n"))} />
            </div>
          ))}
          <button className="chip sm" onClick={() => put(f.key, [...cols, { title: "Nova coluna", cards: [] }])}>+ Coluna</button>
        </div>
      );
    }
    case "goals": {
      const list = (val(f.key) as { text: string; value: number; max: number }[]) ?? [];
      return (
        <div className="field">Metas
          <div className="be-list">
            {list.map((g, i) => (
              <div className="be-item" key={i}>
                <input value={g.text} placeholder="Meta" onChange={(e) => put(`${f.key}.${i}.text`, e.target.value)} />
                <input className="tiny" type="number" min={0} value={g.value} aria-label="Atual" onChange={(e) => put(`${f.key}.${i}.value`, Math.max(0, Number(e.target.value) || 0))} />
                <span className="be-hint">/</span>
                <input className="tiny" type="number" min={1} value={g.max} aria-label="Meta" onChange={(e) => put(`${f.key}.${i}.max`, Math.max(1, Number(e.target.value) || 1))} />
                <Del label="Remover meta" onClick={() => put(f.key, list.filter((_, j) => j !== i))} />
              </div>
            ))}
            <button className="chip sm" onClick={() => put(f.key, [...list, { text: "", value: 0, max: 10 }])}>+ Meta</button>
          </div>
        </div>
      );
    }
    case "gantt": {
      const list = (val(f.key) as { text: string; start: number; end: number }[]) ?? [];
      const periods = (s.periods as string[]) ?? [];
      const sel = (v: number, on: (n: number) => void, min = 0) => <select className="tiny" value={v} onChange={(e) => on(Number(e.target.value))}>{periods.map((p, i) => i >= min && <option key={i} value={i}>{p || i + 1}</option>)}</select>;
      return (
        <div className="field">Tarefas
          <div className="be-list">
            {list.map((t, i) => (
              <div className="be-item" key={i}>
                <input value={t.text} placeholder="Tarefa" onChange={(e) => put(`${f.key}.${i}.text`, e.target.value)} />
                {sel(t.start, (n) => set(setAt(spec, `${f.key}.${i}`, { ...t, start: n, end: Math.max(n, t.end) })))}
                {sel(t.end, (n) => put(`${f.key}.${i}.end`, n), t.start)}
                <Del label="Remover tarefa" onClick={() => put(f.key, list.filter((_, j) => j !== i))} />
              </div>
            ))}
            <button className="chip sm" onClick={() => put(f.key, [...list, { text: "", start: 0, end: 0 }])}>+ Tarefa</button>
          </div>
        </div>
      );
    }
    case "habits": {
      const habits = s.habits as string[], checks = s.checks as boolean[][];
      return (
        <div className="field">Hábitos
          <div className="be-list">
            {habits.map((h, i) => (
              <div className="be-item" key={i}>
                <input value={h} placeholder="Hábito" onChange={(e) => put(`habits.${i}`, e.target.value)} />
                <Del label="Remover hábito" onClick={() => set({ ...s, habits: habits.filter((_, j) => j !== i), checks: checks.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <button className="chip sm" onClick={() => set({ ...s, habits: [...habits, ""], checks: [...checks, Array(s.days).fill(false)] })}>+ Hábito</button>
            <button className="chip sm" onClick={() => set({ ...s, checks: checks.map((r) => r.map(() => false)) })}>Limpar marcações</button>
          </div>
        </div>
      );
    }
    case "cells": return (
      <div className="be-quad">
        {[0, 1, 2, 3].map((i) => (
          <div className="be-col" key={i}>
            <input value={s.labels[i]} aria-label={`Rótulo ${i + 1}`} onChange={(e) => put(`labels.${i}`, e.target.value)} />
            <textarea className="be-area" rows={3} value={s.cells[i]} placeholder="Um item por linha" onChange={(e) => put(`cells.${i}`, e.target.value)} />
          </div>
        ))}
      </div>
    );
    case "options": {
      const opts = s.options as string[];
      return (
        <div className="field">Alternativas (marque a certa)
          <div className="be-list">
            {opts.map((o, i) => (
              <div className="be-item" key={i}>
                <input type="radio" name="quiz-answer" checked={s.answer === i} aria-label="Resposta certa" onChange={() => set({ ...s, answer: i, picked: -1 })} />
                <span className="be-hint">{"ABCDEFGH"[i]}</span>
                <input value={o} onChange={(e) => put(`options.${i}`, e.target.value)} />
                <Del label="Remover" onClick={() => opts.length > 2 && set({ ...s, options: opts.filter((_, j) => j !== i), answer: Math.min(s.answer > i ? s.answer - 1 : s.answer, opts.length - 2), picked: -1 })} />
              </div>
            ))}
            {opts.length < 8 && <button className="chip sm" onClick={() => put("options", [...opts, ""])}>+ Alternativa</button>}
            <button className="chip sm" onClick={() => put("picked", -1)}>↺ Zerar resposta</button>
          </div>
        </div>
      );
    }
  }
}
