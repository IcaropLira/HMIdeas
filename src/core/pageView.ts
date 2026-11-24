// Cada página lembra o seu próprio pan/zoom. Também limpa a seleção ao trocar de página.
import { Camera, defaultCamera } from "./camera";
import { clampToSheet, fitSheet } from "./pageSize";
import { ID } from "./model";
import { useDoc, useSel, useView } from "./store";

const cameras = new Map<ID, Camera>();

/** Chamar ao abrir um arquivo (as páginas antigas deixam de existir). */
export const resetPageCameras = () => cameras.clear();

const viewW = () => (typeof window === "undefined" ? 1280 : window.innerWidth);
const viewH = () => (typeof window === "undefined" ? 800 : window.innerHeight);
const sizeOf = (id: ID) => useDoc.getState().doc.pages.find((p) => p.id === id)?.size;
/** Página aberta "vinda de baixo" (rolando para cima): mostra o fim da folha. */
let enterFromBottom = false;

/** Enquadra a folha da página ativa (se houver); senão volta à câmera padrão. Usado ao abrir um caderno. */
export function fitActivePage() {
  const size = sizeOf(useDoc.getState().activePageId);
  useView.getState().setCamera(size ? fitSheet(size, viewW(), viewH(), 48, true) : defaultCamera());
}

export function initPageViewSync(): () => void {
  const fitIfSheet = () => {
    const s = useDoc.getState(), size = sizeOf(s.activePageId);
    if (size && !cameras.has(s.activePageId)) {
      const cam = fitSheet(size, viewW(), viewH(), 48, true);
      useView.getState().setCamera(enterFromBottom ? { ...cam, y: viewH() - 48 - size.h * cam.zoom } : cam);
    }
    enterFromBottom = false;
  };
  const offDoc = useDoc.subscribe((s, prev) => {
    if (s.activePageId === prev.activePageId) {
      // virou caderno com páginas (ou mudou o tamanho): enquadra a folha
      const a = sizeOf(s.activePageId), b = prev.doc.pages.find((p) => p.id === prev.activePageId)?.size;
      if (a && (!b || a.w !== b.w || a.h !== b.h)) useView.getState().setCamera(fitSheet(a, viewW(), viewH(), 48, true));
      return;
    }
    const view = useView.getState();
    cameras.set(prev.activePageId, view.camera);
    if (cameras.has(s.activePageId) && !enterFromBottom) view.setCamera(cameras.get(s.activePageId)!);
    else { cameras.delete(s.activePageId); view.setCamera(defaultCamera()); fitIfSheet(); }
    useSel.getState().clear();
  });
  // folha sempre à vista (caderno com páginas)
  const offView = useView.subscribe((v) => {
    const size = sizeOf(useDoc.getState().activePageId);
    if (!size) return;
    const c = clampToSheet(v.camera, size, viewW(), viewH());
    if (c !== v.camera) useView.getState().setCamera(c);
  });
  fitIfSheet();
  return () => { offDoc(); offView(); };
}

/** Rolar além do fim (ou do começo) da folha vira a página, como num caderno. Devolve true se virou. */
let flipAcc = 0, flipTimer: ReturnType<typeof setTimeout> | undefined;
export function wheelFlip(deltaY: number): boolean {
  const st = useDoc.getState(), size = sizeOf(st.activePageId);
  if (!size) return false;
  const cam = useView.getState().camera, H = viewH(), h = size.h * cam.zoom;
  const atEnd = cam.y + h <= H - 20, atStart = cam.y >= 20;
  if ((deltaY > 0 && !atEnd) || (deltaY < 0 && !atStart)) { flipAcc = 0; return false; }
  flipAcc += deltaY;
  clearTimeout(flipTimer);
  flipTimer = setTimeout(() => { flipAcc = 0; }, 400);
  const i = st.doc.pages.findIndex((p) => p.id === st.activePageId);
  if (flipAcc > 260 && i < st.doc.pages.length - 1) { flipAcc = 0; cameras.delete(st.doc.pages[i + 1].id); st.setActivePage(st.doc.pages[i + 1].id); return true; }
  if (flipAcc < -260 && i > 0) { flipAcc = 0; cameras.delete(st.doc.pages[i - 1].id); enterFromBottom = true; st.setActivePage(st.doc.pages[i - 1].id); return true; }
  return false;
}
