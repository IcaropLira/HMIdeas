import { Icon } from "./Icon";
import { BLOCKS, BlockId, DockSide, Layout, SIDES, blocksOn } from "../core/layout";

interface ViewProps {
  layout: Layout;
  onSide: (id: BlockId, side: DockSide) => void;
  onMove: (id: BlockId, dir: -1 | 1) => void;
  onRotate: (id: BlockId) => void;
  onLocked: (locked: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}

/** Aba "Barras": onde cada bloco de botões fica. Puro: recebe o layout e os callbacks, para testar sem DOM. */
export function BarsPane({ layout, onSide, onMove, onRotate, onLocked, onReset }: Omit<ViewProps, "onClose">) {
  return (
    <section aria-labelledby="cfg-bars" className="pane">
      <h3 id="cfg-bars">Barras de ferramentas</h3>
      <p className="hint">
        Cada grupo de botões pode ficar embaixo, na esquerda, na direita, flutuando ou oculto. Arraste pelos seis pontinhos:
        enquanto arrasta aparecem as <b>zonas de encaixe</b> (esquerda, embaixo, direita). Solte numa zona, ou em cima de
        outra barra, para juntar de novo. Barras soltas também têm o botão <b>encaixar</b>.
      </p>
      <div className="row" role="group" aria-label="Posições">
        <button className={layout.locked ? "chip on" : "chip"} aria-pressed={layout.locked} onClick={() => onLocked(!layout.locked)}>
          {layout.locked ? "Posições travadas" : "Travar posições"}
        </button>
        <button className="chip" onClick={onReset} title="Volta todos os grupos para o lugar de fábrica">Juntar tudo (restaurar padrão)</button>
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
                  <button key={s.id} role="radio" aria-checked={side === s.id} className={side === s.id ? "chip sm on" : "chip sm"} onClick={() => onSide(b.id, s.id)}>
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
    </section>
  );
}

/** Versão autônoma (modal só com as barras): mantida para os testes de fumaça. */
export function LayoutSettingsView(props: ViewProps) {
  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="panel settings" role="dialog" aria-modal="true" aria-label="Configurações">
        <div className="settings-head">
          <strong>Configurações</strong>
          <button className="btn sm" onClick={props.onClose} aria-label="Fechar" title="Fechar (Esc)">
            <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>
          </button>
        </div>
        <BarsPane {...props} />
      </div>
    </div>
  );
}

