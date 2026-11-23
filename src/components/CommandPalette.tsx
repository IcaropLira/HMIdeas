// Paleta de comandos (Ctrl+K): procura qualquer ação pelo nome e mostra o atalho dela.
import { useEffect, useMemo, useRef, useState } from "react";
import { allCommands, inScope, runCommand, shortcutOf, usePalette } from "./commands";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const RECENT_KEY = "hm-ideas:palette-recent";

export function CommandPalette() {
  const open = usePalette((s) => s.open);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) { setQ(""); setI(0); } }, [open]);

  const results = useMemo(() => {
    if (!open) return [];
    const recent: string[] = (() => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; } })();
    const words = fold(q).split(/\s+/).filter(Boolean);
    const all = allCommands().filter((c) => !c.when || c.when());
    const scored = all
      .map((c) => {
        const hay = fold(`${c.label} ${c.cat} ${c.hint ?? ""}`);
        if (!words.every((w) => hay.includes(w))) return null;
        let score = 0;
        if (words.length && fold(c.label).startsWith(words[0])) score += 3;
        const r = recent.indexOf(c.id);
        if (r >= 0) score += 2 - r * 0.1;
        if (!inScope(c.scope)) score -= 5;
        return { c, score };
      })
      .filter((x): x is { c: (typeof all)[number]; score: number } => !!x)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, 60).map((x) => x.c);
  }, [open, q]);

  useEffect(() => { listRef.current?.querySelector(".pal-item.on")?.scrollIntoView({ block: "nearest" }); }, [i]);

  if (!open) return null;
  const close = () => usePalette.getState().setOpen(false);
  const run = (id: string) => {
    close();
    try {
      const recent: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
      localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recent.filter((x) => x !== id)].slice(0, 8)));
    } catch { /* sem armazenamento */ }
    // deixa a paleta sumir antes (comandos que abrem janelas ou pedem foco)
    requestAnimationFrame(() => runCommand(id));
  };

  return (
    <div className="modal-backdrop palette-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Procurar comando">
        <input
          autoFocus
          className="pal-input"
          placeholder="O que você quer fazer? (ex.: agrupar, alinhar, caneta, painel)"
          value={q}
          onChange={(e) => { setQ(e.target.value); setI(0); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); close(); }
            else if (e.key === "ArrowDown") { e.preventDefault(); setI((v) => Math.min(results.length - 1, v + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setI((v) => Math.max(0, v - 1)); }
            else if (e.key === "Enter" && results[i]) { e.preventDefault(); run(results[i].id); }
          }}
          aria-label="Procurar comando"
        />
        <div className="pal-list" role="listbox" ref={listRef}>
          {results.map((c, k) => {
            const key = shortcutOf(c.id);
            const on = c.checked?.();
            return (
              <button key={c.id} role="option" aria-selected={k === i} className={k === i ? "pal-item on" : "pal-item"} onMouseEnter={() => setI(k)} onClick={() => run(c.id)}>
                <span className="pal-cat">{c.cat}</span>
                <span className="pal-label"><span className="pal-check">{on ? "✓" : ""}</span>{c.label}</span>
                {key && <kbd>{key}</kbd>}
              </button>
            );
          })}
          {!results.length && <p className="hint">Nada encontrado.</p>}
        </div>
      </div>
    </div>
  );
}
