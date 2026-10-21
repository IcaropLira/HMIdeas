import { HirakuDoc, normalizeDoc } from "./model";

export const FILE_EXT = ".hiraku";

export function serializeDoc(doc: HirakuDoc): string {
  return JSON.stringify(doc);
}

export function parseDoc(text: string): HirakuDoc {
  return normalizeDoc(JSON.parse(text));
}

/** Download via Blob: funciona no navegador/PWA e no webview do Tauri. */
export function downloadDoc(doc: HirakuDoc, name = "desenho") {
  const blob = new Blob([serializeDoc(doc)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name + FILE_EXT;
  a.click();
  URL.revokeObjectURL(url);
}
