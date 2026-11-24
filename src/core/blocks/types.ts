// Tipos de bloco. Cada um guarda os SEUS dados (não é um desenho composto): é isso que dá comportamento próprio.
export interface TodoItem { text: string; done: boolean }
export interface TimelineItem { date: string; text: string }
export interface KanbanColumn { title: string; cards: string[] }
export interface Pair { a: string; b: string }
export interface Mark { day: number; text: string }
export interface Goal { text: string; value: number; max: number }
export interface GanttTask { text: string; start: number; end: number }
export interface Col { title: string; body: string }
export interface SubPage { id: string; parentId: string; title: string; icon: string; md: string }

export type BlockSpec =
  // ---- 0.7 ----
  | { kind: "sticky"; text: string; color: string }
  | { kind: "card"; title: string; body: string; color: string; icon?: string }
  | { kind: "todo"; title: string; items: TodoItem[]; color: string }
  | { kind: "table"; rows: string[][]; header: boolean; color: string }
  | { kind: "timeline"; title: string; items: TimelineItem[]; color: string }
  | { kind: "kanban"; title: string; columns: KanbanColumn[]; color: string }
  | { kind: "slide"; title: string; body: string; color: string; number: number }
  | { kind: "doc"; title: string; body: string; color: string }
  | { kind: "callout"; icon: string; title?: string; text: string; color: string }
  | { kind: "code"; lang: string; code: string; color: string }
  // ---- texto ----
  | { kind: "heading"; text: string; level: 1 | 2 | 3; color: string }
  | { kind: "text"; text: string; style: "plain" | "box" | "note" | "footnote"; color: string }
  | { kind: "list"; title: string; items: string[]; style: "bullet" | "number" | "arrow"; color: string }
  | { kind: "quote"; text: string; author: string; color: string }
  | { kind: "definition"; label: string; term: string; text: string; color: string }
  | { kind: "glossary"; title: string; items: Pair[]; color: string }
  | { kind: "qa"; q: string; a: string; color: string }
  | { kind: "math"; label: string; expr: string; color: string }
  // ---- planejamento ----
  | { kind: "calendar"; title: string; year: number; month: number; marks: Mark[]; color: string }
  | { kind: "week"; title: string; days: string[]; color: string }
  | { kind: "habit"; title: string; habits: string[]; days: number; checks: boolean[][]; color: string }
  | { kind: "progress"; title: string; items: Goal[]; color: string }
  | { kind: "matrix2"; title: string; xLabel: string; yLabel: string; labels: string[]; cells: string[]; color: string }
  | { kind: "gantt"; title: string; periods: string[]; tasks: GanttTask[]; color: string }
  | { kind: "proscons"; title: string; pros: string[]; cons: string[]; color: string }
  // ---- estudos ----
  | { kind: "flashcard"; front: string; back: string; flipped: boolean; color: string; srs?: Srs }
  | { kind: "tape"; revealed: boolean; label: string; pattern: "stripes" | "solid" | "dots"; color: string }
  | { kind: "quiz"; question: string; options: string[]; answer: number; picked: number; color: string }
  | { kind: "steps"; title: string; items: string[]; color: string }
  | { kind: "exercise"; label: string; statement: string; solution: string; shown: boolean; color: string }
  | { kind: "reference"; authors: string; title: string; source: string; year: string; note: string; color: string }
  | { kind: "compare"; title: string; cols: Col[]; color: string }
  // ---- matemática ----
  | { kind: "matrix"; name: string; rows: string[][]; brackets: "square" | "round" | "bar"; color: string }
  | { kind: "system"; eqs: string[]; color: string }
  | { kind: "chart"; title: string; chart: "bar" | "line" | "pie"; items: Pair[]; color: string }
  | { kind: "theorem"; label: string; name: string; text: string; color: string }
  // ---- layouts ----
  | { kind: "profile"; name: string; role: string; text: string; emoji: string; color: string }
  | { kind: "media"; media: string; title: string; creator: string; year: string; rating: number; note: string; color: string }
  | { kind: "project"; title: string; status: string; owner: string; due: string; progress: number; text: string; color: string }
  | { kind: "section"; title: string; color: string }
  | { kind: "brace"; side: "left" | "right" | "top" | "bottom"; shape: "curly" | "square"; text: string; color: string }
  | { kind: "sheet"; pattern: "blank" | "ruled" | "grid" | "dots"; title: string; color: string }
  // ---- adesivos ----
  | { kind: "sticker"; style: "emoji" | "badge" | "stamp" | "tape"; emoji: string; text: string; color: string; tilt: number }
  // ---- página (editor do Hiraku Comic Manager) ----
  | { kind: "page"; title: string; icon: string; md: string; pages: SubPage[]; color: string };

/** Repetição espaçada (SM-2) de um flashcard: facilidade, intervalo em dias, acertos seguidos e próxima revisão (ms). */
export interface Srs { ease: number; interval: number; reps: number; due: number; lapses: number }

export type BlockKind = BlockSpec["kind"];
export type SpecOf<K extends BlockKind> = Extract<BlockSpec, { kind: K }>;

/** Conteúdo "neutro" de qualquer bloco: é o que permite transformar um bloco em outro sem perder o texto. */
export interface BlockContent { title?: string; text?: string; items?: { text: string; done?: boolean; sub?: string }[] }
