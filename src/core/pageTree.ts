// Árvore de subpáginas de um bloco Página (puro): listar, mover (sem ciclos), apagar com as filhas e exportar tudo junto.
import type { SpecOf, SubPage } from "./blocks";
import { plainText } from "./pageMd";

type PageSpec = SpecOf<"page">;
const link = (id: string) => `▤ [[np:${id}]]`;
export const newSubId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export interface PageRow { id: string; title: string; icon: string; depth: number; children: number }

/** Linhas da lista (página principal + subpáginas em profundidade) e, com `inline`, o Markdown com as subpáginas dentro
 *  de toggles (<details>), que o Hiraku Comic Manager e o Obsidian leem. */
export function flattenPage(s: PageSpec, inline = false): { rows: PageRow[]; md: string } {
  const kids = (pid: string) => s.pages.filter((p) => p.parentId === pid || (!pid && !s.pages.some((q) => q.id === p.parentId) && p.parentId !== ""));
  const rows: PageRow[] = [{ id: "", title: s.title, icon: s.icon, depth: 0, children: kids("").length }];
  const seen = new Set<string>();
  const walk = (pid: string, depth: number) => {
    for (const p of kids(pid)) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      rows.push({ id: p.id, title: p.title, icon: p.icon, depth, children: kids(p.id).length });
      walk(p.id, depth + 1);
    }
  };
  walk("", 1);
  if (!inline) return { rows, md: s.md };
  const done = new Set<string>();
  const expand = (md: string, depth: number): string =>
    md.split("\n").map((l) => {
      const m = l.trim().match(/^▤ \[\[np:([^\]|]+)\]\]$/);
      const p = m && s.pages.find((x) => x.id === m[1]);
      if (!p || done.has(p.id) || depth > 30) return l;
      done.add(p.id);
      return `<details><summary>${p.icon ? p.icon + " " : ""}${p.title || "Sem título"}</summary>\n${expand(p.md, depth + 1)}\n</details>`;
    }).join("\n");
  return { rows, md: expand(s.md, 0) };
}

/** Apaga a subpágina e as filhas, e tira os links para elas. */
export function removeSubpages(s: PageSpec, id: string): { spec: PageSpec; removed: Set<string> } {
  const removed = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of s.pages) if (removed.has(p.parentId) && !removed.has(p.id)) { removed.add(p.id); changed = true; }
  }
  const strip = (md: string) => md.split("\n").filter((l) => ![...removed].some((r) => l.trim() === link(r))).join("\n");
  return { removed, spec: { ...s, md: strip(s.md), pages: s.pages.filter((p) => !removed.has(p.id)).map((p) => ({ ...p, md: strip(p.md) })) } };
}

/** Move a subpágina para dentro de outra ("" = página principal). Não deixa criar ciclo. Atualiza os links. */
export function moveSubpage(s: PageSpec, id: string, to: string): PageSpec {
  const p = s.pages.find((x) => x.id === id);
  if (!p || id === to || p.parentId === to) return s;
  for (let q = s.pages.find((x) => x.id === to), n = 0; q && n < 500; q = s.pages.find((x) => x.id === q!.parentId), n++) if (q.id === id) return s;
  const drop = (md: string) => md.split("\n").filter((l) => l.trim() !== link(id)).join("\n");
  const add = (md: string) => (md.includes(link(id)) ? md : md.replace(/\s+$/, "") + (md.trim() ? "\n" : "") + link(id) + "\n");
  const fix = (pid: string, md: string) => (pid === p.parentId ? drop(md) : pid === to ? add(md) : md);
  return {
    ...s,
    md: fix("", s.md),
    pages: s.pages.map((x) => ({ ...x, md: fix(x.id, x.md), parentId: x.id === id ? to : x.parentId })),
  };
}

export const pageWords = (md: string) => { const t = plainText(md).replace(/[#>*|`$\-[\]▤]/g, " ").trim(); return t ? t.split(/\s+/).length : 0; };
export type { SubPage };
