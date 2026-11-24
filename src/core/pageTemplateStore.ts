// Modelos de página do usuário (0.11): guardados neste dispositivo (localStorage), fora do documento e do desfazer.
import { create } from "zustand";
import { Page } from "./model";
import { PageTemplate, cleanTemplates, pageFromTemplate, pageToTemplate } from "./notebook";

const KEY = "hm-ideas:page-templates-v1";
const load = (): PageTemplate[] => { try { return cleanTemplates(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { return []; } };
const save = (list: PageTemplate[]): boolean => { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; } };

interface S {
  list: PageTemplate[];
  /** false = não coube no armazenamento (página com imagens grandes). */
  add: (p: Page, name: string) => boolean;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  make: (id: string) => Page | null;
}

export const usePageTemplates = create<S>((set, get) => ({
  list: typeof localStorage === "undefined" ? [] : load(),
  add: (p, name) => {
    const list = [pageToTemplate(p, name), ...get().list].slice(0, 60);
    if (!save(list)) return false;
    set({ list });
    return true;
  },
  remove: (id) => { const list = get().list.filter((t) => t.id !== id); save(list); set({ list }); },
  rename: (id, name) => {
    const clean = name.trim().slice(0, 60);
    if (!clean) return;
    const list = get().list.map((t) => (t.id === id ? { ...t, name: clean, page: { ...t.page, name: clean } } : t));
    save(list); set({ list });
  },
  make: (id) => { const t = get().list.find((x) => x.id === id); return t ? pageFromTemplate(t) : null; },
}));
