// Estudos (0.14), parte pura: repetição espaçada SM-2 dos flashcards do caderno, modo prova (fitas e questões),
// estatísticas de estudo, ordem de apresentação dos quadros e marcas de tempo do áudio gravado junto com os traços.
import type { Srs } from "./blocks/types";
import type { AttachmentElement, FrameElement, HirakuDoc, HirakuElement, ID, Page } from "./model";

export const DAY = 86_400_000;

// ---------- SM-2 ----------

/** Nota da revisão: 0 = errei, 1 = difícil, 2 = bom, 3 = fácil (vira q = 1, 3, 4, 5 do SM-2). */
export type Grade = 0 | 1 | 2 | 3;
export const GRADES: { g: Grade; label: string; hint: string }[] = [
  { g: 0, label: "Errei", hint: "Volta hoje" },
  { g: 1, label: "Difícil", hint: "Intervalo curto" },
  { g: 2, label: "Bom", hint: "Intervalo normal" },
  { g: 3, label: "Fácil", hint: "Intervalo longo" },
];
export const newSrs = (now: number): Srs => ({ ease: 2.5, interval: 0, reps: 0, due: now, lapses: 0 });

/** Algoritmo SM-2 (SuperMemo 2), com "fácil" dando um bônus e "errei" recomeçando em 10 min. */
export function sm2(prev: Srs | undefined, grade: Grade, now: number): Srs {
  const s = prev ?? newSrs(now);
  const q = [1, 3, 4, 5][grade];
  const ease = Math.max(1.3, Math.min(3.5, s.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))));
  if (grade === 0) return { ease, interval: 0, reps: 0, due: now + 10 * 60_000, lapses: s.lapses + 1 };
  const reps = s.reps + 1;
  let interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(s.interval * ease);
  if (grade === 1) interval = Math.max(1, Math.round(interval * 0.6));
  if (grade === 3) interval = Math.round(interval * 1.3) + 1;
  return { ease, interval, reps, due: now + interval * DAY, lapses: s.lapses };
}

/** Texto curto do próximo intervalo ("10 min", "1 dia", "3 sem."). */
export function intervalLabel(s: Srs, now: number): string {
  const ms = Math.max(0, s.due - now);
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  const d = Math.round(ms / DAY);
  if (d < 1) return `${Math.round(ms / 3_600_000)} h`;
  if (d < 14) return d === 1 ? "1 dia" : `${d} dias`;
  if (d < 60) return `${Math.round(d / 7)} sem.`;
  return `${Math.round(d / 30)} meses`;
}

export interface CardRef { pageId: ID; pageName: string; el: AttachmentElement & { block: Extract<NonNullable<AttachmentElement["block"]>, { kind: "flashcard" }> } }

/** Todos os flashcards do caderno (na ordem das páginas). */
export function collectCards(doc: HirakuDoc): CardRef[] {
  const out: CardRef[] = [];
  for (const p of doc.pages) for (const e of p.elements) if (e.type === "attachment" && e.block?.kind === "flashcard") out.push({ pageId: p.id, pageName: p.name, el: e as CardRef["el"] });
  return out;
}

/** Cartões para revisar agora: vencidos primeiro (mais atrasado antes), depois os nunca vistos (até `newLimit`). */
export function dueCards(cards: CardRef[], now: number, newLimit = 20): CardRef[] {
  const due = cards.filter((c) => c.el.block.srs && c.el.block.srs.due <= now).sort((a, b) => a.el.block.srs!.due - b.el.block.srs!.due);
  const fresh = cards.filter((c) => !c.el.block.srs).slice(0, newLimit);
  return [...due, ...fresh];
}

/** Grava as notas de uma sessão (id → srs) no caderno inteiro. Devolve o mesmo doc se nada mudou. */
export function applySrs(doc: HirakuDoc, updates: Map<ID, Srs>): HirakuDoc {
  if (!updates.size) return doc;
  let changed = false;
  const pages = doc.pages.map((p) => {
    if (!p.elements.some((e) => updates.has(e.id))) return p;
    changed = true;
    return { ...p, elements: p.elements.map((e) => (updates.has(e.id) && e.type === "attachment" && e.block?.kind === "flashcard" ? { ...e, block: { ...e.block, srs: updates.get(e.id)!, flipped: false } } : e)) };
  });
  return changed ? { ...doc, pages } : doc;
}

// ---------- modo prova ----------

/** Prepara a prova: esconde as fitas, zera as questões e vira os flashcards para a frente (em todas as páginas). */
export function resetForExam(doc: HirakuDoc): HirakuDoc {
  let changed = false;
  const pages = doc.pages.map((p) => {
    let pc = false;
    const elements = p.elements.map((e) => {
      if (e.type !== "attachment" || !e.block) return e;
      const b = e.block;
      if (b.kind === "tape" && b.revealed) { pc = true; return { ...e, block: { ...b, revealed: false } }; }
      if (b.kind === "quiz" && b.picked >= 0) { pc = true; return { ...e, block: { ...b, picked: -1 } }; }
      if (b.kind === "flashcard" && b.flipped) { pc = true; return { ...e, block: { ...b, flipped: false } }; }
      return e;
    }) as HirakuElement[];
    if (!pc) return p;
    changed = true;
    return { ...p, elements };
  });
  return changed ? { ...doc, pages } : doc;
}

export interface ExamScore { quizzes: number; answered: number; right: number; tapes: number; revealed: number }
export function examScore(doc: HirakuDoc): ExamScore {
  const s: ExamScore = { quizzes: 0, answered: 0, right: 0, tapes: 0, revealed: 0 };
  for (const p of doc.pages) for (const e of p.elements) {
    if (e.type !== "attachment" || !e.block) continue;
    const b = e.block;
    if (b.kind === "quiz") { s.quizzes++; if (b.picked >= 0) { s.answered++; if (b.picked === b.answer) s.right++; } }
    if (b.kind === "tape") { s.tapes++; if (b.revealed) s.revealed++; }
  }
  return s;
}

// ---------- estatísticas ----------

export interface DayStat { focus: number; pomodoros: number; reviewed: number; right: number }
export type Stats = Record<string, DayStat>;
export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const emptyDay = (): DayStat => ({ focus: 0, pomodoros: 0, reviewed: 0, right: 0 });

export function addStat(stats: Stats, t: number, p: Partial<DayStat>): Stats {
  const k = dayKey(t), cur = stats[k] ?? emptyDay();
  return { ...stats, [k]: { focus: cur.focus + (p.focus ?? 0), pomodoros: cur.pomodoros + (p.pomodoros ?? 0), reviewed: cur.reviewed + (p.reviewed ?? 0), right: cur.right + (p.right ?? 0) } };
}

/** Últimos `n` dias (do mais antigo ao de hoje). */
export function lastDays(stats: Stats, now: number, n = 7): { key: string; label: string; s: DayStat }[] {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = now - i * DAY, k = dayKey(t);
    out.push({ key: k, label: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][new Date(t).getDay()], s: stats[k] ?? emptyDay() });
  }
  return out;
}

/** Dias seguidos com algum estudo (até hoje, ou até ontem se hoje ainda não teve). */
export function streak(stats: Stats, now: number): number {
  const has = (k: string) => { const s = stats[k]; return !!s && (s.focus > 0 || s.reviewed > 0); };
  let i = has(dayKey(now)) ? 0 : 1, n = 0;
  while (has(dayKey(now - i * DAY)) && n < 3650) { n++; i++; }
  return n;
}

export function cleanStats(v: unknown): Stats {
  const out: Stats = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, d] of Object.entries(v as Record<string, Partial<DayStat>>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !d) continue;
    const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 0);
    out[k] = { focus: n(d.focus), pomodoros: n(d.pomodoros), reviewed: n(d.reviewed), right: n(d.right) };
  }
  return out;
}

// ---------- apresentação ----------

/** Quadros de primeiro nível na ordem de leitura (linhas de cima para baixo, esquerda para a direita; nome "1.", "2."… vence). */
export function slideOrder(els: HirakuElement[]): FrameElement[] {
  const frames = els.filter((e): e is FrameElement => e.type === "frame" && !e.frameId && !e.invisible);
  const num = (f: FrameElement) => { const m = /^\s*(\d+)[.)\-:\s]/.exec(f.title + " "); return m ? +m[1] : null; };
  if (frames.length && frames.every((f) => num(f) !== null)) return frames.sort((a, b) => num(a)! - num(b)!);
  const rows: FrameElement[][] = [];
  for (const f of [...frames].sort((a, b) => a.y - b.y)) {
    const row = rows.find((r) => Math.abs(r[0].y + r[0].h / 2 - (f.y + f.h / 2)) < Math.min(r[0].h, f.h) / 2);
    if (row) row.push(f); else rows.push([f]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x));
}

// ---------- áudio sincronizado ----------

export interface AudioMark { id: ID; at: number }
export interface Recording { id: ID; name: string; data: string; mime: string; start: number; duration: number; marks: AudioMark[] }

/** Elementos ainda não escritos no instante `t` (ms desde o início da gravação). */
export function notYetWritten(rec: Recording, t: number): Set<ID> {
  return new Set(rec.marks.filter((m) => m.at > t).map((m) => m.id));
}
/** Instante da gravação em que o elemento foi escrito (ou null). */
export const markOf = (rec: Recording, id: ID) => rec.marks.find((m) => m.id === id)?.at ?? null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanRecordings(v: any): Recording[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Recording[] = [];
  for (const r of v) {
    if (!r || typeof r.id !== "string" || typeof r.data !== "string" || !r.data.startsWith("data:audio/")) continue;
    out.push({
      id: r.id, name: typeof r.name === "string" ? r.name.slice(0, 80) : "Gravação", data: r.data,
      mime: typeof r.mime === "string" ? r.mime.slice(0, 60) : "audio/webm",
      start: Number.isFinite(r.start) ? r.start : 0, duration: Number.isFinite(r.duration) ? Math.max(0, r.duration) : 0,
      marks: Array.isArray(r.marks) ? r.marks.filter((m: AudioMark) => m && typeof m.id === "string" && Number.isFinite(m.at)).map((m: AudioMark) => ({ id: m.id, at: Math.max(0, m.at) })) : [],
    });
  }
  return out.length ? out : undefined;
}

/** Adiciona/remove uma gravação da página. */
export const withRecording = (p: Page, r: Recording): Page => ({ ...p, recordings: [...(p.recordings ?? []), r] });
export const withoutRecording = (p: Page, id: ID): Page => {
  const list = (p.recordings ?? []).filter((r) => r.id !== id);
  const next: Page = { ...p, recordings: list };
  if (!list.length) delete next.recordings;
  return next;
};
