#!/usr/bin/env node
// Aponta o atualizador do app para o seu repositório do GitHub (onde ficam as releases).
//   node scripts/set-repo.mjs dono/repositorio      (o workflow de release faz isso sozinho)
import { readFileSync, writeFileSync } from "node:fs";

const repo = process.argv[2] ?? process.env.GITHUB_REPOSITORY ?? "";
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  console.error("Uso: node scripts/set-repo.mjs <dono>/<repositório>");
  process.exit(1);
}
const path = "src-tauri/tauri.conf.json";
const conf = JSON.parse(readFileSync(path, "utf8"));
conf.plugins.updater.endpoints = [`https://github.com/${repo}/releases/latest/download/latest.json`];
writeFileSync(path, JSON.stringify(conf, null, 2) + "\n");
console.log(`Atualizador aponta para github.com/${repo}`);
