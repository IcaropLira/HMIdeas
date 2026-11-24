// Tela inicial (Home) de cadernos: capas com a primeira página de verdade, busca, ordenação, favoritos, cores de capa,
// criar com o papel escolhido, importar/exportar, renomear, duplicar e excluir. Os cadernos ficam no IndexedDB deste
// dispositivo; o caderno aberto é salvo sozinho a cada mudança.
import { PAGE_SIZES } from "../core/pageSize";
import { FormatIcon } from "./PaperPanel";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { PaperSwatch } from "./PaperPanel";
import { DEFAULT_BACKGROUND, HirakuDoc, Page, PaperKind, createDoc, newId, normalizeDoc } from "../core/model";
import { downloadDoc, parseDoc, serializeDoc } from "../core/serialize";
import { useDoc } from "../core/store";
import { useUI } from "../core/ui";
import { pageThumb, safeColor } from "../render/svgThumb";
import { fitActivePage, resetPageCameras } from "../core/pageView";
import { COVER_PATTERNS, COVER_STYLES, Cover, Folder, STUDY_PAPERS, cleanCover, cleanFolders, coverCss, pageFromTemplate } from "../core/notebook";
import { usePageTemplates } from "../core/pageTemplateStore";
import { openNewDocument } from "./NewDocumentDialog";

type Notebook = { id: string; name: string; updatedAt: number; createdAt?: number; color?: string; favorite?: boolean; folder?: string; cover?: Cover; doc: HirakuDoc };
const FOLDERS_KEY = "hm-ideas:folders-v1";
const loadFolders = (): Folder[] => { try { return cleanFolders(JSON.parse(localStorage.getItem(FOLDERS_KEY) || "[]")); } catch { return []; } };
const DB = "hm-ideas-notebooks", STORE = "notebooks", ACTIVE = "hm-ideas:notebooks:active";
export const START_HOME_KEY = "hm-ideas:start-home";

/** Ponte para criar um caderno a partir de um documento pronto (diálogo "Novo documento", 0.18). A Home registra a função
 *  enquanto está montada; sem ela, o documento só é carregado no caderno atual. */
let createFromDoc: ((doc: HirakuDoc, name: string) => Promise<void>) | null = null;
export async function createNotebookFromDoc(doc: HirakuDoc, name: string): Promise<void> {
  if (createFromDoc) return createFromDoc(doc, name);
  useDoc.getState().loadDoc(doc);
  useUI.getState().setNotebookName(name);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: "id" }); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function all(): Promise<Notebook[]> {
  const db = await openDb();
  try {
    const raw = await new Promise<Notebook[]>((resolve, reject) => { const r = db.transaction(STORE).objectStore(STORE).getAll(); r.onsuccess = () => resolve(r.result as Notebook[]); r.onerror = () => reject(r.error); });
    // Cadernos salvos por versões antigas (sem camadas, campos novos…) passam pela mesma migração do arquivo .hiraku.
    // Sem isso a capa lia `page.layers` indefinido e a tela inicial inteira quebrava (tela vazia).
    const out: Notebook[] = [];
    for (const n of raw) {
      if (!n?.id || !n.doc?.pages?.length) continue;
      try { out.push({ ...n, cover: cleanCover(n.cover), folder: typeof n.folder === "string" ? n.folder : undefined, doc: normalizeDoc(n.doc) }); } catch { /* caderno ilegível: fica de fora em vez de derrubar tudo */ }
    }
    return out;
  }
  finally { db.close(); }
}
async function put(n: Notebook): Promise<void> {
  const db = await openDb();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(n); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
  finally { db.close(); }
}
async function drop(id: string): Promise<void> {
  const db = await openDb();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
  finally { db.close(); }
}

async function readLegacyAutosave(): Promise<HirakuDoc | null> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("hm-ideas"); // sem versão: não briga com a cópia automática (core/autosave.ts)
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    if (!db.objectStoreNames.contains("kv")) return null;
    const raw = await new Promise<string | null>((resolve, reject) => {
      const request = db.transaction("kv").objectStore("kv").get("autosave");
      request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
      request.onerror = () => reject(request.error);
    });
    return raw ? parseDoc(raw) : null;
  } finally { db.close(); }
}

export const COVER_COLORS = ["#6A3FD1", "#E0197D", "#2F5BD3", "#0E8A9B", "#2E9B5F", "#C98612", "#D2453A", "#3D4557"];
const coverOf = (n: Notebook) => n.color ?? COVER_COLORS[Math.abs([...n.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % COVER_COLORS.length];

/** Papéis oferecidos ao criar um caderno. */
const NEW_PAPERS: { kind: PaperKind; bg: string; label: string }[] = [
  { kind: "blank", bg: "#FFFFFF", label: "Liso" },
  { kind: "ruled", bg: "#FFFFFF", label: "Pautado" },
  { kind: "margin", bg: "#FFFFFF", label: "Caderno" },
  { kind: "grid", bg: "#FFFFFF", label: "Quadriculado" },
  { kind: "dots", bg: "#FAF1C7", label: "Pontilhado" },
  { kind: "mm", bg: "#FFFFFF", label: "Milimetrado" },
  { kind: "iso", bg: "#FFFFFF", label: "Isométrico" },
  { kind: "grid", bg: "#1F3B2D", label: "Lousa" },
  { kind: "blank", bg: DEFAULT_BACKGROUND, label: "Quadro branco" },
  ...STUDY_PAPERS,
];

function ago(t: number): string {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "agora mesmo";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  if (s < 86400 * 7) { const d = Math.round(s / 86400); return d === 1 ? "ontem" : `há ${d} dias`; }
  return new Date(t).toLocaleDateString();
}

const greeting = () => { const h = new Date().getHours(); return h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };

/** Capa: papel + conteúdo real da primeira página (ou cor/degradê/padrão com título), com a lombada colorida. */
const CoverArt = memo(function CoverArt({ page, color, cover, title }: { page: Page; color: string; cover?: Cover; title: string }) {
  const { paths, viewBox } = useMemo(() => pageThumb(page), [page]);
  if (cover && cover.style !== "page") return (
    <div className="nb-cover" style={{ ["--spine" as string]: color }}>
      <div className="nb-paper nb-art" style={{ background: coverCss(cover, color) }}>
        {cover.title && <span className="nb-title">{title}</span>}
      </div>
      <span className="nb-spine" />
    </div>
  );
  return (
    <div className="nb-cover" style={{ ["--spine" as string]: color }}>
      <div className="nb-paper">
        <PaperSwatch kind={page.paper} bg={safeColor(page.background, "#FFFFFF")} line={page.lineColor} scale={page.paperScale ?? 1} w={180} h={240} zoom={0.45} slice />
        {paths.length > 0 && (
          <svg className="nb-content" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            {paths.map((p, i) => <path key={i} d={p.d} fill={p.fill} stroke={p.stroke ?? "none"} strokeWidth={p.sw} strokeLinejoin="round" strokeLinecap="round" opacity={p.alpha < 1 ? p.alpha : undefined} />)}
          </svg>
        )}
      </div>
      <span className="nb-spine" />
    </div>
  );
}, (a, b) => a.page === b.page && a.color === b.color && a.cover === b.cover && a.title === b.title);

export function NotebookManager() {
  const opened = useUI((u) => u.notebooksOpen), setOpened = useUI.getState().setNotebooksOpen;
  const [items, setItems] = useState<Notebook[]>([]), [active, setActive] = useState("");
  const [query, setQuery] = useState(""), [renameId, setRenameId] = useState(""), [renameValue, setRenameValue] = useState("");
  const [fmt, setFmt] = useState(() => { try { return localStorage.getItem("hm-ideas:new-format") || "infinite"; } catch { return "infinite"; } });
  useEffect(() => { try { localStorage.setItem("hm-ideas:new-format", fmt); } catch { /* sem armazenamento */ } }, [fmt]);
  const [sort, setSort] = useState<"recent" | "name" | "created">(() => (localStorage.getItem("hm-ideas:home-sort") as "recent") || "recent");
  const [menu, setMenu] = useState<string | null>(null);
  const [folders, setFoldersState] = useState<Folder[]>(loadFolders);
  const [folder, setFolder] = useState<string>(() => localStorage.getItem("hm-ideas:home-folder") || "");
  const [folderEdit, setFolderEdit] = useState<string | null>(null);
  const [coverFor, setCoverFor] = useState<string | null>(null);
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const pageTemplates = usePageTemplates((t) => t.list);
  const setFolders = (list: Folder[]) => { setFoldersState(list); try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(list)); } catch { /* sem armazenamento */ } };
  useEffect(() => { try { localStorage.setItem("hm-ideas:home-folder", folder); } catch { /* sem armazenamento */ } }, [folder]);
  const [deleteTarget, setDeleteTarget] = useState<Notebook | null>(null), [ready, setReady] = useState(false);
  const itemsRef = useRef<Notebook[]>([]), activeRef = useRef(""), readyRef = useRef(false), switching = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  const update = (list: Notebook[]) => { itemsRef.current = list; setItems(list); };
  const toast = (m: string) => useUI.getState().showToast(m);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let list = await all(), id = localStorage.getItem(ACTIVE) || "";
        if (!list.length) {
          const legacy = await readLegacyAutosave().catch(() => null);
          const first: Notebook = { id: newId(), name: "Meu primeiro caderno", updatedAt: Date.now(), createdAt: Date.now(), doc: legacy ?? useDoc.getState().doc };
          await put(first); list = [first]; id = first.id;
        }
        if (!list.some((n) => n.id === id)) id = list[0].id;
        const selected = list.find((n) => n.id === id)!;
        if (cancelled) return;
        update(list); activeRef.current = id; setActive(id); localStorage.setItem(ACTIVE, id);
        switching.current = true; useDoc.getState().loadDoc(parseDoc(serializeDoc(selected.doc))); switching.current = false;
        readyRef.current = true; setReady(true);
        // abre na tela inicial (preferência; padrão: sim)
        if (localStorage.getItem(START_HOME_KEY) !== "0") setOpened(true);
      } catch { if (!cancelled) toast("Não foi possível abrir os cadernos locais."); }
    })();
    return () => { cancelled = true; clearTimeout(timer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    const unsub = useDoc.subscribe((s, prev) => {
      if (!readyRef.current || switching.current || s.doc === prev.doc) return;
      const id = activeRef.current, current = itemsRef.current.find((n) => n.id === id);
      if (!current) return;
      const snapshot = { ...current, doc: s.doc, updatedAt: Date.now() };
      update(itemsRef.current.map((n) => n.id === id ? snapshot : n));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { void put(snapshot).catch(() => toast("Falha ao salvar o caderno.")); }, 450);
    });
    return unsub;
  }, [ready]);

  // O nome do caderno atual aparece no topo (chip ao lado do botão de páginas).
  useEffect(() => { useUI.getState().setNotebookName(items.find((n) => n.id === active)?.name ?? ""); }, [items, active]);

  useEffect(() => {
    if (!opened) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !renameId && !deleteTarget) { if (menu) setMenu(null); else setOpened(false); } };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [opened, renameId, deleteTarget, menu, setOpened]);

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase();
  const sorted = useMemo(() => {
    const fid = folder === "none" || folders.some((f) => f.id === folder) ? folder : "";
    const inFolder = (n: Notebook) => !fid || (fid === "none" ? !n.folder || !folders.some((f) => f.id === n.folder) : n.folder === fid);
    const list = items.filter((n) => norm(n.name).includes(norm(query)) && (query ? true : inFolder(n)));
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "pt", { numeric: true }));
    else if (sort === "created") list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    else list.sort((a, b) => b.updatedAt - a.updatedAt);
    return list;
  }, [items, query, sort, folder, folders]);
  const favorites = sorted.filter((n) => n.favorite);

  const saveCurrent = async () => {
    clearTimeout(timer.current);
    const n = itemsRef.current.find((x) => x.id === activeRef.current);
    if (n) await put({ ...n, doc: useDoc.getState().doc, updatedAt: Date.now() });
  };
  const switchTo = async (n: Notebook, close = true) => {
    if (n.id !== activeRef.current) {
      try {
        await saveCurrent(); switching.current = true; activeRef.current = n.id; setActive(n.id); localStorage.setItem(ACTIVE, n.id);
        resetPageCameras();
        useDoc.getState().loadDoc(parseDoc(serializeDoc(n.doc))); switching.current = false;
        fitActivePage();
      } catch { switching.current = false; toast("Não foi possível trocar de caderno."); return; }
    }
    if (close) setOpened(false);
  };
  const create = async (paper?: { kind: PaperKind; bg: string; label: string }, fromTemplate?: string) => {
    try {
      await saveCurrent();
      const doc = createDoc();
      const tpl = fromTemplate ? pageTemplates.find((t) => t.id === fromTemplate) : undefined;
      if (tpl) doc.pages = [pageFromTemplate(tpl, "Página 1")];
      const size = PAGE_SIZES.find((f) => f.id === fmt)?.size ?? undefined;
      if (paper && !tpl) doc.pages = doc.pages.map((p) => ({ ...p, paper: paper.kind, background: paper.bg }));
      if (size && !tpl) doc.pages = doc.pages.map((p) => ({ ...p, size }));
      const used = new Set(itemsRef.current.map((x) => x.name));
      let k = itemsRef.current.length + 1;
      while (used.has(`Caderno ${k}`)) k++;
      const n: Notebook = { id: newId(), name: `Caderno ${k}`, updatedAt: Date.now(), createdAt: Date.now(), color: COVER_COLORS[k % COVER_COLORS.length], ...(folders.some((f) => f.id === folder) ? { folder } : {}), doc };
      await put(n); update([...itemsRef.current, n]); await switchTo(n); setQuery("");
      toast(`“${n.name}” criado. Toque no nome no topo para voltar aos cadernos.`);
    } catch { toast("Não foi possível criar o caderno."); }
  };
  const createDoc2 = async (doc: HirakuDoc, wanted: string) => {
    try {
      await saveCurrent();
      const used = new Set(itemsRef.current.map((x) => x.name));
      const base = wanted.trim().slice(0, 80) || "Sem título";
      let name = base, k = 2;
      while (used.has(name)) name = `${base} (${k++})`;
      const n: Notebook = { id: newId(), name, updatedAt: Date.now(), createdAt: Date.now(), color: COVER_COLORS[itemsRef.current.length % COVER_COLORS.length], ...(folders.some((f) => f.id === folder) ? { folder } : {}), doc: normalizeDoc(doc) };
      await put(n); update([...itemsRef.current, n]); await switchTo(n); setQuery("");
      toast(`“${n.name}” criado.`);
    } catch { toast("Não foi possível criar o documento."); }
  };
  useEffect(() => { createFromDoc = createDoc2; return () => { createFromDoc = null; }; });
  const patch = async (n: Notebook, p: Partial<Notebook>) => {
    const next = { ...n, ...p };
    try { await put(next); update(itemsRef.current.map((x) => x.id === n.id ? next : x)); } catch { toast("Não foi possível salvar a mudança."); }
  };
  const addFolder = () => {
    const used = new Set(folders.map((f) => f.name));
    let k = folders.length + 1;
    while (used.has(`Pasta ${k}`)) k++;
    const f: Folder = { id: newId(), name: `Pasta ${k}`, color: COVER_COLORS[(k + 2) % COVER_COLORS.length] };
    setFolders([...folders, f]); setFolder(f.id); setFolderEdit(f.id);
  };
  const removeFolder = async (f: Folder) => {
    setFolders(folders.filter((x) => x.id !== f.id));
    if (folder === f.id) setFolder("");
    for (const n of itemsRef.current.filter((x) => x.folder === f.id)) await patch(n, { folder: undefined });
    toast(`Pasta “${f.name}” apagada. Os cadernos dela continuam em “Todos”.`);
  };
  const moveTo = (n: Notebook, id: string | undefined) => {
    void patch(n, { folder: id });
    const f = folders.find((x) => x.id === id);
    toast(f ? `“${n.name}” foi para “${f.name}”.` : `“${n.name}” saiu da pasta.`);
  };
  const duplicate = async (n: Notebook) => {
    try { const copy: Notebook = { ...n, id: newId(), name: `${n.name} (cópia)`, updatedAt: Date.now(), createdAt: Date.now(), favorite: false, doc: parseDoc(serializeDoc(n.doc)) }; await put(copy); update([...itemsRef.current, copy]); }
    catch { toast("Não foi possível duplicar o caderno."); }
  };
  const rename = async (n: Notebook) => {
    const name = renameValue.trim().slice(0, 80);
    if (!name) { toast("Digite um nome para o caderno."); return; }
    await patch(n, { name, updatedAt: Date.now() });
    setRenameId("");
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const doc = parseDoc(await file.text());
      const n: Notebook = { id: newId(), name: file.name.replace(/\.hiraku$/i, "").slice(0, 80) || "Importado", updatedAt: Date.now(), createdAt: Date.now(), doc };
      await put(n); update([...itemsRef.current, n]);
      toast(`“${n.name}” importado.`);
    } catch (err) { toast(err instanceof Error ? err.message : "Não foi possível importar."); }
  };
  const confirmDelete = async () => {
    if (!deleteTarget || itemsRef.current.length < 2) return;
    const target = deleteTarget;
    try {
      if (target.id === activeRef.current) await saveCurrent();
      await drop(target.id); const next = itemsRef.current.filter((n) => n.id !== target.id); update(next); setDeleteTarget(null);
      if (target.id === activeRef.current) await switchTo(next[0], false);
    } catch { toast("Não foi possível excluir o caderno."); }
  };

  if (!ready) return null;
  const current = items.find((n) => n.id === active);

  const card = (n: Notebook) => (
    <article className={n.id === active ? "nb-card active" : "nb-card"} key={n.id} draggable={!renameId}
      onDragStart={(e) => { e.dataTransfer.setData("text/x-hm-notebook", n.id); e.dataTransfer.effectAllowed = "move"; }}>
      <button className="nb-open" onClick={() => void switchTo(n)} aria-label={`Abrir ${n.name}`}>
        <CoverArt page={n.doc.pages[0]} color={coverOf(n)} cover={n.cover} title={n.name} />
      </button>
      <div className="nb-info">
        {renameId === n.id ? (
          <input className="rename" value={renameValue} autoFocus onChange={(e) => setRenameValue(e.target.value)} onBlur={() => void rename(n)}
            onKeyDown={(e) => { if (e.key === "Enter") void rename(n); if (e.key === "Escape") setRenameId(""); }} />
        ) : (
          <b title={n.name} onDoubleClick={() => { setRenameId(n.id); setRenameValue(n.name); }}>{n.name}</b>
        )}
        <small>{n.doc.pages.length} {n.doc.pages.length === 1 ? "página" : "páginas"} · {ago(n.updatedAt)}{n.id === active ? " · aberto" : ""}</small>
      </div>
      <button className={n.favorite ? "nb-star on" : "nb-star"} onClick={() => void patch(n, { favorite: !n.favorite })} aria-label={n.favorite ? "Tirar dos favoritos" : "Favoritar"} title={n.favorite ? "Tirar dos favoritos" : "Favoritar"}>
        <Icon size={18}><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" /></Icon>
      </button>
      <div className="nb-more">
        <button className="nb-dots" onClick={() => setMenu(menu === n.id ? null : n.id)} aria-label="Mais ações" aria-expanded={menu === n.id}>
          <Icon size={18}><circle cx="5.5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18.5" cy="12" r="1.2" /></Icon>
        </button>
        {menu === n.id && (
          <div className="menu nb-menu" role="menu" onClick={() => setMenu(null)}>
            <button role="menuitem" onClick={() => { setRenameId(n.id); setRenameValue(n.name); }}>Renomear</button>
            <button role="menuitem" onClick={() => void duplicate(n)}>Duplicar</button>
            <button role="menuitem" onClick={() => downloadDoc(n.doc, n.name.replace(/[^\w\- À-ú]/g, "").trim() || "caderno")}>Exportar .hiraku</button>
            <button role="menuitem" onClick={(e) => { e.stopPropagation(); setCoverFor(coverFor === n.id ? null : n.id); }}>Capa…</button>
            {coverFor === n.id && (
              <div className="nb-cover-ed" onClick={(e) => e.stopPropagation()}>
                <div className="seg small" role="radiogroup" aria-label="Estilo da capa">
                  {COVER_STYLES.map((c) => <button key={c.id} role="radio" aria-checked={(n.cover?.style ?? "page") === c.id} className={(n.cover?.style ?? "page") === c.id ? "on" : ""} onClick={() => void patch(n, { cover: { ...n.cover, style: c.id, title: c.id === "page" ? undefined : n.cover?.title ?? true } })}>{c.label}</button>)}
                </div>
                {n.cover?.style === "pattern" && (
                  <div className="nb-patterns">
                    {COVER_PATTERNS.map((pt) => <button key={pt.id} className={(n.cover?.pattern ?? "dots") === pt.id ? "nb-pat on" : "nb-pat"} style={{ background: coverCss({ style: "pattern", pattern: pt.id }, coverOf(n)) }} aria-label={pt.label} title={pt.label} onClick={() => void patch(n, { cover: { ...n.cover!, pattern: pt.id } })} />)}
                  </div>
                )}
                {n.cover && n.cover.style !== "page" && (
                  <label className="nb-check"><input type="checkbox" checked={!!n.cover.title} onChange={(e) => void patch(n, { cover: { ...n.cover!, title: e.target.checked || undefined } })} /> Título na capa</label>
                )}
              </div>
            )}
            {folders.length > 0 && (
              <div className="nb-folders-menu" onClick={(e) => e.stopPropagation()}>
                <small>Mover para</small>
                {n.folder && <button role="menuitem" onClick={() => { moveTo(n, undefined); setMenu(null); }}>Sem pasta</button>}
                {folders.filter((f) => f.id !== n.folder).map((f) => <button key={f.id} role="menuitem" onClick={() => { moveTo(n, f.id); setMenu(null); }}><span className="dot" style={{ background: f.color }} />{f.name}</button>)}
              </div>
            )}
            <div className="nb-colors" onClick={(e) => e.stopPropagation()}>
              {COVER_COLORS.map((c) => <button key={c} className={coverOf(n) === c ? "swatch on" : "swatch"} style={{ background: c }} aria-label={`Capa ${c}`} onClick={() => { void patch(n, { color: c }); setMenu(null); }} />)}
            </div>
            <button role="menuitem" className="danger" disabled={items.length < 2} onClick={() => setDeleteTarget(n)}>Excluir…</button>
          </div>
        )}
      </div>
    </article>
  );

  return <>
    {opened && (
      <div className="home" role="dialog" aria-modal="true" aria-label="Meus cadernos" onPointerDown={(e) => { if (menu && !(e.target as HTMLElement).closest(".nb-more")) setMenu(null); }}>
        <header className="home-head">
          <div className="home-brand">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={36} height={36} />
            <div><strong>{greeting()}!</strong><small>Seus cadernos ficam salvos neste dispositivo.</small></div>
          </div>
          <input className="home-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cadernos…" aria-label="Buscar cadernos" />
          <div className="home-actions">
            <button className="btn tb" onClick={() => fileRef.current?.click()} title="Importar arquivo .hiraku"><Icon size={20}><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" /></Icon><span className="lbl">Importar</span></button>
            <button className="btn" onClick={() => useUI.getState().setSettingsOpen(true)} aria-label="Configurações" title="Configurações">
              <Icon><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></Icon>
            </button>
            {current && <button className="btn primary" onClick={() => setOpened(false)} title="Voltar ao caderno aberto (Esc)">Continuar “{current.name.length > 22 ? current.name.slice(0, 21) + "…" : current.name}”</button>}
          </div>
          <input ref={fileRef} type="file" accept=".hiraku,application/json" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} />
        </header>

        <div className="home-body">
          {!query && (
            <section>
              <div className="nb-new-head">
                <h2>Novo caderno</h2>
                <button className="btn sm nb-newdoc" onClick={() => openNewDocument()} title="Escolher tamanho, resolução, unidade e fundo (Ctrl+N)">Novo documento…</button>
                <div className="seg fmt-seg" role="radiogroup" aria-label="Formato do caderno">
                  {PAGE_SIZES.map((f) => (
                    <button key={f.id} role="radio" aria-checked={fmt === f.id} className={fmt === f.id ? "on" : ""} onClick={() => setFmt(f.id)} title={f.size ? "Caderno com páginas de tamanho fixo" : "Quadro sem bordas (padrão)"}>
                      <FormatIcon size={f.size} />{f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="nb-new">
                {NEW_PAPERS.map((p) => (
                  <button key={p.label} className="nb-newcard" onClick={() => void create(p)} title={`Criar caderno ${p.label.toLowerCase()}`}>
                    <PaperSwatch kind={p.kind} bg={p.bg} w={96} h={124} zoom={0.4} />
                    <span>{p.label}</span>
                  </button>
                ))}
                {pageTemplates.slice(0, 6).map((t) => (
                  <button key={t.id} className="nb-newcard mine" onClick={() => void create(undefined, t.id)} title={`Criar caderno com o seu modelo “${t.name}”`}>
                    <PaperSwatch kind={t.page.paper} bg={safeColor(t.page.background, "#FFFFFF")} w={96} h={124} zoom={0.4} />
                    <span>{t.name}</span>
                  </button>
                ))}
                <button className="nb-newcard tpl" onClick={() => { void create(NEW_PAPERS[NEW_PAPERS.length - 1]).then(() => useUI.getState().setTemplatesOpen(true)); }} title="Criar um caderno e escolher um modelo pronto">
                  <span className="nb-tpl-art"><Icon size={34}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Icon></span>
                  <span>De um modelo…</span>
                </button>
              </div>
            </section>
          )}

          {!query && (
            <nav className="nb-folders" aria-label="Pastas">
              {([["", "Todos", items.length], ["none", "Sem pasta", items.filter((n) => !n.folder || !folders.some((f) => f.id === n.folder)).length]] as const).map(([id, label, count]) => (
                <button key={id || "all"} className={folder === id ? "nb-folder on" : "nb-folder"} onClick={() => setFolder(id)}>{label} <small>{count}</small></button>
              ))}
              {folders.map((f) => (
                <div key={f.id} className={["nb-folder", folder === f.id && "on", dropFolder === f.id && "drop"].filter(Boolean).join(" ")}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes("text/x-hm-notebook")) { e.preventDefault(); setDropFolder(f.id); } }}
                  onDragLeave={() => setDropFolder(null)}
                  onDrop={(e) => { e.preventDefault(); setDropFolder(null); const n = items.find((x) => x.id === e.dataTransfer.getData("text/x-hm-notebook")); if (n) moveTo(n, f.id); }}>
                  {folderEdit === f.id ? (
                    <input className="rename" autoFocus defaultValue={f.name} maxLength={40} aria-label="Nome da pasta" onFocus={(e) => e.currentTarget.select()}
                      onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v) setFolders(folders.map((x) => x.id === f.id ? { ...x, name: v } : x)); setFolderEdit(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setFolderEdit(null); }} />
                  ) : (
                    <button className="nb-folder-btn" onClick={() => setFolder(f.id)} onDoubleClick={() => setFolderEdit(f.id)} title="Duplo clique renomeia · arraste cadernos para cá">
                      <span className="dot" style={{ background: f.color }} />{f.name} <small>{items.filter((n) => n.folder === f.id).length}</small>
                    </button>
                  )}
                  {folder === f.id && folderEdit !== f.id && <>
                    <button className="nb-folder-x" onClick={() => setFolderEdit(f.id)} aria-label={`Renomear pasta ${f.name}`} title="Renomear"><Icon size={14}><path d="M4 20l4-1 11-11a2.1 2.1 0 00-3-3L5 16l-1 4z" /></Icon></button>
                    <button className="nb-folder-x" onClick={() => void removeFolder(f)} aria-label={`Apagar pasta ${f.name}`} title="Apagar pasta (os cadernos ficam)"><Icon size={14}><path d="M6 6l12 12M18 6L6 18" /></Icon></button>
                  </>}
                </div>
              ))}
              <button className="nb-folder add" onClick={addFolder} title="Nova pasta"><Icon size={16}><path d="M12 5v14M5 12h14" /></Icon> Pasta</button>
            </nav>
          )}

          {favorites.length > 0 && !query && (
            <section>
              <h2>Favoritos</h2>
              <div className="nb-grid">{favorites.map(card)}</div>
            </section>
          )}

          <section>
            <div className="home-row">
              <h2>{query ? `Resultados para “${query}”` : folder === "" ? "Todos os cadernos" : folder === "none" ? "Sem pasta" : folders.find((f) => f.id === folder)?.name ?? "Pasta"} <small>{sorted.length}</small></h2>
              <div className="seg small" role="tablist" aria-label="Ordenar">
                {([["recent", "Recentes"], ["name", "Nome"], ["created", "Criação"]] as const).map(([v, l]) => (
                  <button key={v} role="tab" aria-selected={sort === v} className={sort === v ? "on" : ""} onClick={() => { setSort(v); localStorage.setItem("hm-ideas:home-sort", v); }}>{l}</button>
                ))}
              </div>
            </div>
            <div className="nb-grid">{sorted.map(card)}</div>
            {!sorted.length && <p className="notebook-empty">Nenhum caderno encontrado.</p>}
          </section>
        </div>
      </div>
    )}
    {deleteTarget && <div className="notebook-confirm-backdrop"><section className="notebook-confirm" role="alertdialog" aria-modal="true"><strong>Excluir “{deleteTarget.name}”?</strong><p>O caderno e todas as páginas dele serão apagados deste dispositivo. Esta ação não pode ser desfeita.</p><div><button className="btn" onClick={() => setDeleteTarget(null)}>Cancelar</button><button className="btn danger" onClick={() => void confirmDelete()}>Excluir caderno</button></div></section></div>}
  </>;
}
