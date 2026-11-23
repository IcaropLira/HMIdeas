// Grupos hierárquicos (0.9). Puro: funções sobre a página que devolvem uma página NOVA.
//
// Modelo: `Page.groups` guarda só a estrutura (id, nome, pai, travado, oculto); cada elemento aponta para o grupo
// mais interno dele por `groupId`. Um grupo pode conter elementos e outros grupos, em qualquer profundidade.
// A ordem de empilhamento continua sendo a de `page.elements`; agrupar junta os membros (sem mudar a ordem entre eles).
//
// "Contexto" = grupo em que o usuário entrou (duplo clique). No contexto raiz (null) um clique pega o grupo de fora;
// dentro de um grupo, pega o filho direto dele (elemento ou subgrupo). Nada disso entra no documento.
import type { Group, HirakuElement, ID, Page } from "./model";
import { newId } from "./model";

export type Unit = { kind: "el"; id: ID } | { kind: "group"; id: ID };

const groupsOf = (page: Pick<Page, "groups">): Group[] => page.groups ?? [];

const mapCache = new WeakMap<Group[], Map<ID, Group>>();
export function groupMap(page: Pick<Page, "groups">): Map<ID, Group> {
  const gs = groupsOf(page);
  let m = mapCache.get(gs);
  if (!m) { m = new Map(gs.map((g) => [g.id, g])); mapCache.set(gs, m); }
  return m;
}

/** Cadeia de grupos do mais interno para fora ([grupo, pai, avô…]). Para ciclos (arquivo estragado) com segurança. */
export function chainOf(page: Pick<Page, "groups">, gid: ID | null | undefined): ID[] {
  const m = groupMap(page);
  const out: ID[] = [];
  let cur = gid ? m.get(gid) : undefined;
  while (cur && !out.includes(cur.id) && out.length < 64) {
    out.push(cur.id);
    cur = cur.parentId ? m.get(cur.parentId) : undefined;
  }
  return out;
}

/** O elemento está dentro do contexto (em qualquer profundidade)? Contexto raiz contém tudo. */
export const insideCtx = (page: Pick<Page, "groups">, el: HirakuElement, ctx: ID | null): boolean =>
  !ctx || chainOf(page, el.groupId).includes(ctx);

/** O que um clique pega no contexto: o grupo logo abaixo do contexto que contém o elemento, ou o próprio elemento. */
export function unitOf(page: Pick<Page, "groups">, el: HirakuElement, ctx: ID | null): Unit | null {
  const chain = chainOf(page, el.groupId);
  if (ctx) {
    const i = chain.indexOf(ctx);
    if (i < 0) return null; // fora do contexto
    return i === 0 ? { kind: "el", id: el.id } : { kind: "group", id: chain[i - 1] };
  }
  return chain.length ? { kind: "group", id: chain[chain.length - 1] } : { kind: "el", id: el.id };
}

/** Todos os elementos dentro do grupo (qualquer profundidade), na ordem da página. */
export function leavesOf(page: Page, gid: ID): HirakuElement[] {
  return page.elements.filter((e) => chainOf(page, e.groupId).includes(gid));
}

export const unitLeaves = (page: Page, u: Unit): HirakuElement[] =>
  u.kind === "el" ? page.elements.filter((e) => e.id === u.id) : leavesOf(page, u.id);

const ukey = (u: Unit) => `${u.kind}:${u.id}`;

/** Unidades (no contexto) que os ids selecionados formam, sem repetir. */
export function selectionUnits(page: Page, ids: ID[], ctx: ID | null): Unit[] {
  const set = new Set(ids);
  const seen = new Set<string>();
  const out: Unit[] = [];
  for (const e of page.elements) {
    if (!set.has(e.id)) continue;
    const u = unitOf(page, e, ctx) ?? { kind: "el", id: e.id };
    if (!seen.has(ukey(u))) { seen.add(ukey(u)); out.push(u); }
  }
  return out;
}

/** A seleção é exatamente um grupo (todas as folhas dele e nada mais)? Devolve o grupo mais externo assim. */
export function exactGroup(page: Page, ids: ID[]): ID | null {
  if (!ids.length) return null;
  const set = new Set(ids);
  const first = page.elements.find((e) => set.has(e.id));
  if (!first) return null;
  const chain = chainOf(page, first.groupId);
  for (let i = chain.length - 1; i >= 0; i--) {
    const leaves = leavesOf(page, chain[i]);
    if (leaves.length === set.size && leaves.every((e) => set.has(e.id))) return chain[i];
  }
  return null;
}

/** Ids a selecionar ao tocar num elemento no contexto (todas as folhas do grupo, ou só ele). */
export function idsForHit(page: Page, el: HirakuElement, ctx: ID | null): ID[] {
  const u = unitOf(page, el, ctx);
  if (!u) return [el.id];
  return unitLeaves(page, u).map((e) => e.id);
}

/** Depois de uma seleção por área/laço: completa grupos tocados (com `whole`, só ficam grupos com tudo dentro). */
export function expandToUnits(page: Page, ids: ID[], ctx: ID | null, whole: boolean): ID[] {
  const set = new Set(ids);
  const out = new Set<ID>();
  for (const u of selectionUnits(page, ids, ctx)) {
    const leaves = unitLeaves(page, u);
    if (whole && u.kind === "group" && !leaves.every((e) => set.has(e.id) || isHiddenEl(page, e))) continue;
    leaves.forEach((e) => out.add(e.id));
  }
  return [...out];
}

// ---------- travado / oculto (efetivos, herdados do grupo) ----------

export function isLockedEl(page: Pick<Page, "groups">, el: HirakuElement): boolean {
  if (el.locked) return true;
  if (!el.groupId) return false;
  const m = groupMap(page);
  return chainOf(page, el.groupId).some((g) => m.get(g)?.locked);
}

export function isHiddenEl(page: Pick<Page, "groups">, el: HirakuElement): boolean {
  if (el.invisible) return true;
  if (!el.groupId) return false;
  const m = groupMap(page);
  return chainOf(page, el.groupId).some((g) => m.get(g)?.hidden);
}

const hiddenCache = new WeakMap<Page, Set<ID>>();
/** Ids que não devem ser desenhados (ocultos pelo usuário ou por um grupo oculto). */
export function hiddenIds(page: Page): Set<ID> {
  let s = hiddenCache.get(page);
  if (!s) {
    s = new Set(page.elements.filter((e) => isHiddenEl(page, e)).map((e) => e.id));
    hiddenCache.set(page, s);
  }
  return s;
}

// ---------- operações ----------

const nextName = (page: Page): string => {
  const used = new Set(groupsOf(page).map((g) => g.name));
  let n = groupsOf(page).length + 1;
  while (used.has(`Grupo ${n}`)) n++;
  return `Grupo ${n}`;
};

/** Põe um conjunto de elementos juntos na pilha, na posição do mais alto deles (ordem relativa mantida). */
function bringTogether(elements: HirakuElement[], ids: Set<ID>): HirakuElement[] {
  let last = -1;
  elements.forEach((e, i) => { if (ids.has(e.id)) last = i; });
  if (last < 0) return elements;
  const moving = elements.filter((e) => ids.has(e.id));
  const before = elements.slice(0, last + 1).filter((e) => !ids.has(e.id));
  const after = elements.slice(last + 1);
  return [...before, ...moving, ...after];
}

/**
 * Agrupa as unidades selecionadas no contexto. Unidades que já são grupos viram subgrupos (agrupar grupos);
 * o grupo novo nasce dentro do contexto. Com menos de 2 unidades não faz nada (agrupar um grupo sozinho seria inútil),
 * exceto `force` (agrupar um elemento só, útil para renomear/travar como objeto).
 */
export function groupUnits(page: Page, ids: ID[], ctx: ID | null, name?: string, force = false): { page: Page; id: ID | null } {
  const units = selectionUnits(page, ids, ctx);
  if (units.length < 2 && !(force && units.length === 1)) return { page, id: null };
  const id = newId();
  const g: Group = { id, name: (name ?? nextName(page)).slice(0, 60), parentId: ctx };
  const elIds = new Set(units.filter((u) => u.kind === "el").map((u) => u.id));
  const subIds = new Set(units.filter((u) => u.kind === "group").map((u) => u.id));
  const groups = [...groupsOf(page).map((x) => (subIds.has(x.id) ? { ...x, parentId: id } : x)), g];
  const all = new Set(units.flatMap((u) => unitLeaves(page, u).map((e) => e.id)));
  const elements = bringTogether(page.elements.map((e) => (elIds.has(e.id) ? ({ ...e, groupId: id } as HirakuElement) : e)), all);
  return { page: { ...page, groups, elements }, id };
}

/** Desagrupa: os filhos sobem um nível (para o pai do grupo). Subgrupos continuam inteiros (desagrupar parcial). */
export function ungroup(page: Page, gids: ID[]): Page {
  const drop = new Set(gids);
  const m = groupMap(page);
  // pai efetivo: sobe enquanto o pai também estiver sendo desfeito
  const up = (gid: ID | null): ID | null => {
    let cur = gid;
    for (let i = 0; cur && drop.has(cur) && i < 64; i++) cur = m.get(cur)?.parentId ?? null;
    return cur;
  };
  if (![...drop].some((g) => m.has(g))) return page;
  const groups = groupsOf(page).filter((g) => !drop.has(g.id)).map((g) => (g.parentId && drop.has(g.parentId) ? { ...g, parentId: up(g.parentId) } : g));
  const elements = page.elements.map((e) => (e.groupId && drop.has(e.groupId) ? ({ ...e, groupId: up(e.groupId) } as HirakuElement) : e));
  return prune({ ...page, groups, elements });
}

/** Tira as unidades selecionadas do grupo em que estão (sobem para o pai dele); o resto do grupo fica. */
export function releaseUnits(page: Page, ids: ID[], ctx: ID | null): Page {
  if (!ctx) return page;
  const parent = groupMap(page).get(ctx)?.parentId ?? null;
  return moveUnitsTo(page, selectionUnits(page, ids, ctx), parent);
}

/** Move unidades para dentro de outro grupo (null = solto na página). Não deixa um grupo entrar em si mesmo. */
export function moveUnitsTo(page: Page, units: Unit[], target: ID | null): Page {
  if (target && !groupMap(page).has(target)) return page;
  const targetChain = chainOf(page, target);
  const els = new Set(units.filter((u) => u.kind === "el").map((u) => u.id));
  const subs = new Set(units.filter((u) => u.kind === "group" && !targetChain.includes(u.id)).map((u) => u.id));
  const groups = groupsOf(page).map((g) => (subs.has(g.id) ? { ...g, parentId: target } : g));
  const elements = page.elements.map((e) => (els.has(e.id) ? ({ ...e, groupId: target } as HirakuElement) : e));
  return prune({ ...page, groups, elements });
}

export function patchGroup(page: Page, gid: ID, patch: Partial<Omit<Group, "id" | "parentId">>): Page {
  return {
    ...page,
    groups: groupsOf(page).map((g) => (g.id === gid ? { ...g, ...patch, name: (patch.name ?? g.name).trim().slice(0, 60) || g.name } : g)),
  };
}

/** Trava/destrava ou oculta/mostra unidades (grupo → no grupo; elemento → no elemento). */
export function setFlag(page: Page, units: Unit[], flag: "locked" | "hidden", on: boolean): Page {
  const gs = new Set(units.filter((u) => u.kind === "group").map((u) => u.id));
  const es = new Set(units.filter((u) => u.kind === "el").map((u) => u.id));
  const key = flag === "locked" ? "locked" : "invisible";
  return {
    ...page,
    groups: gs.size ? groupsOf(page).map((g) => (gs.has(g.id) ? { ...g, [flag]: on || undefined } : g)) : page.groups,
    elements: es.size ? page.elements.map((e) => (es.has(e.id) ? ({ ...e, [key]: on || undefined } as HirakuElement) : e)) : page.elements,
  };
}

/** Mostra/destrava tudo da página. */
export function clearFlag(page: Page, flag: "locked" | "hidden"): Page {
  const key = flag === "locked" ? "locked" : "invisible";
  return {
    ...page,
    groups: page.groups?.map((g) => (g[flag] ? { ...g, [flag]: undefined } : g)),
    elements: page.elements.map((e) => (e[key] ? ({ ...e, [key]: undefined } as HirakuElement) : e)),
  };
}

/** Remove grupos vazios (ou que ficaram órfãos), aponta elementos para grupos existentes e desfaz ciclos. */
export function prune(page: Page): Page {
  let gs = groupsOf(page);
  if (!gs.length) {
    return page.elements.some((e) => e.groupId) ? { ...page, elements: page.elements.map((e) => (e.groupId ? ({ ...e, groupId: null } as HirakuElement) : e)) } : page;
  }
  const ids = new Set(gs.map((g) => g.id));
  // pai inexistente ou ciclo → raiz
  gs = gs.map((g) => (g.parentId && (!ids.has(g.parentId) || g.parentId === g.id) ? { ...g, parentId: null } : g));
  const byId = new Map(gs.map((g) => [g.id, g]));
  gs = gs.map((g) => {
    const seen = new Set<ID>([g.id]);
    let p = g.parentId;
    while (p) {
      if (seen.has(p)) return { ...g, parentId: null };
      seen.add(p);
      p = byId.get(p)?.parentId ?? null;
    }
    return g;
  });
  let elements = page.elements.map((e) => (e.groupId && !ids.has(e.groupId) ? ({ ...e, groupId: null } as HirakuElement) : e));
  // grupos sem nenhuma folha somem (em cascata: o pai que ficou vazio também)
  for (let pass = 0; pass < 8; pass++) {
    const count = new Map<ID, number>();
    const bump = (g: ID | null | undefined) => { if (g) count.set(g, (count.get(g) ?? 0) + 1); };
    elements.forEach((e) => bump(e.groupId));
    gs.forEach((g) => bump(g.parentId));
    const dead = gs.filter((g) => (count.get(g.id) ?? 0) === 0);
    if (!dead.length) break;
    const kill = new Set(dead.map((g) => g.id));
    const parentOf = new Map(gs.map((g) => [g.id, g.parentId]));
    const up = (gid: ID | null): ID | null => {
      let c = gid;
      for (let i = 0; c && kill.has(c) && i < 64; i++) c = parentOf.get(c) ?? null;
      return c;
    };
    gs = gs.filter((g) => !kill.has(g.id)).map((g) => (g.parentId && kill.has(g.parentId) ? { ...g, parentId: up(g.parentId) } : g));
    elements = elements.map((e) => (e.groupId && kill.has(e.groupId) ? ({ ...e, groupId: up(e.groupId) } as HirakuElement) : e));
  }
  const same = gs.length === groupsOf(page).length && gs.every((g, i) => g === groupsOf(page)[i]) && elements.every((e, i) => e === page.elements[i]);
  return same ? page : { ...page, groups: gs.length ? gs : undefined, elements };
}

/**
 * Cópias (duplicar/colar): grupos totalmente copiados ganham cópia nova; elementos de grupos copiados só em parte
 * continuam no grupo original quando ele existe na página de destino (duplicar algo dentro de um grupo fica no grupo).
 * `idMap` = id original → id da cópia.
 */
export function cloneGroups(src: Pick<Page, "groups">, originals: HirakuElement[], copies: HirakuElement[], dest: Pick<Page, "groups">): { groups: Group[]; copies: HirakuElement[] } {
  const sgs = groupsOf(src);
  if (!sgs.length) return { groups: [], copies: copies.map((c) => (c.groupId && !groupMap(dest).has(c.groupId) ? ({ ...c, groupId: null } as HirakuElement) : c)) };
  const origIds = new Set(originals.map((e) => e.id));
  // grupo copiado inteiro = todas as folhas dele estão entre os originais
  const leafCount = new Map<ID, number>(), copied = new Map<ID, number>();
  const all = (src as Page).elements ?? originals;
  for (const e of all) for (const g of chainOf(src, e.groupId)) leafCount.set(g, (leafCount.get(g) ?? 0) + 1);
  for (const e of originals) for (const g of chainOf(src, e.groupId)) copied.set(g, (copied.get(g) ?? 0) + 1);
  const whole = new Set(sgs.filter((g) => (copied.get(g.id) ?? 0) > 0 && copied.get(g.id) === leafCount.get(g.id)).map((g) => g.id));
  const fresh = new Map([...whole].map((g) => [g, newId()]));
  const destHas = groupMap(dest);
  const mapGroup = (gid: ID | null | undefined): ID | null => {
    if (!gid) return null;
    if (fresh.has(gid)) return fresh.get(gid)!;
    return destHas.has(gid) ? gid : null;
  };
  const sm = groupMap(src);
  const groups: Group[] = [...whole].map((gid) => {
    const g = sm.get(gid)!;
    return { ...g, id: fresh.get(gid)!, parentId: mapGroup(g.parentId) };
  });
  const out = copies.map((c, i) => {
    const o = originals[i];
    if (!o || !origIds.has(o.id)) return c;
    return { ...c, groupId: mapGroup(o.groupId) } as HirakuElement;
  });
  return { groups, copies: out };
}

/** Saneia grupos lidos do arquivo (normalizeDoc). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanGroups(raw: any): Group[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Group[] = [];
  const seen = new Set<string>();
  for (const g of raw) {
    if (!g || typeof g.id !== "string" || !g.id || seen.has(g.id)) continue;
    seen.add(g.id);
    out.push({
      id: g.id,
      name: (typeof g.name === "string" && g.name.trim() ? g.name.trim() : `Grupo ${out.length + 1}`).slice(0, 60),
      parentId: typeof g.parentId === "string" ? g.parentId : null,
      ...(g.locked === true ? { locked: true } : {}),
      ...(g.hidden === true ? { hidden: true } : {}),
    });
  }
  return out.length ? out : undefined;
}

// ---------- árvore (painel de objetos) ----------

export interface TreeItem {
  unit: Unit;
  name: string;
  depth: number;
  /** Índice do elemento mais alto (para ordenar de frente para trás). */
  z: number;
  locked: boolean;
  hidden: boolean;
  children: TreeItem[];
}

/** Árvore de objetos da página, da frente (topo da lista) para trás. `label` dá o nome padrão de um elemento. */
export function objectTree(page: Page, label: (e: HirakuElement) => string): TreeItem[] {
  const m = groupMap(page);
  const kids = new Map<ID | null, TreeItem[]>();
  const gItem = new Map<ID, TreeItem>();
  const push = (parent: ID | null, it: TreeItem) => kids.set(parent, [...(kids.get(parent) ?? []), it]);
  for (const g of groupsOf(page)) {
    gItem.set(g.id, { unit: { kind: "group", id: g.id }, name: g.name, depth: 0, z: -1, locked: !!g.locked, hidden: !!g.hidden, children: [] });
  }
  page.elements.forEach((e, i) => {
    const gid = e.groupId && m.has(e.groupId) ? e.groupId : null;
    push(gid, { unit: { kind: "el", id: e.id }, name: e.name || label(e), depth: 0, z: i, locked: !!e.locked, hidden: !!e.invisible, children: [] });
    for (const g of chainOf(page, gid)) { const it = gItem.get(g)!; it.z = Math.max(it.z, i); }
  });
  for (const g of groupsOf(page)) push(g.parentId && m.has(g.parentId) ? g.parentId : null, gItem.get(g.id)!);
  const build = (parent: ID | null, depth: number): TreeItem[] =>
    (kids.get(parent) ?? [])
      .filter((it) => it.unit.kind === "el" || it.z >= 0)
      .sort((a, b) => b.z - a.z)
      .map((it) => ({ ...it, depth, children: it.unit.kind === "group" ? build(it.unit.id, depth + 1) : [] }));
  return build(null, 0);
}

/**
 * Arrastar no painel: põe `units` logo acima (`before`) ou abaixo (`after`) de `target` na pilha, no mesmo grupo dele;
 * `inside` = para dentro do grupo-alvo, por cima de tudo nele.
 */
export function placeUnits(page: Page, units: Unit[], target: Unit, where: "before" | "after" | "inside"): Page {
  const tLeaves = unitLeaves(page, target);
  if (!tLeaves.length) return page;
  const parent: ID | null = where === "inside" && target.kind === "group"
    ? target.id
    : target.kind === "group" ? groupMap(page).get(target.id)?.parentId ?? null : (tLeaves[0].groupId ?? null);
  let p = moveUnitsTo(page, units.filter((u) => !(u.kind === target.kind && u.id === target.id)), parent);
  const moving = new Set(units.flatMap((u) => unitLeaves(p, u).map((e) => e.id)));
  const tIds = new Set(unitLeaves(p, target).map((e) => e.id));
  if (!moving.size || [...moving].some((id) => tIds.has(id) && where !== "inside")) return p;
  const rest = p.elements.filter((e) => !moving.has(e.id));
  const mv = p.elements.filter((e) => moving.has(e.id));
  let idx: number;
  // lista de objetos é da frente para trás: "before" (acima na lista) = mais alto na pilha
  if (where === "after") { idx = rest.findIndex((e) => tIds.has(e.id)); if (idx < 0) idx = 0; }
  else { idx = -1; rest.forEach((e, i) => { if (tIds.has(e.id)) idx = i; }); idx += 1; }
  p = { ...p, elements: [...rest.slice(0, idx), ...mv, ...rest.slice(idx)] };
  return p;
}
