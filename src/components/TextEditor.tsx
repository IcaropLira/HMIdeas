import { useEffect, useRef } from "react";
import { useView } from "../core/store";
import { commitText, useEdit } from "../core/textEdit";
import { FONT_CSS, LINE_HEIGHT, measureBlock } from "../core/text";
import { TextBar, applyText } from "./TextControls";

/** <textarea> sobre o canvas, na mesma posição/escala do texto, com a barra de formatação logo acima. O Pixi só desenha o texto confirmado. */
export function TextEditor() {
  const session = useEdit((s) => s.session);
  const cam = useView((s) => s.camera);
  const ref = useRef<HTMLTextAreaElement>(null);
  const token = session?.token;

  useEffect(() => {
    if (token === undefined) return;
    const ta = ref.current;
    if (ta) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
    // Toque/clique fora da caixa confirma — a menos que seja na UI de estilo do texto.
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (ref.current?.contains(el) || el?.closest?.("[data-text-ui]")) return;
      commitText(token);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [token]);

  if (!session) return null;

  const z = cam.zoom;
  const fx = session.fx;
  const m = measureBlock(session.text || " ", session.fontFamily, session.fontSize, fx);
  const w = Math.ceil(m.w * z) + 6;
  const h = Math.ceil(m.h * z) + 2;
  const left = session.x * z + cam.x, top = session.y * z + cam.y;
  const barTop = Math.max(8, top - 52);
  const barLeft = Math.max(8, Math.min(left, (typeof window !== "undefined" ? window.innerWidth : 1200) - 560));

  return (
    <>
      <div className="text-format" style={{ left: barLeft, top: barTop }} data-text-ui>
        <TextBar />
      </div>
      <textarea
        key={session.token}
        ref={ref}
        className="text-editor"
        wrap="off"
        spellCheck={false}
        autoFocus
        aria-label="Texto"
        value={session.text}
        onChange={(e) => useEdit.getState().patch({ text: e.target.value })}
        onBlur={(e) => {
          // ir para a barra de formatação (tamanho, fonte) não confirma o texto
          if ((e.relatedTarget as HTMLElement | null)?.closest?.("[data-text-ui]")) return;
          commitText(session.token);
        }}
        onKeyDown={(e) => {
          const mod = e.ctrlKey || e.metaKey;
          if (e.key === "Escape" || (e.key === "Enter" && mod)) {
            e.preventDefault();
            commitText(session.token);
            return;
          }
          if (!mod) return;
          const k = e.key.toLowerCase();
          if (k === "b") { e.preventDefault(); applyText({ bold: !fx.bold }); }
          else if (k === "i") { e.preventDefault(); applyText({ italic: !fx.italic }); }
          else if (k === "u") { e.preventDefault(); applyText({ underline: !fx.underline }); }
          else if (k === "x" && e.shiftKey) { e.preventDefault(); applyText({ strike: !fx.strike }); }
          else if (e.key === ">" || (k === "." && e.shiftKey)) { e.preventDefault(); applyText({ fontSize: Math.round(session.fontSize * 1.15) }); }
          else if (e.key === "<" || (k === "," && e.shiftKey)) { e.preventDefault(); applyText({ fontSize: Math.max(6, Math.round(session.fontSize / 1.15)) }); }
        }}
        style={{
          left,
          top,
          width: w,
          height: h,
          fontSize: session.fontSize * z,
          lineHeight: fx.lineHeight ?? LINE_HEIGHT,
          fontFamily: FONT_CSS[session.fontFamily],
          fontWeight: fx.bold ? 700 : 400,
          fontStyle: fx.italic ? "italic" : "normal",
          textDecoration: [fx.underline && "underline", fx.strike && "line-through"].filter(Boolean).join(" ") || "none",
          letterSpacing: fx.letterSpacing ? `${fx.letterSpacing}em` : undefined,
          background: fx.bg ?? undefined,
          color: session.color,
          textAlign: session.align,
          transform: session.angle ? `rotate(${session.angle}rad)` : undefined,
          transformOrigin: `${(m.w * z) / 2}px ${(m.h * z) / 2}px`,
        }}
      />
    </>
  );
}
