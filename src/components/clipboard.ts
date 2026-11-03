// Colagem e inserção de anexos (imagem, arquivo, link, texto). Um único caminho para Ctrl+V, botão "Colar",
// menu "Inserir" e arrastar-e-soltar. O Ctrl+V NÃO é interceptado no teclado: o navegador dispara o evento
// `paste` com a área de transferência real (prints, imagens copiadas, links, texto).
import { screenToWorld } from "../core/camera";
import { newId } from "../core/model";
import { copySelection, pasteClipboard } from "../core/actions";
import { useDoc, useSel, useTool, useView } from "../core/store";
import { makeText } from "../core/text";
import { useUI } from "../core/ui";

/** Texto-marcador gravado na área de transferência do sistema ao copiar elementos internos. */
export const INTERNAL_MARK = "hm-ideas:internal-copy";
const MAX_FILE = 15 * 1024 * 1024;
const MAX_SIDE = 2048;

type Point = { x: number; y: number };

const host = () => document.querySelector<HTMLElement>(".canvas-host");

/** Centro visível do quadro, ou o ponto de tela informado, em coordenadas do mundo. */
export function worldPoint(clientX?: number, clientY?: number): Point {
  const r = host()?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const x = clientX == null ? r.width / 2 : clientX - r.left;
  const y = clientY == null ? r.height / 2 : clientY - r.top;
  return screenToWorld(useView.getState().camera, x, y);
}

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("inválido")));
    reader.onerror = () => reject(reader.error ?? new Error("falha"));
    reader.readAsDataURL(blob);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

/** Reduz imagens enormes (prints 4K) para caber no caderno; GIF e SVG ficam como vieram. */
async function shrinkIfHuge(file: Blob, data: string, img: HTMLImageElement): Promise<string> {
  const big = Math.max(img.naturalWidth, img.naturalHeight);
  if (big <= MAX_SIDE || /gif|svg/.test(file.type)) return data;
  const k = MAX_SIDE / big;
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  const g = c.getContext("2d");
  if (!g) return data;
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(file.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.92);
}

export async function addAttachmentFile(file: File | Blob, at: Point = worldPoint(), name?: string): Promise<boolean> {
  const ui = useUI.getState();
  if (file.size > MAX_FILE) { ui.showToast("Este anexo passa de 15 MB. Reduza o arquivo antes de colocá-lo no caderno."); return false; }
  const isImage = file.type.startsWith("image/");
  let data: string;
  try { data = await readAsDataUrl(file); } catch { ui.showToast("Não consegui ler este arquivo."); return false; }
  let w = 340, h = 220;
  if (isImage) {
    const img = await loadImage(data);
    if (img && img.naturalWidth && img.naturalHeight) {
      data = await shrinkIfHuge(file, data, img);
      const s = Math.min(1, 640 / img.naturalWidth, 480 / img.naturalHeight);
      w = Math.max(80, img.naturalWidth * s);
      h = Math.max(60, img.naturalHeight * s);
    }
  }
  const title = name || (file as File).name || (isImage ? "Imagem colada" : "Arquivo anexado");
  const id = newId();
  useDoc.getState().addElement({
    id, type: "attachment", kind: isImage ? "image" : "file", x: at.x - w / 2, y: at.y - h / 2, w, h,
    title, url: title, data, mime: file.type || "application/octet-stream", opacity: 1,
  });
  useSel.getState().set([id]);
  return true;
}

export function addLink(url: string, at: Point = worldPoint()) {
  const u = url.trim();
  const title = /youtube\.com|youtu\.be/.test(u) ? "Vídeo do YouTube" : /vimeo\.com/.test(u) ? "Vídeo do Vimeo" : "Link anexado";
  const id = newId();
  useDoc.getState().addElement({ id, type: "attachment", kind: "link", x: at.x - 170, y: at.y - 70, w: 340, h: 140, title, url: u, mime: "text/uri-list", opacity: 1 });
  useSel.getState().set([id]);
}

export function addPlainText(text: string, at: Point = worldPoint()) {
  const t = useTool.getState();
  const id = newId();
  useDoc.getState().addElement(makeText(id, at.x, at.y, text.replace(/\s+$/, ""), { fontSize: t.fontSize, fontFamily: t.fontFamily, align: t.textAlign, color: t.color }));
  useSel.getState().set([id]);
}

const firstUrl = (text: string) => text.trim().split(/\r?\n/).map((l) => l.trim()).find((l) => /^https?:\/\/\S+$/i.test(l));

/** Decide o que fazer com um pacote de dados colado: imagem > link > cópia interna > texto. */
export async function importData(dt: DataTransfer, at: Point = worldPoint()): Promise<boolean> {
  const files = Array.from(dt.files ?? []);
  const img = files.find((f) => f.type.startsWith("image/")) ?? Array.from(dt.items ?? []).find((i) => i.kind === "file" && i.type.startsWith("image/"))?.getAsFile();
  if (img) return addAttachmentFile(img, at, img.name && img.name !== "image.png" ? img.name : "Imagem colada");
  if (files.length) {
    let ok = false;
    for (let i = 0; i < files.length; i++) ok = (await addAttachmentFile(files[i], { x: at.x + i * 24, y: at.y + i * 24 })) || ok;
    return ok;
  }
  const text = dt.getData("text/uri-list") || dt.getData("text/plain") || "";
  const html = dt.getData("text/html");
  if (text.trim() === INTERNAL_MARK) { pasteClipboard(); return true; }
  const url = firstUrl(text);
  if (url && text.trim().split(/\r?\n/).length === 1) { addLink(url, at); return true; }
  // imagem vinda de uma página (copiar imagem no navegador entrega <img src>)
  const src = html && /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1];
  if (src && /^data:image\//i.test(src)) {
    const blob = await (await fetch(src)).blob();
    return addAttachmentFile(blob, at);
  }
  if (text.trim()) { addPlainText(text, at); return true; }
  return false;
}

/** Botão "Colar" / menu: lê a área de transferência por API (exige gesto do usuário e permissão). */
export async function pasteFromButton(): Promise<void> {
  const ui = useUI.getState();
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) { await addAttachmentFile(await item.getType(type), worldPoint(), "Imagem colada"); return; }
      }
    }
    if (navigator.clipboard?.readText) {
      const text = await navigator.clipboard.readText();
      if (text.trim() === INTERNAL_MARK) { pasteClipboard(); return; }
      const url = firstUrl(text);
      if (url) { addLink(url); return; }
      if (text.trim()) { addPlainText(text); return; }
    }
    pasteClipboard();
  } catch {
    ui.showToast("O navegador bloqueou a leitura. Use Ctrl+V com o quadro em foco.");
  }
}

/** Copiar interno + marcador no sistema (para o Ctrl+V saber que é uma cópia do próprio caderno). */
export function copyWithMark() {
  copySelection();
  try { void navigator.clipboard?.writeText(INTERNAL_MARK).catch(() => {}); } catch { /* sem permissão */ }
}

/** Instala o ouvinte global de colagem. Devolve a função de remoção. */
export function initPaste(): () => void {
  const onPaste = (ev: ClipboardEvent) => {
    const t = ev.target as HTMLElement | null;
    if (t?.closest?.("input,textarea,select,[contenteditable=true],[contenteditable='']")) return;
    if (!ev.clipboardData) return;
    ev.preventDefault();
    void importData(ev.clipboardData).then((ok) => { if (!ok) pasteClipboard(); });
  };
  window.addEventListener("paste", onPaste);
  return () => window.removeEventListener("paste", onPaste);
}
