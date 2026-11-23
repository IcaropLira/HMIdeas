// Ações de grupo sobre a página ativa + o CONTEXTO de edição (grupo em que o usuário entrou). O contexto é estado de
// interface: não entra no documento nem no desfazer.
import { create } from "zustand";
import {
  Unit, chainOf, clearFlag, exactGroup, groupMap, groupUnits, insideCtx, isLockedEl, leavesOf, moveUnitsTo, patchGroup,
  releaseUnits, selectionUnits, setFlag, ungroup, unitLeaves,
} from "./groups";
import { interactiveElements } from "./layers";
import { HirakuElement, ID, Page } from "./model";
import { elementBounds } from "./selection";
import { selectActivePage, useDoc, useSel } from "./store";
import { useUI } from "./ui";

interface GroupCtx {
  /** Grupo aberto para edição (null = página). Vale para a página `pageId`. */
  ctx: ID | null;
  pageId: ID | null;
  set: (ctx: ID | null, pageId: ID | null) => void;
}

export const useGroupCtx = create<GroupCtx>((set) => ({
  ctx: null,
  pageId: null,
  set: (ctx, pageId) => set({ ctx, pageId }),
}));

const page = (): Page => selectActivePage(useDoc.getState());

/** Contexto válido para a página ativa (o grupo pode ter sido desfeito, ou a página trocou). */
export function currentCtx(p: Page = page()): ID | null {
  const { ctx, pageId } = useGroupCtx.getState();
  if (!ctx || pageId !== p.id) return null;
  return groupMap(p).has(ctx) ? ctx : null;
}

/** Cadeia do contexto para a barra de status: [{id, name}] da raiz até o grupo aberto. */
export function ctxPath(p: Page = page()): { id: ID; name: string }[] {
  const m = groupMap(p);
  return chainOf(p, currentCtx(p)).reverse().map((id) => ({ id, name: m.get(id)?.name ?? "Grupo" }));
}

const selIds = () => useSel.getState().ids;
const commitPage = (next: Page) => useDoc.getState().editPage(() => next);

/** Grupo exatamente selecionado (para a barra contextual e o menu Objeto). */
export const selectedGroup = (): ID | null => exactGroup(page(), selIds());

export function enterGroup(gid: ID | null = selectedGroup(), selectIds: ID[] = []): boolean {
  if (!gid) return false;
  const p = page();
  if (!groupMap(p).has(gid)) return false;
  useGroupCtx.getState().set(gid, p.id);
  useSel.getState().set(selectIds);
  return true;
}

/** Sai um nível: o grupo de onde saiu fica selecionado. */
export function exitGroup(): boolean {
  const p = page();
  const ctx = currentCtx(p);
  if (!ctx) return false;
  const parent = groupMap(p).get(ctx)?.parentId ?? null;
  useGroupCtx.getState().set(parent, p.id);
  useSel.getState().set(leavesOf(p, ctx).map((e) => e.id));
  return true;
}

export const exitAllGroups = () => useGroupCtx.getState().set(null, null);

/** Ctrl+A: tudo do contexto atual (só o que está dentro do grupo aberto). */
export function selectAllInContext() {
  const p = page();
  const ctx = currentCtx(p);
  useSel.getState().set(interactiveElements(p).filter((e) => insideCtx(p, e, ctx)).map((e) => e.id));
}

export function groupSelection(): boolean {
  const p = page();
  const { page: next, id } = groupUnits(p, selIds(), currentCtx(p));
  if (!id) {
    useUI.getState().showToast("Selecione dois ou mais objetos para agrupar.");
    return false;
  }
  commitPage(next);
  return true;
}

/** Desagrupa os grupos selecionados (um nível); os filhos continuam selecionados. */
export function ungroupSelectionGroups(): boolean {
  const p = page();
  const gids = selectionUnits(p, selIds(), currentCtx(p)).filter((u) => u.kind === "group").map((u) => u.id);
  if (!gids.length) return false;
  commitPage(ungroup(p, gids));
  return true;
}

/** Tira do grupo (desagrupar parcial): a seleção dentro do grupo aberto sobe para o grupo de cima. */
export function releaseSelection(): boolean {
  const p = page();
  const ctx = currentCtx(p);
  if (!ctx || !selIds().length) return false;
  const parent = groupMap(p).get(ctx)?.parentId ?? null;
  const next = releaseUnits(p, selIds(), ctx);
  commitPage(next);
  if (!groupMap(next).has(ctx)) useGroupCtx.getState().set(parent, p.id);
  return true;
}

/** Move a seleção para dentro de um grupo (null = solta). */
export function moveSelectionToGroup(target: ID | null) {
  const p = page();
  commitPage(moveUnitsTo(p, selectionUnits(p, selIds(), currentCtx(p)), target));
}

const unitsOrAll = (p: Page): Unit[] => selectionUnits(p, selIds(), currentCtx(p));

export function lockSelection(on = true) {
  const p = page();
  const us = unitsOrAll(p);
  if (!us.length) return;
  commitPage(setFlag(p, us, "locked", on));
  if (on) useSel.getState().clear();
}

export function hideSelection(on = true) {
  const p = page();
  const us = unitsOrAll(p);
  if (!us.length) return;
  commitPage(setFlag(p, us, "hidden", on));
  if (on) useSel.getState().clear();
}

export const unlockAll = () => { const p = page(); const n = clearFlag(p, "locked"); if (n !== p) commitPage(n); };
export const showAll = () => { const p = page(); const n = clearFlag(p, "hidden"); if (n !== p) commitPage(n); };

export function setUnitFlag(u: Unit, flag: "locked" | "hidden", on: boolean) {
  commitPage(setFlag(page(), [u], flag, on));
}

export function renameUnit(u: Unit, name: string) {
  const p = page();
  if (u.kind === "group") commitPage(patchGroup(p, u.id, { name }));
  else commitPage({ ...p, elements: p.elements.map((e) => (e.id === u.id ? ({ ...e, name: name.trim().slice(0, 80) || undefined } as HirakuElement) : e)) });
}

/** Seleciona uma unidade a partir da lista (painel de objetos): entra no grupo pai dela para a seleção fazer sentido. */
export function selectUnit(u: Unit, add = false) {
  const p = page();
  const leaves = unitLeaves(p, u).filter((e) => !isLockedEl(p, e));
  const parent = u.kind === "group" ? groupMap(p).get(u.id)?.parentId ?? null : (p.elements.find((e) => e.id === u.id)?.groupId ?? null);
  if (!add || currentCtx(p) !== parent) useGroupCtx.getState().set(parent, p.id);
  const ids = leaves.map((e) => e.id);
  useSel.getState().set(add ? [...selIds(), ...ids] : ids);
}

/** Seleciona os objetos do mesmo tipo que o selecionado (no contexto). */
export function selectSameType() {
  const p = page();
  const ids = new Set(selIds());
  const types = new Set(p.elements.filter((e) => ids.has(e.id)).map((e) => (e.type === "attachment" ? `att:${e.kind}` : e.type)));
  if (!types.size) return;
  const ctx = currentCtx(p);
  useSel.getState().set(interactiveElements(p).filter((e) => insideCtx(p, e, ctx) && types.has(e.type === "attachment" ? `att:${e.kind}` : e.type)).map((e) => e.id));
}

/** Contorno do grupo aberto (mundo). */
export function contextOutline(p: Page = page()) {
  const ctx = currentCtx(p);
  if (!ctx) return null;
  const leaves = leavesOf(p, ctx);
  if (!leaves.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of leaves) {
    const b = elementBounds(e);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  const pad = 6;
  return [{ x: minX - pad, y: minY - pad }, { x: maxX + pad, y: minY - pad }, { x: maxX + pad, y: maxY + pad }, { x: minX - pad, y: maxY + pad }];
}
