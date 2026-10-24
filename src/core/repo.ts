// Em qual repositório do GitHub estão as versões (releases)? Usado pela página de download e pelo aviso de atualização.
// Ordem: variável VITE_GH_REPO (definida no build pelo workflow) → deduzido do endereço do GitHub Pages (dono.github.io/repo)
// → repositório do package.json (vale em qualquer hospedagem, como o Vercel).

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

/** "dono/repositório" ou null se não der para saber. */
export function releasesRepo(
  loc: Pick<Location, "hostname" | "pathname"> = window.location,
  fallback: string = typeof __GH_REPO__ === "string" ? __GH_REPO__ : "",
): string | null {
  const env = (import.meta.env.VITE_GH_REPO as string | undefined)?.trim();
  if (env && REPO_RE.test(env)) return env;
  const m = /^([\w-]+)\.github\.io$/i.exec(loc.hostname);
  if (!m) return REPO_RE.test(fallback) ? fallback : null;
  const first = loc.pathname.split("/").filter(Boolean)[0];
  return `${m[1]}/${first && !/\.\w+$/.test(first) ? first : `${m[1]}.github.io`}`;
}

export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";

/** Compara versões x.y.z (ignora o sufixo -beta). >0 se a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

export interface ReleaseAsset { name: string; url: string; size: number }
export interface Release { version: string; name: string; date: string; page: string; notes: string; assets: ReleaseAsset[] }

/** Última versão publicada no GitHub (null se não houver nenhuma ou se a rede falhar). */
export async function fetchLatestRelease(repo: string): Promise<Release | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) return null;
    const j = await r.json();
    return {
      version: String(j.tag_name ?? "").replace(/^v/, ""),
      name: String(j.name ?? j.tag_name ?? ""),
      date: String(j.published_at ?? ""),
      page: String(j.html_url ?? `https://github.com/${repo}/releases`),
      notes: String(j.body ?? ""),
      assets: ((j.assets ?? []) as { name: string; browser_download_url: string; size: number }[]).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })),
    };
  } catch {
    return null;
  }
}

export type Platform = "windows" | "linux" | "macos" | "android";
export interface Download { platform: Platform; label: string; kind: string; arch: string; asset: ReleaseAsset; primary: boolean }

/** Separa os arquivos da release por sistema; ignora assinaturas, latest.json e pacotes do atualizador. */
export function classifyAssets(assets: ReleaseAsset[]): Download[] {
  const out: Download[] = [];
  for (const a of assets) {
    const n = a.name.toLowerCase();
    const arch = /aarch64|arm64/.test(n) ? "ARM64" : /universal/.test(n) ? "Universal" : /x86_64|x64|amd64/.test(n) ? "64 bits" : "";
    let d: Omit<Download, "asset" | "arch"> | null = null;
    if (n.endsWith(".exe")) d = { platform: "windows", label: "Instalador (.exe)", kind: "exe", primary: true };
    else if (n.endsWith(".msi")) d = { platform: "windows", label: "Pacote MSI", kind: "msi", primary: false };
    else if (n.endsWith(".appimage")) d = { platform: "linux", label: "AppImage (qualquer distro)", kind: "appimage", primary: true };
    else if (n.endsWith(".deb")) d = { platform: "linux", label: "Debian / Ubuntu (.deb)", kind: "deb", primary: false };
    else if (n.endsWith(".rpm")) d = { platform: "linux", label: "Fedora / openSUSE (.rpm)", kind: "rpm", primary: false };
    else if (n.endsWith(".dmg")) d = { platform: "macos", label: "Imagem de disco (.dmg)", kind: "dmg", primary: true };
    else if (n.endsWith(".apk")) d = { platform: "android", label: "APK (instalar direto)", kind: "apk", primary: true };
    if (d) out.push({ ...d, arch, asset: a });
  }
  return out;
}

export function detectPlatform(ua = navigator.userAgent): Platform | "ios" | "other" {
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/windows/i.test(ua)) return "windows";
  if (/mac os x|macintosh/i.test(ua)) return "macos";
  if (/linux|x11|cros/i.test(ua)) return "linux";
  return "other";
}
