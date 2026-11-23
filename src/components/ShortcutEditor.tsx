// Editor de atalhos (Configurações → Atalhos e painel "Atalhos"). Qualquer comando pode ganhar, trocar ou perder teclas;
// conflitos no mesmo contexto são avisados antes de gravar. Exporta/importa o mapa para outro computador.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  SCOPE_LABEL, assignKey, cleanOverrides, comboFromEvent, exportKeymap, findConflicts, keysFor, prettyCombo, removeKey, resetKey, usersOf, useKeymap,
} from "../core/keymap";
import { useUI } from "../core/ui";
import { CATEGORIES, CmdCat, Command, allCommands, useCapture } from "./commands";
import { Icon } from "./Icon";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function ShortcutEditor({ compact = false, focusId }: { compact?: boolean; focusId?: string }) {
  const overrides = useKeymap((s) => s.overrides);
  const setOverrides = useKeymap((s) => s.setOverrides);
  const capturing = useCapture((s) => s.id);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CmdCat | "todas">("todas");
  const [pending, setPending] = useState<{ id: string; combo: string; users: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cmds = allCommands();
  const conflicts = useMemo(() => findConflicts(cmds, overrides), [cmds, overrides]);
  const conflictIds = new Set(conflicts.flatMap((c) => c.ids));

  useEffect(() => {
    if (!focusId) return;
    setQ("");
    setCat("todas");
    requestAnimationFrame(() => document.querySelector(`[data-cmd="${focusId}"]`)?.scrollIntoView({ block: "center" }));
  }, [focusId]);

  // gravação de tecla: escuta ANTES de todo mundo (fase de captura) enquanto um comando está esperando
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) { useCapture.getState().set(null); return; }
      const combo = comboFromEvent(e);
      if (!combo) return; // só modificador: espera a tecla
      if (combo === "Ctrl+V") { useUI.getState().showToast("Ctrl+V é do sistema (colar) e não pode ser trocado."); return; }
      const cmd = cmds.find((c) => c.id === capturing);
      useCapture.getState().set(null);
      if (!cmd) return;
      const others = usersOf(cmds, useKeymap.getState().overrides, combo, cmd.scope ?? "global", cmd.id);
      if (others.length) setPending({ id: cmd.id, combo, users: others.map((o) => o.label) });
      else setOverrides(assignKey(cmds, useKeymap.getState().overrides, cmd.id, combo));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, cmds, setOverrides]);
  useEffect(() => () => useCapture.getState().set(null), []);

  const nq = fold(q.trim());
  const match = (c: Command) => {
    if (cat !== "todas" && c.cat !== cat) return false;
    if (!nq) return true;
    const keys = (c.fixed ? [c.fixed] : keysFor(c, overrides)).map((k) => fold(k) + " " + fold(prettyCombo(k)));
    return fold(c.label).includes(nq) || fold(c.cat).includes(nq) || keys.some((k) => k.includes(nq));
  };
  const list = cmds.filter(match);

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      setOverrides(cleanOverrides(JSON.parse(await f.text())));
      useUI.getState().showToast("Atalhos importados.");
    } catch {
      useUI.getState().showToast("Arquivo de atalhos inválido.");
    }
  };

  const row = (c: Command) => {
    const keys = c.fixed ? [c.fixed] : keysFor(c, overrides);
    const changed = !c.fixed && overrides[c.id] !== undefined;
    return (
      <div key={c.id} className={conflictIds.has(c.id) ? "kb-row conflict" : "kb-row"} data-cmd={c.id}>
        <div className="kb-name">
          <span>{c.label}</span>
          {c.scope && c.scope !== "global" && <small className="kb-scope">{SCOPE_LABEL[c.scope]}</small>}
        </div>
        <div className="kb-keys">
          {capturing === c.id ? (
            <span className="kb-capture" role="status">Pressione as teclas… <small>(Esc cancela)</small></span>
          ) : (
            <>
              {keys.map((k) => (
                <span key={k} className="kb-key">
                  <kbd>{prettyCombo(k)}</kbd>
                  {!c.fixed && <button className="kb-x" onClick={() => setOverrides(removeKey(cmds, overrides, c.id, k))} aria-label={`Tirar ${prettyCombo(k)} de ${c.label}`} title="Tirar esta tecla">×</button>}
                </span>
              ))}
              {!keys.length && <span className="kb-none">—</span>}
              {!c.fixed && <button className="btn sm kb-add" onClick={() => useCapture.getState().set(c.id)} aria-label={`Gravar atalho para ${c.label}`} title="Gravar uma tecla (some às que já tem)">+</button>}
              {changed && <button className="btn sm" onClick={() => setOverrides(resetKey(overrides, c.id))} aria-label={`Voltar ao padrão: ${c.label}`} title="Voltar ao padrão">↺</button>}
              {c.fixed && <small className="kb-scope">fixo</small>}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={compact ? "kb compact" : "kb"}>
      <div className="kb-top">
        <input className="kb-search" type="search" placeholder="Procurar comando ou tecla (ex.: caneta, Ctrl+G)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Procurar atalho" />
        {!compact && (
          <div className="row tight">
            <button className="chip" onClick={() => download("hm-ideas-atalhos.json", exportKeymap(overrides))}>Exportar</button>
            <button className="chip" onClick={() => fileRef.current?.click()}>Importar</button>
            <button className="chip" onClick={() => setOverrides({})} disabled={!Object.keys(overrides).length}>Restaurar todos</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        )}
      </div>
      <div className="kb-cats" role="tablist" aria-label="Categorias">
        {(["todas", ...CATEGORIES] as const).map((x) => (
          <button key={x} role="tab" aria-selected={cat === x} className={cat === x ? "chip on" : "chip"} onClick={() => setCat(x)}>{x === "todas" ? "Todas" : x}</button>
        ))}
      </div>
      {conflicts.length > 0 && (
        <p className="hint warn">
          {conflicts.length === 1 ? "1 tecla repetida" : `${conflicts.length} teclas repetidas`} no mesmo contexto ({conflicts.map((c) => prettyCombo(c.combo)).join(", ")}): só o primeiro comando responde.
        </p>
      )}
      {pending && (
        <div className="kb-confirm" role="alertdialog" aria-label="Tecla em uso">
          <span><kbd>{prettyCombo(pending.combo)}</kbd> já é de <b>{pending.users.join(", ")}</b>. Passar para “{cmds.find((c) => c.id === pending.id)?.label}”?</span>
          <div className="row tight">
            <button className="chip on" onClick={() => { setOverrides(assignKey(cmds, overrides, pending.id, pending.combo)); setPending(null); }}>Substituir</button>
            <button className="chip" onClick={() => setPending(null)}>Cancelar</button>
          </div>
        </div>
      )}
      <div className="kb-list">
        {cat === "todas" && !nq
          ? CATEGORIES.map((k) => {
              const items = list.filter((c) => c.cat === k);
              return items.length ? (<section key={k}><h4>{k}</h4>{items.map(row)}</section>) : null;
            })
          : list.map(row)}
        {!list.length && <p className="hint">Nenhum comando encontrado.</p>}
      </div>
      {!compact && <p className="hint">Clique em <b>+</b> e aperte a combinação. Teclas iguais podem existir em contextos diferentes (ex.: Enter edita um texto, cria um irmão num nó de mapa e entra num grupo). <Icon size={14}><path d="M12 8v5M12 16h.01" /></Icon> Espaço + arrastar (mover a tela) e Ctrl+V (colar) são do sistema.</p>}
    </div>
  );
}
