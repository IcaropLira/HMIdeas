// Cada página lembra o seu próprio pan/zoom. Também limpa a seleção ao trocar de página.
import { Camera, defaultCamera } from "./camera";
import { ID } from "./model";
import { useDoc, useSel, useView } from "./store";

const cameras = new Map<ID, Camera>();

/** Chamar ao abrir um arquivo (as páginas antigas deixam de existir). */
export const resetPageCameras = () => cameras.clear();

export function initPageViewSync(): () => void {
  return useDoc.subscribe((s, prev) => {
    if (s.activePageId === prev.activePageId) return;
    const view = useView.getState();
    cameras.set(prev.activePageId, view.camera);
    view.setCamera(cameras.get(s.activePageId) ?? defaultCamera());
    useSel.getState().clear();
  });
}
