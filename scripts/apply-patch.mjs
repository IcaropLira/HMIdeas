#!/usr/bin/env node
// Aplica patches (formato `git format-patch`) mantendo o histórico, sem baixar zip nem reinstalar tudo.
//
//   npm run patch -- patches/0003-feat-algo.patch     aplica um (ou vários) arquivo(s)
//   npm run patch                                      aplica tudo de ./patches que ainda não foi aplicado
//   npm run patch -- --dry-run [arquivos]              só verifica se aplicaria
//   opções: --no-install  não roda `npm install`   |   --no-check  não roda `npm run typecheck`
//           --force       aplica mesmo com arquivos modificados (não recomendado)
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const dryRun = has("--dry-run");
const isWin = process.platform === "win32";

const git = (a, opts = {}) => spawnSync("git", a, { encoding: "utf8", ...opts });
const out = (a) => git(a).stdout.trim();
const die = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };

if (git(["rev-parse", "--is-inside-work-tree"]).status !== 0) die("Isto não é um repositório Git. Rode `git init` e faça o primeiro commit.");
if (git(["rev-parse", "--verify", "HEAD"]).status !== 0) die("O repositório ainda não tem nenhum commit. Faça o commit inicial antes de aplicar patches.");

const gitDir = out(["rev-parse", "--git-dir"]);
if (existsSync(join(gitDir, "rebase-apply"))) die("Há uma aplicação de patch pendente. Resolva-a ou rode `git am --abort` e tente de novo.");

if (!has("--force") && !dryRun && out(["status", "--porcelain", "--untracked-files=no"])) {
  die("Há arquivos modificados e não commitados. Faça commit (ou `git stash`) antes de aplicar patches.");
}

/** Decodifica cabeçalhos RFC 2047 (`=?UTF-8?q?...?=` / `?b?`), que o git usa quando o assunto tem acentos. */
function decodeMime(text) {
  return text
    .replace(/\?=\s+=\?/g, "?==?") // palavras codificadas vizinhas são concatenadas
    .replace(/=\?([^?]+)\?([qQbB])\?([^?]*)\?=/g, (_, charset, enc, body) => {
      const bytes = enc.toLowerCase() === "b"
        ? Buffer.from(body, "base64")
        : Buffer.from(body.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))), "latin1");
      return new TextDecoder(/utf-?8/i.test(charset) ? "utf-8" : "latin1").decode(bytes);
    });
}

/** O patch já está no projeto? (aplicá-lo de trás para frente funcionaria). Independe do texto do assunto. */
const alreadyApplied = (file) => git(["apply", "--check", "--reverse", file]).status === 0;

/** Assunto do patch (cabeçalho Subject do mbox, sem o prefixo [PATCH n/m]). */
function subjectOf(file) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  let subject = "";
  let on = false;
  for (const l of lines) {
    if (l === "") { if (on) break; else continue; }
    if (l.startsWith("Subject:")) { subject = l.slice(8).trim(); on = true; }
    else if (on && /^\s/.test(l)) subject += " " + l.trim();
    else if (on) break;
  }
  return decodeMime(subject).replace(/^\[PATCH[^\]]*\]\s*/, "").trim();
}

let files = args.filter((a) => !a.startsWith("--")).map((f) => resolve(f));
if (!files.length) {
  const dir = resolve("patches");
  if (!existsSync(dir)) die("Informe o arquivo .patch ou crie a pasta ./patches com os patches.");
  files = readdirSync(dir).filter((f) => f.endsWith(".patch")).sort().map((f) => join(dir, f))
    .filter((f) => !alreadyApplied(f));
  if (!files.length) { console.log("✔ Nada a aplicar: todos os patches de ./patches já estão no histórico."); process.exit(0); }
}
for (const f of files) if (!existsSync(f)) die(`Arquivo não encontrado: ${f}`);

const before = out(["rev-parse", "HEAD"]);
let n = 0;

for (const f of files) {
  const name = f.split(/[\\/]/).pop();
  if (alreadyApplied(f)) {
    console.log(`↷ já aplicado: ${subjectOf(f) || name}`);
    continue;
  }
  if (dryRun) {
    const r = git(["apply", "--check", f]);
    if (r.status !== 0) die(`O patch ${name} NÃO se aplicaria:\n${r.stderr}`);
    console.log(`✔ ${name} aplicaria sem conflitos`);
    continue;
  }
  const r = git(["am", "--3way", "--quiet", f]);
  if (r.status !== 0) {
    git(["am", "--abort"]);
    die(`Falha ao aplicar ${name}. Nada foi alterado.\n${(r.stderr || r.stdout).trim()}\n\nCausas comuns: patch fora de ordem, ou arquivos já editados por você.\nMande a mensagem acima para o Claude gerar um patch novo.`);
  }
  console.log(`✔ aplicado: ${subjectOf(f) || name}`);
  n++;
}

if (dryRun) process.exit(0);

const changed = out(["diff", "--name-only", before, "HEAD"]).split("\n").filter(Boolean);
const touched = (re) => changed.some((c) => re.test(c));
const npm = (a) => spawnSync(isWin ? "npm.cmd" : "npm", a, { stdio: "inherit", shell: isWin });

console.log(`\n${n} patch(es) aplicado(s); ${changed.length} arquivo(s) alterado(s).`);

if (touched(/^package(-lock)?\.json$/)) {
  if (has("--no-install")) console.log("↷ package.json mudou, mas --no-install foi pedido. Rode `npm install` depois.");
  else { console.log("\n→ As dependências mudaram: rodando `npm install`…"); if (npm(["install"]).status !== 0) die("`npm install` falhou."); }
} else {
  console.log("✔ Dependências intactas: nenhuma instalação necessária.");
}
if (touched(/^src-tauri\/(Cargo\.toml|Cargo\.lock)$/)) console.log("ℹ O Rust mudou: a próxima execução de `npm run tauri dev` recompila só o que for preciso.");
if (touched(/^src-tauri\/(tauri\.conf\.json|capabilities\/)/)) console.log("ℹ A configuração do Tauri mudou: reinicie o `tauri dev` se ele estiver aberto.");

if (!has("--no-check") && existsSync("node_modules")) {
  console.log("\n→ Verificando tipos (`npm run typecheck`)…");
  if (npm(["run", "typecheck"]).status !== 0) console.log("\n⚠ O typecheck acusou erros. Copie a saída e mande para o Claude.");
  else console.log("✔ Tipos OK.");
}
console.log("\nPronto. Para testar: npm run tauri dev");
