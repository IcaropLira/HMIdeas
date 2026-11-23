// Controles de texto reaproveitados: barra de formatação sobre o texto em edição, barra de opções, painel Texto e
// painel Propriedades. Valem para (1) o texto em edição, (2) os textos selecionados e (3) o padrão dos textos novos.
import { useEffect, useRef, useState } from "react";
import { FontFamily, TextAlign, TextElement } from "../core/model";
import { selectActivePage, useDoc, useSel, useTool } from "../core/store";
import { useEdit } from "../core/textEdit";
import { FONTS, FONT_CSS, FONT_GROUPS, LINE_HEIGHT, SIZE_STEPS, TextFx } from "../core/text";
import { TextPatch, restyleText } from "../core/actions";
import { Icon } from "./Icon";

export interface TextState { family: FontFamily; size: number; align: TextAlign; color: string; fx: TextFx; target: "edit" | "selection" | "default" }

/** Estado mostrado nos controles: o texto em edição, senão o primeiro texto selecionado, senão o padrão da ferramenta. */
export function useTextState(): TextState {
  const ses = useEdit((s) => s.session);
  const t = useTool();
  const selText = useDoc((s) => {
    const ids = new Set(useSel.getState().ids);
    return selectActivePage(s).elements.find((e): e is TextElement => e.type === "text" && ids.has(e.id)) ?? null;
  });
  useSel((s) => s.ids); // re-renderiza ao mudar a seleção
  if (ses) return { family: ses.fontFamily, size: ses.fontSize, align: ses.align, color: ses.color, fx: ses.fx, target: "edit" };
  if (selText) return { family: selText.fontFamily, size: selText.fontSize, align: selText.align, color: selText.color, fx: selText, target: "selection" };
  return { family: t.fontFamily, size: t.fontSize, align: t.textAlign, color: t.color, fx: t.textFx, target: "default" };
}

/** Aplica e guarda como padrão dos próximos textos. */
export function applyText(patch: TextPatch) {
  const t = useTool.getState();
  const { fontFamily, fontSize, align, color, ...fx } = patch;
  t.set({
    ...(fontFamily ? { fontFamily } : {}),
    ...(fontSize ? { fontSize } : {}),
    ...(align ? { textAlign: align } : {}),
    ...(Object.keys(fx).length ? { textFx: { ...t.textFx, ...fx } } : {}),
  });
  if (color) t.set({ color });
  restyleText(patch);
}

const keep = (e: React.MouseEvent) => e.preventDefault(); // não tira o foco da caixa de texto

export function FontPicker({ value, onChange }: { value: FontFamily; onChange: (f: FontFamily) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", off, true);
    return () => document.removeEventListener("pointerdown", off, true);
  }, [open]);
  const cur = FONTS.find((f) => f.id === value) ?? FONTS[0];
  return (
    <div className="fontpick" ref={ref} data-text-ui>
      <button className="fontpick-btn" onMouseDown={keep} onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} title="Fonte" style={{ fontFamily: cur.css }}>
        <span>{cur.label}</span><Icon size={14}><path d="M6 9l6 6 6-6" /></Icon>
      </button>
      {open && (
        <div className="fontpick-list" role="listbox" aria-label="Fontes">
          {FONT_GROUPS.map((g) => (
            <div key={g}>
              <div className="fontpick-group">{g}</div>
              {FONTS.filter((f) => f.group === g).map((f) => (
                <button key={f.id} role="option" aria-selected={f.id === value} className={f.id === value ? "fontpick-item on" : "fontpick-item"}
                  onMouseDown={keep} onClick={() => { onChange(f.id); setOpen(false); }}>
                  <span className="fp-sample" style={{ fontFamily: f.css }}>Ideias & Notas</span>
                  <small>{f.label}</small>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SizeField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(Math.round(value)));
  useEffect(() => setDraft(String(Math.round(value))), [value]);
  const step = (dir: 1 | -1) => {
    const v = dir > 0 ? SIZE_STEPS.find((s) => s > value + 0.5) ?? value + 8 : [...SIZE_STEPS].reverse().find((s) => s < value - 0.5) ?? Math.max(6, value - 2);
    onChange(v);
  };
  return (
    <div className="sizefield" data-text-ui>
      <button className="btn sm" onMouseDown={keep} onClick={() => step(-1)} aria-label="Diminuir fonte" title="Diminuir fonte">−</button>
      <input
        type="number" min={6} max={400} value={draft} aria-label="Tamanho da fonte" list="hm-font-sizes"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { const v = +draft; if (Number.isFinite(v) && v >= 6 && v <= 400) onChange(v); else setDraft(String(Math.round(value))); }}
        onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } e.stopPropagation(); }}
      />
      <datalist id="hm-font-sizes">{SIZE_STEPS.map((s) => <option key={s} value={s} />)}</datalist>
      <button className="btn sm" onMouseDown={keep} onClick={() => step(1)} aria-label="Aumentar fonte" title="Aumentar fonte">+</button>
    </div>
  );
}

const TEXT_COLORS = ["#1B2233", "#52627A", "#2F4B8F", "#C8372D", "#2F7D5B", "#D98A1F", "#7B4FB5", "#FFFFFF"];
const HIGHLIGHTS = ["#FFF3A3", "#C9F2D0", "#CDE3FF", "#FFD6E7", "#FFE1C2"];

/** Linha de botões de estilo: negrito, itálico, sublinhado, tachado. */
function StyleToggles({ st }: { st: TextState }) {
  const tg = (k: "bold" | "italic" | "underline" | "strike", label: string, icon: React.ReactNode, key: string) => (
    <button className={st.fx[k] ? "btn sm on" : "btn sm"} aria-pressed={!!st.fx[k]} aria-label={label} title={`${label} (${key})`}
      onMouseDown={keep} onClick={() => applyText({ [k]: !st.fx[k] } as TextPatch)}>{icon}</button>
  );
  return (
    <div className="row tight" role="group" aria-label="Estilo">
      {tg("bold", "Negrito", <b style={{ fontSize: 16 }}>N</b>, "Ctrl+B")}
      {tg("italic", "Itálico", <i style={{ fontSize: 16, fontFamily: "Georgia, serif" }}>I</i>, "Ctrl+I")}
      {tg("underline", "Sublinhado", <u style={{ fontSize: 16 }}>S</u>, "Ctrl+U")}
      {tg("strike", "Tachado", <s style={{ fontSize: 16 }}>T</s>, "Ctrl+Shift+X")}
    </div>
  );
}

function AlignToggles({ st }: { st: TextState }) {
  const ICON: Record<TextAlign, React.ReactNode> = {
    left: <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />,
    center: <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />,
    right: <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />,
  };
  return (
    <div className="row tight" role="radiogroup" aria-label="Alinhamento">
      {(["left", "center", "right"] as TextAlign[]).map((a) => (
        <button key={a} role="radio" aria-checked={st.align === a} className={st.align === a ? "btn sm on" : "btn sm"} onMouseDown={keep}
          onClick={() => applyText({ align: a })} aria-label={a === "left" ? "Esquerda" : a === "center" ? "Centro" : "Direita"}>
          <Icon size={18}>{ICON[a]}</Icon>
        </button>
      ))}
    </div>
  );
}

/** Barra compacta (sobre o texto em edição e na barra de opções). */
export function TextBar({ withColor = true }: { withColor?: boolean }) {
  const st = useTextState();
  return (
    <div className="textbar" data-text-ui onMouseDown={(e) => { if ((e.target as HTMLElement).tagName !== "INPUT") e.preventDefault(); }}>
      <FontPicker value={st.family} onChange={(f) => applyText({ fontFamily: f })} />
      <SizeField value={st.size} onChange={(v) => applyText({ fontSize: v })} />
      <span className="vsep" aria-hidden="true" />
      <StyleToggles st={st} />
      <span className="vsep" aria-hidden="true" />
      <AlignToggles st={st} />
      {withColor && (
        <>
          <span className="vsep" aria-hidden="true" />
          <div className="row tight" role="radiogroup" aria-label="Cor do texto">
            {TEXT_COLORS.slice(0, 5).map((c) => (
              <button key={c} role="radio" aria-checked={st.color.toUpperCase() === c} aria-label={`Cor ${c}`} className={st.color.toUpperCase() === c ? "swatch sm on" : "swatch sm"} style={{ background: c }} onMouseDown={keep} onClick={() => applyText({ color: c })} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Painel completo (painel Texto / Propriedades). */
export function TextPanelBody() {
  const st = useTextState();
  const lh = st.fx.lineHeight ?? LINE_HEIGHT;
  const ls = st.fx.letterSpacing ?? 0;
  return (
    <div className="textpanel" data-text-ui onMouseDown={(e) => { const tg = (e.target as HTMLElement).tagName; if (tg !== "INPUT" && tg !== "SELECT") e.preventDefault(); }}>
      <p className="hint small">{st.target === "edit" ? "Editando o texto." : st.target === "selection" ? "Muda os textos selecionados." : "Padrão para os próximos textos."}</p>
      <FontPicker value={st.family} onChange={(f) => applyText({ fontFamily: f })} />
      <div className="row"><SizeField value={st.size} onChange={(v) => applyText({ fontSize: v })} /><AlignToggles st={st} /></div>
      <StyleToggles st={st} />
      <label className="slider">
        <span>Entrelinha</span>
        <input type="range" min={0.8} max={2.5} step={0.05} value={lh} onChange={(e) => applyText({ lineHeight: +e.target.value })} />
        <output>{lh.toFixed(2)}</output>
      </label>
      <label className="slider">
        <span>Espaço entre letras</span>
        <input type="range" min={-0.1} max={0.5} step={0.01} value={ls} onChange={(e) => applyText({ letterSpacing: +e.target.value || undefined })} />
        <output>{Math.round(ls * 100)}%</output>
      </label>
      <div className="sec-title">Cor</div>
      <div className="swatch-grid" role="radiogroup" aria-label="Cor do texto">
        {TEXT_COLORS.map((c) => (
          <button key={c} role="radio" aria-checked={st.color.toUpperCase() === c} aria-label={`Cor ${c}`} className={st.color.toUpperCase() === c ? "swatch on" : "swatch"} style={{ background: c }} onMouseDown={keep} onClick={() => applyText({ color: c })} />
        ))}
      </div>
      <div className="sec-title">Fundo (marca-texto)</div>
      <div className="swatch-grid" role="radiogroup" aria-label="Fundo do texto">
        <button role="radio" aria-checked={!st.fx.bg} aria-label="Sem fundo" className={!st.fx.bg ? "swatch none on" : "swatch none"} onMouseDown={keep} onClick={() => applyText({ bg: undefined })} />
        {HIGHLIGHTS.map((c) => (
          <button key={c} role="radio" aria-checked={st.fx.bg === c} aria-label={`Fundo ${c}`} className={st.fx.bg === c ? "swatch on" : "swatch"} style={{ background: c }} onMouseDown={keep} onClick={() => applyText({ bg: c })} />
        ))}
      </div>
      <div className="sec-title">Prévia</div>
      <div className="text-preview" style={{
        fontFamily: FONT_CSS[st.family], fontWeight: st.fx.bold ? 700 : 400, fontStyle: st.fx.italic ? "italic" : "normal",
        textDecoration: [st.fx.underline && "underline", st.fx.strike && "line-through"].filter(Boolean).join(" ") || "none",
        letterSpacing: `${ls}em`, lineHeight: lh, textAlign: st.align, color: st.color, background: st.fx.bg ?? "transparent",
      }}>
        Ideias que viram<br />mapas, notas e planos.
      </div>
    </div>
  );
}
