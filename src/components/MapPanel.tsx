import { ReactNode, useMemo, useRef, useState } from "react";
import { openExternal } from "../core/openExternal";
import { ElementsPreview } from "./ElementsPreview";
import { insertTemplate } from "./TemplateGallery";
import { TEMPLATES } from "../core/templates";
import { MAP_TEMPLATES, buildMapTemplate } from "../core/mapTemplates";
import { BRANCH_STYLES, MAP_LAYOUTS, NODE_SHAPES, NodeElement } from "../core/model";
import { FRAME_COLORS } from "../core/frames";
import {
  addChildToSelection, addSiblingToSelection, applyPreset, collapseMap, connectSelection, createRootAt,
  detachSelection, exportOutlineOfSelection, fitFrameSelection, fitToSelection, focusSelection, importOutlineText,
  recolorFrames, setBranchStyle, setMapLayout, styleSelection, toggleCollapseSelection, toggleDone, ungroupSelection,
  viewCenter, wrapSelectionInFrame,
} from "../core/mapActions";
import { BRANCH_PALETTE, MAP_THEMES, NODE_ICONS, NODE_PRESETS, applyMapTheme, balanceSides, numberBranches, rootOf, sortChildren, toMarkdown } from "../core/mindmap";
import { measure } from "../core/mapActions";
import { selectActivePage, useDoc, useSel } from "../core/store";
import { useUI } from "../core/ui";

/** Ícones das opções de layout, ligações e formas (desenhos pequenos, não texto). */
const LAYOUT_ICON: Record<string, ReactNode> = {
  both: <><rect x="17" y="11" width="10" height="6" rx="3" /><path d="M17 14c-4 0-4-7-8-7M17 14c-4 0-4 7-8 7M27 14c4 0 4-7 8-7M27 14c4 0 4 7 8 7" /></>,
  right: <><rect x="4" y="11" width="10" height="6" rx="3" /><path d="M14 14c5 0 5-8 10-8M14 14h10M14 14c5 0 5 8 10 8" /><path d="M26 6h12M26 14h12M26 22h12" /></>,
  left: <><rect x="30" y="11" width="10" height="6" rx="3" /><path d="M30 14c-5 0-5-8-10-8M30 14H20M30 14c-5 0-5 8-10 8" /><path d="M6 6h12M6 14h12M6 22h12" /></>,
  down: <><rect x="17" y="3" width="10" height="6" rx="3" /><path d="M22 9v4M10 13h24M10 13v5M22 13v5M34 13v5" /><rect x="5" y="19" width="10" height="5" rx="2" /><rect x="17" y="19" width="10" height="5" rx="2" /><rect x="29" y="19" width="10" height="5" rx="2" /></>,
};
const BRANCH_ICON: Record<string, ReactNode> = {
  curve: <path d="M6 22C20 22 18 6 38 6" />,
  elbow: <path d="M6 22h14V6h18" />,
  straight: <path d="M6 22L38 6" />,
};
const SHAPE_ICON: Record<string, ReactNode> = {
  pill: <rect x="6" y="8" width="32" height="12" rx="6" />,
  rounded: <rect x="6" y="7" width="32" height="14" rx="4" />,
  rect: <rect x="6" y="7" width="32" height="14" />,
  ellipse: <ellipse cx="22" cy="14" rx="16" ry="8" />,
  underline: <><path d="M8 21h28" /><path d="M12 14h20" strokeOpacity=".35" /></>,
  none: <path d="M12 14h20" strokeOpacity=".5" />,
};
const Pic = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 44 28" width="44" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

const Chip = ({ on, onClick, children, title }: { on?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) => (
  <button className={on ? "chip sm on" : "chip sm"} onClick={onClick} title={title}>{children}</button>
);

const STICKERS: [string, string[]][] = [
  ["Status", ["✅", "☑️", "⏳", "🚧", "❌", "⚠️", "❓", "❗", "🔁", "🆕"]],
  ["Ideias", ["💡", "⭐", "🔥", "🎯", "🚀", "🧠", "✨", "📌", "🏆", "💎"]],
  ["Coisas", ["📚", "📝", "📅", "💰", "🔧", "💻", "📊", "🧪", "🎨", "🎵"]],
  ["Pessoas", ["😀", "🤔", "😍", "😴", "👍", "👎", "👥", "🙋", "❤️", "🙌"]],
];

/** Conteúdo do nó (como nos cartões do Miro/Milanote): nota com lista de tarefas, link, etiquetas, data, progresso e imagem. */
function NodeContentEditor({ node }: { node: NodeElement }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const patch = (p: Parameters<typeof styleSelection>[0]) => styleSelection(p, false);
  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 360 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      patch({ image: c.toDataURL("image/jpeg", 0.85), imageRatio: c.height / c.width });
    } catch { useUI.getState().showToast("Não consegui abrir essa imagem."); }
  };
  const tagsText = (node.tags ?? []).join(", ");
  return (
    <div className="node-content">
      <div className="sec-title">Conteúdo do nó</div>
      <textarea className="outline-in" rows={3} defaultValue={node.note ?? ""} key={node.id + "note"} placeholder={"Nota… (dica: linhas “- [ ] tarefa” viram lista de tarefas com progresso)"}
        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (node.note ?? "")) patch({ note: v || undefined }); }} />
      <div className="row tight">
        <button className="chip sm" onClick={() => patch({ note: `${node.note ? node.note + "\n" : ""}- [ ] ` })}>+ Tarefa</button>
        <button className={node.shape === "card" ? "chip sm on" : "chip sm"} onClick={() => patch({ shape: node.shape === "card" ? "rounded" : "card" })} title="Mostra a nota dentro do nó, como um cartão">Mostrar como cartão</button>
      </div>
      <div className="row tight">
        <label className="mini-field">Etiquetas <input className="wide" defaultValue={tagsText} key={node.id + "tags" + tagsText} placeholder="urgente, aula" onBlur={(e) => {
          const tags = e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8);
          if (tags.join(",") !== (node.tags ?? []).join(",")) patch({ tags: tags.length ? tags : undefined });
        }} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} /></label>
        <label className="mini-field">Data <input type="date" defaultValue={node.due ?? ""} key={node.id + "due" + node.due} onChange={(e) => patch({ due: e.target.value || undefined })} /></label>
      </div>
      <label className="slider">
        <span>Progresso {node.progress === undefined ? "(automático pela lista)" : ""}</span>
        <input type="range" min={0} max={100} step={5} value={node.progress ?? 0} onChange={(e) => patch({ progress: +e.target.value })} />
        <output>{node.progress === undefined ? "—" : `${node.progress}%`}</output>
      </label>
      <div className="row tight">
        {node.progress !== undefined && <button className="chip sm" onClick={() => patch({ progress: undefined })}>Sem progresso</button>}
        <label className="mini-field">Link <input className="wide" defaultValue={node.link ?? ""} key={node.id + "link" + node.link} placeholder="https://…" onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && !/^(https?:|mailto:)/i.test(v)) { useUI.getState().showToast("O link precisa começar com https://"); return; }
          if (v !== (node.link ?? "")) patch({ link: v || undefined });
        }} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} /></label>
        {node.link && <button className="chip sm" onClick={() => void openExternal(node.link!)}>Abrir ↗</button>}
      </div>
      <div className="row tight">
        <button className="chip sm" onClick={() => fileRef.current?.click()}>{node.image ? "Trocar imagem" : "🖼 Imagem no nó"}</button>
        {node.image && <button className="chip sm danger" onClick={() => patch({ image: undefined, imageRatio: undefined })}>Tirar imagem</button>}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <div className="sec-title">Adesivos</div>
      <div className="stickers">
        {STICKERS.map(([group, list]) => (
          <div key={group} className="sticker-row" aria-label={group}>
            {list.map((i) => <button key={i} className={node.icon === i ? "stk on" : "stk"} onClick={() => patch({ icon: node.icon === i ? null : i })} title={group}>{i}</button>)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Painel "Mapa & quadros": modelos, temas, layout, formas, códigos visuais, recolher, quadros, lista de texto. */
export function MapPanel() {
  const ids = useSel((s) => s.ids);
  const els = useDoc((s) => selectActivePage(s).elements);
  const [sub, setSub] = useState(true);
  const [text, setText] = useState("");
  const sel = els.filter((e) => ids.includes(e.id));
  const nodes = sel.filter((e): e is NodeElement => e.type === "node");
  const frames = sel.filter((e) => e.type === "frame");
  const n0 = nodes[0];
  const root = n0 ? rootOf(els, n0.id) : null;
  const same = <K extends keyof NodeElement>(k: K) => (nodes.length && nodes.every((n) => n[k] === n0[k]) ? n0[k] : undefined);
  const commitEls = (next: typeof els) => { if (next !== els) useDoc.getState().replaceElements(next); };
  const toast = (m: string) => useUI.getState().showToast(m);

  // prévias: 4 modelos e um minimapa por tema
  const quick = useMemo(() => MAP_TEMPLATES.slice(0, 6).map((t) => ({ t, els: buildMapTemplate(t) })), []);
  const themePreviews = useMemo(() => {
    const mini = { id: "mini", name: "", hint: "", theme: "", layout: "both" as const, outline: "Tema\n  A\n    a\n  B\n  C\n  D" };
    return MAP_THEMES.map((th) => ({ th, els: buildMapTemplate({ ...mini, theme: th.id }) }));
  }, []);

  return (
    <div className="panel mappanel" role="dialog" aria-label="Mapa mental e quadros">
      <div className="row">
        <Chip onClick={() => createRootAt(viewCenter())} title="Novo mapa no centro da tela (ou Tab sem seleção)">+ Novo mapa</Chip>
        <Chip onClick={() => addChildToSelection()} title="Tab">Filho</Chip>
        <Chip onClick={() => addSiblingToSelection()} title="Enter">Irmão</Chip>
        <Chip onClick={wrapSelectionInFrame} title="Ctrl+G">Quadro</Chip>
        <Chip onClick={() => connectSelection()} title="K: seta ligando 2 nós de qualquer ramo">Ligar 2 nós</Chip>
      </div>

      {!nodes.length && (
        <>
          <div className="sec-title">Começar de um modelo</div>
          <div className="tiles three">
            {quick.map(({ t, els: pv }) => (
              <button key={t.id} className="tile" title={t.hint} onClick={() => { const tp = TEMPLATES.find((x) => x.id === `map-${t.id}`); if (tp) insertTemplate(tp); }}>
                <ElementsPreview elements={pv} w={110} h={72} pad={10} bg="#FFFFFF" />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
          <button className="chip sm" onClick={() => useUI.getState().setTemplatesOpen(true, "mapas")}>Ver todos os modelos de mapa…</button>
        </>
      )}

      {nodes.length > 0 && root && (
        <>
          <div className="sec-title">Tema do mapa</div>
          <div className="tiles four">
            {themePreviews.map(({ th, els: pv }) => (
              <button key={th.id} className="tile" title={`Tema ${th.name}`} onClick={() => commitEls(applyMapTheme(els, root.id, th, measure))}>
                <ElementsPreview elements={pv} w={84} h={52} pad={8} bg={th.id === "night" ? "#0F0D1F" : "#FFFFFF"} />
                <span>{th.name}</span>
              </button>
            ))}
          </div>
          <div className="sec-title">Layout e ligações</div>
          <div className="tiles four" role="radiogroup" aria-label="Layout do mapa">
            {MAP_LAYOUTS.map((l) => (
              <button key={l.id} role="radio" aria-checked={root.layout === l.id} className={root.layout === l.id ? "tile icon on" : "tile icon"} onClick={() => setMapLayout(l.id)} title={l.label}>
                <Pic>{LAYOUT_ICON[l.id]}</Pic><span>{l.label}</span>
              </button>
            ))}
          </div>
          <div className="tiles three" role="radiogroup" aria-label="Estilo dos ramos">
            {BRANCH_STYLES.map((b) => (
              <button key={b.id} role="radio" aria-checked={root.branchStyle === b.id} className={root.branchStyle === b.id ? "tile icon on" : "tile icon"} onClick={() => setBranchStyle(b.id)} title={b.label}>
                <Pic>{BRANCH_ICON[b.id]}</Pic><span>{b.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {nodes.length > 0 && (
        <>
          <div className="sec-title">Nó{nodes.length > 1 ? `s (${nodes.length})` : ""}</div>
          <div className="tiles three" role="radiogroup" aria-label="Forma do nó">
            {NODE_SHAPES.map((sh) => (
              <button key={sh.id} role="radio" aria-checked={same("shape") === sh.id} className={same("shape") === sh.id ? "tile icon on" : "tile icon"} onClick={() => styleSelection({ shape: sh.id }, sub)} title={sh.label}>
                <Pic>{SHAPE_ICON[sh.id]}</Pic><span>{sh.label}</span>
              </button>
            ))}
          </div>
          <div className="row tight" aria-label="Códigos visuais">
            {NODE_PRESETS.map((p) => (
              <button key={p.id} className="chip sm" title={p.label} style={{ background: p.fill ?? "#fff", borderColor: p.stroke, color: p.color }} onClick={() => applyPreset(p.id, sub)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="swatch-grid" aria-label="Cor do ramo">
            <span className="rowlabel">Ramo</span>
            {BRANCH_PALETTE.map((c) => (
              <button key={c} className={same("branchColor") === c ? "swatch on" : "swatch"} aria-label={`Cor do ramo ${c}`} style={{ background: c }} onClick={() => styleSelection({ branchColor: c, ...(n0.stroke ? { stroke: c } : {}) }, sub)} />
            ))}
          </div>
          <div className="row tight" aria-label="Marcador">
            <Chip on={!!same("done")} onClick={toggleDone} title="Riscar o texto">✓ Concluído</Chip>
            {nodes.length > 1 && <>
              <Chip on={same("icon") === null} onClick={() => styleSelection({ icon: null })}>Sem marcador</Chip>
              {NODE_ICONS.slice(0, 8).map((i) => <Chip key={i} on={same("icon") === i} onClick={() => styleSelection({ icon: i })}>{i}</Chip>)}
            </>}
          </div>
          <label className="check"><input type="checkbox" checked={sub} onChange={(e) => setSub(e.target.checked)} /> Aplicar ao ramo todo</label>
          {nodes.length === 1 && <NodeContentEditor node={n0} />}

          <div className="sec-title">Ramos</div>
          <div className="row tight">
            <Chip onClick={toggleCollapseSelection} title="C">Recolher/expandir</Chip>
            <Chip onClick={() => collapseMap(true)} title="Shift+C">Recolher tudo</Chip>
            <Chip onClick={() => collapseMap(true, 2)}>Só 1º nível</Chip>
            <Chip onClick={() => collapseMap(false)}>Expandir tudo</Chip>
            <Chip onClick={focusSelection}>Foco neste ramo</Chip>
            <Chip onClick={detachSelection}>Separar do mapa</Chip>
            {root && <Chip onClick={() => commitEls(sortChildren(els, n0.id))} title="Ordena os filhos do nó selecionado">Ordenar A–Z</Chip>}
            {root && <Chip onClick={() => { const on = !(els.some((e) => e.type === "node" && e.parentId === root.id && e.icon === "1")); commitEls(numberBranches(els, root.id, on, measure)); }}>Numerar ramos</Chip>}
            {root && root.layout === "both" && <Chip onClick={() => commitEls(balanceSides(els, root.id))}>Equilibrar lados</Chip>}
          </div>
          <div className="row tight">
            <Chip onClick={() => {
              const o = exportOutlineOfSelection();
              if (o) void navigator.clipboard?.writeText(o).then(() => toast("Mapa copiado como lista."), () => toast("Não consegui copiar."));
            }}>Copiar como lista</Chip>
            {root && <Chip onClick={() => void navigator.clipboard?.writeText(toMarkdown(els, root.id)).then(() => toast("Mapa copiado em Markdown."), () => toast("Não consegui copiar."))}>Copiar Markdown</Chip>}
          </div>
        </>
      )}

      {frames.length > 0 && (
        <>
          <div className="sec-title">Quadro</div>
          <div className="swatch-grid">
            {FRAME_COLORS.map((c) => <button key={c} className="swatch" aria-label={`Cor do quadro ${c}`} style={{ background: c }} onClick={() => recolorFrames(c)} />)}
          </div>
          <div className="row tight">
            <Chip onClick={fitFrameSelection}>Ajustar ao conteúdo</Chip>
            <Chip onClick={ungroupSelection} title="Ctrl+Shift+G">Desfazer quadro</Chip>
            <Chip onClick={() => fitToSelection(false)}>Ir até ele</Chip>
          </div>
        </>
      )}

      <div className="row tight">
        <span className="rowlabel">Vista</span>
        <Chip onClick={() => fitToSelection(true)} title="Shift+1">Ver tudo</Chip>
        <Chip onClick={() => fitToSelection(false)} title="Shift+2">Ver seleção</Chip>
      </div>

      <details className="editor">
        <summary>Criar mapa de uma lista (recuo = nível)</summary>
        <div className="editor-body">
          <textarea className="outline-in" rows={5} value={text} placeholder={"Tema\n  Ramo A\n    detalhe\n  Ramo B"} onChange={(e) => setText(e.target.value)} />
          <Chip onClick={() => { if (importOutlineText(text)) setText(""); else toast("Escreva uma lista com recuo."); }}>Criar mapa</Chip>
        </div>
      </details>
      <details className="editor">
        <summary>Atalhos</summary>
        <p className="hint">Tab = filho · Enter = irmão · Shift+Enter = irmão acima · F2 = editar · C = recolher · setas = navegar · K = ligar 2 nós com seta. Arraste um nó sobre outro para mudar de pai; o layout se reorganiza sozinho. Clique na bolinha numerada para expandir.</p>
      </details>
    </div>
  );
}
