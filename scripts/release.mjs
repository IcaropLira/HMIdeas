#!/usr/bin/env node
// Publica uma versão: ajusta a versão, faz commit e cria a tag. O GitHub Actions gera os instaladores.
//   npm run release -- 0.3.0
import { spawnSync } from "node:child_process";

const version = (process.argv[2] ?? "").replace(/^v/, "");
if (!version) { console.error("Uso: npm run release -- <x.y.z>"); process.exit(1); }

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) { console.error(`✖ falhou: ${cmd} ${args.join(" ")}`); process.exit(1); }
};
const dirty = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).stdout.trim();
if (dirty) { console.error("✖ Há alterações não commitadas. Faça commit antes de publicar."); process.exit(1); }

run("node", ["scripts/set-version.mjs", version]);
run("git", ["add", "package.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml"]);
run("git", ["commit", "-m", `chore: versão ${version}`]);
run("git", ["tag", `v${version}`]);
console.log(`\n✔ Tag v${version} criada. Para publicar e gerar os instaladores:\n\n  git push && git push origin v${version}\n`);
