// Paleta de comandos (Ctrl+K): procura qualquer ação pelo nome e mostra o atalho dela.
import { useEffect, useMemo, useRef, useState } from "react";
import { allCommands, inScope, runCommand, shortcutOf, usePalette } from "./commands";
import { scoreText } from "../core/search";
import { useToolKit } from "../core/toolKit";
import { useSel } from "../core/store";
import { searchLibrary } from "../core/blocks/library";
import { insertLibItemById } from "./BlockGallery";


export function CommandPalette() {
  const open = usePalette((s) => s.open);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) { setQ(""); setI(0); } }, [open]);

  type Row = { id: string; label: string; cat: string; key: string; on?: boolean; run: () => void; section?: string };
  const results = useMemo((): Row[] => {
    if (!open) return [];
    const recentIds = useToolKit.getState().commandLog.map((c) => c.id);
    const all = allCommands().filter((c) => !c.when || c.when());
    const row = (c: (typeof all)[number], section?: string): Row => ({ id: c.id, label: c.label, cat: c.cat, key: shortcutOf(c.id), on: c.checked?.(), run: () => runCommand(c.id), section });
    if (!q.trim()) {
      // vazio: recentes + sugestões para o que está acontecendo agora
      const sel = useSel.getState().ids.length;
      const sug = sel > 1 ? ["obj.group", "dist.h", "align.left", "edit.duplicate", "arr.grid", "eq.both"]
        : sel === 1 ? ["edit.duplicate", "obj.lock", "arr.front", "panel.props", "edit.selectSame"]
        : ["insert.sticky", "insert.library", "insert.templates", "panel.quick", "macro.record", "preset.save"];
      const byId = (id: string) => all.find((c) => c.id === id);
      const rec = recentIds.map(byId).filter((c): c is (typeof all)[number] => !!c && inScope(c.scope)).slice(0, 6);
      const out = [...rec.map((c) => row(c, "Recentes")), ...sug.map(byId).filter((c): c is (typeof all)[number] => !!c && !rec.includes(c)).map((c) => row(c, "Sugestões"))];
      return out;
    }
    const scored = all
      .map((c) => {
        let score = scoreText(q, c.label, `${c.cat} ${c.hint ?? ""} ${c.keywords ?? ""}`);
        if (!score) return null;
        const r = recentIds.indexOf(c.id);
        if (r >= 0) score += 0.6 - r * 0.02;
        if (!inScope(c.scope)) score -= 1.5;
        return { c, score };
      })
      .filter((x): x is { c: (typeof all)[number]; score: number } => !!x)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((x) => row(x.c));
    // blocos da biblioteca também aparecem ("Bloco: Post-it amarelo")
    const blocks = q.trim().length >= 2
      ? searchLibrary(q).slice(0, 5).map((it): Row => ({ id: `lib.${it.id}`, label: `Bloco: ${it.label}`, cat: "Biblioteca", key: "", run: () => { insertLibItemById(it.id); } }))
      : [];
    return [...scored.slice(0, 30), ...blocks, ...scored.slice(30)];
  }, [open, q]);

  useEffect(() => { listRef.current?.querySelector(".pal-item.on")?.scrollIntoView({ block: "nearest" }); }, [i]);

  if (!open) return null;
  const close = () => usePalette.getState().setOpen(false);
  const run = (r: Row) => {
    close();
    // deixa a paleta sumir antes (comandos que abrem janelas ou pedem foco)
    requestAnimationFrame(() => r.run());
  };

  return (
    <div className="modal-backdrop palette-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Procurar comando">
        <input
          autoFocus
          className="pal-input"
          placeholder="O que você quer fazer? (ex.: agrupar, mesmo espaço, post-it, caneta azul)"
          value={q}
          onChange={(e) => { setQ(e.target.value); setI(0); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); close(); }
            else if (e.key === "ArrowDown") { e.preventDefault(); setI((v) => Math.min(results.length - 1, v + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setI((v) => Math.max(0, v - 1)); }
            else if (e.key === "Enter" && results[i]) { e.preventDefault(); run(results[i]); }
          }}
          aria-label="Procurar comando"
        />
        <div className="pal-list" role="listbox" ref={listRef}>
          {results.map((c, k) => (
            <div key={c.id + k}>
              {c.section && c.section !== results[k - 1]?.section && <div className="pal-section">{c.section}</div>}
              <button role="option" aria-selected={k === i} className={k === i ? "pal-item on" : "pal-item"} onMouseEnter={() => setI(k)} onClick={() => run(c)}>
                <span className="pal-cat">{c.cat}</span>
                <span className="pal-label"><span className="pal-check">{c.on ? "✓" : ""}</span>{c.label}</span>
                {c.key && <kbd>{c.key}</kbd>}
              </button>
            </div>
          ))}
          {!results.length && <p className="hint">Nada encontrado.</p>}
        </div>
      </div>
    </div>
  );
}
