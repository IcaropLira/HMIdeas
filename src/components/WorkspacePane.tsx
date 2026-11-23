// Configurações → Áreas de trabalho: trocar, criar, renomear, duplicar, restaurar, excluir, importar e exportar;
// quais barras da janela aparecem e quais painéis abrem.
import { useRef, useState } from "react";
import { PANELS, isOpen } from "../core/docking";
import { PRESETS, useWorkspace, togglePanelCmd } from "../core/workspace";
import { useLayout } from "../core/layout";
import { useUI } from "../core/ui";

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function WorkspacePane() {
  const ws = useWorkspace();
  const locked = useLayout((s) => s.layout.locked);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [newName, setNewName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useUI.getState().showToast;

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    const id = ws.importJson(await f.text());
    toast(id ? "Área de trabalho importada." : "Arquivo de área de trabalho inválido.");
  };

  return (
    <section className="pane">
      <h3>Áreas de trabalho</h3>
      <p className="hint">Cada área guarda onde ficam os painéis, as barras de ferramentas e as barras da janela. Trocar de área nunca mexe nos seus cadernos.</p>
      <div className="ws-list" role="radiogroup" aria-label="Área de trabalho">
        {ws.list.map((w) => {
          const preset = PRESETS.find((p) => p.id === w.id);
          return (
            <div key={w.id} className={ws.activeId === w.id ? "ws-item on" : "ws-item"}>
              <button role="radio" aria-checked={ws.activeId === w.id} className="ws-pick" onClick={() => ws.switchTo(w.id)}>
                {renaming === w.id ? (
                  <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { ws.rename(w.id, name); setRenaming(null); } if (e.key === "Escape") setRenaming(null); }}
                    onBlur={() => { ws.rename(w.id, name); setRenaming(null); }} aria-label="Nome da área" />
                ) : (
                  <><b>{w.name}</b><small>{preset?.hint ?? "Área personalizada"}</small></>
                )}
              </button>
              <div className="row tight">
                <button className="btn sm" title="Renomear" aria-label={`Renomear ${w.name}`} onClick={() => { setRenaming(w.id); setName(w.name); }}>✎</button>
                <button className="btn sm" title="Duplicar" aria-label={`Duplicar ${w.name}`} onClick={() => ws.duplicate(w.id)}>⧉</button>
                {w.preset && <button className="btn sm" title="Restaurar o padrão" aria-label={`Restaurar ${w.name}`} onClick={() => ws.restore(w.id)}>↺</button>}
                <button className="btn sm" title="Exportar" aria-label={`Exportar ${w.name}`} onClick={() => download(`area-${w.name.toLowerCase().replace(/\s+/g, "-")}.json`, ws.exportJson(w.id))}>⇩</button>
                {!preset && <button className="btn sm danger" title="Excluir" aria-label={`Excluir ${w.name}`} onClick={() => ws.remove(w.id)}>×</button>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="row">
        <input className="kb-search" placeholder="Nome da nova área" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Nome da nova área" />
        <button className="chip on" onClick={() => { ws.create(newName || "Minha área"); setNewName(""); toast("Área criada a partir da atual."); }}>Salvar a atual como nova</button>
        <button className="chip" onClick={() => fileRef.current?.click()}>Importar…</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      <h3>Barras da janela</h3>
      {([
        ["menubar", "Barra de menus", "Arquivo, Editar, Exibir, Inserir, Objeto, Organizar, Ferramentas, Janela, Ajuda"],
        ["optionsbar", "Barra de opções", "Opções da ferramenta ativa ou da seleção, logo abaixo do menu"],
        ["statusbar", "Barra de status", "Zoom, coordenadas, página, grupo aberto e estado do documento"],
        ["pills", "Botões flutuantes do topo", "Caderno, páginas, zoom e salvar (visual clássico)"],
      ] as const).map(([k, label, hint]) => (
        <button key={k} className="toggle" role="switch" aria-checked={ws.chrome[k]} onClick={() => ws.setChrome({ [k]: !ws.chrome[k] })}>
          <span className="toggle-text"><b>{label}</b><small>{hint}</small></span>
          <span className={ws.chrome[k] ? "switch on" : "switch"} aria-hidden="true"><i /></span>
        </button>
      ))}
      <button className="toggle" role="switch" aria-checked={locked} onClick={() => { useLayout.getState().setLocked(!locked); ws.updateDock((L) => ({ ...L, locked: !locked })); }}>
        <span className="toggle-text"><b>Travar o layout</b><small>Painéis e barras não saem do lugar (abas e botões continuam funcionando).</small></span>
        <span className={locked ? "switch on" : "switch"} aria-hidden="true"><i /></span>
      </button>

      <h3>Painéis</h3>
      <div className="chips-wrap">
        {PANELS.map((p) => (
          <button key={p.id} className={isOpen(ws.dock, p.id) ? "chip on" : "chip"} aria-pressed={isOpen(ws.dock, p.id)} title={p.hint} onClick={() => togglePanelCmd(p.id)}>{p.label}</button>
        ))}
      </div>
      <p className="hint">Arraste a aba de um painel para outro lado, para junto de outro painel (vira aba) ou para fora (vira janela flutuante). Shift+Tab esconde/mostra todos.</p>
    </section>
  );
}
