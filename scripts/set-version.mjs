#!/usr/bin/env node
// Define a versão em package.json, src-tauri/tauri.conf.json e src-tauri/Cargo.toml.
//   node scripts/set-version.mjs 0.3.0      (aceita também v0.3.0)
import { readFileSync, writeFileSync } from "node:fs";

const version = (process.argv[2] ?? "").replace(/^v/, "");
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Uso: node scripts/set-version.mjs <x.y.z>");
  process.exit(1);
}

const editJson = (path) => {
  const j = JSON.parse(readFileSync(path, "utf8"));
  j.version = version;
  writeFileSync(path, JSON.stringify(j, null, 2) + "\n");
};
editJson("package.json");
editJson("src-tauri/tauri.conf.json");

const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
const next = cargo.replace(/^version = ".*"$/m, `version = "${version}"`);
if (next === cargo && !cargo.includes(`version = "${version}"`)) {
  console.error("Não encontrei a linha version em src-tauri/Cargo.toml");
  process.exit(1);
}
writeFileSync("src-tauri/Cargo.toml", next);
console.log(`Versão definida: ${version}`);
