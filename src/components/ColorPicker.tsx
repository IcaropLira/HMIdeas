// Seletor de cor: quadrado de saturação/brilho + matiz + hex, paletas, recentes e conta-gotas.
// Arrastar só muda a cor da ferramenta; soltar confirma (recolore a seleção e vale 1 passo de desfazer).
import { CSSProperties, KeyboardEvent as RKeyboardEvent, PointerEvent as RPointerEvent, ReactNode, useEffect, useRef, useState } from "react";
import { applyColor } from "../core/actions";
import { HSV, PALETTES, contrastOn, hexToHsv, hsvToHex, parseHex } from "../core/color";
import { useTool } from "../core/store";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

interface AreaProps {
  className: string;
  label: string;
  valueText: string;
  style?: CSSProperties;
  children: ReactNode;
  onDrag: (fx: number, fy: number) => void;
  onEnd: () => void;
  onKey: (e: RKeyboardEvent<HTMLDivElement>) => void;
}

/** Área arrastável por toque, caneta ou mouse (captura o ponteiro, então não perde o gesto ao sair da caixa). */
function DragArea({ className, label, valueText, style, children, onDrag, onEnd, onKey }: AreaProps) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const at = (e: RPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onDrag(clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height));
  };
  return (
    <div
      ref={ref}
      className={className}
      style={style}
      tabIndex={0}
      role="slider"
      aria-label={label}
      aria-valuetext={valueText}
      onPointerDown={(e) => {
        active.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        at(e);
      }}
      onPointerMove={(e) => active.current && at(e)}
      onPointerUp={(e) => {
        if (!active.current) return;
        active.current = false;
        at(e);
        onEnd();
      }}
      onPointerCancel={() => {
        if (!active.current) return;
        active.current = false;
        onEnd();
      }}
      onKeyDown={onKey}
    >
      {children}
    </div>
  );
}

export function ColorPicker({ onEyedropper }: { onEyedropper: () => void }) {
  const color = useTool((s) => s.color);
  const recent = useTool((s) => s.recent);
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(color));
  const hsvRef = useRef(hsv);
  const [hex, setHex] = useState(color);
  const [palette, setPalette] = useState(PALETTES[0].id);
  const own = useRef<string | null>(null); // última cor aplicada por AQUI (não recalcula o matiz por cima)

  const put = (n: HSV) => {
    hsvRef.current = n;
    setHsv(n);
  };

  // Cor mudou por fora (paleta, conta-gotas, brush): sincroniza. Cinza/preto/branco não têm matiz: mantém o atual.
  useEffect(() => {
    setHex(color);
    if (own.current === color) return;
    const n = hexToHsv(color);
    put(n.s === 0 || n.v === 0 ? { h: hsvRef.current.h, s: n.s, v: n.v } : n);
  }, [color]);

  const live = (n: HSV) => {
    put(n);
    const c = hsvToHex(n);
    own.current = c;
    applyColor(c, { commit: false });
  };
  const commit = () => {
    const c = hsvToHex(hsvRef.current);
    own.current = c;
    applyColor(c);
  };
  const step = (e: RKeyboardEvent<HTMLDivElement>, fn: (d: number) => HSV) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    live(fn(dir * (e.shiftKey ? 0.1 : 0.02)));
    commit();
  };

  const { h, s, v } = hsv;
  const pure = `hsl(${h.toFixed(0)} 100% 50%)`;

  return (
    <div
      className="panel colorpanel"
      role="dialog"
      aria-label="Cores"
      data-text-ui
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); // não tira o foco do texto em edição
      }}
    >
      <DragArea
        className="cp-sv"
        label="Saturação e brilho"
        valueText={`saturação ${Math.round(s * 100)}%, brilho ${Math.round(v * 100)}%`}
        style={{ backgroundImage: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, ${pure})` }}
        onDrag={(fx, fy) => live({ h: hsvRef.current.h, s: fx, v: 1 - fy })}
        onEnd={commit}
        onKey={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") step(e, (d) => ({ ...hsvRef.current, s: clamp01(hsvRef.current.s + d) }));
          else step(e, (d) => ({ ...hsvRef.current, v: clamp01(hsvRef.current.v + d) }));
        }}
      >
        <span className="cp-knob" style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: color, borderColor: contrastOn(color) }} />
      </DragArea>

      <DragArea
        className="cp-hue"
        label="Matiz"
        valueText={`${Math.round(h)} graus`}
        onDrag={(fx) => live({ ...hsvRef.current, h: fx * 359.99 })}
        onEnd={commit}
        onKey={(e) => step(e, (d) => ({ ...hsvRef.current, h: (hsvRef.current.h + d * 360 + 360) % 360 }))}
      >
        <span className="cp-knob" style={{ left: `${(h / 360) * 100}%`, top: "50%", background: pure }} />
      </DragArea>

      <div className="row cp-hexrow">
        <span className="cp-now" style={{ background: color }} aria-hidden="true" />
        <input
          className="cp-hex"
          aria-label="Código da cor (hex)"
          spellCheck={false}
          maxLength={7}
          value={hex}
          onChange={(e) => {
            setHex(e.target.value);
            const c = parseHex(e.target.value);
            if (c) {
              own.current = null;
              applyColor(c, { commit: false });
            }
          }}
          onBlur={() => {
            const c = parseHex(hex);
            if (c) applyColor(c);
            else setHex(color);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <button className="chip" onClick={onEyedropper} title="Pegar a cor de um desenho na página">Conta-gotas</button>
      </div>

      <div className="row" role="tablist" aria-label="Paletas">
        {PALETTES.map((p) => (
          <button key={p.id} role="tab" aria-selected={palette === p.id} className={palette === p.id ? "chip sm on" : "chip sm"} onClick={() => setPalette(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="cp-grid" role="radiogroup" aria-label="Cores da paleta">
        {PALETTES.find((p) => p.id === palette)!.colors.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={color.toUpperCase() === c}
            aria-label={`Cor ${c}`}
            title={c}
            className={color.toUpperCase() === c ? "swatch on" : "swatch"}
            style={{ background: c }}
            onClick={() => applyColor(c)}
          />
        ))}
      </div>

      {recent.length > 0 && (
        <>
          <span className="rowlabel">Recentes</span>
          <div className="cp-grid" role="radiogroup" aria-label="Cores recentes">
            {recent.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={color.toUpperCase() === c}
                aria-label={`Cor ${c}`}
                title={c}
                className={color.toUpperCase() === c ? "swatch on" : "swatch"}
                style={{ background: c }}
                onClick={() => applyColor(c)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
