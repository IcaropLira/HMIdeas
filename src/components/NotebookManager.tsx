import { useEffect, useMemo, useRef, useState } from "react";
import { createDoc, HirakuDoc, newId } from "../core/model";
import { downloadDoc, parseDoc, serializeDoc } from "../core/serialize";
import { useDoc } from "../core/store";
import { useUI } from "../core/ui";

type Notebook = { id: string; name: string; updatedAt: number; doc: HirakuDoc };
const DB = "hm-ideas-notebooks", STORE = "notebooks", ACTIVE = "hm-ideas:notebooks:active";
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: "id" }); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function all(): Promise<Notebook[]> {
  const db = await openDb();
  try { return await new Promise((resolve, reject) => { const r = db.transaction(STORE).objectStore(STORE).getAll(); r.onsuccess = () => resolve((r.result as Notebook[]).filter((n) => n?.id && n.doc?.pages?.length)); r.onerror = () => reject(r.error); }); }
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
    const request = indexedDB.open("hm-ideas", 1);
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

export function NotebookManager() {
  const [opened, setOpened] = useState(false), [items, setItems] = useState<Notebook[]>([]), [active, setActive] = useState("");
  const [query, setQuery] = useState(""), [renameId, setRenameId] = useState(""), [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Notebook | null>(null), [ready, setReady] = useState(false);
  const itemsRef = useRef<Notebook[]>([]), activeRef = useRef(""), readyRef = useRef(false), switching = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const update = (list: Notebook[]) => { itemsRef.current = list; setItems(list); };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let list = await all(), id = localStorage.getItem(ACTIVE) || "";
        if (!list.length) {
          const legacy = await readLegacyAutosave().catch(() => null);
          const first = { id: newId(), name: "Meu primeiro caderno", updatedAt: Date.now(), doc: legacy ?? useDoc.getState().doc };
          await put(first); list = [first]; id = first.id;
        }
        if (!list.some((n) => n.id === id)) id = list[0].id;
        const selected = list.find((n) => n.id === id)!;
        if (cancelled) return;
        update(list); activeRef.current = id; setActive(id); localStorage.setItem(ACTIVE, id);
        switching.current = true; useDoc.getState().loadDoc(parseDoc(serializeDoc(selected.doc))); switching.current = false;
        readyRef.current = true; setReady(true);
      } catch { if (!cancelled) useUI.getState().showToast("Não foi possível abrir os cadernos locais."); }
    })();
    return () => { cancelled = true; clearTimeout(timer.current); };
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
      timer.current = setTimeout(() => { void put(snapshot).catch(() => useUI.getState().showToast("Falha ao salvar o caderno.")); }, 450);
    });
    return unsub;
  }, [ready]);

  const filtered = useMemo(() => items.filter((n) => n.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [items, query]);
  const saveCurrent = async () => {
    clearTimeout(timer.current);
    const n = itemsRef.current.find((x) => x.id === activeRef.current);
    if (n) await put({ ...n, doc: useDoc.getState().doc, updatedAt: Date.now() });
  };
  const switchTo = async (n: Notebook) => {
    if (n.id === activeRef.current) return;
    try {
      await saveCurrent(); switching.current = true; activeRef.current = n.id; setActive(n.id); localStorage.setItem(ACTIVE, n.id);
      useDoc.getState().loadDoc(parseDoc(serializeDoc(n.doc))); switching.current = false;
    } catch { switching.current = false; useUI.getState().showToast("Não foi possível trocar de caderno."); }
  };
  const create = async () => {
    try {
      await saveCurrent();
      const n: Notebook = { id: newId(), name: `Novo caderno ${itemsRef.current.length + 1}`, updatedAt: Date.now(), doc: createDoc() };
      await put(n); update([...itemsRef.current, n]); await switchTo(n); setQuery("");
    } catch { useUI.getState().showToast("Não foi possível criar o caderno."); }
  };
  const duplicate = async (n: Notebook) => {
    try { const copy = { ...n, id: newId(), name: `${n.name} (cópia)`, updatedAt: Date.now(), doc: parseDoc(serializeDoc(n.doc)) }; await put(copy); update([...itemsRef.current, copy]); }
    catch { useUI.getState().showToast("Não foi possível duplicar o caderno."); }
  };
  const rename = async (n: Notebook) => {
    const name = renameValue.trim().slice(0, 80);
    if (!name) { useUI.getState().showToast("Digite um nome para o caderno."); return; }
    const next = { ...n, name, updatedAt: Date.now() };
    try { await put(next); update(itemsRef.current.map((x) => x.id === n.id ? next : x)); setRenameId(""); }
    catch { useUI.getState().showToast("Não foi possível renomear o caderno."); }
  };
  const confirmDelete = async () => {
    if (!deleteTarget || itemsRef.current.length < 2) return;
    const target = deleteTarget;
    try {
      if (target.id === activeRef.current) await saveCurrent();
      await drop(target.id); const next = itemsRef.current.filter((n) => n.id !== target.id); update(next); setDeleteTarget(null);
      if (target.id === activeRef.current) await switchTo(next[0]);
    } catch { useUI.getState().showToast("Não foi possível excluir o caderno."); }
  };

  if (!ready) return null;
  return <>
    <button className="notebook-launch btn" onClick={() => setOpened(true)} title="Gerenciador de cadernos">▤ Cadernos</button>
    {opened && <div className="notebook-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpened(false); }}>
      <section className="notebook-dialog" role="dialog" aria-modal="true" aria-label="Meus cadernos">
        <header><div><strong>Meus cadernos</strong><small>Organize suas ideias em espaços separados.</small></div><button className="btn" onClick={() => setOpened(false)} aria-label="Fechar">×</button></header>
        <div className="notebook-tools"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cadernos…" /><button className="btn primary" onClick={() => void create()}>＋ Novo caderno</button></div>
        <div className="notebook-list">{filtered.map((n) => <article className={n.id === active ? "notebook-card active" : "notebook-card"} key={n.id}>
          <div className="notebook-open"><span className="notebook-cover">▤</span><span>{renameId === n.id ? <input value={renameValue} autoFocus onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void rename(n); if (e.key === "Escape") setRenameId(""); }} /> : <b>{n.name}</b>}<small>{n.doc.pages.length} páginas · {n.doc.pages.reduce((a, p) => a + p.elements.length, 0)} elementos</small><small>{new Date(n.updatedAt).toLocaleString()}</small></span></div>
          <div className="notebook-actions">{renameId === n.id ? <><button className="btn sm" onClick={() => void rename(n)}>Salvar</button><button className="btn sm" onClick={() => setRenameId("")}>Cancelar</button></> : <button className="btn sm" onClick={() => void switchTo(n)} disabled={n.id === active}>Abrir</button>}
            <button className="btn sm" onClick={() => { setRenameId(n.id); setRenameValue(n.name); }}>✎</button><button className="btn sm" onClick={() => void duplicate(n)}>⧉</button>
            <button className="btn sm" onClick={() => downloadDoc(n.doc, n.name.replace(/[^\w\- ]/g, "").trim() || "caderno")}>↓</button><button className="btn sm danger" disabled={items.length < 2} onClick={() => setDeleteTarget(n)}>×</button></div>
        </article>)}{!filtered.length && <p className="notebook-empty">Nenhum caderno encontrado.</p>}</div>
        <footer>Os cadernos são salvos neste dispositivo. Exporte .hiraku para manter uma cópia externa.</footer>
      </section>
    </div>}
    {deleteTarget && <div className="notebook-confirm-backdrop"><section className="notebook-confirm" role="alertdialog" aria-modal="true"><strong>Excluir “{deleteTarget.name}”?</strong><p>Esta ação não pode ser desfeita.</p><div><button className="btn" onClick={() => setDeleteTarget(null)}>Cancelar</button><button className="btn danger" onClick={() => void confirmDelete()}>Excluir caderno</button></div></section></div>}
  </>;
}
