// Configurações → Barras: o mesmo que arrastar, mas por botões (teclado, leitor de tela, e para achar bloquinhos ocultos).
import { Icon } from "./Icon";
import { Bar, ItemId, Layout, Side, hiddenItems, hideItem, itemLabel, moveBar, moveItems, rotateBar, showItem } from "../core/layout";

const SIDE_LABEL: Record<Side, string> = { left: "Esquerda", right: "Direita", bottom: "Embaixo" };

export function BarsPane({ layout, onChange, onLocked, onReset }: { layout: Layout; onChange: (L: Layout) => void; onLocked: (v: boolean) => void; onReset: () => void }) {
  const hidden = hiddenItems(layout);
  const where = (b: Bar) => (b.dock ? SIDE_LABEL[b.dock] : `Solta${b.vertical ? " (vertical)" : " (horizontal)"}`);
  const step = (b: Bar, id: ItemId, dir: -1 | 1) => {
    const i = b.items.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= b.items.length) return;
    onChange(moveItems(layout, [id], { kind: "into", bar: b.id, index: dir > 0 ? j + 1 : j }));
  };
  return (
    <section aria-labelledby="cfg-bars" className="pane">
      <h3 id="cfg-bars">Barras de ferramentas</h3>
      <p className="hint">
        Cada ferramenta é um bloquinho. <b>Arraste</b> um bloquinho para trocar de lugar, para outra barra ou para fora (vira uma barra solta);
        solte-o em cima, embaixo ou ao lado de outro bloquinho solto para juntar os dois numa barra nova. Arrastar o espaço entre os
        bloquinhos leva a barra inteira; perto da borda da tela ela encaixa. Duplo clique no espaço de uma barra solta a gira.
      </p>
      <div className="row" role="group" aria-label="Posições">
        <button className={layout.locked ? "chip on" : "chip"} aria-pressed={layout.locked} onClick={() => onLocked(!layout.locked)}>
          {layout.locked ? "Barras travadas" : "Travar barras"}
        </button>
        <button className="chip" onClick={onReset}>Restaurar padrão</button>
      </div>
      <ul className="barlist">
        {layout.bars.map((b, k) => (
          <li key={b.id} className="barrow">
            <div className="barrow-head">
              <b>{`Barra ${k + 1}`}</b><small>{where(b)}</small>
              <span className="ob-fill" />
              <select className="ob-select" aria-label={`Onde fica a barra ${k + 1}`} value={b.dock ?? "float"}
                onChange={(e) => {
                  const v = e.target.value;
                  onChange(v === "float" ? moveBar(layout, b.id, { kind: "float", x: 160 + k * 24, y: 140 + k * 24, vertical: b.vertical }) : moveBar(layout, b.id, { kind: "dock", side: v as Side }));
                }}>
                <option value="left">Esquerda</option><option value="right">Direita</option><option value="bottom">Embaixo</option><option value="float">Solta</option>
              </select>
              {!b.dock && (
                <button className="btn sm" onClick={() => onChange(rotateBar(layout, b.id))} aria-label={`Girar a barra ${k + 1}`} title="Girar (horizontal ↔ vertical)">
                  <Icon><path d="M4 12a8 8 0 0114-5.3L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 01-14 5.3L4 15" /><path d="M4 20v-5h5" /></Icon>
                </button>
              )}
            </div>
            <div className="baritems">
              {b.items.map((id, i) => (
                <span key={id} className="baritem">
                  <span>{itemLabel(id)}</span>
                  <button className="kb-x" disabled={i === 0} onClick={() => step(b, id, -1)} aria-label={`${itemLabel(id)} para antes`} title="Para antes">‹</button>
                  <button className="kb-x" disabled={i === b.items.length - 1} onClick={() => step(b, id, 1)} aria-label={`${itemLabel(id)} para depois`} title="Para depois">›</button>
                  <button className="kb-x" onClick={() => onChange(hideItem(layout, id))} aria-label={`Ocultar ${itemLabel(id)}`} title="Ocultar">×</button>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {hidden.length > 0 && (
        <>
          <h3>Ocultos</h3>
          <div className="chips-wrap">
            {hidden.map((id) => <button key={id} className="chip" onClick={() => onChange(showItem(layout, id))} title="Mostrar de novo">{`+ ${itemLabel(id)}`}</button>)}
          </div>
        </>
      )}
    </section>
  );
}
