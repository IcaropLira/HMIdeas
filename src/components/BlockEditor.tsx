// Editor do bloco selecionado (duplo toque, Enter ou "Editar"): campos próprios de cada tipo de bloco.
// Cada mudança aparece AO VIVO no quadro (previewElements, sem histórico); fechar grava tudo como UM passo de desfazer.
import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { useBlockEdit } from "../core/blockView";
import { BLOCK_COLORS, BLOCK_KINDS, BlockSpec, STICKY_COLORS, fitBlock } from "../core/blocks";
import { rebindAfterChange } from "../core/binding";
import { AttachmentElement, HirakuDoc } from "../core/model";
import { selectActivePage, useDoc } from "../core/store";
import { canvasMeasure } from "../render/blockDraw";

const X = () => <Icon size={18}><path d="M6 6l12 12M18 6L6 18" /></Icon>;

const CALLOUT_ICONS = ["💡", "⚠️", "✅", "❗", "📌", "ℹ️", "🔥", "❓", "🎯", "📝"];

export function BlockEditor() {
  const id = useBlockEdit((s) => s.id);
  const el = useDoc((s) => (id ? selectActivePage(s).elements.find((e) => e.id === id) : undefined)) as AttachmentElement | undefined;
  const base = useRef<HirakuDoc | null>(null);

  const commit = () => {
    if (base.current) useDoc.getState().endPreview(base.current);
    base.current = null;
  };
  const close = () => { commit(); useBlockEdit.getState().close(); };

  // o bloco sumiu (desfazer, apagar, trocar de página): fecha sem gravar
  useEffect(() => { if (id && (!el || el.kind !== "block")) { base.current = null; useBlockEdit.getState().close(); } }, [id, el]);
  // Esc fecha; trocar de bloco grava o anterior
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); commit(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id || !el || el.kind !== "block" || !el.block) return null;
  const spec = el.block;

  const set = (next: BlockSpec) => {
    if (!base.current) base.current = useDoc.getState().doc;
    const size = fitBlock(spec, next, el.w, el.h, canvasMeasure);
    const upd: AttachmentElement = { ...el, block: next, w: size.w, h: size.h };
    const els = selectActivePage(useDoc.getState()).elements.map((e) => (e.id === el.id ? upd : e));
    useDoc.getState().previewElements(rebindAfterChange(els, new Set([el.id])));
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch = (p: any) => set({ ...spec, ...p } as BlockSpec);
  const label = BLOCK_KINDS.find((k) => k.id === spec.kind)?.label ?? "Bloco";
  const palette = spec.kind === "sticky" ? STICKY_COLORS : BLOCK_COLORS;

  return (
    <div className="block-editor" role="dialog" aria-label={`Editar ${label}`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="be-head">
        <b>{label}</b>
        <span className="be-hint">ao vivo · Esc fecha</span>
        <button className="btn sm" aria-label="Fechar editor" title="Fechar (Esc)" onClick={close}><X /></button>
      </div>
      <div className="be-body">
        <div className="swatch-grid" role="radiogroup" aria-label="Cor">
          {palette.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={spec.color === c} aria-label={`Cor ${c}`} className={"swatch" + (spec.color === c ? " on" : "")} style={{ background: c }} onClick={() => patch({ color: c })} />
          ))}
        </div>

        {"title" in spec && (
          <label className="field">Título
            <input value={spec.title} onChange={(e) => patch({ title: e.target.value })} autoFocus={spec.kind !== "todo"} />
          </label>
        )}

        {spec.kind === "sticky" && (
          <textarea className="be-area hand" rows={6} value={spec.text} autoFocus onChange={(e) => patch({ text: e.target.value })} aria-label="Texto do post-it" />
        )}

        {(spec.kind === "card" || spec.kind === "slide" || spec.kind === "doc") && (
          <label className="field">{spec.kind === "doc" ? "Texto (# subtítulo, - lista)" : spec.kind === "slide" ? "Tópicos (- um por linha)" : "Texto"}
            <textarea className={"be-area" + (spec.kind === "doc" ? " serif" : "")} rows={spec.kind === "doc" ? 12 : 5} value={spec.body} onChange={(e) => patch({ body: e.target.value })} />
          </label>
        )}
        {spec.kind === "slide" && (
          <label className="field">Número do slide
            <input type="number" min={1} value={spec.number} onChange={(e) => patch({ number: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
        )}

        {spec.kind === "todo" && (
          <div className="be-list">
            {spec.items.map((it, i) => (
              <div className="be-item" key={i}>
                <input type="checkbox" checked={it.done} aria-label="Feita" onChange={() => patch({ items: spec.items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} />
                <input value={it.text} autoFocus={i === spec.items.length - 1 && !it.text} placeholder="Tarefa"
                  onChange={(e) => patch({ items: spec.items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const items = [...spec.items]; items.splice(i + 1, 0, { text: "", done: false }); patch({ items }); } }} />
                <button className="btn sm" aria-label="Remover tarefa" onClick={() => patch({ items: spec.items.filter((_, j) => j !== i) })}><X /></button>
              </div>
            ))}
            <button className="chip sm" onClick={() => patch({ items: [...spec.items, { text: "", done: false }] })}>+ Tarefa</button>
          </div>
        )}

        {spec.kind === "table" && (
          <>
            <div className="be-table" style={{ gridTemplateColumns: `repeat(${spec.rows[0]?.length ?? 1}, minmax(70px, 1fr))` }}>
              {spec.rows.map((row, r) => row.map((cell, c) => (
                <input key={`${r}-${c}`} className={spec.header && r === 0 ? "head" : ""} value={cell} aria-label={`Linha ${r + 1}, coluna ${c + 1}`}
                  onChange={(e) => patch({ rows: spec.rows.map((rr, i) => (i === r ? rr.map((cc, j) => (j === c ? e.target.value : cc)) : rr)) })} />
              )))}
            </div>
            <div className="row tight">
              <button className="chip sm" onClick={() => patch({ rows: [...spec.rows, spec.rows[0].map(() => "")] })}>+ Linha</button>
              <button className="chip sm" disabled={spec.rows.length < 2} onClick={() => patch({ rows: spec.rows.slice(0, -1) })}>− Linha</button>
              <button className="chip sm" onClick={() => patch({ rows: spec.rows.map((r) => [...r, ""]) })}>+ Coluna</button>
              <button className="chip sm" disabled={(spec.rows[0]?.length ?? 1) < 2} onClick={() => patch({ rows: spec.rows.map((r) => r.slice(0, -1)) })}>− Coluna</button>
              <button className={"chip sm" + (spec.header ? " on" : "")} aria-pressed={spec.header} onClick={() => patch({ header: !spec.header })}>Cabeçalho</button>
            </div>
          </>
        )}

        {spec.kind === "timeline" && (
          <div className="be-list">
            {spec.items.map((it, i) => (
              <div className="be-item" key={i}>
                <input className="short" value={it.date} placeholder="Data" aria-label="Data" onChange={(e) => patch({ items: spec.items.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} />
                <input value={it.text} placeholder="Marco" aria-label="Marco" onChange={(e) => patch({ items: spec.items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                <button className="btn sm" aria-label="Remover marco" onClick={() => patch({ items: spec.items.filter((_, j) => j !== i) })}><X /></button>
              </div>
            ))}
            <button className="chip sm" onClick={() => patch({ items: [...spec.items, { date: "", text: "" }] })}>+ Marco</button>
          </div>
        )}

        {spec.kind === "kanban" && (
          <div className="be-cols">
            {spec.columns.map((col, i) => (
              <div className="be-col" key={i}>
                <div className="be-item">
                  <input value={col.title} aria-label="Título da coluna" onChange={(e) => patch({ columns: spec.columns.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                  <button className="btn sm" aria-label="Remover coluna" disabled={spec.columns.length < 2} onClick={() => patch({ columns: spec.columns.filter((_, j) => j !== i) })}><X /></button>
                </div>
                <textarea className="be-area" rows={4} value={col.cards.join("\n")} placeholder="Um cartão por linha" aria-label={`Cartões de ${col.title}`}
                  onChange={(e) => patch({ columns: spec.columns.map((x, j) => (j === i ? { ...x, cards: e.target.value.split("\n") } : x)) })} />
              </div>
            ))}
            <button className="chip sm" onClick={() => patch({ columns: [...spec.columns, { title: "Nova coluna", cards: [] }] })}>+ Coluna</button>
          </div>
        )}

        {spec.kind === "callout" && (
          <>
            <div className="row tight">
              {CALLOUT_ICONS.map((ic) => (
                <button key={ic} className={"chip sm" + (spec.icon === ic ? " on" : "")} aria-pressed={spec.icon === ic} onClick={() => patch({ icon: ic })}>{ic}</button>
              ))}
            </div>
            <textarea className="be-area" rows={4} autoFocus value={spec.text} onChange={(e) => patch({ text: e.target.value })} aria-label="Texto do destaque" />
          </>
        )}

        {spec.kind === "code" && (
          <>
            <label className="field">Linguagem
              <input value={spec.lang} onChange={(e) => patch({ lang: e.target.value })} />
            </label>
            <textarea className="be-area mono" rows={10} autoFocus spellCheck={false} value={spec.code} aria-label="Código"
              onChange={(e) => patch({ code: e.target.value })}
              onKeyDown={(e) => {
                if (e.key !== "Tab") return;
                e.preventDefault();
                const t = e.currentTarget, a = t.selectionStart, b = t.selectionEnd;
                patch({ code: spec.code.slice(0, a) + "    " + spec.code.slice(b) });
                requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = a + 4; });
              }} />
          </>
        )}
      </div>
      <div className="be-foot">
        <button className="chip sm" onClick={close}>Pronto</button>
      </div>
    </div>
  );
}
