import { useEffect, useRef } from "react";
import { useView } from "../core/store";
import { commitText, useEdit } from "../core/textEdit";
import { FONT_CSS, LINE_HEIGHT, measureBlock } from "../core/text";

/** <textarea> sobre o canvas, na mesma posição/escala do texto. O Pixi só desenha o texto confirmado. */
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
  const m = measureBlock(session.text || " ", session.fontFamily, session.fontSize);
  const w = Math.ceil(m.w * z) + 6;
  const h = Math.ceil(m.h * z) + 2;

  return (
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
      onBlur={() => commitText(session.token)}
      onKeyDown={(e) => {
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          commitText(session.token);
        }
      }}
      style={{
        left: session.x * z + cam.x,
        top: session.y * z + cam.y,
        width: w,
        height: h,
        fontSize: session.fontSize * z,
        lineHeight: LINE_HEIGHT,
        fontFamily: FONT_CSS[session.fontFamily],
        color: session.color,
        textAlign: session.align,
        transform: session.angle ? `rotate(${session.angle}rad)` : undefined,
        transformOrigin: `${(m.w * z) / 2}px ${(m.h * z) / 2}px`,
      }}
    />
  );
}
