// Pacote de configurações (0.16): tudo o que o app guarda como PREFERÊNCIA (temas, áreas de trabalho, barras, atalhos,
// pincéis, presets, macros, modelos de página, pastas, estatísticas…) num arquivo só. Os cadernos NÃO entram (vão por .hiraku).

export interface SettingsBundle { app: "hm-ideas"; kind: "settings"; version: 1; at: number; data: Record<string, string> }

/** Chaves que são preferência do app (e não estado passageiro). */
export const isSettingsKey = (k: string) => /^(hm-ideas|hmideas)/.test(k) && !/notebooks:active|autosave/.test(k);

export function collectSettings(store: Pick<Storage, "length" | "key" | "getItem">, now = Date.now()): SettingsBundle {
  const data: Record<string, string> = {};
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && isSettingsKey(k)) { const v = store.getItem(k); if (v !== null) data[k] = v; }
  }
  return { app: "hm-ideas", kind: "settings", version: 1, at: now, data };
}

/** Valida o arquivo; devolve as chaves a gravar (só as de preferência, só texto). */
export function parseSettings(text: string): Record<string, string> | null {
  try {
    const j = JSON.parse(text);
    if (j?.app !== "hm-ideas" || j?.kind !== "settings" || !j.data || typeof j.data !== "object") return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j.data)) if (isSettingsKey(k) && typeof v === "string" && v.length < 5_000_000) out[k] = v;
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}
