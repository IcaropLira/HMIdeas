// Edição de texto DIRETO no bloco: duplo toque num texto (título do cartão, item da lista, célula da tabela, post-it…) abre
// um campo do sistema exatamente por cima dele, com a mesma fonte, tamanho e cor, acompanhando zoom e rolagem.
// Enter num item de lista cria o próximo (como no Notion); Backspace num item vazio apaga; Tab vai para o próximo campo.
// Tudo ao vivo (previewElements) e gravado como UM passo de desfazer ao sair.
import { useEffect, useLayoutEffect, useRef } from "react";
import { useBlockInline } from "../core/blockView";
import { BField, BlockSpec, blockFields, blockPrims, fieldValue, fitBlock, removeFieldItem, splitField, withField } from "../core/blocks";
import { rebindAfterChange } from "../core/binding";
import { AttachmentElement, HirakuDoc } from "../core/model";
import { selectActivePage, useDoc, useView } from "../core/store";
import { FONT_CSS } from "../core/text";
import { canvasMeasure } from "../render/blockDraw";

export function BlockInlineEditor() {
  const { id, key, caret } = useBlockInline();
  const el = useDoc((s) => (id ? selectActivePage(s).elements.find((e) => e.id === id) : undefined)) as AttachmentElement | undefined;
  const cam = useView((s) => s.camera);
  const base = useRef<HirakuDoc | null>(null);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const done = useRef(false);

  const commit = () => {
    if (base.current) useDoc.getState().endPreview(base.current);
    base.current = null;
  };
  const close = () => { if (done.current) return; done.current = true; commit(); useBlockInline.getState().close(); };

  // abriu outro campo: foca e põe o cursor
  useLayoutEffect(() => {
    done.current = false;
    const t = ref.current;
    if (!t) return;
    t.focus({ preventScroll: true });
    const n = t.value.length, c = caret ?? n;
    t.setSelectionRange(Math.min(c, n), Math.min(c, n));
  }, [id, key, caret]);
  useEffect(() => { if (id && (!el || el.kind !== "block")) { base.current = null; useBlockInline.getState().close(); } }, [id, el]);
  useEffect(() => () => { commit(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!id || !el || el.kind !== "block" || !el.block) return null;
  const spec = el.block;
  const fields = blockFields(spec, el.w, el.h, canvasMeasure);
  const f: BField | undefined = fields.find((x) => x.key === key);
  if (!f) return null;
  const value = fieldValue(spec, key);

  const apply = (next: BlockSpec) => {
    if (!base.current) base.current = useDoc.getState().doc;
    const size = fitBlock(spec, next, el.w, el.h, canvasMeasure);
    const upd: AttachmentElement = { ...el, block: next, w: size.w, h: size.h };
    const els = selectActivePage(useDoc.getState()).elements.map((e) => (e.id === el.id ? upd : e));
    useDoc.getState().previewElements(rebindAfterChange(els, new Set([el.id])));
  };
  const jump = (dir: 1 | -1) => {
    const i = fields.findIndex((x) => x.key === key), n = fields[(i + dir + fields.length) % fields.length];
    if (n) useBlockInline.getState().open(el.id, n.key);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    e.stopPropagation();
    const t = e.currentTarget;
    if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); close(); return; }
    if (e.key === "Tab") { e.preventDefault(); jump(e.shiftKey ? -1 : 1); return; }
    if (e.key === "Enter" && !f.multiline) {
      e.preventDefault();
      const r = splitField(spec, key, t.value.slice(0, t.selectionStart ?? t.value.length), t.value.slice(t.selectionEnd ?? t.value.length));
      if (r) { apply(r.spec); useBlockInline.getState().open(el.id, r.focus, 0); }
      else close();
      return;
    }
    if (e.key === "Backspace" && t.value === "") {
      const r = removeFieldItem(spec, key);
      if (r) { e.preventDefault(); apply(r.spec); useBlockInline.getState().open(el.id, r.focus); }
    }
  };

  // posição na tela (blocos girados — adesivos — giram junto)
  const z = cam.zoom;
  const tilt = (blockPrims(spec, el.w, el.h, canvasMeasure).tilt ?? 0) * (180 / Math.PI);
  const lh = 1.3;
  const style: React.CSSProperties = {
    left: f.x * z, top: f.y * z, width: Math.max(24, f.w * z), height: f.multiline ? Math.max(f.size * lh * z, f.h * z) : f.size * lh * z + 2,
    fontFamily: FONT_CSS[f.font ?? "sans"], fontSize: f.size * z, fontWeight: f.bold ? 600 : 400, fontStyle: f.italic ? "italic" : "normal",
    lineHeight: lh, color: f.color, background: f.bg, textAlign: f.align ?? "left",
  };
  const Tag = f.multiline ? "textarea" : "input";
  return (
    <div className="block-inline" style={{ left: el.x * z + cam.x, top: el.y * z + cam.y, width: el.w * z, height: el.h * z, transform: tilt ? `rotate(${tilt}deg)` : undefined }} onPointerDown={(e) => e.stopPropagation()}>
      <Tag
        ref={ref}
        className="block-inline-field"
        style={style}
        value={value}
        placeholder={f.placeholder}
        spellCheck={f.font !== "mono"}
        aria-label="Editar texto do bloco"
        onChange={(e) => apply(withField(spec, key, e.target.value))}
        onKeyDown={onKey}
        onBlur={() => setTimeout(() => { if (useBlockInline.getState().key === key && useBlockInline.getState().id === el.id) close(); }, 0)}
      />
    </div>
  );
}
