import { useEffect } from "react";
import { Icon } from "./Icon";
import { BLOCKS, BlockId, DockSide, Layout, SIDES, blocksOn, useLayout } from "../core/layout";
import { useUI } from "../core/ui";
import { rotateBlock } from "./BlockHandle";

interface ViewProps {
  layout: Layout;
  onSide: (id: BlockId, side: DockSide) => void;
  onMove: (id: BlockId, dir: -1 | 1) => void;
  onRotate: (id: BlockId) => void;
  onLocked: (locked: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}

/** Conteúdo do menu de configurações (puro: recebe o layout e os callbacks, para testar sem DOM). */
export function LayoutSettingsView({ layout, onSide, onMove, onRotate, onLocked, onReset, onClose }: ViewProps) {
  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel settings" role="dialog" aria-modal="true" aria-label="Configurações">
        <div className="settings-head">
          <strong>Configurações</strong>
          <button className="btn sm" onClick={onClose} aria-label="Fechar" title="Fechar (Esc)">
            <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>
          </button>
        </div>

        <section aria-labelledby="cfg-bars">
          <h3 id="cfg-bars">Barras de ferramentas</h3>
          <p className="hint">
            Escolha onde cada grupo de botões aparece: embaixo, na lateral esquerda, na direita, flutuando em qualquer
            lugar da tela ou oculto. Os seis pontinhos de cada grupo servem para arrastá-lo; perto das bordas ele gruda
            sozinho e nunca sai da tela. As setas mudam a ordem dentro do mesmo lado. Nada é apagado: um grupo oculto
            volta quando você escolher um lado de novo.
          </p>
          <div className="row" role="group" aria-label="Posições">
            <button className={layout.locked ? "chip on" : "chip"} aria-pressed={layout.locked} onClick={() => onLocked(!layout.locked)}>
              {layout.locked ? "Posições travadas" : "Travar posições"}
            </button>
            <span className="hint">Travado, os pontinhos somem e nada é arrastado sem querer.</span>
          </div>
          <ul className="blocklist">
            {BLOCKS.map((b) => {
              const side = layout.side[b.id];
              const same = blocksOn(layout, side);
              const i = same.indexOf(b.id);
              const hidden = side === "hidden";
              return (
                <li key={b.id} className="blockrow">
                  <div className="blockinfo">
                    <span className="blockname">{b.label}</span>
                    <span className="hint">{b.hint}</span>
                  </div>
                  <div className="row" role="radiogroup" aria-label={`Onde fica: ${b.label}`}>
                    {SIDES.map((s) => (
                      <button key={s.id} role="radio" aria-checked={side === s.id} className={side === s.id ? "chip on" : "chip"} onClick={() => onSide(b.id, s.id)}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div className="blockmove">
                    {side === "float" && (
                      <button className="btn sm" onClick={() => onRotate(b.id)} aria-label={`Girar ${b.label}`} title="Girar (horizontal ↔ vertical)">
                        <Icon><path d="M4 12a8 8 0 0114-5.3L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 01-14 5.3L4 15" /><path d="M4 20v-5h5" /></Icon>
                      </button>
                    )}
                    <button className="btn sm" disabled={hidden || i <= 0} onClick={() => onMove(b.id, -1)} aria-label={`Mover ${b.label} para antes`} title="Mover para antes">
                      <Icon><path d="M6 14l6-6 6 6" /></Icon>
                    </button>
                    <button className="btn sm" disabled={hidden || i < 0 || i >= same.length - 1} onClick={() => onMove(b.id, 1)} aria-label={`Mover ${b.label} para depois`} title="Mover para depois">
                      <Icon><path d="M6 10l6 6 6-6" /></Icon>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <button className="btn text" onClick={onReset}>Restaurar padrão</button>
        </section>
      </div>
    </div>
  );
}

/** Menu de configurações: abre pela engrenagem do canto superior direito (que nunca some, para ninguém ficar sem acesso). */
export function LayoutSettings() {
  const open = useUI((s) => s.settingsOpen);
  const layout = useLayout((s) => s.layout);
  const setSide = useLayout((s) => s.setSide);
  const move = useLayout((s) => s.move);
  const setLocked = useLayout((s) => s.setLocked);
  const reset = useLayout((s) => s.reset);
  const close = () => useUI.getState().setSettingsOpen(false);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  if (!open) return null;
  return <LayoutSettingsView layout={layout} onSide={setSide} onMove={move} onRotate={rotateBlock} onLocked={setLocked} onReset={reset} onClose={close} />;
}
