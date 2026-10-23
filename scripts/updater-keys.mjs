#!/usr/bin/env node
// Gera a chave que ASSINA as atualizações (sem ela, o app recusa qualquer atualização).
//   npm run updater:keys
// A chave privada fica em ~/.tauri/hm-ideas.key (NUNCA vai para o git); a pública entra no tauri.conf.json.
// Depois, cadastre a privada nos Secrets do repositório: TAURI_SIGNING_PRIVATE_KEY (e ..._PASSWORD se pôs senha).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const dir = join(homedir(), ".tauri");
const key = join(dir, "hm-ideas.key");
mkdirSync(dir, { recursive: true });
if (existsSync(key)) {
  console.error(`✖ Já existe ${key}. Apague-a só se quiser TROCAR a chave (apps já instalados deixarão de aceitar atualizações).`);
  process.exit(1);
}
const r = spawnSync("npx", ["tauri", "signer", "generate", "-w", key], { stdio: "inherit", shell: process.platform === "win32" });
if (r.status !== 0) process.exit(r.status ?? 1);

const pub = readFileSync(key + ".pub", "utf8").trim();
const path = "src-tauri/tauri.conf.json";
const conf = JSON.parse(readFileSync(path, "utf8"));
conf.plugins.updater.pubkey = pub;
writeFileSync(path, JSON.stringify(conf, null, 2) + "\n");
console.log(`
✔ Chave pública gravada em ${path} (faça commit).
✔ Chave privada: ${key}

Agora, no GitHub: Settings → Secrets and variables → Actions → New repository secret
  TAURI_SIGNING_PRIVATE_KEY            = conteúdo do arquivo ${key}
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD   = a senha (se você definiu uma)
Guarde uma cópia da chave privada em lugar seguro: se perder, os apps instalados não aceitam mais atualizações.`);
