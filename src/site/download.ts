// Página de download: lê a última release do GitHub e mostra o instalador certo para o sistema de quem abriu.
import { Download, Platform, Release, classifyAssets, detectPlatform, fetchLatestRelease, releasesRepo } from "../core/repo";

const $ = (id: string) => document.getElementById(id)!;
const NAMES: Record<Platform, string> = { windows: "Windows", linux: "Linux", macos: "macOS", android: "Android" };
const ORDER: Platform[] = ["windows", "linux", "android", "macos"];

const mb = (n: number) => `${(n / 1048576).toFixed(n > 10485760 ? 0 : 1)} MB`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function card(p: Platform, items: Download[], me: boolean, releasesUrl?: string): string {
  const rows = items
    .sort((a, b) => Number(b.primary) - Number(a.primary))
    .map((d) => `<a class="dl" href="${esc(d.asset.url)}" download><span>${esc(d.label)}${d.arch ? ` · ${esc(d.arch)}` : ""}</span><small>${mb(d.asset.size)}</small></a>`)
    .join("");
  const none = releasesUrl
    ? `<a class="dl" href="${esc(releasesUrl)}"><span>Ver arquivos no GitHub</span><small>↗</small></a>`
    : `<p class="empty">Em breve.</p>`;
  return `<article class="card${me ? " me" : ""}"><h3>${NAMES[p]}${me ? " · seu sistema" : ""}</h3>${rows || none}</article>`;
}

function render(rel: Release | null, repo: string | null) {
  const me = detectPlatform();
  const hero = { title: $("hero-title"), sub: $("hero-sub"), cta: $("hero-cta") as HTMLAnchorElement };
  const downloads = rel ? classifyAssets(rel.assets) : [];
  const by = (p: Platform) => downloads.filter((d) => d.platform === p);

  const browser = `<article class="card"><h3>Navegador</h3><a class="dl" href="./"><span>Abrir o HM Ideas</span><small>sem instalar</small></a><p>Funciona offline depois da primeira visita e se atualiza sozinho.</p></article>`;
  if (!rel || !downloads.length) {
    hero.title.textContent = "Baixar o HM Ideas";
    hero.sub.textContent = repo
      ? "Não consegui ler a lista de versões agora. Os arquivos de cada sistema estão na página de releases do GitHub."
      : "Os instaladores aparecem aqui quando o endereço do repositório for configurado.";
    // As quatro plataformas aparecem sempre, mesmo sem a lista: cada uma leva à página de releases.
    $("grid").innerHTML = repo
      ? ORDER.map((p) => card(p, [], p === me, `https://github.com/${repo}/releases/latest`)).join("") + browser
      : "";
  } else {
    const mine = me === "ios" || me === "other" ? null : by(me).sort((a, b) => Number(b.primary) - Number(a.primary))[0] ?? null;
    hero.title.textContent = mine ? `Baixar para ${NAMES[mine.platform]}` : `Versão ${rel.version}`;
    hero.sub.textContent = mine
      ? `Versão ${rel.version} · ${mine.label}${mine.arch ? " · " + mine.arch : ""} · ${mb(mine.asset.size)}`
      : me === "ios" ? "No iPhone/iPad: abra no Safari e use Compartilhar → Adicionar à Tela de Início." : `Versão ${rel.version} — escolha o seu sistema abaixo.`;
    if (mine) { hero.cta.textContent = "Baixar"; hero.cta.href = mine.asset.url; }
    $("grid").innerHTML = ORDER.map((p) => card(p, by(p), p === me)).join("") + browser;
  }
  $("footer").innerHTML = rel
    ? `Versão ${esc(rel.version)}${rel.date ? " · " + new Date(rel.date).toLocaleDateString("pt-BR") : ""} · <a href="${esc(rel.page)}">notas da versão e todos os arquivos</a>`
    : repo ? `<a href="https://github.com/${esc(repo)}/releases">Ver releases no GitHub</a>` : "";
}

const repo = releasesRepo();
// Enquanto busca, fica o "Procurando a versão mais recente…" do HTML (sem piscar um estado de erro).
if (repo) void fetchLatestRelease(repo).then((r) => render(r, repo));
else render(null, null);
