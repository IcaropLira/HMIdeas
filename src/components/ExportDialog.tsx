// Exportar/importar (0.16): PNG, JPEG, SVG e PDF da página, da seleção, de um quadro ou do caderno inteiro; PDF como
// páginas; cópias de segurança automáticas com versões; pacote de configurações.
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { BackupInfo, deleteBackup, getBackup, listBackups, saveBackup } from "../core/backups";
import { withDependents } from "../core/mindmap";
import { HirakuElement, Page } from "../core/model";
import { makePdf, pxToPt } from "../core/pdfWrite";
import { Bounds } from "../core/selection";
import { parseDoc } from "../core/serialize";
import { collectSettings, parseSettings } from "../core/settingsBundle";
import { selectActivePage, useDoc, useSel } from "../core/store";
import { useUI } from "../core/ui";
import { contentBounds, exportSvg, grayHex, grayscaleSvg } from "../render/exportSvg";
import { Icon } from "./Icon";

const toast = (m: string) => useUI.getState().showToast(m);
export type Scope = "page" | "selection" | "frame" | "notebook";
export type Format = "png" | "jpeg" | "svg" | "pdf";
type Bg = "paper" | "white" | "transparent";

interface ExportState { open: boolean; scope: Scope; set: (p: Partial<Omit<ExportState, "set">>) => void }
export const useExport = create<ExportState>((set) => ({ open: false, scope: "page", set: (p) => set(p) }));

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const fileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "hm-ideas";

/** Desenha o SVG num canvas e devolve a imagem. Limita o tamanho (o navegador recusa canvas gigantes). */
export async function rasterize(svg: string, w: number, h: number, scale: number, mime: "image/png" | "image/jpeg", fill: string | null): Promise<{ blob: Blob; w: number; h: number }> {
  const k = Math.min(scale, 8192 / Math.max(1, w), 8192 / Math.max(1, h), Math.sqrt(40_000_000 / Math.max(1, w * h)));
  const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("Não consegui desenhar a imagem.")); img.src = url; });
    const c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    const ctx = c.getContext("2d")!;
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, cw, ch); }
    ctx.drawImage(img, 0, 0, cw, ch);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, mime, 0.92));
    c.width = c.height = 0;
    if (!blob) throw new Error("O navegador não gerou a imagem.");
    return { blob, w: cw, h: ch };
  } finally { URL.revokeObjectURL(url); }
}

/** O que sai em cada alcance: elementos + caixa (folha inteira nas páginas de tamanho fixo). */
export function scopeContent(page: Page, scope: Scope, selIds: string[], pad = 24): { els: HirakuElement[]; box: Bounds } | null {
  let els = page.elements;
  if (scope === "selection" || scope === "frame") {
    const base = scope === "frame" ? page.elements.filter((e) => selIds.includes(e.id) && e.type === "frame").map((e) => e.id) : selIds;
    if (!base.length) return null;
    const ids = withDependents(page.elements, base);
    els = page.elements.filter((e) => ids.has(e.id));
  }
  if (scope !== "selection" && scope !== "frame" && page.size) return { els, box: { minX: 0, minY: 0, maxX: page.size.w, maxY: page.size.h } };
  const b = contentBounds(els);
  if (!b) return null;
  return { els, box: { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad } };
}

async function runExport(scope: Scope, fmt: Format, scale: number, bg: Bg, name: string) {
  const d = useDoc.getState();
  const pages = scope === "notebook" ? d.doc.pages : [selectActivePage(d)];
  const sel = useSel.getState().ids;
  const jobs = pages.map((p) => ({ p, c: scopeContent(p, scope, sel) })).filter((j): j is { p: Page; c: NonNullable<typeof j.c> } => !!j.c);
  if (!jobs.length) { toast(scope === "frame" ? "Selecione um quadro para exportar." : scope === "selection" ? "Selecione o que quer exportar." : "Não há nada para exportar."); return; }
  const meta = d.doc.meta, gray = meta?.colorMode === "gray";
  const opaque = fmt === "jpeg" || fmt === "pdf";
  // folha transparente no modo "Papel": sem fundo onde o formato aceita
  const paperBg = (p: Page) => (p.transparent ? (opaque ? "#FFFFFF" : null) : p.background);
  const g = (c: string | null) => (c && gray ? grayHex(c) : c);
  const svgOf = (j: (typeof jobs)[number]) => {
    const svg = exportSvg(j.c.els, {
      box: j.c.box,
      background: bg === "transparent" && !opaque ? null : bg === "white" ? "#FFFFFF" : paperBg(j.p),
      paper: bg === "paper" ? j.p : null,
    });
    return gray ? grayscaleSvg(svg) : svg;
  };
  const fillOf = (j: (typeof jobs)[number]) => g(bg === "transparent" && fmt === "png" ? null : bg === "white" ? "#FFFFFF" : paperBg(j.p));
  if (fmt === "svg") {
    jobs.forEach((j, i) => downloadBlob(`${fileName(name)}${jobs.length > 1 ? ` - ${i + 1}` : ""}.svg`, new Blob([svgOf(j)], { type: "image/svg+xml" })));
  } else if (fmt === "pdf") {
    const pdfPages = [];
    for (const j of jobs) {
      const w = j.c.box.maxX - j.c.box.minX, h = j.c.box.maxY - j.c.box.minY;
      const r = await rasterize(svgOf(j), w, h, scale, "image/jpeg", fillOf(j) ?? "#FFFFFF");
      pdfPages.push({ w: pxToPt(w, meta?.dpi), h: pxToPt(h, meta?.dpi), jpeg: new Uint8Array(await r.blob.arrayBuffer()), iw: r.w, ih: r.h });
    }
    downloadBlob(`${fileName(name)}.pdf`, new Blob([makePdf(pdfPages, name) as Uint8Array<ArrayBuffer>], { type: "application/pdf" }));
  } else {
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i], w = j.c.box.maxX - j.c.box.minX, h = j.c.box.maxY - j.c.box.minY;
      const r = await rasterize(svgOf(j), w, h, scale, fmt === "png" ? "image/png" : "image/jpeg", fillOf(j));
      downloadBlob(`${fileName(name)}${jobs.length > 1 ? ` - ${i + 1}` : ""}.${fmt === "png" ? "png" : "jpg"}`, r.blob);
    }
  }
  toast(jobs.length > 1 ? `${jobs.length} páginas exportadas.` : "Exportado.");
}

export function ExportDialog() {
  const { open, scope } = useExport();
  const page = useDoc((s) => selectActivePage(s));
  const nPages = useDoc((s) => s.doc.pages.length);
  const notebook = useUI((s) => s.notebookName);
  const sel = useSel((s) => s.ids);
  const [fmt, setFmt] = useState<Format>("png"), [scale, setScale] = useState(2), [bg, setBg] = useState<Bg>("paper"), [busy, setBusy] = useState(false);
  const hasFrame = page.elements.some((e) => sel.includes(e.id) && e.type === "frame");
  const gray = useDoc((s) => s.doc.meta?.colorMode === "gray");
  useEffect(() => { if (open && scope === "notebook") setFmt("pdf"); }, [open, scope]);
  useEffect(() => { if (open && page.transparent) setBg("transparent"); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => {
    if (!open || scope === "notebook") return null;
    const c = scopeContent(page, scope, sel);
    if (!c) return null;
    const svg = exportSvg(c.els, { box: c.box, background: bg === "transparent" || (bg === "paper" && page.transparent) ? null : bg === "white" ? "#FFFFFF" : page.background, paper: bg === "paper" ? page : null });
    return { svg: gray ? grayscaleSvg(svg) : svg, w: c.box.maxX - c.box.minX, h: c.box.maxY - c.box.minY };
  }, [open, scope, page, sel, bg, gray]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); useExport.getState().set({ open: false }); } };
    document.addEventListener("keydown", k, true);
    return () => document.removeEventListener("keydown", k, true);
  }, [open]);
  if (!open) return null;
  const close = () => useExport.getState().set({ open: false });
  const name = scope === "notebook" ? notebook || "caderno" : `${notebook ? notebook + " - " : ""}${page.name}`;
  const go = async () => {
    setBusy(true);
    try { await runExport(scope, fmt, scale, bg, name); close(); }
    catch (e) { toast(e instanceof Error ? e.message : "Não foi possível exportar."); }
    finally { setBusy(false); }
  };
  const scopes: [Scope, string, boolean][] = [["page", "Página", true], ["selection", `Seleção${sel.length ? ` (${sel.length})` : ""}`, sel.length > 0], ["frame", "Quadro", hasFrame], ["notebook", `Caderno (${nPages} p.)`, true]];
  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <section className="export dialog" role="dialog" aria-modal="true" aria-label="Exportar">
        <header><strong>Exportar</strong><button className="btn sm" onClick={close} aria-label="Fechar"><Icon><path d="M6 6l12 12M18 6L6 18" /></Icon></button></header>
        <div className="export-body">
          <div className="export-prev" style={{ background: bg === "transparent" || (bg === "paper" && page.transparent) ? "repeating-conic-gradient(#e6e8ee 0 25%, #fff 0 50%) 0 0/16px 16px" : undefined }}>
            {preview ? <img alt="Prévia" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview.svg)}`} /> : <p className="hint">{scope === "notebook" ? `Todas as ${nPages} páginas, uma por página no PDF (ou um arquivo por página).` : "Nada para exportar aqui."}</p>}
            {preview && <small>{Math.round(preview.w * (fmt === "svg" ? 1 : scale))} × {Math.round(preview.h * (fmt === "svg" ? 1 : scale))} px</small>}
          </div>
          <div className="export-opts">
            <label>O quê</label>
            <div className="seg small wrap" role="radiogroup">{scopes.map(([v, l, ok]) => <button key={v} role="radio" aria-checked={scope === v} disabled={!ok} className={scope === v ? "on" : ""} onClick={() => useExport.getState().set({ scope: v })}>{l}</button>)}</div>
            <label>Formato</label>
            <div className="seg small wrap" role="radiogroup">{(["png", "jpeg", "svg", "pdf"] as Format[]).map((v) => <button key={v} role="radio" aria-checked={fmt === v} className={fmt === v ? "on" : ""} onClick={() => setFmt(v)}>{v.toUpperCase()}</button>)}</div>
            {fmt !== "svg" && <><label>Resolução</label>
              <div className="seg small wrap" role="radiogroup">{[1, 2, 3, 4].map((v) => <button key={v} role="radio" aria-checked={scale === v} className={scale === v ? "on" : ""} onClick={() => setScale(v)}>{v}×</button>)}</div></>}
            <label>Fundo</label>
            <div className="seg small wrap" role="radiogroup">
              {([["paper", "Papel"], ["white", "Branco"], ["transparent", "Transparente"]] as [Bg, string][]).map(([v, l]) => (
                <button key={v} role="radio" aria-checked={bg === v} disabled={v === "transparent" && (fmt === "jpeg" || fmt === "pdf")} className={bg === v ? "on" : ""} onClick={() => setBg(v)}>{l}</button>
              ))}
            </div>
            <p className="hint">{fmt === "pdf" ? "PDF com uma imagem nítida por página (do tamanho da folha nos cadernos com páginas)." : fmt === "svg" ? "SVG vetorial: abre no navegador, Inkscape, Figma…" : "Imagem para compartilhar ou colar em outros apps."}</p>
          </div>
        </div>
        <footer><button className="btn" onClick={close}>Cancelar</button><button className="btn primary" disabled={busy || (scope !== "notebook" && !preview)} onClick={() => void go()}>{busy ? "Exportando…" : "Exportar"}</button></footer>
      </section>
    </div>
  );
}

// ---------- importar PDF como páginas ----------

export async function importPdfAsPages(file: File) {
  if (file.size > 60 * 1024 * 1024) { toast("PDF grande demais (máx. 60 MB)."); return; }
  toast("Lendo o PDF…");
  try {
    const { pdfToPages } = await import("../render/pdfImport");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = file.name.replace(/\.pdf$/i, "").slice(0, 40) || "PDF";
    const pages = await pdfToPages(bytes, name, (i, n) => { if (i % 5 === 0 || i === n) toast(`Importando página ${i} de ${n}…`); });
    if (!pages.length) { toast("O PDF não tem páginas."); return; }
    const cur = useDoc.getState().activePageId;
    useDoc.getState().editDoc((d) => {
      const list = [...d.pages];
      const empty = list.length === 1 && !list[0].elements.length;
      if (empty) return { ...d, pages: pages };
      list.splice(list.findIndex((p) => p.id === cur) + 1, 0, ...pages);
      return { ...d, pages: list };
    });
    useDoc.getState().setActivePage(pages[0].id);
    toast(`${pages.length} página(s) importada(s). O PDF fica numa camada travada; escreva por cima.`);
  } catch (e) {
    toast(e instanceof Error && /password/i.test(e.message) ? "PDF protegido por senha." : "Não consegui ler esse PDF.");
  }
}
export function pickPdfAsPages() {
  const input = document.createElement("input");
  input.type = "file"; input.accept = "application/pdf,.pdf";
  input.onchange = () => { const f = input.files?.[0]; if (f) void importPdfAsPages(f); };
  input.click();
}

// ---------- cópias de segurança ----------

const activeNotebook = () => { try { return localStorage.getItem("hm-ideas:notebooks:active") || "solto"; } catch { return "solto"; } };
export const BACKUP_EVERY = 5 * 60_000;

/** Liga as cópias automáticas: a cada 5 min se o caderno mudou, e ao esconder/fechar o app. */
export function initBackups(): () => void {
  let dirty = false;
  const off = useDoc.subscribe((s, p) => { if (s.doc !== p.doc) dirty = true; });
  const snap = () => {
    if (!dirty) return;
    dirty = false;
    void saveBackup(activeNotebook(), useUI.getState().notebookName || "Caderno", useDoc.getState().doc).catch(() => undefined);
  };
  const id = setInterval(snap, BACKUP_EVERY);
  const vis = () => { if (document.visibilityState === "hidden") snap(); };
  document.addEventListener("visibilitychange", vis);
  return () => { off(); clearInterval(id); document.removeEventListener("visibilitychange", vis); };
}

export async function backupNow() {
  const ok = await saveBackup(activeNotebook(), useUI.getState().notebookName || "Caderno", useDoc.getState().doc).catch(() => false);
  toast(ok ? "Cópia de segurança feita." : "Nada mudou desde a última cópia.");
}

const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
const kb = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/** Aba "Cadernos e dados": versões do caderno aberto + pacote de configurações. */
export function BackupsPane() {
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const [all, setAll] = useState(false);
  const reload = () => void listBackups(all ? undefined : activeNotebook()).then(setList).catch(() => setList([]));
  useEffect(reload, [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const restore = async (b: BackupInfo) => {
    const full = await getBackup(b.id);
    if (!full) return;
    try {
      const doc = parseDoc(full.data);
      useDoc.getState().editDoc(() => doc); // dá para desfazer (Ctrl+Z volta ao que estava)
      useDoc.getState().setActivePage(doc.pages[0].id);
      toast(`Versão de ${when(b.at)} restaurada. Ctrl+Z desfaz.`);
    } catch { toast("Essa cópia está ilegível."); }
  };
  const download = async (b: BackupInfo) => {
    const full = await getBackup(b.id);
    if (full) downloadBlob(`${fileName(b.name)} ${new Date(b.at).toISOString().slice(0, 16).replace(/[T:]/g, "-")}.hiraku`, new Blob([full.data], { type: "application/json" }));
  };
  const exportSettings = () => downloadBlob("configuracoes-hm-ideas.json", new Blob([JSON.stringify(collectSettings(localStorage), null, 1)], { type: "application/json" }));
  const [pending, setPending] = useState<Record<string, string> | null>(null);
  const importSettings = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json,application/json";
    input.onchange = () => void input.files?.[0]?.text().then((t) => { const p = parseSettings(t); if (p) setPending(p); else toast("Arquivo de configurações inválido."); });
    input.click();
  };
  return (
    <>
      <h3>Versões (cópias automáticas)</h3>
      <p className="hint">A cada 5 minutos de edição (e ao sair do app) uma cópia do caderno aberto fica guardada neste dispositivo — as últimas 15 de cada caderno.</p>
      <div className="row">
        <button className="chip" onClick={() => void backupNow().then(reload)}>Fazer cópia agora</button>
        <button className={all ? "chip on" : "chip"} aria-pressed={all} onClick={() => setAll(!all)}>Todos os cadernos</button>
      </div>
      <div className="backup-list">
        {list === null ? <p className="hint">Carregando…</p> : !list.length ? <p className="hint">Nenhuma cópia ainda.</p> : list.map((b) => (
          <div key={b.id} className="backup-row">
            <div><b>{when(b.at)}</b><small>{b.name} · {b.pages} p. · {kb(b.size)}</small></div>
            <button className="btn sm" onClick={() => void restore(b)} title="Restaura no caderno aberto (Ctrl+Z desfaz)">Restaurar</button>
            <button className="btn sm" onClick={() => void download(b)} aria-label="Baixar .hiraku" title="Baixar .hiraku"><Icon size={16}><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" /></Icon></button>
            <button className="btn sm" onClick={() => void deleteBackup(b.id).then(reload)} aria-label="Apagar cópia" title="Apagar"><Icon size={16}><path d="M6 6l12 12M18 6L6 18" /></Icon></button>
          </div>
        ))}
      </div>
      <h3>Configurações</h3>
      <p className="hint">Leve temas, áreas de trabalho, barras, atalhos, pincéis, presets, macros, modelos de página e pastas para outro aparelho.</p>
      <div className="row">
        <button className="chip" onClick={exportSettings}>Exportar configurações</button>
        <button className="chip" onClick={importSettings}>Importar configurações…</button>
      </div>
      {pending && (
        <div className="notebook-confirm-backdrop"><section className="notebook-confirm" role="alertdialog" aria-modal="true">
          <strong>Substituir as configurações?</strong><p>{Object.keys(pending).length} itens serão gravados e o app recarrega. Seus cadernos não mudam.</p>
          <div><button className="btn" onClick={() => setPending(null)}>Cancelar</button><button className="btn primary" onClick={() => { for (const [k, v] of Object.entries(pending)) { try { localStorage.setItem(k, v); } catch { /* cheio */ } } location.reload(); }}>Importar e recarregar</button></div>
        </section></div>
      )}
    </>
  );
}
