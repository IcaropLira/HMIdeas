#!/usr/bin/env node
// Gera a chave que ASSINA o APK. Use SEMPRE a mesma: o Android só atualiza por cima um app assinado pela mesma chave.
//   npm run android:keystore
// Requer o `keytool` (vem com o JDK). O arquivo fica em ~/.tauri/hm-ideas.jks (NUNCA vai para o git).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

const dir = join(homedir(), ".tauri");
const jks = join(dir, "hm-ideas.jks");
mkdirSync(dir, { recursive: true });
if (existsSync(jks)) { console.error(`✖ Já existe ${jks}. Apague só se quiser TROCAR a chave (aí o Android exige desinstalar o app antigo).`); process.exit(1); }

const pass = randomBytes(18).toString("base64url");
const r = spawnSync("keytool", ["-genkeypair", "-v", "-keystore", jks, "-alias", "hmideas", "-keyalg", "RSA", "-keysize", "2048", "-validity", "36500",
  "-storepass", pass, "-keypass", pass, "-dname", "CN=HM Ideas, O=HM Ideas, C=BR"], { stdio: "inherit" });
if (r.status !== 0) { console.error("✖ keytool falhou (instale um JDK)."); process.exit(1); }

console.log(`
✔ Keystore: ${jks}

No GitHub: Settings → Secrets and variables → Actions → New repository secret
  ANDROID_KEYSTORE_BASE64    = (o texto abaixo, tudo numa linha)
  ANDROID_KEYSTORE_PASSWORD  = ${pass}
  ANDROID_KEY_ALIAS          = hmideas

ANDROID_KEYSTORE_BASE64:
${readFileSync(jks).toString("base64")}

Guarde o arquivo e a senha em lugar seguro.`);
