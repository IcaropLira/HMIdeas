import { useEffect, useRef } from "react";
import { addChildToSelection, addSiblingToSelection, commitLabel, patchLabel, useLabel } from "../core/mapActions";
import { selectActivePage, useDoc, useView } from "../core/store";
import { FONT_CSS, LINE_HEIGHT, measureBlock } from "../core/text";

/** <textarea> sobre o nó/quadro em edição. Enter = irmão, Tab = filho, Shift+Enter = quebra de linha, Esc = cancela. */
export function LabelEditor() {
  const session = useLabel((s) => s.session);
  const cam = useView((s) => s.camera);
  const el = useDoc((s) => (session ? selectActivePage(s).elements.find((e) => e.id === session.id) : undefined));
  const ref = useRef<HTMLTextAreaElement>(null);
  const token = session?.token;
  const born = useRef(0);

  useEffect(() => {
    if (token === undefined) return;
    born.current = performance.now();
    const ta = ref.current;
    if (ta) { ta.focus(); ta.select(); }
    // o mousedown que criou o nó ainda pode roubar o foco depois: refoca uma vez logo em seguida
    const t = setTimeout(() => { if (document.activeElement !== ref.current) { ref.current?.focus(); ref.current?.select(); } }, 40);
    const onDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      commitLabel(token);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => { clearTimeout(t); document.removeEventListener("pointerdown", onDown, true); };
  }, [token]);

  if (!session || !el || (el.type !== "node" && el.type !== "frame")) return null;
  const z = cam.zoom;
  const node = el.type === "node";
  const size = node ? el.fontSize : 14;
  const family = node ? el.fontFamily : "sans";
  const m = measureBlock(session.text || " ", family, size);
  const w = Math.max(node ? el.w : 140, Math.ceil(m.w) + 24) * z;
  const h = Math.max(node ? el.h : 24, Math.ceil(m.h) + 8) * z;
  const cx = node ? el.x + el.w / 2 : el.x + 70;
  const left = (node ? cx : el.x + (w / z) / 2) * z + cam.x - w / 2;
  const top = node ? (el.y + el.h / 2) * z + cam.y - h / 2 : (el.y - 14) * z + cam.y - h / 2;

  return (
    <textarea
      key={session.token}
      ref={ref}
      className="label-editor"
      spellCheck={false}
      wrap="off"
      aria-label={node ? "Texto do nó" : "Título do quadro"}
      value={session.text}
      onChange={(e) => patchLabel(e.target.value)}
      onBlur={() => {
        // blur nos primeiros ms = foco roubado pelo clique que criou o nó: volta o foco em vez de confirmar
        if (performance.now() - born.current < 250) { setTimeout(() => ref.current?.focus(), 0); return; }
        commitLabel(session.token);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); commitLabel(session.token); return; }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commitLabel(session.token);
          if (node) addSiblingToSelection();
        } else if (e.key === "Tab" && node) {
          e.preventDefault();
          commitLabel(session.token);
          addChildToSelection();
        }
      }}
      style={{
        left, top, width: w, height: h,
        fontSize: size * z,
        lineHeight: LINE_HEIGHT,
        fontFamily: FONT_CSS[family],
        color: node ? el.color : el.color,
        background: node && el.fill ? el.fill : "#fff",
        borderRadius: node && el.shape === "pill" ? h / 2 : 6,
        textAlign: node ? "center" : "left",
      }}
    />
  );
}
