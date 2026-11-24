// Busca "por intenção" (paleta de comandos): sem acento, sem palavras vazias, plural → singular, prefixos.
// "deixar dois cartões com o mesmo espaço" acha Distribuir porque os comandos têm palavras-chave (keywords).

const STOP = new Set([
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das", "e", "em", "no", "na", "nos", "nas", "com", "para",
  "pra", "por", "que", "eu", "quero", "queria", "deixar", "fazer", "ficar", "dois", "duas", "tres", "todos", "todas", "meu", "minha",
  "isso", "esse", "essa", "aqui", "como", "the", "to", "se", "ao", "aos", "mais",
]);

export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "cartões" → "cartao", "espaços" → "espaco", "linhas" → "linha". */
export function stem(w: string): string {
  if (w.length > 4 && w.endsWith("oes")) return w.slice(0, -3) + "ao";
  if (w.length > 4 && w.endsWith("aes")) return w.slice(0, -3) + "ao";
  if (w.length > 4 && w.endsWith("res")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

export const tokens = (s: string, stop = true): string[] =>
  fold(s).split(/[^a-z0-9+]+/).filter((w) => w && (!stop || !STOP.has(w))).map(stem);

/** 0 = não serve; senão, quanto maior melhor. Pelo menos metade das palavras da busca precisa bater. */
export function scoreText(query: string, label: string, extra = ""): number {
  const q = tokens(query);
  if (!q.length) return 0;
  const lab = tokens(label, false);
  const hay = [...lab, ...tokens(extra, false)];
  let hit = 0, inLabel = 0;
  for (const w of q) {
    const m = (t: string) => t.startsWith(w) || (w.length >= 4 && t.length >= 4 && w.startsWith(t));
    if (hay.some(m)) hit++;
    if (lab.some(m)) inLabel++;
  }
  if (hit < Math.max(1, Math.ceil(q.length / 2))) return 0;
  let score = hit / q.length + inLabel * 0.4;
  if (fold(label).startsWith(fold(query.trim()))) score += 2;
  return score;
}
