// Acesso rápido (0.10): ferramentas favoritas e recentes, presets, histórico de ajustes, macros e ferramentas temporárias.
import { useMemo, useState } from "react";
import {
  Macro, applyPreset, currentToolCmd, deleteMacro, deletePreset, describe, newMacro, renamePreset, restoreSettings, saveMacro,
  savePreset, toggleFavorite, updatePreset, useToolKit,
} from "../core/toolKit";
import { useTool } from "../core/store";
import { allCommands, commandById, runCommand, runMacro, shortcutOf } from "./commands";
import { Icon } from "./Icon";

const label = (id: string) => (commandById(id)?.label ?? id).replace(/^(Pincel|Preset|Macro): /, "");
const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? "agora" : s < 3600 ? `há ${Math.round(s / 60)} min` : `há ${Math.round(s / 3600)} h`;
};
const STAR = <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />;

function MacroEditor({ macro, onDone }: { macro: Macro; onDone: () => void }) {
  const [m, setM] = useState(macro);
  const [q, setQ] = useState("");
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const found = useMemo(() => (q.trim() ? allCommands().filter((c) => !c.id.startsWith("macro.") && fold(`${c.label} ${c.cat}`).includes(fold(q))).slice(0, 8) : []), [q]);
  const move = (i: number, d: number) => {
    const steps = [...m.steps];
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    setM({ ...m, steps });
  };
  return (
    <div className="macro-ed">
      <input className="kb-search" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} aria-label="Nome da sequência" />
      <ol className="macro-steps">
        {m.steps.map((s, i) => (
          <li key={`${s}${i}`}>
            <span>{label(s)}</span>
            <button className="kb-x" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">‹</button>
            <button className="kb-x" onClick={() => move(i, 1)} disabled={i === m.steps.length - 1} aria-label="Descer">›</button>
            <button className="kb-x" onClick={() => setM({ ...m, steps: m.steps.filter((_, k) => k !== i) })} aria-label="Tirar passo">×</button>
          </li>
        ))}
        {!m.steps.length && <li className="hint small">Adicione passos procurando abaixo (ex.: Duplicar, Alinhar à esquerda, Agrupar).</li>}
      </ol>
      <input className="kb-search" placeholder="Adicionar passo: procure um comando" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Procurar comando para adicionar" />
      {found.map((c) => (
        <button key={c.id} className="qp-row" onClick={() => { setM({ ...m, steps: [...m.steps, c.id] }); setQ(""); }}>
          <span>+ {c.label}</span><small>{c.cat}</small>
        </button>
      ))}
      <div className="row tight">
        <button className="chip on" onClick={() => { saveMacro({ ...m, name: m.name.trim() || "Sequência" }); onDone(); }}>Salvar</button>
        <button className="chip" onClick={onDone}>Cancelar</button>
      </div>
    </div>
  );
}

export function QuickPanel() {
  const kit = useToolKit();
  useTool((s) => s.tool + s.brush);
  const [presetName, setPresetName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [editing, setEditing] = useState<Macro | null>(null);
  const cur = currentToolCmd();
  const fav = kit.favorites.filter((f) => commandById(f));

  return (
    <div className="quickpanel">
      <div className="qp-head">
        <div className="sec-title">Favoritas</div>
        <button className={kit.favorites.includes(cur) ? "chip on" : "chip"} onClick={() => toggleFavorite(cur)} title={`Favoritar a ferramenta atual (${shortcutOf("tool.favorite")})`}>
          <Icon size={14}>{STAR}</Icon> {kit.favorites.includes(cur) ? "Favorita" : "Favoritar atual"}
        </button>
      </div>
      {fav.length ? (
        <div className="qp-grid">
          {fav.map((f) => (
            <div key={f} className={f === cur ? "qp-tile on" : "qp-tile"}>
              <button onClick={() => runCommand(f)} title={label(f)}><span>{label(f)}</span><kbd>{shortcutOf(f)}</kbd></button>
              <button className="kb-x" onClick={() => toggleFavorite(f)} aria-label={`Tirar ${label(f)} das favoritas`}>×</button>
            </div>
          ))}
        </div>
      ) : <p className="hint small">Favorite ferramentas, pincéis, presets ou macros para tê-los aqui num toque.</p>}

      <div className="sec-title">Recentes</div>
      <div className="chips-wrap">
        {kit.recent.filter((r) => commandById(r)).slice(0, 8).map((r) => (
          <button key={r} className={r === cur ? "chip on" : "chip"} onClick={() => runCommand(r)}>{label(r)}</button>
        ))}
        {!kit.recent.length && <span className="hint small">Nenhuma ainda.</span>}
      </div>
      <p className="hint small">Q volta para a anterior. Segurar a tecla de uma ferramenta usa ela só enquanto segura.</p>

      <div className="qp-head"><div className="sec-title">Presets</div></div>
      <div className="row tight">
        <input className="kb-search" placeholder="Nome (opcional)" value={presetName} onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Nome do preset" />
        <button className="chip on" onClick={() => { savePreset(presetName); setPresetName(""); }}>Salvar atual</button>
      </div>
      <div className="qp-list">
        {kit.presets.map((p) => (
          <div key={p.id} className="qp-item">
            {renaming === p.id
              ? <input autoFocus className="kb-search" defaultValue={p.name} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} onBlur={(e) => { renamePreset(p.id, e.target.value); setRenaming(null); }} aria-label="Nome" />
              : <button className="qp-main" onClick={() => applyPreset(p.id)} title={describe(p.tool, p.settings)}>
                  {p.settings.color && <i className="qp-dot" style={{ background: String(p.settings.color) }} />}
                  <span><b>{p.name}</b><small>{describe(p.tool, p.settings)}</small></span>
                </button>}
            <button className="kb-x" onClick={() => toggleFavorite(`preset.${p.id}`)} aria-label="Favoritar" title="Favoritar"><Icon size={13}>{STAR}</Icon></button>
            <button className="kb-x" onClick={() => setRenaming(p.id)} aria-label="Renomear" title="Renomear">✎</button>
            <button className="kb-x" onClick={() => updatePreset(p.id)} aria-label="Atualizar com os ajustes atuais" title="Atualizar com os ajustes atuais">↻</button>
            <button className="kb-x" onClick={() => deletePreset(p.id)} aria-label="Excluir" title="Excluir">×</button>
          </div>
        ))}
        {!kit.presets.length && <p className="hint small">Ex.: marcador 12, 80%, azul, estabilização 30% → “Marca azul”. Cada preset ganha comando e pode ter atalho.</p>}
      </div>

      <div className="sec-title">Ajustes anteriores</div>
      <div className="qp-list">
        {kit.history.slice(0, 8).map((h, i) => (
          <div key={i} className="qp-item">
            <span className="qp-main static"><span><b>{describe(h.tool, h.before)}</b><small>→ {describe(h.tool, h.after)} · {ago(h.at)}</small></span></span>
            <button className="chip" onClick={() => restoreSettings(h)}>Voltar</button>
          </div>
        ))}
        {!kit.history.length && <p className="hint small">Quando você muda espessura, cor, estabilização… dá para voltar ao ajuste de antes aqui.</p>}
      </div>

      <div className="qp-head">
        <div className="sec-title">Macros e sequências</div>
        <button className={kit.recording ? "chip rec" : "chip"} onClick={() => runCommand("macro.record")} title={`Gravar (${shortcutOf("macro.record")})`}>
          {kit.recording ? `■ Parar (${kit.recording.length})` : "● Gravar"}
        </button>
      </div>
      {editing ? <MacroEditor macro={editing} onDone={() => setEditing(null)} /> : (
        <>
          <div className="qp-list">
            {kit.macros.map((m) => (
              <div key={m.id} className="qp-item">
                <button className="qp-main" onClick={() => runMacro(m.id)} title={m.steps.map(label).join(" → ")}>
                  <span><b>▶ {m.name}</b><small>{m.steps.slice(0, 4).map(label).join(" → ")}{m.steps.length > 4 ? " …" : ""}</small></span>
                </button>
                <button className="kb-x" onClick={() => toggleFavorite(`macro.${m.id}`)} aria-label="Favoritar" title="Favoritar"><Icon size={13}>{STAR}</Icon></button>
                <button className="kb-x" onClick={() => setEditing(m)} aria-label="Editar" title="Editar passos">✎</button>
                <button className="kb-x" onClick={() => deleteMacro(m.id)} aria-label="Excluir" title="Excluir">×</button>
              </div>
            ))}
          </div>
          <button className="chip" onClick={() => setEditing(newMacro())}>+ Montar sequência</button>
          <p className="hint small">Ex.: Duplicar → Alinhar à esquerda → Agrupar. Cada macro vira um comando (dá para pôr atalho em Configurações → Atalhos).</p>
        </>
      )}

      <div className="sec-title">Ferramentas temporárias</div>
      {([
        ["tempTools", "Segurar a tecla de uma ferramenta", "Usa a ferramenta enquanto a tecla está apertada; ao soltar, volta a anterior."],
        ["ctrlSelect", "Segurar Ctrl = Selecionar", "Desenhando, segure Ctrl para selecionar/mover; soltou, volta a desenhar."],
        ["altPick", "Segurar Alt = conta-gotas", "Com caneta, formas ou texto: Alt + toque pega a cor do que está embaixo."],
      ] as const).map(([k, t, h]) => (
        <button key={k} className="toggle" role="switch" aria-checked={kit[k]} onClick={() => kit.set({ [k]: !kit[k] })}>
          <span className="toggle-text"><b>{t}</b><small>{h}</small></span>
          <span className={kit[k] ? "switch on" : "switch"} aria-hidden="true"><i /></span>
        </button>
      ))}
      <p className="hint small">Espaço segurado continua sendo a mão (mover a tela) em qualquer ferramenta.</p>
    </div>
  );
}
