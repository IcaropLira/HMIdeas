// Cópia automática do documento no navegador (IndexedDB): fechar a aba, falta de energia ou uma atualização do app
// não perdem o desenho. NÃO é o arquivo do usuário (isso continua sendo "Salvar" → .hiraku); é só uma rede de segurança.
import { parseDoc, serializeDoc } from "./serialize";
import { useDoc } from "./store";
import { useUI } from "./ui";
import { create } from "zustand";

/** Estado da cópia automática, para a barra de status. */
export const useSaveState = create<{ state: "saved" | "pending" | "error"; at: number }>(() => ({ state: "saved", at: Date.now() }));

const DB = "hm-ideas";
const STORE = "kv";
const KEY = "autosave";

/**
 * Abre o banco garantindo o depósito `kv`. Se outra parte do app abriu "hm-ideas" antes sem criar o depósito
 * (leitura da cópia antiga na tela inicial), sobe a versão e cria — antes a cópia automática falhava em silêncio.
 */
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => {
      const db = r.result;
      if (db.objectStoreNames.contains(STORE)) { res(db); return; }
      const v = db.version + 1;
      db.close();
      const u = indexedDB.open(DB, v);
      u.onupgradeneeded = () => { if (!u.result.objectStoreNames.contains(STORE)) u.result.createObjectStore(STORE); };
      u.onsuccess = () => res(u.result);
      u.onerror = () => rej(u.error);
    };
    r.onerror = () => rej(r.error);
  });
}

async function put(text: string): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(text, KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

async function get(): Promise<string | null> {
  const db = await open();
  const v = await new Promise<string | null>((res, rej) => {
    const rq = db.transaction(STORE).objectStore(STORE).get(KEY);
    rq.onsuccess = () => res((rq.result as string | undefined) ?? null);
    rq.onerror = () => rej(rq.error);
  });
  db.close();
  return v;
}

/** Restaura a sessão anterior (se houver) e passa a guardar as mudanças. Devolve a função que desliga. */
export function initAutosave(restore = true): () => void {
  if (typeof indexedDB === "undefined") return () => undefined;
  let off = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsub: (() => void) | undefined;

  const flush = () => {
    clearTimeout(timer);
    void put(serializeDoc(useDoc.getState().doc))
      .then(() => useSaveState.setState({ state: "saved", at: Date.now() }))
      .catch(() => useSaveState.setState({ state: "error", at: Date.now() }));
  };
  const onHide = () => { if (document.visibilityState === "hidden") flush(); };

  void (async () => {
    if (restore) {
      try {
        const saved = await get();
        const s = useDoc.getState();
        const pristine = s.past.length === 0 && s.doc.pages.every((p) => p.elements.length === 0);
        if (!off && saved && pristine) {
          const doc = parseDoc(saved);
          if (doc.pages.some((p) => p.elements.length > 0)) {
            s.loadDoc(doc);
            useUI.getState().showToast("Sua sessão anterior foi restaurada.");
          }
        }
      } catch { /* cópia ilegível: segue com o documento em branco */ }
    }
    if (off) return;
    unsub = useDoc.subscribe((s, prev) => {
      if (s.doc === prev.doc) return;
      if (useSaveState.getState().state !== "pending") useSaveState.setState({ state: "pending" });
      clearTimeout(timer);
      timer = setTimeout(flush, 1200);
    });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
  })();

  return () => {
    off = true;
    clearTimeout(timer);
    unsub?.();
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", flush);
  };
}
