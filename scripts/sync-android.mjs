#!/usr/bin/env node
/**
 * sync-android.mjs — Copie le build web (dist/) dans le projet Android Capacitor.
 *
 * Équivalent minimal et déterministe de `npx cap copy android`, qui :
 *   1. vide/recrée android/app/src/main/assets/public et y copie dist/
 *   2. écrit android/app/src/main/assets/capacitor.config.json   (lu par BridgeActivity)
 *   3. écrit android/app/src/main/assets/capacitor.plugins.json  (aucun plugin natif)
 *
 * On N'UTILISE PAS `npx cap sync` : ce projet embarque un SDK Capacitor
 * vendored (android/capacitor-sdk) et capacitor.settings.gradle est géré
 * à la main — `cap sync` le réécrirait vers node_modules et casserait le build.
 *
 * Usage :  node scripts/sync-android.mjs        (après `npx vite build`)
 */
import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const android = join(root, "android");
const assets = join(android, "app", "src", "main", "assets");
const publicDir = join(assets, "public");

const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

if (!existsSync(join(android, "settings.gradle"))) {
  fail("dossier android/ introuvable ou incomplet (settings.gradle manquant).");
}
if (!existsSync(join(dist, "index.html"))) {
  fail("dist/index.html introuvable — lancez d'abord :  npx vite build");
}

// 1. Web assets
rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });
cpSync(dist, publicDir, { recursive: true });

// 2 + 3. Fichiers de configuration Capacitor (ignorés par git, donc régénérés)
mkdirSync(assets, { recursive: true });
writeFileSync(
  join(assets, "capacitor.config.json"),
  JSON.stringify(
    {
      appId: "com.prototype.metronome",
      appName: "Métronome",
      webDir: "dist",
      backgroundColor: "#050506",
      android: { allowMixedContent: false },
    },
    null,
    "\t",
  ) + "\n",
);
writeFileSync(join(assets, "capacitor.plugins.json"), "[]\n");

const size = statSync(join(publicDir, "index.html")).size;
console.log("✔ Web assets copiés dans android/app/src/main/assets/public");
console.log(`    index.html : ${(size / 1024).toFixed(0)} Ko (bundle unique)`);
console.log("✔ capacitor.config.json + capacitor.plugins.json régénérés");
