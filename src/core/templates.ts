// Modelos prontos: cada um GERA elementos nativos editáveis (formas, textos, setas, quadros), já dentro de um quadro
// com título — mover o quadro leva o modelo inteiro. Puro: as miniaturas da galeria desenham exatamente estes elementos.
import { solveArrow } from "./binding";
import { ArrowHead, FontFamily, FrameElement, HirakuElement, ID, LinearElement, ShapeElement, ShapeType, TextAlign, TextElement, isLinear, newId } from "./model";
import { elementBounds } from "./selection";
import { makeText } from "./text";

export type TemplateCategory = "organizar" | "estudar" | "estrategia" | "diagramas" | "apresentar";

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: "organizar", label: "Organizar" },
  { id: "estudar", label: "Estudar" },
  { id: "estrategia", label: "Estratégia" },
  { id: "diagramas", label: "Diagramas" },
  { id: "apresentar", label: "Apresentar" },
];

export interface Template {
  id: string;
  name: string;
  hint: string;
  category: TemplateCategory;
  build: () => HirakuElement[];
}

// ---------------- paleta ----------------
const INK = "#1B2233";
const SOFT = "#52627A";
export const T = {
  blue: { fill: "#DCE6FB", stroke: "#4D6FC4", ink: "#23396F" },
  green: { fill: "#DAF1E2", stroke: "#3E9A66", ink: "#1E5638" },
  yellow: { fill: "#FFF1B8", stroke: "#D9A92A", ink: "#6B4E00" },
  red: { fill: "#FBDDDA", stroke: "#D2554A", ink: "#7A221A" },
  purple: { fill: "#E8DEFA", stroke: "#7B57C9", ink: "#3F2378" },
  teal: { fill: "#D5F0F1", stroke: "#2B9AA0", ink: "#11545A" },
  gray: { fill: "#EEF1F6", stroke: "#AAB4C4", ink: INK },
  white: { fill: "#FFFFFF", stroke: "#CAD2DF", ink: INK },
};
type Tone = (typeof T)[keyof typeof T];

// ---------------- construtor ----------------
class Builder {
  els: HirakuElement[] = [];
  frame: ID | null = null;

  push<E extends HirakuElement>(e: E): E {
    const withFrame = this.frame && e.type !== "frame" ? ({ ...e, frameId: this.frame } as E) : e;
    this.els.push(withFrame);
    return withFrame;
  }

  box(x: number, y: number, w: number, h: number, tone: Tone, o: { type?: ShapeType; rounded?: boolean; dashed?: boolean; sw?: number; fill?: string | null; alpha?: number } = {}): ShapeElement {
    return this.push({
      id: newId(), type: o.type ?? "rect", x, y, w, h, angle: 0,
      stroke: tone.stroke, strokeWidth: o.sw ?? 1.5, strokeStyle: o.dashed ? "dashed" : "solid",
      fill: o.fill === undefined ? tone.fill : o.fill, rounded: o.rounded ?? true, opacity: o.alpha ?? 1,
    });
  }

  text(x: number, y: number, text: string, o: { size?: number; color?: string; align?: TextAlign; family?: FontFamily } = {}): TextElement {
    return this.push(makeText(newId(), x, y, text, { fontSize: o.size ?? 16, fontFamily: o.family ?? "sans", align: o.align ?? "left", color: o.color ?? INK }));
  }

  /** Texto centralizado em (cx, cy). */
  label(cx: number, cy: number, text: string, o: { size?: number; color?: string; family?: FontFamily } = {}): TextElement {
    const t = makeText(newId(), 0, 0, text, { fontSize: o.size ?? 16, fontFamily: o.family ?? "sans", align: "center", color: o.color ?? INK });
    return this.push({ ...t, x: cx - t.w / 2, y: cy - t.h / 2 });
  }

  line(points: { x: number; y: number }[], o: { color?: string; sw?: number; end?: ArrowHead; start?: ArrowHead; dashed?: boolean; arrow?: boolean; curved?: boolean } = {}): LinearElement {
    return this.push({
      id: newId(), type: o.arrow || o.end ? "arrow" : "line", points, stroke: o.color ?? SOFT, strokeWidth: o.sw ?? 2,
      strokeStyle: o.dashed ? "dashed" : "solid", startHead: o.start ?? "none", endHead: o.end ?? "none", curved: o.curved ?? false, opacity: 1,
    });
  }

  /** Seta ligada a duas formas (acompanha as formas quando elas se movem). */
  connect(a: ShapeElement, b: ShapeElement, o: { color?: string; label?: string } = {}): LinearElement {
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const arrow: LinearElement = {
      id: newId(), type: "arrow", points: [ac, bc], stroke: o.color ?? SOFT, strokeWidth: 2, strokeStyle: "solid",
      startHead: "none", endHead: "triangle", curved: false, opacity: 1,
      startBinding: { elementId: a.id, u: 0, v: 0 }, endBinding: { elementId: b.id, u: 0, v: 0 },
      ...(o.label ? { label: o.label } : {}),
    };
    const byId = new Map<ID, HirakuElement>([[a.id, a], [b.id, b]]);
    return this.push(solveArrow(arrow, byId));
  }

  /** Abre um quadro com título; os elementos criados depois entram nele. */
  open(x: number, y: number, w: number, h: number, title: string, color = "#5E6B7E"): FrameElement {
    const f: FrameElement = { id: newId(), type: "frame", frameId: null, x, y, w, h, angle: 0, strokeWidth: 1.5, title, color, tint: 0.04, rounded: true, opacity: 1 };
    this.els.push(f);
    this.frame = f.id;
    return f;
  }

  /** Cartão: caixa com título em negrito-de-tamanho e um texto menor embaixo. */
  card(x: number, y: number, w: number, h: number, tone: Tone, title: string, body?: string) {
    this.box(x, y, w, h, tone);
    this.text(x + 14, y + 12, title, { size: 17, color: tone.ink });
    if (body) this.text(x + 14, y + 40, body, { size: 13, color: SOFT });
  }
}

// ---------------- modelos ----------------
export const TEMPLATES: Template[] = [
  {
    id: "postits", name: "Post-its", hint: "Três notas adesivas coloridas", category: "organizar",
    build() {
      const b = new Builder();
      b.open(0, 0, 660, 250, "Post-its", "#D9A92A");
      [T.yellow, T.red, T.green].forEach((tone, i) => {
        b.box(24 + i * 210, 30, 190, 190, tone, { rounded: false, sw: 0 });
        b.text(40 + i * 210, 46, ["Ideia", "Lembrete", "Feito!"][i], { size: 20, color: tone.ink, family: "hand" });
        b.text(40 + i * 210, 84, "Escreva aqui…", { size: 15, color: tone.ink, family: "hand" });
      });
      return b.els;
    },
  },
  {
    id: "todo", name: "Lista de tarefas", hint: "Caixinhas para marcar e prioridade", category: "organizar",
    build() {
      const b = new Builder();
      b.open(0, 0, 420, 400, "Tarefas", "#4D6FC4");
      b.text(24, 24, "Hoje", { size: 26 });
      for (let i = 0; i < 7; i++) {
        const y = 80 + i * 42;
        b.box(26, y, 22, 22, T.white, { rounded: false });
        b.line([{ x: 62, y: y + 22 }, { x: 330, y: y + 22 }], { color: "#D4DAE5", sw: 1 });
        if (i < 3) b.box(346, y + 3, 46, 18, [T.red, T.yellow, T.green][i], { sw: 0 });
      }
      b.text(62, 82, "Primeira tarefa", { size: 15, color: SOFT });
      return b.els;
    },
  },
  {
    id: "kanban", name: "Kanban", hint: "A fazer · Fazendo · Feito", category: "organizar",
    build() {
      const b = new Builder();
      b.open(0, 0, 720, 430, "Kanban", "#4D6FC4");
      const cols = [["A fazer", T.gray], ["Fazendo", T.yellow], ["Feito", T.green]] as const;
      cols.forEach(([name, tone], i) => {
        const x = 20 + i * 232;
        b.box(x, 20, 216, 390, T.gray, { fill: "#F5F7FB" });
        b.box(x, 20, 216, 44, tone, { sw: 0 });
        b.text(x + 14, 32, name, { size: 18, color: tone.ink });
        for (let k = 0; k < (i === 0 ? 3 : i === 1 ? 2 : 1); k++) {
          b.box(x + 12, 78 + k * 86, 192, 74, T.white);
          b.text(x + 24, 90 + k * 86, "Tarefa", { size: 15 });
          b.box(x + 24, 120 + k * 86, 52, 14, [T.blue, T.purple, T.teal][k], { sw: 0 });
        }
      });
      return b.els;
    },
  },
  {
    id: "week", name: "Semana", hint: "Planejamento de 7 dias", category: "organizar",
    build() {
      const b = new Builder();
      const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
      b.open(0, 0, 20 + days.length * 132, 360, "Semana", "#2B9AA0");
      days.forEach((d, i) => {
        const x = 16 + i * 132;
        const tone = i >= 5 ? T.purple : T.teal;
        b.box(x, 16, 124, 40, tone, { sw: 0 });
        b.label(x + 62, 36, d, { size: 17, color: tone.ink });
        b.box(x, 62, 124, 280, T.white);
        for (let k = 1; k < 6; k++) b.line([{ x: x + 10, y: 62 + k * 46 }, { x: x + 114, y: 62 + k * 46 }], { color: "#E2E7EF", sw: 1 });
      });
      return b.els;
    },
  },
  {
    id: "timeline", name: "Linha do tempo", hint: "Marcos em ordem", category: "organizar",
    build() {
      const b = new Builder();
      b.open(0, 0, 760, 260, "Linha do tempo", "#7B57C9");
      b.line([{ x: 30, y: 130 }, { x: 730, y: 130 }], { color: "#7B57C9", sw: 4, end: "triangle" });
      const tones = [T.blue, T.green, T.yellow, T.red, T.purple];
      for (let i = 0; i < 5; i++) {
        const x = 70 + i * 140;
        const up = i % 2 === 0;
        b.box(x - 9, 121, 18, 18, tones[i], { type: "ellipse", sw: 2 });
        b.line([{ x, y: up ? 121 : 139 }, { x, y: up ? 92 : 168 }], { color: tones[i].stroke, sw: 2 });
        b.card(x - 60, up ? 26 : 168, 120, 66, tones[i], `Etapa ${i + 1}`, "Data");
      }
      return b.els;
    },
  },
  {
    id: "table", name: "Tabela", hint: "Grade 4 × 4 com cabeçalho", category: "organizar",
    build() {
      const b = new Builder();
      const cw = 150, rh = 46, n = 4;
      b.open(0, 0, cw * n + 40, rh * 5 + 40, "Tabela", "#4D6FC4");
      for (let r = 0; r < 5; r++) for (let c = 0; c < n; c++) {
        const head = r === 0;
        b.box(20 + c * cw, 20 + r * rh, cw, rh, head ? T.blue : T.white, { rounded: false, sw: 1, fill: head ? T.blue.fill : r % 2 ? "#FFFFFF" : "#F6F8FC" });
        if (head) b.label(20 + c * cw + cw / 2, 20 + rh / 2, `Coluna ${c + 1}`, { size: 15, color: T.blue.ink });
      }
      return b.els;
    },
  },

  // ---------------- estudar ----------------
  {
    id: "cornell", name: "Notas Cornell", hint: "Palavras-chave · anotações · resumo", category: "estudar",
    build() {
      const b = new Builder();
      b.open(0, 0, 640, 760, "Notas Cornell", "#4D6FC4");
      b.text(24, 22, "Assunto:", { size: 18, color: SOFT });
      b.line([{ x: 24, y: 58 }, { x: 616, y: 58 }], { color: "#4D6FC4", sw: 2 });
      b.box(24, 70, 170, 520, T.blue, { fill: "#EEF3FD", sw: 0, rounded: false });
      b.text(36, 82, "Perguntas /\npalavras-chave", { size: 14, color: T.blue.ink });
      b.text(212, 82, "Anotações da aula", { size: 14, color: SOFT });
      for (let k = 1; k < 16; k++) b.line([{ x: 206, y: 82 + k * 32 }, { x: 616, y: 82 + k * 32 }], { color: "#E2E7EF", sw: 1 });
      b.line([{ x: 24, y: 604 }, { x: 616, y: 604 }], { color: "#4D6FC4", sw: 2 });
      b.box(24, 616, 592, 120, T.yellow, { fill: "#FFF8DC", sw: 0, rounded: false });
      b.text(36, 628, "Resumo", { size: 15, color: T.yellow.ink });
      return b.els;
    },
  },
  {
    id: "chapter", name: "Resumo de conteúdo", hint: "Ideia central, conceitos, exemplos e dúvidas", category: "estudar",
    build() {
      const b = new Builder();
      b.open(0, 0, 700, 520, "Resumo", "#7B57C9");
      b.box(20, 20, 660, 90, T.purple);
      b.text(40, 34, "Ideia central", { size: 20, color: T.purple.ink });
      b.text(40, 68, "Em uma frase, do que se trata?", { size: 14, color: SOFT });
      b.card(20, 126, 320, 180, T.blue, "Conceitos-chave", "• \n• \n• ");
      b.card(360, 126, 320, 180, T.green, "Exemplos", "• \n• ");
      b.card(20, 322, 320, 178, T.yellow, "Fórmulas / regras");
      b.card(360, 322, 320, 178, T.red, "Dúvidas", "?");
      return b.els;
    },
  },
  {
    id: "flashcards", name: "Flashcards", hint: "Pergunta e resposta lado a lado", category: "estudar",
    build() {
      const b = new Builder();
      b.open(0, 0, 640, 470, "Flashcards", "#2B9AA0");
      for (let i = 0; i < 3; i++) {
        const y = 24 + i * 146;
        b.box(20, y, 290, 128, T.teal);
        b.text(36, y + 12, `Pergunta ${i + 1}`, { size: 13, color: T.teal.ink });
        b.box(330, y, 290, 128, T.white, { dashed: true });
        b.text(346, y + 12, "Resposta", { size: 13, color: SOFT });
      }
      return b.els;
    },
  },
  {
    id: "studyplan", name: "Plano de estudos", hint: "Matérias × dias da semana", category: "estudar",
    build() {
      const b = new Builder();
      const days = ["Seg", "Ter", "Qua", "Qui", "Sex"];
      const subjects = ["Matemática", "Português", "Ciências", "História", "Inglês"];
      b.open(0, 0, 160 + days.length * 104 + 20, 60 + subjects.length * 56 + 20, "Plano de estudos", "#3E9A66");
      days.forEach((d, i) => b.label(160 + i * 104 + 52, 40, d, { size: 15, color: SOFT }));
      subjects.forEach((s, r) => {
        const tone = [T.blue, T.red, T.green, T.yellow, T.purple][r];
        b.box(20, 64 + r * 56, 132, 46, tone, { sw: 0 });
        b.text(32, 76 + r * 56, s, { size: 14, color: tone.ink });
        days.forEach((_, i) => b.box(160 + i * 104, 64 + r * 56, 96, 46, T.white));
      });
      return b.els;
    },
  },

  // ---------------- estratégia ----------------
  {
    id: "swot", name: "Matriz SWOT", hint: "Forças, fraquezas, oportunidades e ameaças", category: "estrategia",
    build() {
      const b = new Builder();
      b.open(0, 0, 640, 520, "SWOT", "#4D6FC4");
      const q = [["Forças", "S", T.green], ["Fraquezas", "W", T.red], ["Oportunidades", "O", T.blue], ["Ameaças", "T", T.yellow]] as const;
      q.forEach(([name, letter, tone], i) => {
        const x = 20 + (i % 2) * 304, y = 20 + Math.floor(i / 2) * 244;
        b.box(x, y, 296, 236, tone);
        b.label(x + 268, y + 30, letter, { size: 34, color: tone.stroke });
        b.text(x + 16, y + 14, name, { size: 20, color: tone.ink });
        b.text(x + 16, y + 50, "• ", { size: 15, color: SOFT });
      });
      return b.els;
    },
  },
  {
    id: "eisenhower", name: "Matriz de Eisenhower", hint: "Urgente × importante", category: "estrategia",
    build() {
      const b = new Builder();
      b.open(0, 0, 660, 560, "Prioridades", "#D2554A");
      b.label(208, 30, "Urgente", { size: 15, color: SOFT });
      b.label(512, 30, "Não urgente", { size: 15, color: SOFT });
      const q = [["Fazer agora", T.red], ["Agendar", T.blue], ["Delegar", T.yellow], ["Eliminar", T.gray]] as const;
      q.forEach(([name, tone], i) => {
        const x = 60 + (i % 2) * 304, y = 52 + Math.floor(i / 2) * 248;
        b.box(x, y, 296, 240, tone);
        b.text(x + 16, y + 14, name, { size: 20, color: tone.ink });
      });
      b.text(14, 160, "Importante", { size: 13, color: SOFT });
      b.text(14, 410, "Não\nimportante", { size: 13, color: SOFT });
      return b.els;
    },
  },
  {
    id: "proscons", name: "Prós e contras", hint: "Para decidir com calma", category: "estrategia",
    build() {
      const b = new Builder();
      b.open(0, 0, 600, 420, "Decisão", "#3E9A66");
      b.text(20, 20, "Decisão:", { size: 20 });
      b.box(20, 64, 272, 336, T.green);
      b.text(36, 78, "👍 Prós", { size: 19, color: T.green.ink });
      b.box(308, 64, 272, 336, T.red);
      b.text(324, 78, "👎 Contras", { size: 19, color: T.red.ink });
      return b.els;
    },
  },
  {
    id: "5w2h", name: "5W2H", hint: "Plano de ação em 7 perguntas", category: "estrategia",
    build() {
      const b = new Builder();
      const rows = [["O quê?", "What"], ["Por quê?", "Why"], ["Onde?", "Where"], ["Quando?", "When"], ["Quem?", "Who"], ["Como?", "How"], ["Quanto?", "How much"]];
      b.open(0, 0, 620, 40 + rows.length * 56, "5W2H", "#7B57C9");
      rows.forEach(([pt, en], i) => {
        const tone = i < 5 ? T.purple : T.blue;
        b.box(20, 20 + i * 56, 150, 48, tone, { sw: 0 });
        b.text(32, 26 + i * 56, pt, { size: 16, color: tone.ink });
        b.text(32, 48 + i * 56, en, { size: 11, color: SOFT });
        b.box(180, 20 + i * 56, 420, 48, T.white);
      });
      return b.els;
    },
  },
  {
    id: "bmc", name: "Canvas de negócio", hint: "Business Model Canvas (9 blocos)", category: "estrategia",
    build() {
      const b = new Builder();
      b.open(0, 0, 1000, 600, "Modelo de negócio", "#2B9AA0");
      const W = 192;
      const cell = (x: number, y: number, w: number, h: number, t: string, tone: Tone) => { b.box(x, y, w, h, tone, { fill: "#FFFFFF" }); b.text(x + 12, y + 10, t, { size: 14, color: tone.ink }); };
      cell(20, 20, W, 380, "Parceiros-chave", T.blue);
      cell(20 + W, 20, W, 190, "Atividades-chave", T.blue);
      cell(20 + W, 210, W, 190, "Recursos-chave", T.blue);
      cell(20 + 2 * W, 20, W, 380, "Proposta de valor", T.red);
      cell(20 + 3 * W, 20, W, 190, "Relacionamento", T.green);
      cell(20 + 3 * W, 210, W, 190, "Canais", T.green);
      cell(20 + 4 * W, 20, W, 380, "Segmentos de clientes", T.green);
      cell(20, 400, 2.5 * W, 180, "Estrutura de custos", T.yellow);
      cell(20 + 2.5 * W, 400, 2.5 * W, 180, "Fontes de receita", T.yellow);
      return b.els;
    },
  },
  {
    id: "retro", name: "Retrospectiva", hint: "Foi bem · Melhorar · Ações", category: "estrategia",
    build() {
      const b = new Builder();
      b.open(0, 0, 720, 420, "Retrospectiva", "#4D6FC4");
      ([["😀 Foi bem", T.green], ["🤔 Melhorar", T.yellow], ["🚀 Ações", T.blue]] as const).forEach(([n, tone], i) => {
        b.box(20 + i * 232, 20, 216, 380, tone);
        b.text(36 + i * 232, 34, n, { size: 19, color: tone.ink });
        b.box(34 + i * 232, 80, 188, 80, T.yellow, { rounded: false, sw: 0 });
      });
      return b.els;
    },
  },

  // ---------------- diagramas ----------------
  {
    id: "flowchart", name: "Fluxograma", hint: "Início, processo, decisão e fim ligados", category: "diagramas",
    build() {
      const b = new Builder();
      b.open(0, 0, 560, 640, "Fluxograma", "#4D6FC4");
      const start = b.box(200, 30, 160, 60, T.green, { type: "ellipse" });
      b.label(280, 60, "Início", { size: 17, color: T.green.ink });
      const p1 = b.box(190, 140, 180, 70, T.blue);
      b.label(280, 175, "Processo", { size: 17, color: T.blue.ink });
      const d = b.box(190, 260, 180, 120, T.yellow, { type: "diamond" });
      b.label(280, 320, "Condição?", { size: 16, color: T.yellow.ink });
      const p2 = b.box(30, 430, 180, 70, T.blue);
      b.label(120, 465, "Se sim", { size: 16, color: T.blue.ink });
      const p3 = b.box(350, 430, 180, 70, T.purple);
      b.label(440, 465, "Se não", { size: 16, color: T.purple.ink });
      const end = b.box(200, 550, 160, 60, T.red, { type: "ellipse" });
      b.label(280, 580, "Fim", { size: 17, color: T.red.ink });
      b.connect(start, p1);
      b.connect(p1, d);
      b.connect(d, p2);
      b.connect(d, p3);
      b.connect(p2, end);
      b.connect(p3, end);
      b.text(150, 380, "sim", { size: 13, color: SOFT });
      b.text(380, 380, "não", { size: 13, color: SOFT });
      return b.els;
    },
  },
  {
    id: "venn", name: "Diagrama de Venn", hint: "Três conjuntos sobrepostos", category: "diagramas",
    build() {
      const b = new Builder();
      b.open(0, 0, 560, 520, "Venn", "#7B57C9");
      b.box(80, 40, 260, 260, T.blue, { type: "ellipse", alpha: 0.75 });
      b.box(220, 40, 260, 260, T.red, { type: "ellipse", alpha: 0.75 });
      b.box(150, 200, 260, 260, T.green, { type: "ellipse", alpha: 0.75 });
      b.label(160, 140, "A", { size: 24, color: T.blue.ink });
      b.label(400, 140, "B", { size: 24, color: T.red.ink });
      b.label(280, 400, "C", { size: 24, color: T.green.ink });
      b.label(280, 230, "A∩B∩C", { size: 13, color: INK });
      return b.els;
    },
  },
  {
    id: "fishbone", name: "Espinha de peixe", hint: "Causa e efeito (Ishikawa)", category: "diagramas",
    build() {
      const b = new Builder();
      b.open(0, 0, 820, 440, "Causa e efeito", "#D2554A");
      b.line([{ x: 40, y: 220 }, { x: 640, y: 220 }], { color: INK, sw: 3, end: "triangle" });
      b.box(650, 180, 150, 80, T.red);
      b.label(725, 220, "Problema", { size: 18, color: T.red.ink });
      const cats = ["Método", "Máquina", "Material", "Pessoas", "Medição", "Ambiente"];
      cats.forEach((c, i) => {
        const x = 140 + (i % 3) * 180;
        const top = i < 3;
        b.line([{ x: x - 70, y: top ? 70 : 370 }, { x: x + 20, y: 220 }], { color: SOFT, sw: 2 });
        const tone = [T.blue, T.green, T.yellow, T.purple, T.teal, T.gray][i];
        b.box(x - 130, top ? 34 : 370, 120, 36, tone, { sw: 0 });
        b.label(x - 70, top ? 52 : 388, c, { size: 15, color: tone.ink });
      });
      return b.els;
    },
  },
  {
    id: "pdca", name: "Ciclo PDCA", hint: "Planejar, fazer, checar, agir", category: "diagramas",
    build() {
      const b = new Builder();
      b.open(0, 0, 520, 520, "PDCA", "#3E9A66");
      const q = [["Planejar", T.blue, 40, 40], ["Fazer", T.green, 270, 40], ["Agir", T.red, 40, 270], ["Checar", T.yellow, 270, 270]] as const;
      for (const [n, tone, x, y] of q) { b.box(x, y, 210, 210, tone); b.label(x + 105, y + 105, n, { size: 22, color: tone.ink }); }
      b.line([{ x: 250, y: 120 }, { x: 270, y: 120 }], { end: "triangle", color: INK });
      b.line([{ x: 375, y: 250 }, { x: 375, y: 270 }], { end: "triangle", color: INK });
      b.line([{ x: 270, y: 400 }, { x: 250, y: 400 }], { end: "triangle", color: INK });
      b.line([{ x: 145, y: 270 }, { x: 145, y: 250 }], { end: "triangle", color: INK });
      return b.els;
    },
  },
  {
    id: "org", name: "Organograma", hint: "Hierarquia em árvore", category: "diagramas",
    build() {
      const b = new Builder();
      b.open(0, 0, 760, 380, "Organograma", "#4D6FC4");
      const top = b.box(300, 30, 160, 64, T.blue);
      b.label(380, 62, "Diretoria", { size: 17, color: T.blue.ink });
      for (let i = 0; i < 3; i++) {
        const m = b.box(40 + i * 240, 160, 200, 60, T.purple);
        b.label(140 + i * 240, 190, `Área ${i + 1}`, { size: 16, color: T.purple.ink });
        b.connect(top, m);
        for (let k = 0; k < 2; k++) {
          const s = b.box(40 + i * 240 + k * 104, 280, 96, 50, T.white);
          b.label(88 + i * 240 + k * 104, 305, "Equipe", { size: 13 });
          b.connect(m, s);
        }
      }
      return b.els;
    },
  },

  // ---------------- apresentar ----------------
  {
    id: "slides", name: "Slides", hint: "Três slides 16:9 para apresentar", category: "apresentar",
    build() {
      const b = new Builder();
      b.open(0, 0, 1060, 290, "Apresentação", "#7B57C9");
      for (let i = 0; i < 3; i++) {
        const x = 20 + i * 344;
        b.box(x, 30, 328, 184.5, T.white, { rounded: false, sw: 1 });
        b.box(x, 30, 328, 10, [T.purple, T.red, T.teal][i], { rounded: false, sw: 0, fill: [T.purple, T.red, T.teal][i].stroke });
        b.text(x + 20, 58, i === 0 ? "Título da apresentação" : `Tópico ${i}`, { size: i === 0 ? 20 : 18 });
        b.text(x + 20, 96, i === 0 ? "Seu nome · data" : "• Ponto principal\n• Detalhe", { size: 13, color: SOFT });
        b.text(x + 4, 224, `Slide ${i + 1}`, { size: 12, color: SOFT });
      }
      return b.els;
    },
  },
  {
    id: "doc", name: "Página A4", hint: "Folha em branco com título e linhas", category: "apresentar",
    build() {
      const b = new Builder();
      b.open(0, 0, 595, 842, "Documento", "#5E6B7E");
      b.box(0, 0, 595, 842, T.white, { rounded: false, sw: 0 });
      b.text(56, 56, "Título", { size: 30 });
      b.text(56, 104, "Subtítulo ou data", { size: 15, color: SOFT });
      for (let k = 0; k < 20; k++) b.line([{ x: 56, y: 170 + k * 30 }, { x: 539, y: 170 + k * 30 }], { color: "#E7EBF2", sw: 1 });
      return b.els;
    },
  },
  {
    id: "storyboard", name: "Storyboard", hint: "6 quadros com legenda", category: "apresentar",
    build() {
      const b = new Builder();
      b.open(0, 0, 760, 520, "Storyboard", "#D9A92A");
      for (let i = 0; i < 6; i++) {
        const x = 20 + (i % 3) * 246, y = 24 + Math.floor(i / 3) * 246;
        b.box(x, y, 230, 150, T.white, { rounded: false });
        b.text(x + 6, y + 6, String(i + 1), { size: 13, color: SOFT });
        b.line([{ x, y: y + 178 }, { x: x + 230, y: y + 178 }], { color: "#D4DAE5", sw: 1 });
        b.line([{ x, y: y + 206 }, { x: x + 230, y: y + 206 }], { color: "#D4DAE5", sw: 1 });
      }
      return b.els;
    },
  },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);

/** Desloca os elementos para que o centro deles fique em (cx, cy). */
export function placeAt(els: HirakuElement[], cx: number, cy: number): HirakuElement[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of els) {
    const b = elementBounds(e);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  const dx = Math.round(cx - (minX + maxX) / 2), dy = Math.round(cy - (minY + maxY) / 2);
  return els.map((e) => shift(e, dx, dy));
}

export function shift(e: HirakuElement, dx: number, dy: number): HirakuElement {
  if (e.type === "stroke") return { ...e, points: e.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) };
  if (isLinear(e)) return { ...e, points: e.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  const b = e as Extract<HirakuElement, { x: number }>;
  return { ...b, x: b.x + dx, y: b.y + dy } as HirakuElement;
}
