// Atualização automática, nos três ambientes:
//  • Desktop (Tauri): plugin updater do Tauri — baixa o pacote ASSINADO do GitHub Releases, instala e reinicia.
//  • Android (Tauri): a loja não é usada; o app compara a versão com a última release e oferece baixar o APK novo.
//  • Site/PWA: o service worker traz a versão nova; o aviso pede um clique para recarregar (nada recarrega sozinho).
// O desenho é guardado por core/autosave.ts, então atualizar não perde nada.
import { create } from "zustand";
import { APP_VERSION, compareVersions, fetchLatestRelease, releasesRepo } from "./repo";
import { useUI } from "./ui";

export type UpdateKind = "desktop" | "link" | "pwa";
export interface UpdateState {
  status: "idle" | "checking" | "available" | "downloading" | "installing" | "error";
  kind: UpdateKind | null;
  version: string | null;
  notes: string;
  /** 0..1 durante o download (null = desconhecido). */
  progress: number | null;
  /** Para kind "link": endereço do download. */
  url: string | null;
  error: string | null;
  dismissed: boolean;
}

export const useUpdate = create<UpdateState>(() => ({
  status: "idle", kind: null, version: null, notes: "", progress: null, url: null, error: null, dismissed: false,
}));
const set = (p: Partial<UpdateState>) => useUpdate.setState(p);

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const isAndroid = () => /android/i.test(navigator.userAgent);

// referência ao objeto de atualização do plugin (tem downloadAndInstall) e à função do service worker
let desktopUpdate: { version: string; body?: string | null; downloadAndInstall: (cb?: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void) => Promise<void> } | null = null;
let applyPwa: ((reload?: boolean) => Promise<void>) | null = null;
let swRegistration: ServiceWorkerRegistration | undefined;

/** Procura atualização agora. `manual`: avisa também quando não há nada novo. */
export async function checkForUpdates(manual = false): Promise<void> {
  const cur = useUpdate.getState();
  if (cur.status === "checking" || cur.status === "downloading" || cur.status === "installing") return;
  const toast = (m: string) => manual && useUI.getState().showToast(m);
  try {
    if (isTauri() && !isAndroid()) {
      set({ status: "checking", error: null });
      const { check } = await import("@tauri-apps/plugin-updater");
      const u = await check();
      if (!u) { set({ status: "idle" }); toast(`Você já está na versão mais recente (${APP_VERSION}).`); return; }
      desktopUpdate = u as unknown as typeof desktopUpdate;
      set({ status: "available", kind: "desktop", version: u.version, notes: u.body ?? "", dismissed: false });
    } else if (isTauri()) {
      set({ status: "checking", error: null });
      await checkLink(manual);
    } else if (swRegistration) {
      set({ status: "checking" });
      await swRegistration.update(); // se houver versão nova, o registerSW chama onNeedRefresh
      if (useUpdate.getState().status === "checking") { set({ status: "idle" }); toast(`Você já está na versão mais recente (${APP_VERSION}).`); }
    }
  } catch (e) {
    set({ status: "idle" });
    if (manual) useUI.getState().showToast("Não consegui verificar atualizações agora.");
    console.warn("update check failed", e);
  }
}

/** Android / Linux .deb: compara com a última release do GitHub. */
async function checkLink(manual: boolean) {
  const repo = releasesRepo();
  const rel = repo ? await fetchLatestRelease(repo) : null;
  if (!rel || compareVersions(rel.version, APP_VERSION) <= 0) {
    set({ status: "idle" });
    if (manual) useUI.getState().showToast(`Você já está na versão mais recente (${APP_VERSION}).`);
    return;
  }
  const apk = rel.assets.find((a) => a.name.toLowerCase().endsWith(".apk"));
  set({ status: "available", kind: "link", version: rel.version, notes: rel.notes, url: apk?.url ?? rel.page, dismissed: false });
}

/** Botão "Atualizar" do aviso. */
export async function installUpdate(): Promise<void> {
  const s = useUpdate.getState();
  try {
    if (s.kind === "desktop" && desktopUpdate) {
      set({ status: "downloading", progress: null, error: null });
      let total = 0, got = 0;
      await desktopUpdate.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data?.contentLength ?? 0;
        else if (e.event === "Progress") { got += e.data?.chunkLength ?? 0; set({ progress: total ? Math.min(1, got / total) : null }); }
        else if (e.event === "Finished") set({ status: "installing", progress: 1 });
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } else if (s.kind === "link" && s.url) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(s.url);
    } else if (s.kind === "pwa" && applyPwa) {
      set({ status: "installing" });
      await applyPwa(true);
    }
  } catch (e) {
    // .deb/.rpm não se atualizam sozinhos: cai para a página de download
    const repo = releasesRepo();
    set({ status: "available", kind: "link", url: repo ? `https://github.com/${repo}/releases/latest` : null, error: e instanceof Error ? e.message : String(e) });
  }
}

export const dismissUpdate = () => set({ dismissed: true });

const SIX_HOURS = 6 * 3600 * 1000;

/** Liga a verificação automática (ao abrir e a cada 6 h). Devolve a função que desliga. */
export function initUpdates(): () => void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let first: ReturnType<typeof setTimeout> | undefined;
  let off = false;

  if (isTauri()) {
    first = setTimeout(() => void checkForUpdates(), 8000); // não disputa com a abertura do app
    timer = setInterval(() => void checkForUpdates(), SIX_HOURS);
  } else if ("serviceWorker" in navigator) {
    void import("virtual:pwa-register").then(({ registerSW }) => {
      if (off) return;
      applyPwa = registerSW({
        immediate: true,
        onNeedRefresh() { set({ status: "available", kind: "pwa", version: null, dismissed: false }); },
        onRegisteredSW(_url, reg) { swRegistration = reg; },
      });
      timer = setInterval(() => void swRegistration?.update(), SIX_HOURS / 6);
    }).catch(() => undefined);
  }
  return () => { off = true; clearTimeout(first); clearInterval(timer); };
}
