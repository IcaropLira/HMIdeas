// Modelos prontos = CONJUNTOS DE BLOCOS nativos (post-it, tarefas, tabela, linha do tempo, kanban, slide, documento…;
// core/blocks.ts) e, nos diagramas, formas + setas ligadas — tudo dentro de um quadro com título (mover o quadro leva o modelo). Puro: as miniaturas da galeria desenham exatamente estes elementos.
import { Bindable, solveArrow } from "./binding";
import { BLOCK_COLORS, BlockSpec, STICKY_COLORS, blockContentHeight, defaultBlockSize } from "./blocks";
import { blockAt } from "./blockElement";
import { ArrowHead, AttachmentElement, FontFamily, FrameElement, HirakuElement, ID, LinearElement, ShapeElement, ShapeType, TextAlign, TextElement, isLinear, newId } from "./model";
import { elementBounds } from "./selection";
import { makeText } from "./text";
import { Measure } from "./mindmap";
import { MAP_TEMPLATES, buildMapTemplate } from "./mapTemplates";

export type TemplateCategory = "organizar" | "estudar" | "estrategia" | "diagramas" | "apresentar" | "mapas";

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: "organizar", label: "Organizar" },
  { id: "estudar", label: "Estudar" },
  { id: "estrategia", label: "Estratégia" },
  { id: "diagramas", label: "Diagramas" },
  { id: "apresentar", label: "Apresentar" },
  { id: "mapas", label: "Mapas mentais" },
];

export interface Template {
  id: string;
  name: string;
  hint: string;
  category: TemplateCategory;
  /** `measure` mede textos de verdade na hora de inserir (as prévias usam uma aproximação). */
  build: (measure?: Measure) => HirakuElement[];
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

  /** Bloco nativo (post-it, cartão, tarefas, tabela…) com canto em (x, y). Listas e cartões crescem para caber o texto. */
  block(spec: BlockSpec, x: number, y: number, w?: number, h?: number): AttachmentElement {
    const s = defaultBlockSize(spec);
    const W = w ?? s.w;
    const H = Math.max(h ?? s.h, blockContentHeight(spec, W));
    return this.push(blockAt(spec, x, y, W, H));
  }

  /** Ajusta o quadro aberto para envolver o conteúdo (margem `pad`) e devolve os elementos. */
  fit(pad = 24): HirakuElement[] {
    const f = this.els.find((e): e is FrameElement => e.type === "frame" && e.id === this.frame);
    if (!f) return this.els;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of this.els) {
      if (e === f) continue;
      const bb = elementBounds(e);
      minX = Math.min(minX, bb.minX); minY = Math.min(minY, bb.minY); maxX = Math.max(maxX, bb.maxX); maxY = Math.max(maxY, bb.maxY);
    }
    if (!Number.isFinite(minX)) return this.els;
    const nf = { ...f, x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
    return this.els.map((e) => (e === f ? nf : e));
  }

  /** Seta ligada a duas formas/blocos (acompanha quando eles se movem). */
  connect(a: Bindable, b: Bindable, o: { color?: string; label?: string } = {}): LinearElement {
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
  // ---------------- organizar ----------------
  {
    id: "brainstorm", name: "Brainstorm", hint: "Seis post-its coloridos para soltar ideias", category: "organizar",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Brainstorm", "#D9A92A");
      const ideas = ["Ideia maluca", "E se…?", "Problema a resolver", "Referência", "Pergunta", "Próximo passo"];
      ideas.forEach((t, i) => b.block({ kind: "sticky", text: t, color: STICKY_COLORS[i % STICKY_COLORS.length] }, 24 + (i % 3) * 196, 30 + Math.floor(i / 3) * 196, 176, 176));
      return b.fit();
    },
  },
  {
    id: "postits", name: "Post-its", hint: "Três notas adesivas", category: "organizar",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Post-its", "#D9A92A");
      ["Ideia", "Lembrete", "Feito!"].forEach((t, i) => b.block({ kind: "sticky", text: `${t}\nEscreva aqui…`, color: [STICKY_COLORS[0], STICKY_COLORS[2], STICKY_COLORS[5]][i] }, 24 + i * 220, 30, 200, 200));
      return b.fit();
    },
  },
  {
    id: "todo", name: "Lista de tarefas", hint: "Hoje e esta semana, com caixinhas que marcam", category: "organizar",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Tarefas", "#3E9A66");
      b.block({ kind: "todo", title: "Hoje", color: BLOCK_COLORS[2], items: ["Responder mensagens", "Revisar anotações", "Exercícios", "Academia", "Ler 20 páginas"].map((text, i) => ({ text, done: i === 0 })) }, 24, 30, 300);
      b.block({ kind: "todo", title: "Esta semana", color: BLOCK_COLORS[0], items: ["Entregar trabalho", "Marcar reunião", "Organizar arquivos"].map((text) => ({ text, done: false })) }, 344, 30, 300);
      b.block({ kind: "callout", icon: "🎯", text: "Foco do dia: uma coisa importante de cada vez.", color: BLOCK_COLORS[3] }, 344, 230, 300, 80);
      return b.fit();
    },
  },
  {
    id: "kanban", name: "Kanban", hint: "A fazer · Fazendo · Feito", category: "organizar",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Kanban", "#4D6FC4");
      b.block({ kind: "kanban", title: "Projeto", color: BLOCK_COLORS[0], columns: [{ title: "A fazer", cards: ["Pesquisar referências", "Escrever rascunho", "Montar apresentação"] }, { title: "Fazendo", cards: ["Protótipo"] }, { title: "Revisão", cards: ["Texto da introdução"] }, { title: "Feito", cards: ["Definir tema"] }] }, 24, 30, 900, 400);
      return b.fit();
    },
  },
  {
    id: "week", name: "Semana", hint: "Sete listas, uma por dia", category: "organizar",
    build() {
      const b = new Builder();
      const days = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
      b.open(0, 0, 0, 0, "Semana", "#2B9AA0");
      days.forEach((d, i) => b.block({ kind: "todo", title: d, color: i >= 5 ? BLOCK_COLORS[4] : BLOCK_COLORS[5], items: [{ text: "", done: false }, { text: "", done: false }, { text: "", done: false }] }, 24 + (i % 4) * 236, 30 + Math.floor(i / 4) * 230, 220, 210));
      b.block({ kind: "sticky", text: "Metas da semana", color: STICKY_COLORS[0] }, 24 + 3 * 236, 260, 220, 210);
      return b.fit();
    },
  },
  {
    id: "timeline", name: "Linha do tempo", hint: "Marcos com data, distribuídos sozinhos", category: "organizar",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Linha do tempo", "#7B57C9");
      b.block({ kind: "timeline", title: "Projeto", color: BLOCK_COLORS[4], items: [{ date: "Jan", text: "Ideia" }, { date: "Mar", text: "Pesquisa" }, { date: "Mai", text: "Protótipo" }, { date: "Ago", text: "Testes" }, { date: "Nov", text: "Lançamento" }] }, 24, 30, 820, 190);
      return b.fit();
    },
  },
  {
    id: "table", name: "Tabela", hint: "Tabela de verdade: células editáveis, + linha/coluna", category: "organizar",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Tabela", "#4D6FC4");
      b.block({ kind: "table", header: true, color: BLOCK_COLORS[0], rows: [["Item", "Responsável", "Prazo", "Status"], ["", "", "", ""], ["", "", "", ""], ["", "", "", ""], ["", "", "", ""]] }, 24, 30, 600, 230);
      return b.fit();
    },
  },
  {
    id: "meeting", name: "Reunião", hint: "Pauta, decisões e ações com dono", category: "organizar",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Reunião", "#5E6B7E");
      b.block({ kind: "doc", title: "Pauta", color: BLOCK_COLORS[7], body: "Data · participantes\n\n# Tópicos\n- abertura\n- status\n- próximos passos" }, 24, 30, 340, 420);
      b.block({ kind: "table", header: true, color: BLOCK_COLORS[0], rows: [["Decisão", "Por quê"], ["", ""], ["", ""]] }, 384, 30, 380, 130);
      b.block({ kind: "todo", title: "Ações", color: BLOCK_COLORS[2], items: [{ text: "Fulano: enviar resumo", done: false }, { text: "Ciclana: atualizar planilha", done: false }] }, 384, 180, 380);
      return b.fit();
    },
  },

  // ---------------- estudar ----------------
  {
    id: "cornell", name: "Notas Cornell", hint: "Palavras-chave · anotações · resumo", category: "estudar",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Notas Cornell", "#4D6FC4");
      b.block({ kind: "card", title: "Perguntas", body: "Palavras-chave e perguntas que a aula responde.", color: BLOCK_COLORS[0] }, 24, 30, 200, 520);
      b.block({ kind: "doc", title: "Anotações da aula", color: BLOCK_COLORS[0], body: "# Assunto\nAnote aqui durante a aula.\n\n- ideia\n- exemplo" }, 240, 30, 420, 520);
      b.block({ kind: "callout", icon: "📝", text: "Resumo: em 2–3 frases, o que você aprendeu?", color: BLOCK_COLORS[3] }, 24, 566, 636, 100);
      return b.fit();
    },
  },
  {
    id: "chapter", name: "Resumo de conteúdo", hint: "Ideia central, conceitos, exemplos e dúvidas", category: "estudar",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Resumo", "#7B57C9");
      b.block({ kind: "callout", icon: "💡", text: "Ideia central: em uma frase, do que se trata?", color: BLOCK_COLORS[4] }, 24, 30, 660, 80);
      b.block({ kind: "card", title: "Conceitos-chave", body: "• \n• \n• ", color: BLOCK_COLORS[0] }, 24, 126, 320, 180);
      b.block({ kind: "card", title: "Exemplos", body: "• \n• ", color: BLOCK_COLORS[2] }, 364, 126, 320, 180);
      b.block({ kind: "card", title: "Fórmulas / regras", body: "", color: BLOCK_COLORS[3] }, 24, 322, 320, 180);
      b.block({ kind: "todo", title: "Dúvidas", color: BLOCK_COLORS[1], items: [{ text: "Perguntar ao professor…", done: false }] }, 364, 322, 320, 180);
      return b.fit();
    },
  },
  {
    id: "flashcards", name: "Flashcards", hint: "Pergunta e resposta lado a lado", category: "estudar",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Flashcards", "#2B9AA0");
      for (let i = 0; i < 3; i++) {
        const y = 30 + i * 150;
        b.block({ kind: "card", title: `Pergunta ${i + 1}`, body: "Escreva a pergunta…", color: BLOCK_COLORS[5] }, 24, y, 290, 130);
        b.block({ kind: "sticky", text: "Resposta", color: STICKY_COLORS[5] }, 334, y, 290, 130);
      }
      return b.fit();
    },
  },
  {
    id: "studyplan", name: "Plano de estudos", hint: "Matérias × dias da semana", category: "estudar",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Plano de estudos", "#3E9A66");
      const days = ["Seg", "Ter", "Qua", "Qui", "Sex"];
      const subjects = ["Matemática", "Português", "Ciências", "História", "Inglês"];
      b.block({ kind: "table", header: true, color: BLOCK_COLORS[2], rows: [["", ...days], ...subjects.map((s) => [s, "", "", "", "", ""])] }, 24, 30, 700, 280);
      b.block({ kind: "todo", title: "Metas", color: BLOCK_COLORS[2], items: [{ text: "Revisar a matéria da semana", done: false }, { text: "Fazer 1 simulado", done: false }] }, 744, 30, 260);
      return b.fit();
    },
  },
  {
    id: "code", name: "Estudo de código", hint: "Código, explicação e pontos de atenção", category: "estudar",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Estudo de código", "#3D4557");
      const code = b.block({ kind: "code", lang: "python", color: BLOCK_COLORS[7], code: "def busca_binaria(v, x):\n    lo, hi = 0, len(v) - 1\n    while lo <= hi:\n        m = (lo + hi) // 2\n        if v[m] == x: return m\n        if v[m] < x: lo = m + 1\n        else: hi = m - 1\n    return -1" }, 24, 30, 460, 250);
      const card = b.block({ kind: "card", title: "Como funciona", body: "Divide o intervalo ao meio a cada passo: O(log n).", color: BLOCK_COLORS[0] }, 560, 30, 280, 150);
      b.connect(code, card);
      b.block({ kind: "callout", icon: "⚠️", text: "Só funciona com o vetor ORDENADO.", color: BLOCK_COLORS[1] }, 560, 200, 280, 80);
      return b.fit();
    },
  },

  // ---------------- estratégia ----------------
  {
    id: "swot", name: "Matriz SWOT", hint: "Forças, fraquezas, oportunidades e ameaças", category: "estrategia",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "SWOT", "#4D6FC4");
      const q = [["Forças (S)", BLOCK_COLORS[2]], ["Fraquezas (W)", BLOCK_COLORS[1]], ["Oportunidades (O)", BLOCK_COLORS[0]], ["Ameaças (T)", BLOCK_COLORS[3]]] as const;
      q.forEach(([name, color], i) => b.block({ kind: "card", title: name, body: "• \n• \n• ", color }, 24 + (i % 2) * 316, 30 + Math.floor(i / 2) * 236, 300, 220));
      return b.fit();
    },
  },
  {
    id: "eisenhower", name: "Matriz de Eisenhower", hint: "Urgente × importante, com listas", category: "estrategia",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Prioridades", "#D2554A");
      b.label(214, 40, "Urgente", { size: 15, color: SOFT });
      b.label(530, 40, "Não urgente", { size: 15, color: SOFT });
      b.text(14, 170, "Importante", { size: 13, color: SOFT });
      b.text(14, 420, "Não\nimportante", { size: 13, color: SOFT });
      const q = [["Fazer agora", BLOCK_COLORS[1]], ["Agendar", BLOCK_COLORS[0]], ["Delegar", BLOCK_COLORS[3]], ["Eliminar", BLOCK_COLORS[7]]] as const;
      q.forEach(([name, color], i) => b.block({ kind: "todo", title: name, color, items: [{ text: "", done: false }, { text: "", done: false }, { text: "", done: false }] }, 64 + (i % 2) * 316, 60 + Math.floor(i / 2) * 250, 300, 236));
      return b.fit();
    },
  },
  {
    id: "proscons", name: "Prós e contras", hint: "Para decidir com calma", category: "estrategia",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Decisão", "#3E9A66");
      b.block({ kind: "callout", icon: "❓", text: "Decisão: escreva aqui a pergunta.", color: BLOCK_COLORS[7] }, 24, 30, 580, 70);
      b.block({ kind: "card", title: "👍 Prós", body: "• \n• \n• ", color: BLOCK_COLORS[2] }, 24, 116, 282, 280);
      b.block({ kind: "card", title: "👎 Contras", body: "• \n• \n• ", color: BLOCK_COLORS[1] }, 322, 116, 282, 280);
      return b.fit();
    },
  },
  {
    id: "5w2h", name: "5W2H", hint: "Plano de ação em 7 perguntas", category: "estrategia",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "5W2H", "#7B57C9");
      const rows = ["O quê? (What)", "Por quê? (Why)", "Onde? (Where)", "Quando? (When)", "Quem? (Who)", "Como? (How)", "Quanto? (How much)"];
      b.block({ kind: "table", header: true, color: BLOCK_COLORS[4], rows: [["Pergunta", "Resposta"], ...rows.map((r) => [r, ""])] }, 24, 30, 620, 360);
      return b.fit();
    },
  },
  {
    id: "bmc", name: "Canvas de negócio", hint: "Business Model Canvas (9 blocos)", category: "estrategia",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Modelo de negócio", "#2B9AA0");
      const W = 196, G = 8;
      const cell = (x: number, y: number, w: number, h: number, t: string, color: string) => b.block({ kind: "card", title: t, body: "", color }, 24 + x * (W + G), 30 + y, w * W + (w - 1) * G, h);
      cell(0, 0, 1, 388, "Parceiros-chave", BLOCK_COLORS[0]);
      cell(1, 0, 1, 190, "Atividades-chave", BLOCK_COLORS[0]);
      cell(1, 198, 1, 190, "Recursos-chave", BLOCK_COLORS[0]);
      cell(2, 0, 1, 388, "Proposta de valor", BLOCK_COLORS[1]);
      cell(3, 0, 1, 190, "Relacionamento", BLOCK_COLORS[2]);
      cell(3, 198, 1, 190, "Canais", BLOCK_COLORS[2]);
      cell(4, 0, 1, 388, "Segmentos de clientes", BLOCK_COLORS[2]);
      b.block({ kind: "card", title: "Estrutura de custos", body: "", color: BLOCK_COLORS[3] }, 24, 426, 2.5 * W + 2 * G, 160);
      b.block({ kind: "card", title: "Fontes de receita", body: "", color: BLOCK_COLORS[3] }, 24 + 2.5 * W + 3 * G, 426, 2.5 * W + 1 * G, 160);
      return b.fit();
    },
  },
  {
    id: "retro", name: "Retrospectiva", hint: "Foi bem · Melhorar · Ações", category: "estrategia",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Retrospectiva", "#4D6FC4");
      b.block({ kind: "kanban", title: "Sprint", color: BLOCK_COLORS[2], columns: [{ title: "😀 Foi bem", cards: ["Entregamos no prazo"] }, { title: "🤔 Melhorar", cards: ["Menos reuniões"] }, { title: "🚀 Ações", cards: ["Revisão às sextas"] }] }, 24, 30, 700, 360);
      return b.fit();
    },
  },
  {
    id: "project", name: "Projeto", hint: "Objetivo, cronograma, kanban e riscos", category: "estrategia",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Projeto", "#4D6FC4");
      b.block({ kind: "callout", icon: "🎯", text: "Objetivo: o que muda quando o projeto terminar?", color: BLOCK_COLORS[0] }, 24, 30, 900, 70);
      b.block({ kind: "timeline", title: "Cronograma", color: BLOCK_COLORS[4], items: [{ date: "S1", text: "Kick-off" }, { date: "S3", text: "MVP" }, { date: "S6", text: "Beta" }, { date: "S8", text: "Entrega" }] }, 24, 120, 900, 170);
      b.block({ kind: "kanban", title: "Tarefas", color: BLOCK_COLORS[0], columns: [{ title: "A fazer", cards: ["Definir escopo"] }, { title: "Fazendo", cards: [] }, { title: "Feito", cards: [] }] }, 24, 310, 600, 300);
      b.block({ kind: "todo", title: "Riscos", color: BLOCK_COLORS[1], items: [{ text: "Prazo apertado", done: false }, { text: "Dependência externa", done: false }] }, 644, 310, 280);
      return b.fit();
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
    id: "slides", name: "Slides", hint: "Três slides 16:9 numerados", category: "apresentar",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Apresentação", "#7B57C9");
      const slides = [["Título da apresentação", "Seu nome · data"], ["Tópico 1", "- Ponto principal\n- Detalhe\n- Exemplo"], ["Conclusão", "- O que fica\n- Próximos passos"]];
      slides.forEach(([title, body], i) => b.block({ kind: "slide", title, body, number: i + 1, color: [BLOCK_COLORS[4], BLOCK_COLORS[1], BLOCK_COLORS[5]][i] }, 24 + i * 380, 30, 360, 202));
      return b.fit();
    },
  },
  {
    id: "doc", name: "Página A4", hint: "Documento com título, seções e listas", category: "apresentar",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Documento", "#5E6B7E");
      b.block({ kind: "doc", title: "Título", color: BLOCK_COLORS[7], body: "Subtítulo ou data\n\n# Introdução\nEscreva aqui.\n\n# Desenvolvimento\n- primeiro ponto\n- segundo ponto\n\n# Conclusão\n" }, 24, 30, 595, 842);
      return b.fit();
    },
  },
  {
    id: "diary", name: "Diário", hint: "Página do dia, gratidão e tarefas", category: "apresentar",
    build() {
      const b = new Builder();
      b.open(0, 0, 0, 0, "Diário", "#D1307A");
      b.block({ kind: "doc", title: "Hoje", color: BLOCK_COLORS[6], body: "Como foi o dia?\n\n# Destaques\n- \n\n# Aprendi\n- " }, 24, 30, 380, 480);
      b.block({ kind: "sticky", text: "Gratidão:\n1.\n2.\n3.", color: STICKY_COLORS[2] }, 424, 30, 220, 220);
      b.block({ kind: "todo", title: "Amanhã", color: BLOCK_COLORS[6], items: [{ text: "", done: false }, { text: "", done: false }] }, 424, 270, 220);
      return b.fit();
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

// mapas mentais entram na mesma galeria
for (const m of MAP_TEMPLATES) {
  TEMPLATES.push({ id: `map-${m.id}`, name: m.name, hint: m.hint, category: "mapas", build: (measure) => buildMapTemplate(m, measure) });
}

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
