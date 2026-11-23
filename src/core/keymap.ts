// Atalhos de teclado personalizáveis (estilo Clip Studio Paint): cada comando tem teclas padrão e o usuário
// pode trocar, somar ou remover teclas a qualquer momento. Este arquivo é PURO quanto ao formato das teclas
// (normalizar, comparar, conflitos) e guarda só as SOBREPOSIÇÕES do usuário em localStorage.
import { create } from "zustand";

/** Onde o comando vale. Comandos de contexto mais específico têm prioridade sobre os globais na mesma tecla. */
export type KeyScope = "global" | "selection" | "group" | "node" | "vertex" | "line";
export const SCOPE_RANK: Record<KeyScope, number> = { vertex: 0, line: 1, node: 2, group: 3, selection: 4, global: 5 };
export const SCOPE_LABEL: Record<KeyScope, string> = {
  global: "Sempre", selection: "Com seleção", group: "Grupo selecionado", node: "Nó de mapa selecionado", vertex: "Vértice selecionado", line: "Linha/seta selecionada",
};

export interface KeyEventLike {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

const NAMED: Record<string, string> = {
  " ": "Space", spacebar: "Space", space: "Space", esc: "Escape", escape: "Escape", enter: "Enter", return: "Enter", tab: "Tab",
  delete: "Delete", del: "Delete", backspace: "Backspace", insert: "Insert", home: "Home", end: "End",
  pageup: "PageUp", pagedown: "PageDown", arrowleft: "Left", arrowright: "Right", arrowup: "Up", arrowdown: "Down",
  left: "Left", right: "Right", up: "Up", down: "Down", plus: "+", minus: "-", equal: "=",
};

const MOD_ORDER = ["Ctrl", "Alt", "Shift"] as const;
const isModifierKey = (k: string) => ["Control", "Shift", "Alt", "Meta", "AltGraph", "OS", "CapsLock", "Fn"].includes(k);

/** Nome canônico da tecla-base ("K", "1", "Enter", "F2", "[", "Left"…). */
export function baseKey(raw: string): string {
  if (!raw) return "";
  const k = raw.trim();
  if (k === "+") return "+";
  const low = k.toLowerCase();
  if (NAMED[low]) return NAMED[low];
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(k)) return k.toUpperCase();
  if (k.length === 1) return k.toUpperCase();
  return k[0].toUpperCase() + k.slice(1);
}

/** Tecla-base a partir do evento: usa a posição física (code) para letras, números e sinais, então Shift+1 é "Shift+1" e não "!". */
function eventBase(e: KeyEventLike): string {
  const code = e.code ?? "";
  let m: RegExpMatchArray | null;
  if ((m = code.match(/^Key([A-Z])$/))) return m[1];
  if ((m = code.match(/^Digit([0-9])$/))) return m[1];
  if ((m = code.match(/^Numpad([0-9])$/))) return m[1];
  const byCode: Record<string, string> = {
    BracketLeft: "[", BracketRight: "]", Period: ".", Comma: ",", Slash: "/", Backslash: "\\", Semicolon: ";", Quote: "'",
    Minus: "-", Equal: "=", Backquote: "`", NumpadAdd: "+", NumpadSubtract: "-", NumpadMultiply: "*", NumpadDivide: "/",
    NumpadDecimal: ".", NumpadEnter: "Enter", Space: "Space", IntlBackslash: "\\",
  };
  if (byCode[code]) return byCode[code];
  return baseKey(e.key);
}

/** Combinação canônica do evento ("Ctrl+Shift+Z"), ou "" se só um modificador foi apertado. */
export function comboFromEvent(e: KeyEventLike): string {
  if (isModifierKey(e.key)) return "";
  const base = eventBase(e);
  if (!base) return "";
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  return [...mods, base].join("+");
}

/** Normaliza texto digitado/salvo ("shift+ctrl+z", "Cmd+K", "ctrl + =") para a forma canônica. "" se inválido. */
export function normalizeCombo(raw: string): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim();
  if (!s) return "";
  // "+" sozinho ou no fim ("Ctrl++") é a tecla mais
  const parts = s.replace(/\+\+$/, "+plus").split("+").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return "";
  const mods = new Set<string>();
  let base = "";
  for (const p of parts) {
    const low = p.toLowerCase();
    if (["ctrl", "control", "cmd", "command", "meta", "⌘", "mod"].includes(low)) mods.add("Ctrl");
    else if (["alt", "option", "opt", "⌥"].includes(low)) mods.add("Alt");
    else if (["shift", "⇧"].includes(low)) mods.add("Shift");
    else if (base) return ""; // duas teclas-base
    else base = baseKey(p);
  }
  if (!base) return "";
  return [...MOD_ORDER.filter((m) => mods.has(m)), base].join("+");
}

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");
const PRETTY: Record<string, string> = { Left: "←", Right: "→", Up: "↑", Down: "↓", Escape: "Esc", Delete: "Del", Backspace: "⌫", Space: "Espaço", PageUp: "PgUp", PageDown: "PgDn" };
/** Texto para mostrar ("Ctrl+Shift+Z", "⌘⇧Z" no Mac). */
export function prettyCombo(combo: string): string {
  const parts = combo.split("+");
  const base = combo.endsWith("++") ? "+" : parts[parts.length - 1];
  const mods = parts.slice(0, -1).filter(Boolean);
  const b = PRETTY[base] ?? base;
  if (MAC) return mods.map((m) => (m === "Ctrl" ? "⌘" : m === "Alt" ? "⌥" : "⇧")).join("") + b;
  return [...mods, b].join("+");
}

// ---------- mapa de teclas ----------

/** O mínimo que o mapa precisa saber de um comando. */
export interface KeyedCommand {
  id: string;
  label: string;
  keys?: string[];
  scope?: KeyScope;
}

/** Sobreposições do usuário: id do comando → teclas (lista vazia = sem atalho). Comando ausente = teclas padrão. */
export type KeyOverrides = Record<string, string[]>;

export function keysFor(cmd: KeyedCommand, overrides: KeyOverrides): string[] {
  const o = overrides[cmd.id];
  return (o ?? cmd.keys ?? []).map(normalizeCombo).filter(Boolean);
}

/** Índice tecla → comandos (na ordem de prioridade: escopo mais específico primeiro, depois a ordem do registro). */
export function buildIndex<C extends KeyedCommand>(cmds: C[], overrides: KeyOverrides): Map<string, C[]> {
  const idx = new Map<string, C[]>();
  cmds.forEach((c) => {
    for (const k of keysFor(c, overrides)) {
      const list = idx.get(k) ?? [];
      if (!list.includes(c)) list.push(c);
      idx.set(k, list);
    }
  });
  for (const list of idx.values()) list.sort((a, b) => SCOPE_RANK[a.scope ?? "global"] - SCOPE_RANK[b.scope ?? "global"]);
  return idx;
}

/** Conflitos de verdade: a mesma tecla em dois comandos do MESMO contexto (contextos diferentes convivem). */
export function findConflicts(cmds: KeyedCommand[], overrides: KeyOverrides): { combo: string; ids: string[] }[] {
  const out: { combo: string; ids: string[] }[] = [];
  for (const [combo, list] of buildIndex(cmds, overrides)) {
    const byScope = new Map<string, string[]>();
    list.forEach((c) => byScope.set(c.scope ?? "global", [...(byScope.get(c.scope ?? "global") ?? []), c.id]));
    for (const ids of byScope.values()) if (ids.length > 1) out.push({ combo, ids });
  }
  return out;
}

/** Comandos (do mesmo contexto) que já usam esta tecla — para avisar antes de gravar. */
export function usersOf(cmds: KeyedCommand[], overrides: KeyOverrides, combo: string, scope: KeyScope = "global", except?: string): KeyedCommand[] {
  const c = normalizeCombo(combo);
  return cmds.filter((x) => x.id !== except && (x.scope ?? "global") === scope && keysFor(x, overrides).includes(c));
}

/** Atribui `combo` ao comando (somando às teclas dele) e tira a tecla de quem a usava no mesmo contexto. */
export function assignKey(cmds: KeyedCommand[], overrides: KeyOverrides, id: string, combo: string, replace = false): KeyOverrides {
  const c = normalizeCombo(combo);
  const cmd = cmds.find((x) => x.id === id);
  if (!c || !cmd) return overrides;
  const next: KeyOverrides = { ...overrides };
  for (const other of usersOf(cmds, overrides, c, cmd.scope ?? "global", id)) next[other.id] = keysFor(other, overrides).filter((k) => k !== c);
  const mine = replace ? [] : keysFor(cmd, overrides).filter((k) => k !== c);
  next[id] = [...mine, c];
  return tidy(cmds, next);
}

export function removeKey(cmds: KeyedCommand[], overrides: KeyOverrides, id: string, combo: string): KeyOverrides {
  const cmd = cmds.find((x) => x.id === id);
  if (!cmd) return overrides;
  return tidy(cmds, { ...overrides, [id]: keysFor(cmd, overrides).filter((k) => k !== normalizeCombo(combo)) });
}

export function resetKey(overrides: KeyOverrides, id: string): KeyOverrides {
  const next = { ...overrides };
  delete next[id];
  return next;
}

/** Sobreposição igual ao padrão não precisa ser guardada. */
function tidy(cmds: KeyedCommand[], o: KeyOverrides): KeyOverrides {
  const out: KeyOverrides = {};
  for (const [id, keys] of Object.entries(o)) {
    const cmd = cmds.find((x) => x.id === id);
    if (!cmd) continue;
    const def = (cmd.keys ?? []).map(normalizeCombo).filter(Boolean);
    const same = def.length === keys.length && def.every((k, i) => k === keys[i]);
    if (!same) out[id] = keys;
  }
  return out;
}

/** Aceita qualquer JSON (arquivo importado, versão futura) e devolve sobreposições válidas. */
export function cleanOverrides(raw: unknown): KeyOverrides {
  const src = raw && typeof raw === "object" && "keys" in (raw as object) ? (raw as { keys: unknown }).keys : raw;
  const out: KeyOverrides = {};
  if (!src || typeof src !== "object" || Array.isArray(src)) return out;
  for (const [id, v] of Object.entries(src as Record<string, unknown>)) {
    if (typeof id !== "string" || id.length > 80 || !Array.isArray(v)) continue;
    out[id] = [...new Set(v.filter((x): x is string => typeof x === "string").map(normalizeCombo).filter(Boolean))].slice(0, 6);
  }
  return out;
}

// ---------- estado persistido ----------

export const KEYMAP_KEY = "hm-ideas:keymap-v1";

const load = (): KeyOverrides => {
  try { return cleanOverrides(JSON.parse(localStorage.getItem(KEYMAP_KEY) ?? "{}")); } catch { return {}; }
};

interface KeymapState {
  overrides: KeyOverrides;
  setOverrides: (o: KeyOverrides) => void;
}

export const useKeymap = create<KeymapState>((set) => ({
  overrides: typeof localStorage !== "undefined" ? load() : {},
  setOverrides: (overrides) => {
    set({ overrides });
    try { localStorage.setItem(KEYMAP_KEY, JSON.stringify(overrides)); } catch { /* sem armazenamento */ }
  },
}));

/** Arquivo de exportação dos atalhos (para levar a outro computador). */
export const exportKeymap = (o: KeyOverrides) => JSON.stringify({ app: "hm-ideas", kind: "keymap", version: 1, keys: o }, null, 2);
