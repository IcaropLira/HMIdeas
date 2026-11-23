// Biblioteca de blocos: todas as variações prontas, por categoria, com busca e prévia de verdade. Clique insere no centro;
// arrastar um cartão para o quadro insere onde soltar. Também traz as FERRAMENTAS do app (mapa, setas, mídia, desenho).
import { ReactNode, useEffect, useMemo, useState } from "react";
import { ElementsPreview } from "./ElementsPreview";
import { GalleryCard, GalleryShell } from "./TemplateGallery";
import { LIB_MIME } from "./clipboard";
import { BlockKind } from "../core/blocks";
import { LIBRARY, LIB_CATEGORIES, LibCategory, LibItem, libSize, libSpec, searchLibrary } from "../core/blocks/library";
import { makeBlockElement } from "../core/blockElement";
import { useBlockEdit } from "../core/blockView";
import { createRootAt, viewCenter } from "../core/mapActions";
import { ToolId, useDoc, useSel, useTool } from "../core/store";
import { useUI } from "../core/ui";
import { usePageEdit } from "../core/pageEdit";

const NO_EDIT: BlockKind[] = ["todo", "kanban", "timeline", "table", "calendar", "habit", "progress", "quiz", "chart", "gantt", "sticker", "section", "sheet", "page"];

export function insertLibItem(item: LibItem, at = viewCenter(), edit = true) {
  const el = makeBlockElement(libSpec(item), at, libSize(item));
  useDoc.getState().addElement(el);
  useSel.getState().set([el.id]);
  useTool.getState().setTool("select");
  if (item.kind === "page" && edit) usePageEdit.getState().open(el.id);
  else if (edit && !NO_EDIT.includes(item.kind)) useBlockEdit.getState().open(el.id);
  return el;
}
export function insertLibItemById(id: string, at = viewCenter()): boolean {
  const item = LIBRARY.find((x) => x.id === id);
  if (!item) return false;
  insertLibItem(item, at, false);
  return true;
}
export function insertBlock(kind: BlockKind, at = viewCenter(), edit = false) {
  return insertLibItem({ id: kind, label: kind, cat: "texto", kind }, at, edit);
}

// ---------------- prévias ----------------
const previewCache = new Map<string, ReturnType<typeof makeBlockElement>>();
function previewEl(item: LibItem) {
  let el = previewCache.get(item.id);
  if (!el) { el = { ...makeBlockElement(libSpec(item), { x: 0, y: 0 }, libSize(item)), id: "pv-" + item.id }; previewCache.set(item.id, el); }
  return el;
}

/** Favoritos que aparecem direto no painel Inserir. */
const QUICK = ["sticky", "card", "todo", "heading-1", "callout", "table", "kanban", "flashcard", "page"];
export function BlockTiles({ onPick }: { onPick?: () => void }) {
  const items = useMemo(() => QUICK.map((id) => LIBRARY.find((x) => x.id === id)!).filter(Boolean), []);
  return (
    <>
      <div className="tiles three block-tiles" role="toolbar" aria-label="Blocos">
        {items.map((it) => (
          <button key={it.id} className="tile" title={it.label} draggable onDragStart={(e) => e.dataTransfer.setData(LIB_MIME, it.id)} onClick={() => { insertLibItem(it); onPick?.(); }}>
            <ElementsPreview elements={[previewEl(it)]} w={96} h={66} pad={6} />
            <span>{it.label}</span>
          </button>
        ))}
      </div>
      <button className="chip wide" onClick={() => { onPick?.(); useUI.getState().setLibraryOpen(true); }}>Todos os blocos ({LIBRARY.length}) · adesivos · páginas…</button>
    </>
  );
}

// ---------------- ferramentas (itens que não são blocos) ----------------
interface ToolItem { id: string; label: string; hint: string; tab: "mapas" | "conexoes" | "midia" | "desenho"; art: ReactNode; run: () => void }
const tool = (t: ToolId, patch: Parameters<ReturnType<typeof useTool.getState>["set"]>[0] = {}, toast?: string) => () => {
  useTool.getState().setTool(t);
  if (Object.keys(patch).length) useTool.getState().set(patch);
  if (toast) useUI.getState().showToast(toast);
};
const svg = (d: ReactNode) => <svg viewBox="0 0 96 64" width="96" height="64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const TOOLS: ToolItem[] = [
  { id: "map", label: "Mapa mental", hint: "Nó central: Tab cria filho, Enter cria irmão", tab: "mapas", art: svg(<><rect x="36" y="26" width="24" height="12" rx="6" /><path d="M36 32c-8 0-8-14-18-14M36 32c-8 0-8 14-18 14M60 32c8 0 8-14 18-14M60 32c8 0 8 14 18 14" /></>), run: () => { createRootAt(viewCenter()); } },
  { id: "map-tpl", label: "Modelos de mapa", hint: "Árvore, conceitos, causa e efeito…", tab: "mapas", art: svg(<><circle cx="48" cy="14" r="6" /><circle cx="26" cy="46" r="6" /><circle cx="70" cy="46" r="6" /><path d="M44 19L29 41M52 19l15 22" /></>), run: () => useUI.getState().setTemplatesOpen(true, "mapas") },
  { id: "fishbone", label: "Diagramas", hint: "Fluxograma, Venn, Ishikawa, ciclo, organograma…", tab: "mapas", art: svg(<><path d="M10 32h70M80 32l-8-6M80 32l-8 6M28 32L18 14M28 32L18 50M50 32L40 14M50 32L40 50" /></>), run: () => useUI.getState().setTemplatesOpen(true, "diagramas") },
  { id: "vertex", label: "Nó de grafo", hint: "Ferramenta Vértice (N): toque cria, Tab cria vizinho", tab: "mapas", art: svg(<><circle cx="30" cy="32" r="10" /><circle cx="70" cy="20" r="8" /><path d="M40 29l22-7" /></>), run: tool("vertex") },
  { id: "arrow", label: "Seta simples", hint: "Arraste de um bloco a outro", tab: "conexoes", art: svg(<path d="M14 44L80 20M80 20l-12 0M80 20l-8 10" />), run: tool("arrow", { startHead: "none", endHead: "triangle", curved: false, lineStyle: "solid" }) },
  { id: "arrow2", label: "Seta dupla", hint: "Pontas nos dois lados", tab: "conexoes", art: svg(<path d="M14 44L80 20M80 20l-12 0M80 20l-8 10M14 44l12 0M14 44l8-10" />), run: tool("arrow", { startHead: "triangle", endHead: "triangle", curved: false, lineStyle: "solid" }) },
  { id: "line", label: "Linha de conexão", hint: "Sem pontas", tab: "conexoes", art: svg(<path d="M14 44L82 20" />), run: tool("line", { curved: false, lineStyle: "solid" }) },
  { id: "dotted", label: "Linha pontilhada", hint: "Ligação fraca ou dependência", tab: "conexoes", art: svg(<path d="M14 44L82 20" strokeDasharray="2 7" />), run: tool("arrow", { lineStyle: "dotted", startHead: "none", endHead: "triangle", curved: false }) },
  { id: "dashed", label: "Linha tracejada", hint: "Associação", tab: "conexoes", art: svg(<path d="M14 44L82 20" strokeDasharray="10 7" />), run: tool("arrow", { lineStyle: "dashed", startHead: "none", endHead: "none", curved: false }) },
  { id: "curve", label: "Linha curva", hint: "Clique em vários pontos; Esc termina", tab: "conexoes", art: svg(<path d="M12 48C30 6 60 60 84 16" />), run: tool("arrow", { curved: true, lineStyle: "solid", endHead: "triangle", startHead: "none" }) },
  { id: "labelled", label: "Conector com texto", hint: "Depois de criar: duplo toque na seta escreve o rótulo", tab: "conexoes", art: svg(<><path d="M12 44L84 20" /><rect x="34" y="22" width="28" height="16" rx="4" fill="var(--surface)" /></>), run: tool("arrow", { startHead: "none", endHead: "triangle", curved: false, lineStyle: "solid" }, "Desenhe a seta e dê duplo toque nela para escrever o texto.") },
  { id: "quick", label: "Puxar dos blocos", hint: "Selecione um bloco e arraste um dos pontos azuis das bordas", tab: "conexoes", art: svg(<><rect x="12" y="20" width="30" height="24" rx="5" /><circle cx="42" cy="32" r="4" fill="currentColor" /><path d="M46 32h34M80 32l-8-5M80 32l-8 5" strokeDasharray="5 5" /></>), run: () => useUI.getState().showToast("Selecione um bloco e arraste um dos pontos das bordas até outro bloco.") },
  { id: "image", label: "Imagem / arquivo", hint: "Imagem, PDF ou qualquer arquivo", tab: "midia", art: svg(<><rect x="18" y="10" width="60" height="44" rx="5" /><circle cx="36" cy="26" r="5" /><path d="M20 50l18-16 12 10 10-8 18 14" /></>), run: () => document.getElementById("hm-attach-input")?.click() },
  { id: "video", label: "Vídeo / link", hint: "Cole um link do YouTube ou de um site (Ctrl+V)", tab: "midia", art: svg(<><rect x="16" y="12" width="64" height="40" rx="8" /><path d="M42 24l14 8-14 8z" fill="currentColor" /></>), run: () => useUI.getState().showToast("Copie o link (YouTube, site…) e cole com Ctrl+V no quadro.") },
  { id: "pen", label: "Desenho livre", hint: "Caneta (P)", tab: "desenho", art: svg(<path d="M14 46c10-20 20 10 30-8s16 10 26-6 10 0 14-4" />), run: tool("pen") },
  { id: "highlighter", label: "Marca-texto", hint: "Grife por cima de qualquer coisa", tab: "desenho", art: svg(<path d="M14 36h68" strokeWidth="12" stroke="#F2D14B" opacity=".7" />), run: () => { useTool.getState().setTool("pen"); useTool.getState().setBrush("highlighter"); } },
  { id: "shapes", label: "Formas geométricas", hint: "Retângulo (R), elipse (O), losango (D)", tab: "desenho", art: svg(<><rect x="10" y="18" width="26" height="26" rx="3" /><circle cx="56" cy="31" r="13" /><path d="M82 18l10 13-10 13-10-13z" /></>), run: tool("rect") },
  { id: "laser", label: "Caneta laser", hint: "Escreve e some sozinho", tab: "desenho", art: svg(<path d="M14 44c14-22 30 8 44-10s18 0 24-4" stroke="#FF3B30" />), run: tool("laser") },
  { id: "science", label: "Gráfico de funções e sólidos", hint: "Painel Ciências: gráficos, sólidos, vetores…", tab: "desenho", art: svg(<><path d="M12 54h72M16 58V8" /><path d="M16 50C34 50 40 14 58 14s20 30 26 34" /></>), run: () => useUI.getState().showToast("Abra o painel Ciências (ícone de grafo na barra) para gráficos, sólidos e vetores.") },
];
const TOOL_TABS = [{ id: "mapas", label: "Mapas" }, { id: "conexoes", label: "Conexões" }, { id: "midia", label: "Mídia" }, { id: "desenho", label: "Desenho" }] as const;

export function BlockLibrary() {
  const open = useUI((s) => s.libraryOpen);
  const initial = useUI((s) => s.libraryTab);
  const [tab, setTab] = useState<string>("todos");
  const [q, setQ] = useState("");
  const [dragging, setDragging] = useState(false);
  useEffect(() => { if (open) { setTab(initial); setQ(""); } }, [open, initial]);
  if (!open) return null;
  const close = () => useUI.getState().setLibraryOpen(false);
  const toolTab = TOOL_TABS.some((t) => t.id === tab);
  const items = toolTab ? [] : searchLibrary(q, tab === "todos" ? undefined : (tab as LibCategory));
  const tools = TOOLS.filter((t) => (toolTab ? t.tab === tab : tab === "todos" && q && `${t.label} ${t.hint}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className={dragging ? "lib-dragging" : ""}>
      <GalleryShell
        title="Blocos"
        tabs={[{ id: "todos", label: "Todos", count: LIBRARY.length }, ...LIB_CATEGORIES.map((c) => ({ id: c.id, label: `${c.icon} ${c.label}`, count: LIBRARY.filter((i) => i.cat === c.id).length })), ...TOOL_TABS.map((t) => ({ id: t.id, label: t.label }))]}
        tab={tab}
        onTab={setTab}
        onClose={close}
        search={q}
        onSearch={setQ}
        footer={<span>Clique para inserir no centro ou <b>arraste</b> para o quadro. Duplo toque num bloco edita o texto ali mesmo; o menu ⋯ do bloco transforma em outro tipo sem perder o conteúdo.</span>}
      >
        {items.map((it) => (
          <div key={it.id} draggable onDragStart={(e) => { e.dataTransfer.setData(LIB_MIME, it.id); e.dataTransfer.effectAllowed = "copy"; requestAnimationFrame(() => setDragging(true)); }} onDragEnd={() => { setDragging(false); close(); }}>
            <GalleryCard title={it.label} onClick={() => { insertLibItem(it); close(); }}>
              <ElementsPreview elements={[previewEl(it)]} w={176} h={112} pad={10} />
            </GalleryCard>
          </div>
        ))}
        {tools.map((t) => (
          <GalleryCard key={t.id} title={t.label} hint={t.hint} onClick={() => { close(); t.run(); }}>
            <span className="lib-tool-art">{t.art}</span>
          </GalleryCard>
        ))}
        {!items.length && !tools.length && <p className="hint" style={{ gridColumn: "1 / -1" }}>Nada encontrado para “{q}”.</p>}
      </GalleryShell>
    </div>
  );
}
