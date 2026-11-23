// Biblioteca de blocos: variações prontas ("presets") de cada tipo, organizadas por categoria, com palavras de busca.
// Um preset é só um tipo + campos alterados (+ tamanho). Itens que são FERRAMENTAS do app (seta, mapa, imagem…) ficam na UI.
import { BLOCK_COLORS, STICKY_COLORS } from "./kit";
import { BlockKind, BlockSpec } from "./types";
import { defaultBlock, defaultBlockSize } from "./index";

export type LibCategory = "texto" | "destaques" | "planejamento" | "estudos" | "matematica" | "layouts" | "adesivos" | "paginas";
export const LIB_CATEGORIES: { id: LibCategory; label: string; icon: string }[] = [
  { id: "texto", label: "Texto", icon: "¶" },
  { id: "destaques", label: "Destaques", icon: "💡" },
  { id: "planejamento", label: "Planejamento", icon: "📅" },
  { id: "estudos", label: "Estudos", icon: "🎓" },
  { id: "matematica", label: "Matemática", icon: "∑" },
  { id: "layouts", label: "Layouts", icon: "▦" },
  { id: "adesivos", label: "Adesivos", icon: "⭐" },
  { id: "paginas", label: "Páginas", icon: "📄" },
];

export interface LibItem { id: string; label: string; cat: LibCategory; kind: BlockKind; patch?: Record<string, unknown>; size?: { w: number; h: number }; keys?: string }

const C = BLOCK_COLORS, S = STICKY_COLORS;
const callout = (id: string, label: string, icon: string, color: string, text: string, keys = ""): LibItem => ({ id, label, cat: "destaques", kind: "callout", patch: { icon, title: label, text, color }, keys });
const badge = (text: string, color: string, emoji = ""): LibItem => ({ id: "badge-" + text.toLowerCase(), label: text, cat: "adesivos", kind: "sticker", patch: { style: "badge", text, emoji, color, tilt: -5 }, keys: "selo etiqueta badge" });
const emoji = (e: string, label: string): LibItem => ({ id: "emoji-" + label, label, cat: "adesivos", kind: "sticker", patch: { style: "emoji", emoji: e, text: "", tilt: [-8, 6, -3, 9][label.length % 4] }, keys: "emoji adesivo sticker " + label });

export const LIBRARY: LibItem[] = [
  // ---- texto ----
  { id: "sticky", label: "Post-it", cat: "texto", kind: "sticky", keys: "nota adesiva" },
  { id: "sticky-quick", label: "Nota rápida", cat: "texto", kind: "sticky", patch: { text: "Lembrete rápido", color: S[4] }, size: { w: 160, h: 160 }, keys: "post-it pequeno" },
  { id: "card", label: "Cartão de texto", cat: "texto", kind: "card", keys: "cartão título descrição" },
  { id: "heading-1", label: "Título", cat: "texto", kind: "heading", keys: "heading h1" },
  { id: "heading-2", label: "Subtítulo", cat: "texto", kind: "heading", patch: { text: "Subtítulo", level: 2 }, keys: "heading h2" },
  { id: "text", label: "Parágrafo", cat: "texto", kind: "text", keys: "texto livre" },
  { id: "text-box", label: "Caixa de texto", cat: "texto", kind: "text", patch: { style: "box" }, keys: "texto caixa" },
  { id: "text-note", label: "Nota lateral", cat: "texto", kind: "text", patch: { style: "note", text: "Observação ao lado do conteúdo principal." }, size: { w: 240, h: 90 } },
  { id: "text-foot", label: "Nota de rodapé", cat: "texto", kind: "text", patch: { style: "footnote", text: "¹ Fonte ou explicação complementar." }, size: { w: 320, h: 50 } },
  { id: "list-bullet", label: "Lista com marcadores", cat: "texto", kind: "list", keys: "bullets" },
  { id: "list-number", label: "Lista numerada", cat: "texto", kind: "list", patch: { style: "number", title: "Passos" } },
  { id: "todo", label: "Lista de tarefas", cat: "texto", kind: "todo", keys: "checklist tarefas" },
  { id: "checklist", label: "Checklist", cat: "texto", kind: "todo", patch: { title: "Checklist", color: C[0] } },
  { id: "quote", label: "Citação", cat: "texto", kind: "quote", keys: "citação frase" },
  { id: "definition", label: "Definição", cat: "texto", kind: "definition" },
  { id: "concept", label: "Conceito", cat: "texto", kind: "definition", patch: { label: "Conceito", term: "Nome do conceito", text: "Explique com suas palavras.", color: C[4] } },
  { id: "glossary", label: "Glossário", cat: "texto", kind: "glossary", keys: "vocabulário termos" },
  { id: "qa", label: "Pergunta e resposta", cat: "texto", kind: "qa", keys: "p&r faq" },
  { id: "code", label: "Código", cat: "texto", kind: "code", keys: "programação" },
  { id: "doc", label: "Bloco de Markdown", cat: "texto", kind: "doc", keys: "documento markdown" },
  { id: "summary", label: "Resumo", cat: "texto", kind: "callout", patch: { icon: "📝", title: "Resumo", text: "Em poucas frases: o que é mais importante?", color: C[0] } },

  // ---- destaques ----
  { id: "callout", label: "Destaque", cat: "destaques", kind: "callout" },
  callout("alert", "Alerta", "⛔", C[1], "Isto exige atenção imediata.", "perigo erro"),
  callout("warning", "Aviso", "⚠️", C[3], "Cuidado com este ponto.", "atenção"),
  callout("info", "Informação", "ℹ️", C[0], "Um dado útil para entender o contexto."),
  callout("tip", "Dica", "💡", C[3], "Um atalho ou truque que ajuda."),
  callout("attention", "Atenção", "❗", C[1], "Não esqueça disto."),
  callout("important", "Importante", "📌", C[6], "O ponto que mais importa."),
  callout("curiosity", "Curiosidade", "🤔", C[4], "Algo interessante sobre o tema."),
  callout("example", "Exemplo", "🧪", C[5], "Um exemplo concreto."),
  callout("observation", "Observação", "👁️", C[7], "Um detalhe a observar."),
  callout("conclusion", "Conclusão", "🏁", C[2], "O que concluímos."),
  callout("main-idea", "Ideia principal", "🎯", C[4], "A ideia central em uma frase."),
  callout("reminder", "Lembrete", "⏰", C[3], "Fazer isto até sexta."),
  callout("positive", "Ponto positivo", "👍", C[2], "O que funciona bem."),
  callout("negative", "Ponto negativo", "👎", C[1], "O que precisa melhorar."),
  callout("question-box", "Caixa de pergunta", "❓", C[0], "Qual é a dúvida?"),
  callout("answer-box", "Caixa de resposta", "✅", C[2], "A resposta é…"),
  { id: "proscons", label: "Prós e contras", cat: "destaques", kind: "proscons", keys: "vantagens desvantagens" },

  // ---- planejamento ----
  { id: "table", label: "Tabela", cat: "planejamento", kind: "table" },
  { id: "kanban", label: "Kanban", cat: "planejamento", kind: "kanban", keys: "quadro de tarefas" },
  { id: "backlog", label: "Backlog", cat: "planejamento", kind: "kanban", patch: { title: "Backlog", columns: [{ title: "Backlog", cards: ["Ideia 1", "Ideia 2", "Ideia 3"] }, { title: "Próxima sprint", cards: [] }, { title: "Em andamento", cards: [] }, { title: "Feito", cards: [] }] }, size: { w: 900, h: 380 } },
  { id: "timeline", label: "Linha do tempo", cat: "planejamento", kind: "timeline" },
  { id: "calendar", label: "Calendário", cat: "planejamento", kind: "calendar", keys: "mês agenda" },
  { id: "week", label: "Planejamento semanal", cat: "planejamento", kind: "week", keys: "semana agenda" },
  { id: "gantt", label: "Cronograma", cat: "planejamento", kind: "gantt", keys: "gantt roadmap" },
  { id: "roadmap", label: "Roadmap", cat: "planejamento", kind: "gantt", patch: { title: "Roadmap", periods: ["T1", "T2", "T3", "T4"], tasks: [{ text: "Descoberta", start: 0, end: 0 }, { text: "MVP", start: 1, end: 1 }, { text: "Beta", start: 2, end: 2 }, { text: "Lançamento", start: 3, end: 3 }] }, size: { w: 500, h: 230 } },
  { id: "habit", label: "Rastreador de hábitos", cat: "planejamento", kind: "habit", keys: "hábitos tracker" },
  { id: "progress", label: "Quadro de metas", cat: "planejamento", kind: "progress", keys: "progresso objetivos" },
  { id: "eisenhower", label: "Matriz de Eisenhower", cat: "planejamento", kind: "matrix2", keys: "prioridades urgente importante" },
  { id: "swot", label: "Matriz SWOT", cat: "planejamento", kind: "matrix2", patch: { title: "SWOT", xLabel: "", yLabel: "", labels: ["Forças", "Fraquezas", "Oportunidades", "Ameaças"], color: C[2] }, keys: "fofa forças fraquezas" },
  { id: "effort", label: "Esforço × impacto", cat: "planejamento", kind: "matrix2", patch: { title: "Esforço × impacto", xLabel: "Pouco esforço → Muito esforço", yLabel: "Alto impacto → Baixo impacto", labels: ["Ganhos rápidos", "Grandes projetos", "Tarefas leves", "Evitar"], color: C[0] } },
  { id: "priorities", label: "Lista de prioridades", cat: "planejamento", kind: "list", patch: { title: "Prioridades", style: "number", items: ["Mais importante", "Segundo", "Terceiro"], color: C[1] } },
  { id: "project", label: "Cartão de projeto", cat: "planejamento", kind: "project" },
  { id: "action-plan", label: "Plano de ação", cat: "planejamento", kind: "table", patch: { rows: [["O quê", "Quem", "Quando", "Como"], ["", "", "", ""], ["", "", "", ""]], color: C[4] }, size: { w: 560, h: 120 } },

  // ---- estudos ----
  { id: "flashcard", label: "Flashcard", cat: "estudos", kind: "flashcard", keys: "frente e verso cartão" },
  { id: "quiz", label: "Múltipla escolha", cat: "estudos", kind: "quiz", keys: "questão teste" },
  { id: "exercise", label: "Exercício", cat: "estudos", kind: "exercise", keys: "questão discursiva resolução" },
  { id: "steps", label: "Passo a passo", cat: "estudos", kind: "steps" },
  { id: "worked", label: "Exemplo resolvido", cat: "estudos", kind: "steps", patch: { title: "Exemplo resolvido", items: ["Dados: …", "Fórmula: …", "Cálculo: …", "Resposta: …"], color: C[2] } },
  { id: "class-notes", label: "Anotação de aula", cat: "estudos", kind: "doc", patch: { title: "Aula de hoje", body: "# Tema\n\n# Pontos principais\n- \n- \n\n# Dúvidas\n- " } },
  { id: "review", label: "Ficha de revisão", cat: "estudos", kind: "card", patch: { title: "📚 Ficha de revisão", body: "Conceitos:\n• \nFórmulas:\n• \nErros comuns:\n• ", color: C[5] }, size: { w: 300, h: 220 } },
  { id: "compare", label: "Quadro comparativo", cat: "estudos", kind: "compare" },
  { id: "vocab", label: "Vocabulário", cat: "estudos", kind: "glossary", patch: { title: "Vocabulário", items: [{ a: "word", b: "palavra" }, { a: "book", b: "livro" }] } },
  { id: "reading", label: "Ficha de leitura", cat: "estudos", kind: "reference", keys: "livro leitura resumo" },
  { id: "reference", label: "Referência bibliográfica", cat: "estudos", kind: "reference", patch: { note: "" }, keys: "bibliografia citação abnt" },
  { id: "formulas", label: "Tabela de fórmulas", cat: "estudos", kind: "table", patch: { rows: [["Grandeza", "Fórmula", "Unidade"], ["Velocidade", "v = Δs/Δt", "m/s"], ["Força", "F = m·a", "N"]], color: C[4] }, size: { w: 420, h: 120 } },

  // ---- matemática ----
  { id: "math", label: "Fórmula", cat: "matematica", kind: "math", keys: "equação" },
  { id: "equation", label: "Equação", cat: "matematica", kind: "math", patch: { label: "Equação (1)", expr: "E = mc^2" } },
  { id: "integral", label: "Integral", cat: "matematica", kind: "math", patch: { label: "Integral", expr: "int_0^1 x^2 dx = 1/3" } },
  { id: "derivative", label: "Derivada", cat: "matematica", kind: "math", patch: { label: "Derivada", expr: "d/dx (x^n) = n·x^(n-1)" } },
  { id: "sum", label: "Somatório", cat: "matematica", kind: "math", patch: { label: "Somatório", expr: "sum_(i=1)^n i = n(n+1)/2" } },
  { id: "limit", label: "Limite", cat: "matematica", kind: "math", patch: { label: "Limite", expr: "lim (x -> 0) sin(x)/x = 1" } },
  { id: "system", label: "Sistema de equações", cat: "matematica", kind: "system" },
  { id: "matrix", label: "Matriz", cat: "matematica", kind: "matrix" },
  { id: "vector", label: "Vetor", cat: "matematica", kind: "matrix", patch: { name: "v =", rows: [["3"], ["-1"], ["2"]], brackets: "round" }, size: { w: 130, h: 150 } },
  { id: "determinant", label: "Determinante", cat: "matematica", kind: "matrix", patch: { name: "det A =", rows: [["a", "b"], ["c", "d"]], brackets: "bar" }, size: { w: 230, h: 120 } },
  { id: "chart-bar", label: "Gráfico de barras", cat: "matematica", kind: "chart" },
  { id: "chart-line", label: "Gráfico de linhas", cat: "matematica", kind: "chart", patch: { chart: "line", title: "Temperatura" } },
  { id: "chart-pie", label: "Gráfico de setores", cat: "matematica", kind: "chart", patch: { chart: "pie", title: "Divisão", items: [{ a: "A", b: "40" }, { a: "B", b: "30" }, { a: "C", b: "20" }, { a: "D", b: "10" }] } },
  { id: "values", label: "Tabela de valores", cat: "matematica", kind: "table", patch: { rows: [["x", "f(x)"], ["0", ""], ["1", ""], ["2", ""]], color: C[4] }, size: { w: 220, h: 160 } },
  { id: "theorem", label: "Teorema", cat: "matematica", kind: "theorem" },
  { id: "lemma", label: "Lema", cat: "matematica", kind: "theorem", patch: { label: "Lema", name: "", text: "Enunciado do lema." } },
  { id: "proposition", label: "Proposição", cat: "matematica", kind: "theorem", patch: { label: "Proposição", name: "", text: "Enunciado." } },
  { id: "proof", label: "Prova", cat: "matematica", kind: "theorem", patch: { label: "Prova", name: "", text: "Suponha que… Então… Logo, vale o enunciado." }, keys: "demonstração" },
  { id: "algorithm", label: "Algoritmo", cat: "matematica", kind: "code", patch: { lang: "algoritmo", code: "algoritmo MDC(a, b)\n  enquanto b ≠ 0 faça\n    t ← b\n    b ← a mod b\n    a ← t\n  retorne a" } },
  { id: "pseudocode", label: "Pseudocódigo", cat: "matematica", kind: "code", patch: { lang: "pseudocódigo", code: "início\n  leia n\n  se n mod 2 = 0 então\n    escreva \"par\"\n  senão\n    escreva \"ímpar\"\nfim" } },

  // ---- layouts ----
  { id: "section", label: "Seção / grupo", cat: "layouts", kind: "section", keys: "grupo de ideias área" },
  { id: "profile", label: "Cartão de pessoa", cat: "layouts", kind: "profile", keys: "personagem contato" },
  { id: "book", label: "Cartão de livro", cat: "layouts", kind: "media" },
  { id: "movie", label: "Cartão de filme", cat: "layouts", kind: "media", patch: { media: "Filme", title: "Título do filme", creator: "Direção", color: C[1] } },
  { id: "idea", label: "Cartão de ideia", cat: "layouts", kind: "card", patch: { icon: "💡", title: "Ideia", body: "Descreva a ideia e por que ela importa.", color: C[3] } },
  { id: "compare-2", label: "Comparação lado a lado", cat: "layouts", kind: "compare" },
  { id: "before-after", label: "Antes e depois", cat: "layouts", kind: "compare", patch: { title: "Antes e depois", cols: [{ title: "Antes", body: "- como era" }, { title: "Depois", body: "- como ficou" }] } },
  { id: "slide", label: "Slide", cat: "layouts", kind: "slide", keys: "apresentação" },
  { id: "brace", label: "Chave {", cat: "layouts", kind: "brace", keys: "agrupar colchete" },
  { id: "bracket", label: "Colchete [", cat: "layouts", kind: "brace", patch: { shape: "square" } },
  { id: "sheet-ruled", label: "Folha pautada", cat: "layouts", kind: "sheet", keys: "escrever à mão caneta" },
  { id: "sheet-grid", label: "Folha quadriculada", cat: "layouts", kind: "sheet", patch: { pattern: "grid" } },
  { id: "sheet-dots", label: "Folha pontilhada", cat: "layouts", kind: "sheet", patch: { pattern: "dots" } },
  { id: "sheet-blank", label: "Área de desenho", cat: "layouts", kind: "sheet", patch: { pattern: "blank", title: "Esboço" }, keys: "tela desenho esboço" },

  // ---- adesivos ----
  emoji("⭐", "Estrela"), emoji("❤️", "Coração"), emoji("🔥", "Fogo"), emoji("✅", "Certo"), emoji("❌", "Errado"), emoji("💡", "Ideia"),
  emoji("📌", "Alfinete"), emoji("🎯", "Alvo"), emoji("🚀", "Foguete"), emoji("👀", "Olhos"), emoji("🤔", "Pensando"), emoji("🎉", "Festa"),
  emoji("📚", "Livros"), emoji("🧠", "Cérebro"), emoji("⏰", "Relógio"), emoji("🏆", "Troféu"), emoji("👍", "Joinha"), emoji("⚡", "Raio"),
  badge("IMPORTANTE", C[1], "❗"), badge("NOVO", C[0], "✨"), badge("FEITO", C[2], "✓"), badge("REVISAR", C[3], "↻"), badge("URGENTE", C[1], "⏰"),
  badge("DÚVIDA", C[4], "?"), badge("IDEIA", C[3], "💡"), badge("PROVA", C[6], "📝"),
  { id: "stamp-ok", label: "Carimbo aprovado", cat: "adesivos", kind: "sticker", patch: { style: "stamp", text: "Aprovado", emoji: "", color: C[2], tilt: -12 } },
  { id: "stamp-rev", label: "Carimbo revisado", cat: "adesivos", kind: "sticker", patch: { style: "stamp", text: "Revisado", emoji: "✓", color: C[0], tilt: 8 } },
  { id: "stamp-top", label: "Carimbo top", cat: "adesivos", kind: "sticker", patch: { style: "stamp", text: "Top!", emoji: "⭐", color: C[1], tilt: -6 } },
  ...[["Fita amarela", "#E9C46A"], ["Fita rosa", "#F4A6C0"], ["Fita azul", "#8ECAE6"], ["Fita verde", "#95D5B2"], ["Fita lilás", "#C8B6FF"]].map(([label, color], i): LibItem => ({ id: "tape-" + i, label, cat: "adesivos", kind: "sticker", patch: { style: "tape", text: "", emoji: "", color, tilt: [-4, 3, -2, 5, -6][i] }, keys: "washi fita adesiva" })),

  // ---- páginas ----
  { id: "page", label: "Página", cat: "paginas", kind: "page", keys: "notion documento editor manager" },
  { id: "page-notes", label: "Página de notas", cat: "paginas", kind: "page", patch: { title: "Notas", icon: "📝", md: "## Hoje\n- \n\n## Para lembrar\n- [ ] " } },
  { id: "page-study", label: "Página de estudo", cat: "paginas", kind: "page", patch: { title: "Resumo da matéria", icon: "📚", md: "[toc]\n\n# Conceitos\n- \n\n# Fórmulas\n$$\nE = mc^2\n$$\n\n# Exercícios\n- [ ] Lista 1\n- [ ] Lista 2\n\n<details open><summary>Dúvidas</summary>\n- \n</details>" } },
  { id: "page-budget", label: "Planilha de gastos", cat: "paginas", kind: "page", patch: { title: "Gastos do mês", icon: "💰", color: C[2], md: "<!--sheet-->\n| Item | Valor |\n| --- | --- |\n| Aluguel | 1200 |\n| Mercado | 650 |\n| Transporte | 180 |\n| Total | =SOMA(B1:B3) |" } },
  { id: "page-meeting", label: "Ata de reunião", cat: "paginas", kind: "page", patch: { title: "Reunião", icon: "🗓️", color: C[7], md: "> [!info] ℹ️ Data · participantes\n\n## Pauta\n1. \n\n## Decisões\n- \n\n## Ações\n- [ ] " } },
];

/** Bloco pronto de um item da biblioteca. */
export function libSpec(item: LibItem): BlockSpec {
  const base = defaultBlock(item.kind);
  return { ...base, ...(item.patch ?? {}) } as BlockSpec;
}
export function libSize(item: LibItem): { w: number; h: number } {
  return item.size ?? defaultBlockSize(libSpec(item));
}
export function searchLibrary(q: string, cat?: LibCategory): LibItem[] {
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const t = n(q.trim());
  return LIBRARY.filter((i) => (!cat || i.cat === cat) && (!t || n(`${i.label} ${i.keys ?? ""} ${i.kind}`).includes(t)));
}
