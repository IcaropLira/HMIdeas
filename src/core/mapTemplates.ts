// Modelos de mapa mental: lista com recuo + tema + layout. Viram mapas de verdade (nós editáveis, layout automático).
import { HirakuElement, MapLayout } from "./model";
import { MAP_THEMES, Measure, applyMapTheme, approxMeasure, mapFromOutline, parseOutline, relayout, styleNodes } from "./mindmap";

export interface MapTemplate { id: string; name: string; hint: string; theme: string; layout: MapLayout; outline: string }

export const MAP_TEMPLATES: MapTemplate[] = [
  { id: "brainstorm", name: "Brainstorm", hint: "Ideias soltas em volta de um tema", theme: "rainbow", layout: "both",
    outline: "Tema\n  Ideia 1\n    detalhe\n  Ideia 2\n  Ideia 3\n    detalhe\n  Ideia 4\n  Ideia 5\n  Ideia 6" },
  { id: "study", name: "Estudo de um assunto", hint: "Conceitos, exemplos, fórmulas e dúvidas", theme: "ocean", layout: "both",
    outline: "Assunto\n  Conceitos\n    definição\n    propriedades\n  Exemplos\n    exemplo 1\n    exemplo 2\n  Fórmulas\n  Exercícios\n  Dúvidas" },
  { id: "project", name: "Projeto", hint: "Objetivo, etapas, pessoas, prazos e riscos", theme: "classic", layout: "right",
    outline: "Projeto\n  Objetivo\n  Etapas\n    1. Planejar\n    2. Executar\n    3. Entregar\n  Pessoas\n  Prazos\n  Riscos\n  Recursos" },
  { id: "book", name: "Resumo de livro", hint: "Personagens, enredo, temas e citações", theme: "pastel", layout: "both",
    outline: "Livro\n  Autor e contexto\n  Personagens\n    protagonista\n    antagonista\n  Enredo\n    início\n    conflito\n    desfecho\n  Temas\n  Citações\n  Minha opinião" },
  { id: "decision", name: "Tomada de decisão", hint: "Opções com prós e contras", theme: "forest", layout: "down",
    outline: "Decisão\n  Opção A\n    prós\n    contras\n  Opção B\n    prós\n    contras\n  Opção C\n    prós\n    contras" },
  { id: "swotmap", name: "SWOT em mapa", hint: "Forças, fraquezas, oportunidades e ameaças", theme: "sticky", layout: "both",
    outline: "Análise SWOT\n  Forças\n  Fraquezas\n  Oportunidades\n  Ameaças" },
  { id: "whys", name: "5 porquês", hint: "Chegar à causa raiz de um problema", theme: "minimal", layout: "right",
    outline: "Problema\n  Por quê?\n    Por quê?\n      Por quê?\n        Por quê?\n          Causa raiz" },
  { id: "week", name: "Semana", hint: "Tarefas por dia", theme: "night", layout: "both",
    outline: "Semana\n  Segunda\n  Terça\n  Quarta\n  Quinta\n  Sexta\n  Fim de semana" },
  { id: "code", name: "Arquitetura de software", hint: "Camadas e módulos de um sistema", theme: "classic", layout: "down",
    outline: "Sistema\n  Front-end\n    telas\n    estado\n  Back-end\n    API\n    regras\n  Dados\n    banco\n    cache\n  Infra" },
];

/** Monta o mapa do modelo com a raiz em (x, y). */
export function buildMapTemplate(t: MapTemplate, measure: Measure = approxMeasure, at = { x: 0, y: 0 }): HirakuElement[] {
  const a = mapFromOutline([], parseOutline(t.outline), at, measure);
  if (!a) return [];
  const theme = MAP_THEMES.find((x) => x.id === t.theme) ?? MAP_THEMES[0];
  let els = styleNodes(a.elements, [a.id], { layout: t.layout }, measure);
  els = applyMapTheme(els, a.id, theme, measure);
  return relayout(els);
}
