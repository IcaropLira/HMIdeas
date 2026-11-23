// Campo flutuante para o peso/rótulo de uma aresta (ou de qualquer linha/seta), no meio dela.
// Abre ao criar aresta ponderada, com duplo toque numa seta ou Enter com a seta selecionada.
import { useEffect, useRef, useState } from "react";
import { cleanWeight, useEdgeLabel } from "../core/graphEdit";
import { linearPath, pathMidpoint } from "../core/linear";
import { isLinear } from "../core/model";
import { selectActivePage, useDoc, useView } from "../core/store";

export function EdgeLabelEditor() {
  const id = useEdgeLabel((s) => s.id);
  const el = useDoc((s) => (id ? selectActivePage(s).elements.find((e) => e.id === id) : undefined));
  const cam = useView((s) => s.camera);
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!id) return;
    done.current = false;
    setText(el && isLinear(el) ? el.label ?? "" : "");
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.select(); });
    setTimeout(() => ref.current?.select(), 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => { if (id && (!el || !isLinear(el))) useEdgeLabel.getState().close(); }, [id, el]);

  if (!id || !el || !isLinear(el)) return null;
  const mid = pathMidpoint(linearPath(el));
  const x = mid.x * cam.zoom + cam.x, y = mid.y * cam.zoom + cam.y;

  const commit = () => {
    if (done.current) return;
    done.current = true;
    const label = cleanWeight(text);
    if ((label ?? "") !== (el.label ?? "")) useDoc.getState().updateElements([{ ...el, label }]);
    useEdgeLabel.getState().close();
  };

  return (
    <input
      ref={ref}
      className="edge-label-editor"
      style={{ left: x, top: y }}
      value={text}
      placeholder="peso"
      aria-label="Peso ou rótulo da aresta"
      inputMode="decimal"
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") { done.current = true; useEdgeLabel.getState().close(); }
      }}
    />
  );
}
