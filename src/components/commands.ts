// Registro ÚNICO de comandos do app. Teclado, menus, paleta de comandos, barra contextual e o editor de atalhos
// leem daqui: um comando = id + nome + categoria + teclas padrão + o que fazer. Trocar o atalho de qualquer coisa
// é só mudar o mapa de teclas (core/keymap.ts), sem tocar no código.
import { BOOKMARK_COLORS } from "../core/notebook";
import { usePageTemplates } from "../core/pageTemplateStore";
import { create } from "zustand";
import { defaultCamera, zoomAt } from "../core/camera";
import {
  KeyScope, KeyedCommand, buildIndex, comboFromEvent, keysFor, prettyCombo, useKeymap,
} from "../core/keymap";
import { ToolId, selectActivePage, useDoc, useSel, useTool, useView } from "../core/store";
import { useUI } from "../core/ui";
import { useTheme } from "../core/theme";
import { isLinear } from "../core/model";
import { connectedVertex, isVertex, useEdgeLabel, useGraphTool } from "../core/graphEdit";
import { editSelectedBlock } from "../core/blockView";
import { usePageEdit } from "../core/pageEdit";
import { deleteSelection, duplicateSelection, editSelectedText, goPage, nudgeSelection, selectAll } from "../core/actions";
import {
  addChildToSelection, addSiblingToSelection, collapseMap, connectSelection, editSelectedLabel, fitToSelection,
  selectNeighbor, toggleCollapseSelection, ungroupSelection as unframeSelection, wrapSelectionInFrame,
} from "../core/mapActions";
import {
  currentCtx, enterGroup, exitGroup, groupSelection, hideSelection, lockSelection, releaseSelection, selectAllInContext,
  selectSameType, selectedGroup, showAll, ungroupSelectionGroups, unlockAll,
} from "../core/groupActions";
import { alignSelection, arrangeGrid, centerOnScreen, distributeSelection, equalizeSelection, flipSelection, rotateSelection } from "../core/alignActions";
import { listBrushes } from "../core/brushes";
import { downloadDoc } from "../core/serialize";
import { PANELS, PanelId, isShowing } from "../core/docking";
import { PRESETS, togglePanelCmd, useWorkspace } from "../core/workspace";
import { useLayout } from "../core/layout";
import { applyPreset, currentToolCmd, noteCommand, savePreset, startRecording, stopRecording, toggleFavorite, useToolKit } from "../core/toolKit";
import { zSelection } from "./LayersPanel";
import { copyWithMark, pasteFromButton } from "./clipboard";
import { insertBlock } from "./BlockGallery";

export type CmdCat =
  | "Arquivo" | "Editar" | "Exibir" | "Inserir" | "Objeto" | "Organizar" | "Ferramentas" | "Pincéis" | "Presets" | "Macros" | "Mapa mental" | "Janela" | "Ajuda";
export const CATEGORIES: CmdCat[] = ["Arquivo", "Editar", "Exibir", "Inserir", "Objeto", "Organizar", "Ferramentas", "Pincéis", "Presets", "Macros", "Mapa mental", "Janela", "Ajuda"];

export interface Command extends KeyedCommand {
  cat: CmdCat;
  /** Devolve `false` quando não se aplicou (a tecla passa para o próximo comando ou para o navegador). */
  run: () => void | boolean;
  /** Só vale quando… (além do escopo). */
  when?: () => boolean;
  /** Item de menu marcado (alternâncias). */
  checked?: () => boolean;
  /** Repete com a tecla segurada (mover, zoom, tamanho do pincel). */
  repeat?: boolean;
  /** Tecla que o sistema trata (Ctrl+V): aparece na lista, mas não é trocável. */
  fixed?: string;
  hint?: string;
  /** Palavras que a busca da paleta também entende ("mesmo espaço" acha Distribuir). */
  keywords?: string;
}

// ---------- contexto ----------

const page = () => selectActivePage(useDoc.getState());
const selIds = () => useSel.getState().ids;
const one = () => {
  const ids = selIds();
  if (ids.length !== 1) return undefined;
  const all = page().elements;
  return all.find((x) => x.id === ids[0]);
};
const oneVertex = () => { const e = one(); return !!e && isVertex(e, page().elements); };

export function inScope(scope: KeyScope | undefined): boolean {
  switch (scope ?? "global") {
    case "global": return true;
    case "selection": return selIds().length > 0;
    case "group": return !!selectedGroup();
    case "vertex": return oneVertex();
    case "line": { const e = one(); return !!e && isLinear(e); }
    case "node": { const e = one(); return !!e && e.type === "node" && !oneVertex(); }
  }
}

const tool = (t: ToolId) => () => useTool.getState().setTool(t);
const zoomBy = (f: number) => {
  const c = useView.getState().camera;
  useView.getState().setCamera(zoomAt(c, f, window.innerWidth / 2, window.innerHeight / 2));
};
const openInput = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.click();
const setLockedLayout = (v: boolean) => {
  useLayout.getState().setLocked(v);
  useWorkspace.getState().updateDock((L) => ({ ...L, locked: v }));
};

/** Escape em cascata: conta-gotas → sai do grupo aberto (um nível) → desmarca. */
function escape(): boolean {
  if (useTool.getState().picking) { useTool.getState().set({ picking: false }); return true; }
  if (currentCtx()) { exitGroup(); return true; }
  if (selIds().length) { useSel.getState().clear(); return true; }
  return false;
}

/** Tab num vértice: novo vértice já ligado (o novo fica selecionado → Tab de novo continua o caminho). */
function vertexTab(): boolean {
  const el = one();
  if (!el) return false;
  const all = page().elements;
  const g = useGraphTool.getState();
  const r = connectedVertex(all, el.id, { directed: g.directed, label: g.weighted ? "1" : undefined });
  if (!r) return false;
  if (el.type === "node" && !el.vertex) useDoc.getState().replaceElements([...all.map((x) => (x.id === el.id ? { ...el, vertex: true } : x)), r.vertex, r.edge]);
  else useDoc.getState().addElements([r.vertex, r.edge]);
  useSel.getState().set([r.vertex.id]);
  if (g.weighted) useEdgeLabel.getState().open(r.edge.id);
  return true;
}

const brushSize = (dir: 1 | -1) => {
  const t = useTool.getState();
  if (t.tool === "eraser") t.set({ eraserSize: Math.max(10, Math.min(80, t.eraserSize + dir * 4)) });
  else t.set({ width: Math.max(1, Math.min(14, +(t.width + dir * 0.5).toFixed(1))) });
};

// ---------- lista ----------

const TOOLS: [ToolId, string, string[]][] = [
  ["select", "Selecionar", ["V", "1"]], ["lasso", "Laço", ["L"]], ["pen", "Caneta", ["P", "7"]], ["eraser", "Borracha", ["E", "0"]],
  ["hand", "Mover tela (mão)", ["H"]], ["text", "Texto", ["T", "8"]], ["rect", "Retângulo", ["R", "2"]], ["diamond", "Losango", ["D", "3"]],
  ["ellipse", "Elipse", ["O", "4"]], ["arrow", "Seta", ["A", "5"]], ["line", "Linha", ["6"]], ["mindmap", "Mapa mental", ["M"]],
  ["frame", "Quadro", ["F"]], ["vertex", "Vértice (grafo)", ["N"]], ["edge", "Aresta (grafo)", ["G"]], ["laser", "Ponteiro laser", ["Z"]],
  ["laserpen", "Caneta laser", ["Shift+Z"]],
];

function buildCommands(): Command[] {
  const c: Command[] = [
    // Arquivo
    { id: "file.home", cat: "Arquivo", label: "Tela inicial (cadernos)", keys: ["Ctrl+Alt+H"], run: () => useUI.getState().setNotebooksOpen(true) },
    { id: "file.open", cat: "Arquivo", label: "Abrir arquivo .hiraku…", keys: ["Ctrl+O"], run: () => openInput("hm-open-input") },
    { id: "file.save", cat: "Arquivo", label: "Salvar arquivo .hiraku", keys: ["Ctrl+S"], run: () => downloadDoc(useDoc.getState().doc, useUI.getState().notebookName || "desenho") },
    { id: "file.attach", cat: "Arquivo", label: "Importar imagem, PDF ou arquivo…", keys: ["Ctrl+Shift+O"], run: () => openInput("hm-attach-input") },
    { id: "page.new", cat: "Arquivo", label: "Nova página", keys: ["Ctrl+Alt+N"], run: () => useDoc.getState().addPage() },
    { id: "page.duplicate", cat: "Arquivo", label: "Duplicar página", run: () => useDoc.getState().duplicatePage(useDoc.getState().activePageId) },
    { id: "page.rotate", cat: "Arquivo", label: "Girar folha (retrato/paisagem)", when: () => !!selectActivePage(useDoc.getState()).size, run: () => useDoc.getState().rotatePage(useDoc.getState().activePageId) },
    { id: "page.star", cat: "Arquivo", label: "Favoritar página", checked: () => !!selectActivePage(useDoc.getState()).starred, run: () => { const p = selectActivePage(useDoc.getState()); useDoc.getState().setPageMeta(p.id, { starred: !p.starred }); } },
    { id: "page.bookmark", cat: "Arquivo", label: "Marcador da página (trocar cor)", run: () => {
      const p = selectActivePage(useDoc.getState()), i = p.bookmark ? BOOKMARK_COLORS.indexOf(p.bookmark) : -1;
      useDoc.getState().setPageMeta(p.id, { bookmark: i + 1 < BOOKMARK_COLORS.length ? BOOKMARK_COLORS[i + 1] : undefined });
    } },
    { id: "page.saveTemplate", cat: "Arquivo", label: "Salvar página como modelo", run: () => {
      const p = selectActivePage(useDoc.getState());
      useUI.getState().showToast(usePageTemplates.getState().add(p, p.name) ? `Modelo “${p.name}” salvo (Páginas → ⋯).` : "Não coube no armazenamento deste dispositivo.");
    } },
    { id: "page.prev", cat: "Arquivo", label: "Página anterior", keys: ["PageUp"], run: () => goPage(-1) },
    { id: "page.next", cat: "Arquivo", label: "Próxima página", keys: ["PageDown"], run: () => goPage(1) },

    // Editar
    { id: "edit.undo", cat: "Editar", label: "Desfazer", keys: ["Ctrl+Z"], repeat: true, run: () => useDoc.getState().undo(), when: () => useDoc.getState().past.length > 0 },
    { id: "edit.redo", cat: "Editar", label: "Refazer", keys: ["Ctrl+Shift+Z", "Ctrl+Y"], repeat: true, run: () => useDoc.getState().redo(), when: () => useDoc.getState().future.length > 0 },
    { id: "edit.cut", cat: "Editar", label: "Recortar", keys: ["Ctrl+X"], scope: "selection", run: () => { copyWithMark(); deleteSelection(); } },
    { id: "edit.copy", cat: "Editar", label: "Copiar", keys: ["Ctrl+C"], scope: "selection", run: () => copyWithMark() },
    { id: "edit.paste", cat: "Editar", label: "Colar", fixed: "Ctrl+V", run: () => void pasteFromButton() },
    { id: "edit.duplicate", cat: "Editar", label: "Duplicar", keys: ["Ctrl+D"], scope: "selection", run: duplicateSelection },
    { id: "edit.delete", cat: "Editar", label: "Apagar", keys: ["Delete", "Backspace"], scope: "selection", run: deleteSelection },
    { id: "edit.selectAll", cat: "Editar", label: "Selecionar tudo (no grupo aberto)", keys: ["Ctrl+A"], run: selectAllInContext },
    { id: "edit.selectAllPage", cat: "Editar", label: "Selecionar tudo da página", keys: ["Ctrl+Alt+A"], run: () => { useSel.getState().clear(); exitGroupsAll(); selectAll(); } },
    { id: "edit.selectSame", cat: "Editar", label: "Selecionar do mesmo tipo", keys: ["Ctrl+Shift+A"], scope: "selection", run: selectSameType },
    { id: "edit.escape", cat: "Editar", label: "Desmarcar / sair do grupo", keys: ["Escape"], run: escape },
    { id: "edit.text", cat: "Editar", label: "Editar texto / rótulo / bloco", keys: ["Enter"], scope: "selection", run: () => editSelectedText() || editSelectedLabel() || editSelectedBlock() },
    { id: "edit.label", cat: "Editar", label: "Editar rótulo", keys: ["F2"], scope: "selection", run: () => editSelectedLabel() || editSelectedText() || editSelectedBlock() },
    { id: "edit.nudgeLeft", cat: "Editar", label: "Mover 1 px à esquerda", keys: ["Left"], scope: "selection", repeat: true, run: () => nudgeSelection(-1, 0) },
    { id: "edit.nudgeRight", cat: "Editar", label: "Mover 1 px à direita", keys: ["Right"], scope: "selection", repeat: true, run: () => nudgeSelection(1, 0) },
    { id: "edit.nudgeUp", cat: "Editar", label: "Mover 1 px para cima", keys: ["Up"], scope: "selection", repeat: true, run: () => nudgeSelection(0, -1) },
    { id: "edit.nudgeDown", cat: "Editar", label: "Mover 1 px para baixo", keys: ["Down"], scope: "selection", repeat: true, run: () => nudgeSelection(0, 1) },
    { id: "edit.nudgeLeft10", cat: "Editar", label: "Mover 10 px à esquerda", keys: ["Shift+Left"], scope: "selection", repeat: true, run: () => nudgeSelection(-10, 0) },
    { id: "edit.nudgeRight10", cat: "Editar", label: "Mover 10 px à direita", keys: ["Shift+Right"], scope: "selection", repeat: true, run: () => nudgeSelection(10, 0) },
    { id: "edit.nudgeUp10", cat: "Editar", label: "Mover 10 px para cima", keys: ["Shift+Up"], scope: "selection", repeat: true, run: () => nudgeSelection(0, -10) },
    { id: "edit.nudgeDown10", cat: "Editar", label: "Mover 10 px para baixo", keys: ["Shift+Down"], scope: "selection", repeat: true, run: () => nudgeSelection(0, 10) },
    { id: "edit.eyedropper", cat: "Editar", label: "Conta-gotas (pegar cor)", keys: ["I"], run: () => { useTool.getState().set({ picking: true }); useUI.getState().showToast("Toque num desenho para pegar a cor dele."); } },
    { id: "edit.settings", cat: "Editar", label: "Configurações…", keys: ["Ctrl+,"], run: () => useUI.getState().setSettingsOpen(true) },

    // Exibir
    { id: "view.zoomIn", cat: "Exibir", label: "Aproximar", keys: ["Ctrl+=", "Ctrl+Shift+=", "Ctrl++"], repeat: true, run: () => zoomBy(1.25) },
    { id: "view.zoomOut", cat: "Exibir", label: "Afastar", keys: ["Ctrl+-"], repeat: true, run: () => zoomBy(0.8) },
    { id: "view.zoom100", cat: "Exibir", label: "Zoom 100%", keys: ["Ctrl+0"], run: () => useView.getState().setCamera(defaultCamera()) },
    { id: "view.fitAll", cat: "Exibir", label: "Ver tudo", keys: ["Shift+1"], run: () => fitToSelection(true) },
    { id: "view.fitSel", cat: "Exibir", label: "Ver a seleção", keys: ["Shift+2"], run: () => fitToSelection(false) },
    { id: "view.focus", cat: "Exibir", label: "Modo foco", keys: ["Ctrl+."], checked: () => useTheme.getState().focus, run: () => useTheme.getState().setFocus(!useTheme.getState().focus) },
    { id: "view.snapGrid", cat: "Exibir", label: "Encaixar na grade", keys: ["Ctrl+'"], checked: () => useTool.getState().snapGrid, run: () => useTool.getState().set({ snapGrid: !useTool.getState().snapGrid }) },
    { id: "view.smartGuides", cat: "Exibir", label: "Guias inteligentes", keys: ["Ctrl+;"], checked: () => useTool.getState().smartGuides, run: () => useTool.getState().set({ smartGuides: !useTool.getState().smartGuides }) },
    { id: "view.pages", cat: "Exibir", label: "Barra de páginas", checked: () => useUI.getState().sidebarOpen, run: () => useUI.getState().setSidebar(!useUI.getState().sidebarOpen) },
    { id: "view.menubar", cat: "Exibir", label: "Barra de menus", checked: () => useWorkspace.getState().chrome.menubar, run: () => useWorkspace.getState().setChrome({ menubar: !useWorkspace.getState().chrome.menubar }) },
    { id: "view.optionsbar", cat: "Exibir", label: "Barra de opções", checked: () => useWorkspace.getState().chrome.optionsbar, run: () => useWorkspace.getState().setChrome({ optionsbar: !useWorkspace.getState().chrome.optionsbar }) },
    { id: "view.statusbar", cat: "Exibir", label: "Barra de status", checked: () => useWorkspace.getState().chrome.statusbar, run: () => useWorkspace.getState().setChrome({ statusbar: !useWorkspace.getState().chrome.statusbar }) },
    { id: "view.pills", cat: "Exibir", label: "Botões flutuantes do topo", checked: () => useWorkspace.getState().chrome.pills, run: () => useWorkspace.getState().setChrome({ pills: !useWorkspace.getState().chrome.pills }) },

    // Inserir
    { id: "insert.library", cat: "Inserir", label: "Biblioteca de blocos…", keys: ["B"], run: () => useUI.getState().setLibraryOpen(true) },
    { id: "insert.templates", cat: "Inserir", label: "Modelos prontos…", keys: ["Shift+T"], run: () => useUI.getState().setTemplatesOpen(true) },
    { id: "insert.mapTemplates", cat: "Inserir", label: "Mapa mental pronto…", run: () => useUI.getState().setTemplatesOpen(true, "mapas") },
    { id: "insert.sticky", cat: "Inserir", label: "Post-it", keys: ["Shift+S"], run: () => insertBlock("sticky", undefined, true) },
    { id: "insert.todo", cat: "Inserir", label: "Lista de tarefas", run: () => insertBlock("todo", undefined, true) },
    { id: "insert.table", cat: "Inserir", label: "Tabela", run: () => insertBlock("table", undefined, true) },
    { id: "insert.card", cat: "Inserir", label: "Cartão", run: () => insertBlock("card", undefined, true) },
    { id: "insert.pageBlock", cat: "Inserir", label: "Bloco Página", run: () => insertBlock("page", undefined, false) },

    // Objeto
    { id: "obj.group", cat: "Objeto", label: "Agrupar", keys: ["Ctrl+G"], scope: "selection", run: groupSelection },
    { id: "obj.ungroup", cat: "Objeto", label: "Desagrupar", keys: ["Ctrl+Shift+G"], scope: "selection", run: () => ungroupSelectionGroups() || unframeSelection() },
    { id: "obj.enter", cat: "Objeto", label: "Entrar no grupo", keys: ["Enter"], scope: "group", run: () => enterGroup() },
    { id: "obj.exit", cat: "Objeto", label: "Sair do grupo", keys: ["Shift+Escape"], run: exitGroup, when: () => !!currentCtx() },
    { id: "obj.release", cat: "Objeto", label: "Tirar do grupo", keys: ["Ctrl+Alt+Shift+G"], scope: "selection", run: releaseSelection, when: () => !!currentCtx() },
    { id: "obj.frame", cat: "Objeto", label: "Envolver em quadro", keys: ["Ctrl+Alt+G"], scope: "selection", run: wrapSelectionInFrame },
    { id: "obj.lock", cat: "Objeto", label: "Travar", keys: ["Ctrl+Shift+L"], scope: "selection", run: () => lockSelection(true) },
    { id: "obj.unlockAll", cat: "Objeto", label: "Destravar tudo", keys: ["Ctrl+Alt+Shift+L"], run: unlockAll },
    { id: "obj.hide", cat: "Objeto", label: "Ocultar", keys: ["Ctrl+Shift+H"], scope: "selection", run: () => hideSelection(true) },
    { id: "obj.showAll", cat: "Objeto", label: "Mostrar tudo", keys: ["Ctrl+Alt+Shift+H"], run: showAll },
    { id: "obj.edit", cat: "Objeto", label: "Editar bloco", scope: "selection", run: () => editSelectedBlock() },
    { id: "obj.connect", cat: "Objeto", label: "Ligar os dois selecionados com seta", keys: ["K"], run: () => connectSelection() },

    // Organizar
    { id: "arr.front", cat: "Organizar", label: "Trazer para a frente", keys: ["Ctrl+Shift+]"], scope: "selection", run: () => zSelection("front") },
    { id: "arr.forward", cat: "Organizar", label: "Avançar", keys: ["Ctrl+]"], scope: "selection", repeat: true, run: () => zSelection("forward") },
    { id: "arr.backward", cat: "Organizar", label: "Recuar", keys: ["Ctrl+["], scope: "selection", repeat: true, run: () => zSelection("backward") },
    { id: "arr.back", cat: "Organizar", label: "Enviar para trás", keys: ["Ctrl+Shift+["], scope: "selection", run: () => zSelection("back") },
    { id: "align.left", cat: "Organizar", label: "Alinhar à esquerda", keys: ["Alt+A"], scope: "selection", run: () => alignSelection("left") },
    { id: "align.hcenter", cat: "Organizar", label: "Centralizar na horizontal", keys: ["Alt+H"], scope: "selection", run: () => alignSelection("hcenter") },
    { id: "align.right", cat: "Organizar", label: "Alinhar à direita", keys: ["Alt+D"], scope: "selection", run: () => alignSelection("right") },
    { id: "align.top", cat: "Organizar", label: "Alinhar em cima", keys: ["Alt+W"], scope: "selection", run: () => alignSelection("top") },
    { id: "align.vcenter", cat: "Organizar", label: "Centralizar na vertical", keys: ["Alt+V"], scope: "selection", run: () => alignSelection("vcenter") },
    { id: "align.bottom", cat: "Organizar", label: "Alinhar embaixo", keys: ["Alt+S"], scope: "selection", run: () => alignSelection("bottom") },
    { id: "dist.h", cat: "Organizar", label: "Distribuir na horizontal (espaços iguais)", keys: ["Alt+Shift+H"], scope: "selection", run: () => distributeSelection("h") },
    { id: "dist.v", cat: "Organizar", label: "Distribuir na vertical (espaços iguais)", keys: ["Alt+Shift+V"], scope: "selection", run: () => distributeSelection("v") },
    { id: "dist.hc", cat: "Organizar", label: "Distribuir centros na horizontal", scope: "selection", run: () => distributeSelection("h", "center") },
    { id: "dist.vc", cat: "Organizar", label: "Distribuir centros na vertical", scope: "selection", run: () => distributeSelection("v", "center") },
    { id: "eq.w", cat: "Organizar", label: "Igualar larguras", scope: "selection", run: () => equalizeSelection("w") },
    { id: "eq.h", cat: "Organizar", label: "Igualar alturas", scope: "selection", run: () => equalizeSelection("h") },
    { id: "eq.both", cat: "Organizar", label: "Igualar tamanhos", scope: "selection", run: () => equalizeSelection("both") },
    { id: "arr.grid", cat: "Organizar", label: "Organizar em grade", keys: ["Alt+G"], scope: "selection", run: () => arrangeGrid() },
    { id: "arr.center", cat: "Organizar", label: "Centralizar na tela", keys: ["Alt+C"], scope: "selection", run: centerOnScreen },
    { id: "arr.flipH", cat: "Organizar", label: "Espelhar na horizontal", keys: ["Shift+H"], scope: "selection", run: () => flipSelection("h") },
    { id: "arr.flipV", cat: "Organizar", label: "Espelhar na vertical", keys: ["Shift+V"], scope: "selection", run: () => flipSelection("v") },
    { id: "arr.rotCW", cat: "Organizar", label: "Girar 90° (horário)", keys: ["Alt+R"], scope: "selection", run: () => rotateSelection(90) },
    { id: "arr.rotCCW", cat: "Organizar", label: "Girar 90° (anti-horário)", keys: ["Alt+Shift+R"], scope: "selection", run: () => rotateSelection(-90) },

    // Ferramentas
    ...TOOLS.map(([t, label, keys]): Command => ({ id: `tool.${t}`, cat: "Ferramentas", label, keys, run: tool(t), checked: () => useTool.getState().tool === t })),
    { id: "tool.sizeUp", cat: "Ferramentas", label: "Aumentar espessura/borracha", keys: ["]"], repeat: true, run: () => brushSize(1) },
    { id: "tool.sizeDown", cat: "Ferramentas", label: "Diminuir espessura/borracha", keys: ["["], repeat: true, run: () => brushSize(-1) },
    { id: "tool.eraserMode", cat: "Ferramentas", label: "Borracha: alternar traço inteiro / pixel", keys: ["Shift+E"], run: () => { const t = useTool.getState(); t.set({ eraserMode: t.eraserMode === "stroke" ? "pixel" : "stroke" }); t.setTool("eraser"); } },
    { id: "tool.recognize", cat: "Ferramentas", label: "Caneta: reconhecer formas", keys: ["Shift+R"], checked: () => useTool.getState().recognize, run: () => useTool.getState().set({ recognize: !useTool.getState().recognize }) },
    { id: "tool.fingerDraws", cat: "Ferramentas", label: "Desenhar com o dedo", checked: () => useTool.getState().fingerDraws, run: () => useTool.getState().set({ fingerDraws: !useTool.getState().fingerDraws }) },

    // Mapa mental / grafos
    { id: "map.vertexTab", cat: "Mapa mental", label: "Grafo: novo vértice ligado", keys: ["Tab"], scope: "vertex", run: vertexTab },
    { id: "map.child", cat: "Mapa mental", label: "Novo filho", keys: ["Tab"], run: () => addChildToSelection() },
    { id: "map.sibling", cat: "Mapa mental", label: "Novo irmão", keys: ["Enter"], scope: "node", run: () => addSiblingToSelection(false) },
    { id: "map.siblingAbove", cat: "Mapa mental", label: "Novo irmão acima", keys: ["Shift+Enter"], scope: "node", run: () => addSiblingToSelection(true) },
    { id: "map.edgeLabel", cat: "Mapa mental", label: "Rótulo/peso da seta", keys: ["Enter"], scope: "line", run: () => { const e = one(); if (e) useEdgeLabel.getState().open(e.id); } },
    { id: "map.collapse", cat: "Mapa mental", label: "Recolher/expandir ramo", keys: ["C"], scope: "selection", run: toggleCollapseSelection },
    { id: "map.collapseAll", cat: "Mapa mental", label: "Recolher o mapa", keys: ["Shift+C"], scope: "selection", run: () => collapseMap(true) },
    { id: "map.left", cat: "Mapa mental", label: "Ir ao nó da esquerda", keys: ["Left"], scope: "node", run: () => selectNeighbor("left") },
    { id: "map.right", cat: "Mapa mental", label: "Ir ao nó da direita", keys: ["Right"], scope: "node", run: () => selectNeighbor("right") },
    { id: "map.up", cat: "Mapa mental", label: "Ir ao nó de cima", keys: ["Up"], scope: "node", run: () => selectNeighbor("up") },
    { id: "map.down", cat: "Mapa mental", label: "Ir ao nó de baixo", keys: ["Down"], scope: "node", run: () => selectNeighbor("down") },

    // Janela
    ...PANELS.map((p): Command => ({
      id: `panel.${p.id}`, cat: "Janela", label: `Painel ${p.label}`, hint: p.hint,
      checked: () => isShowing(useWorkspace.getState().dock, p.id as PanelId),
      run: () => togglePanelCmd(p.id),
      keys: PANEL_KEYS[p.id],
    })),
    ...PRESETS.map((w, i): Command => ({
      id: `ws.${w.id}`, cat: "Janela", label: `Área de trabalho: ${w.name}`, hint: w.hint, keys: [`Ctrl+Alt+${i + 1}`],
      checked: () => useWorkspace.getState().activeId === w.id,
      run: () => useWorkspace.getState().switchTo(w.id),
    })),
    { id: "ws.restore", cat: "Janela", label: "Restaurar a área de trabalho", run: () => useWorkspace.getState().restore(useWorkspace.getState().activeId) },
    { id: "ws.lock", cat: "Janela", label: "Travar o layout", checked: () => useLayout.getState().layout.locked, run: () => setLockedLayout(!useLayout.getState().layout.locked) },
    { id: "ws.manage", cat: "Janela", label: "Gerenciar áreas de trabalho…", run: () => useUI.getState().setSettingsTab("areas") },
    { id: "ws.hidePanels", cat: "Janela", label: "Esconder/mostrar todos os painéis", keys: ["Shift+Tab"], run: toggleAllPanels },

    // Ajuda
    { id: "help.palette", cat: "Ajuda", label: "Procurar comando…", keys: ["Ctrl+K", "Ctrl+Shift+P"], run: () => usePalette.getState().setOpen(true) },
    { id: "help.shortcuts", cat: "Ajuda", label: "Atalhos de teclado…", keys: ["F1", "Ctrl+/"], run: () => useUI.getState().setSettingsTab("atalhos") },
  ];
  // kit de ferramentas: presets, macros, favoritas, ferramenta anterior
  const kit = useToolKit.getState();
  c.push(
    { id: "preset.save", cat: "Presets", label: "Salvar ajustes da ferramenta como preset", keys: ["Ctrl+Alt+P"], keywords: "guardar configuração pincel favorito", run: () => { const p = savePreset(); useUI.getState().showToast(`Preset “${p.name}” salvo.`); } },
    { id: "tool.previous", cat: "Ferramentas", label: "Voltar para a ferramenta anterior", keys: ["Q"], keywords: "última recente trocar", run: () => { const r = useToolKit.getState().recent[1]; return r ? runCommand(r) : false; } },
    { id: "tool.favorite", cat: "Ferramentas", label: "Favoritar/desfavoritar a ferramenta atual", keys: ["Ctrl+Alt+F"], keywords: "estrela acesso rápido", run: () => toggleFavorite(currentToolCmd()) },
    { id: "macro.record", cat: "Macros", label: "Gravar macro (começar/parar)", keys: ["Ctrl+Alt+R"], keywords: "gravar sequência automatizar ações repetir",
      checked: () => !!useToolKit.getState().recording,
      run: () => {
        if (useToolKit.getState().recording) {
          const m = stopRecording();
          useUI.getState().showToast(m ? `Macro “${m.name}” salva com ${m.steps.length} passos.` : "Nenhuma ação gravada.");
        } else { startRecording(); useUI.getState().showToast("Gravando: use comandos (teclado, menus, paleta). Ctrl+Alt+R para parar."); }
      } },
  );
  for (const p of kit.presets) {
    c.push({ id: `preset.${p.id}`, cat: "Presets", label: `Preset: ${p.name}`, keywords: "ajustes ferramenta", run: () => applyPreset(p.id), checked: () => false });
  }
  for (const m of kit.macros) {
    c.push({ id: `macro.${m.id}`, cat: "Macros", label: `Macro: ${m.name}`, hint: `${m.steps.length} passos`, keywords: "sequência automática", run: () => runMacro(m.id) });
  }
  for (const x of c) if (!x.keywords && KEYWORDS[x.id]) x.keywords = KEYWORDS[x.id];
  // pincéis: cada um vira um comando (sem tecla padrão; o usuário escolhe)
  for (const b of listBrushes()) {
    c.push({
      id: `brush.${b.id}`, cat: "Pincéis", label: `Pincel: ${b.label}`,
      checked: () => useTool.getState().tool === "pen" && useTool.getState().brush === b.id,
      run: () => { const t = useTool.getState(); t.setTool("pen"); t.setBrush(b.id); },
    });
  }
  return c;
}

const PANEL_KEYS: Partial<Record<PanelId, string[]>> = {
  props: ["F7"], objects: ["F8"], layers: ["F9"], colors: ["F6"], brushes: ["F5"], align: ["Shift+F7"], text: ["Ctrl+Shift+F"], navigator: ["F10"], history: ["Ctrl+Alt+Z"], transform: ["Shift+F8"], library: ["Shift+B"],
};

/** Esconder todos os painéis (Shift+Tab, como no Clip Studio/Photoshop) e voltar exatamente como estavam. */
let stashed: ReturnType<typeof useWorkspace.getState>["dock"] | null = null;
function toggleAllPanels() {
  const ws = useWorkspace.getState();
  if (stashed) { ws.setDock(stashed); stashed = null; return; }
  stashed = ws.dock;
  ws.setDock({ ...ws.dock, areas: { left: { ...ws.dock.areas.left, stacks: [] }, right: { ...ws.dock.areas.right, stacks: [] }, top: { ...ws.dock.areas.top, stacks: [] }, bottom: { ...ws.dock.areas.bottom, stacks: [] } }, floats: [] }, false);
}

const exitGroupsAll = () => { while (currentCtx()) exitGroup(); };

/** Sinônimos/intenções para a busca da paleta (por id). */
const KEYWORDS: Record<string, string> = {
  "dist.h": "mesmo espaço espaçamento igual distância cartões lado a lado horizontal espalhar",
  "dist.v": "mesmo espaço espaçamento igual distância cartões um embaixo do outro vertical espalhar",
  "dist.hc": "centros espaçados iguais horizontal", "dist.vc": "centros espaçados iguais vertical",
  "align.left": "esquerda encostar alinhar margem", "align.right": "direita encostar alinhar", "align.top": "topo cima alinhar",
  "align.bottom": "baixo base alinhar", "align.hcenter": "meio centro horizontal", "align.vcenter": "meio centro vertical",
  "arr.grid": "grade organizar arrumar mosaico tabela linhas colunas", "arr.center": "meio tela centralizar",
  "eq.w": "mesma largura igual tamanho", "eq.h": "mesma altura igual tamanho", "eq.both": "mesmo tamanho igualar",
  "obj.group": "juntar unir agrupar conjunto", "obj.ungroup": "separar desfazer grupo soltar", "obj.release": "tirar remover do grupo",
  "obj.lock": "trancar bloquear fixar prender", "obj.hide": "esconder sumir invisível", "obj.showAll": "mostrar reaparecer",
  "obj.unlockAll": "liberar soltar travados", "obj.frame": "moldura quadro envolver",
  "edit.delete": "apagar excluir deletar remover lixo", "edit.duplicate": "copiar clonar repetir duplicar",
  "edit.undo": "voltar desfazer erro", "edit.redo": "refazer avançar", "edit.selectSame": "mesmo tipo parecidos iguais selecionar",
  "edit.eyedropper": "pegar cor conta gotas amostra", "arr.flipH": "espelhar inverter horizontal", "arr.flipV": "espelhar inverter vertical",
  "arr.rotCW": "girar rodar virar", "arr.rotCCW": "girar rodar virar", "arr.front": "frente cima sobrepor", "arr.back": "fundo trás atrás",
  "insert.sticky": "post-it nota adesiva lembrete", "insert.todo": "tarefas checklist lista afazeres", "insert.table": "tabela planilha linhas colunas",
  "insert.library": "blocos biblioteca adesivos cartões", "insert.templates": "modelos prontos kanban swot cornell",
  "view.fitAll": "ver tudo enquadrar zoom", "view.fitSel": "zoom seleção aproximar objeto", "view.focus": "foco esconder interface distrações",
  "file.save": "salvar exportar baixar arquivo", "file.open": "abrir carregar arquivo", "file.home": "cadernos início inicial",
  "tool.pen": "desenhar escrever lápis caneta", "tool.eraser": "apagar borracha", "tool.text": "escrever digitar texto",
  "tool.hand": "mover tela arrastar navegar", "tool.select": "selecionar mover cursor seta",
  "panel.layers": "camadas", "panel.objects": "objetos árvore grupos lista", "help.shortcuts": "teclas atalhos teclado",
};

let cache: { sig: string; list: Command[] } | null = null;
/** Todos os comandos (refeito quando a lista de pincéis, presets ou macros muda). */
export function allCommands(): Command[] {
  const k = useToolKit.getState();
  const sig = listBrushes().map((b) => `${b.id}:${b.label}`).join("|") + "#" + k.presets.map((p) => `${p.id}:${p.name}`).join("|") + "#" + k.macros.map((m) => `${m.id}:${m.name}`).join("|");
  if (!cache || cache.sig !== sig) cache = { sig, list: buildCommands() };
  return cache.list;
}

export const commandById = (id: string) => allCommands().find((c) => c.id === id);

export function runCommand(id: string): boolean {
  const c = commandById(id);
  if (!c) return false;
  if (c.when && !c.when()) return false;
  const ok = c.run() !== false;
  if (ok) noteCommand(id);
  return ok;
}

/** Executa os passos de uma macro em ordem (passo que não se aplica agora é pulado). */
export function runMacro(id: string): boolean {
  const m = useToolKit.getState().macros.find((x) => x.id === id);
  if (!m) return false;
  if (useToolKit.getState().recording) { useUI.getState().showToast("Pare a gravação antes de rodar uma macro."); return false; }
  let ran = 0;
  for (const step of m.steps) {
    if (step === `macro.${id}`) continue;
    const c = commandById(step);
    if (!c || !inScope(c.scope) || (c.when && !c.when())) continue;
    if (c.run() !== false) ran++;
  }
  if (!ran) useUI.getState().showToast(`A macro “${m.name}” não tinha o que fazer agora.`);
  return true;
}

/** Tecla atual do comando (a primeira), para mostrar em menus e dicas. */
export function shortcutOf(id: string): string {
  const c = commandById(id);
  if (!c) return "";
  if (c.fixed) return prettyCombo(c.fixed);
  const k = keysFor(c, useKeymap.getState().overrides)[0];
  return k ? prettyCombo(k) : "";
}

/** Dica com atalho: "Agrupar (Ctrl+G)". */
export const withKey = (label: string, id: string) => { const k = shortcutOf(id); return k ? `${label} (${k})` : label; };

let idx: { cmds: Command[]; o: object; map: Map<string, Command[]> } | null = null;
const index = () => {
  const cmds = allCommands(), o = useKeymap.getState().overrides;
  if (!idx || idx.cmds !== cmds || idx.o !== o) idx = { cmds, o, map: buildIndex(cmds, o) };
  return idx.map;
};

/** O teclado do app inteiro passa por aqui. */
export function handleKey(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t?.isContentEditable) return false;
  if (usePageEdit.getState().id) return false; // o editor de página é modal: os atalhos do quadro ficam desligados
  if (usePalette.getState().open || useCapture.getState().id) return false;
  const combo = comboFromEvent(e);
  if (!combo || combo === "Ctrl+V") return false; // Ctrl+V fica com o evento `paste` (components/clipboard.ts)
  const list = index().get(combo);
  if (!list) return false;
  cancelModHold();
  for (const c of list) {
    if (e.repeat && !c.repeat) { e.preventDefault(); return true; }
    if (!inScope(c.scope)) continue;
    if (c.when && !c.when()) continue;
    // ferramenta temporária: segurar a tecla da ferramenta usa ela só enquanto a tecla está apertada
    const isTool = (c.id.startsWith("tool.") && !NOT_TOOL.includes(c.id)) || c.id.startsWith("brush.") || c.id.startsWith("preset.");
    const before = isTool && useToolKit.getState().tempTools ? { tool: useTool.getState().tool, brush: useTool.getState().brush, at: performance.now(), code: e.code } : null;
    if (c.run() === false) continue;
    if (before) hold = before;
    noteCommand(c.id);
    e.preventDefault();
    return true;
  }
  return false;
}

const NOT_TOOL = ["tool.sizeUp", "tool.sizeDown", "tool.eraserMode", "tool.recognize", "tool.fingerDraws", "tool.previous", "tool.favorite"];

/** Tecla de ferramenta segurada (para voltar ao soltar) e Ctrl/Alt segurados sozinhos. */
let hold: { tool: ToolId; brush: string; at: number; code: string } | null = null;
let mod: { key: "Control" | "Alt"; timer: ReturnType<typeof setTimeout> | null; prev: ToolId | null; active: boolean } | null = null;
const HOLD_MS = 350;
const DRAWING: ToolId[] = ["pen", "eraser", "rect", "ellipse", "diamond", "arrow", "line", "text", "laser", "laserpen", "mindmap", "frame", "vertex", "edge"];

function cancelModHold() {
  if (mod && !mod.active && mod.timer) { clearTimeout(mod.timer); mod = null; }
}

/** Ctrl segurado sozinho (com ferramenta de desenho) = Selecionar; Alt segurado = conta-gotas. Soltar volta. */
export function handleModifierDown(e: KeyboardEvent) {
  if (e.repeat || mod) return;
  const t = e.target as HTMLElement | null;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable) return;
  const kit = useToolKit.getState();
  const tool = useTool.getState().tool;
  if (e.key === "Control" && kit.ctrlSelect && DRAWING.includes(tool)) {
    mod = { key: "Control", prev: tool, active: false, timer: setTimeout(() => { if (mod) { mod.active = true; useTool.getState().setTool("select"); } }, 220) };
  } else if (e.key === "Alt" && kit.altPick && (tool === "pen" || tool === "rect" || tool === "ellipse" || tool === "diamond" || tool === "text")) {
    e.preventDefault(); // não abre o menu da janela no Linux/Windows
    mod = { key: "Alt", prev: null, active: false, timer: setTimeout(() => { if (mod) { mod.active = true; useTool.getState().set({ picking: true }); } }, 220) };
  }
}

/** Soltar teclas: desfaz as ferramentas temporárias. */
export function handleKeyUp(e: KeyboardEvent) {
  if (mod && e.key === mod.key) {
    if (mod.timer) clearTimeout(mod.timer);
    if (mod.active) {
      if (mod.key === "Control" && mod.prev && useTool.getState().tool === "select") useTool.getState().setTool(mod.prev);
      if (mod.key === "Alt") useTool.getState().set({ picking: false });
    }
    mod = null;
  }
  if (hold && e.code === hold.code) {
    const h = hold;
    hold = null;
    if (performance.now() - h.at >= HOLD_MS) {
      const t = useTool.getState();
      t.setTool(h.tool);
      if (h.tool === "pen") t.setBrush(h.brush);
    }
  }
}

// ---------- estado da paleta e da captura de teclas ----------

interface PaletteState { open: boolean; setOpen: (open: boolean) => void }
export const usePalette = create<PaletteState>((set) => ({ open: false, setOpen: (open) => set({ open }) }));

/** Comando cuja tecla está sendo gravada no editor de atalhos (o teclado do app fica mudo enquanto isso). */
interface CaptureState { id: string | null; set: (id: string | null) => void }
export const useCapture = create<CaptureState>((set) => ({ id: null, set: (id) => set({ id }) }));
