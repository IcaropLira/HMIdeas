// Cópias de segurança automáticas com versões (0.16): fotos do caderno aberto no IndexedDB deste dispositivo, a cada
// poucos minutos de edição e ao sair do app. Guarda as últimas N por caderno; restaurar é desfazível.
import { HirakuDoc } from "./model";
import { serializeDoc } from "./serialize";

export interface Backup { id: string; notebookId: string; name: string; at: number; size: number; pages: number; hash: number; data: string }
export type BackupInfo = Omit<Backup, "data">;

const DB = "hm-ideas-backups", STORE = "snaps";
export const KEEP_PER_NOTEBOOK = 15;

/** Hash rápido (FNV-1a) para não guardar duas fotos iguais seguidas. */
export function hashText(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Quais apagar para ficar só com as `keep` mais novas de cada caderno. Puro. */
export function pruneList(list: BackupInfo[], keep = KEEP_PER_NOTEBOOK): string[] {
  const by = new Map<string, BackupInfo[]>();
  for (const b of list) by.set(b.notebookId, [...(by.get(b.notebookId) ?? []), b]);
  const out: string[] = [];
  for (const l of by.values()) l.sort((a, b) => b.at - a.at).slice(keep).forEach((b) => out.push(b.id));
  return out;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore(STORE, { keyPath: "id" }); s.createIndex("notebookId", "notebookId"); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const t = db.transaction(STORE, mode), req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? req.result : undefined); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
    });
  } finally { db.close(); }
}

export async function listBackups(notebookId?: string): Promise<BackupInfo[]> {
  const all = (await tx<Backup[]>("readonly", (s) => s.getAll())) ?? [];
  return all.filter((b) => !notebookId || b.notebookId === notebookId).map(({ data: _d, ...info }) => info).sort((a, b) => b.at - a.at);
}
export const getBackup = (id: string) => tx<Backup>("readonly", (s) => s.get(id));
export const deleteBackup = (id: string) => tx("readwrite", (s) => s.delete(id));

let lastHash = new Map<string, number>();
/** Tira uma foto (se mudou desde a última) e apaga as velhas. Devolve false se nada mudou. */
export async function saveBackup(notebookId: string, name: string, doc: HirakuDoc): Promise<boolean> {
  const data = serializeDoc(doc), hash = hashText(data);
  if (lastHash.get(notebookId) === hash) return false;
  const prev = (await listBackups(notebookId))[0];
  if (prev && prev.hash === hash) { lastHash.set(notebookId, hash); return false; }
  const b: Backup = { id: `${notebookId}:${Date.now()}`, notebookId, name, at: Date.now(), size: data.length, pages: doc.pages.length, hash, data };
  await tx("readwrite", (s) => s.put(b));
  lastHash.set(notebookId, hash);
  const old = pruneList(await listBackups());
  if (old.length) await tx("readwrite", (s) => { old.forEach((id) => s.delete(id)); });
  return true;
}
export const resetBackupMemo = () => { lastHash = new Map(); };
