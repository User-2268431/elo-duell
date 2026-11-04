// Eigentümer: E – Lighthouse-11-PWA-Prüfung (docs/ARCHITEKTUR.md §10, docs/research/pwa-offline.md §3a).
// Start: npm run test:lh   (Ziel: categories.pwa.score === 1, sonst Exit-Code 1)
//
// Lighthouse 11 ist bewusst KEINE devDependency: Es wird in einem Arbeitsverzeichnis außerhalb des Repos
// erwartet bzw. dort einmalig installiert (npm i lighthouse@11). Berichte landen ebenfalls dort.
//   LH_DIR      Verzeichnis mit node_modules/lighthouse (Standard: <tmp>/elo-duell-lh)
//   LH_OUT      Ausgabeverzeichnis für lh.report.json/.html (Standard: LH_DIR)
//   LH_URL      zu prüfende URL (Standard: http://localhost:4173/elo-duell/)
//   CHROME_PATH Chromium (Standard: /opt/pw-browsers/chromium, falls vorhanden)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LH_DIR = path.resolve(process.env.LH_DIR || path.join(os.tmpdir(), 'elo-duell-lh'));
const OUT = path.resolve(process.env.LH_OUT || LH_DIR);
const URL_ = process.env.LH_URL || 'http://localhost:4173/elo-duell/';
const CHROME = process.env.CHROME_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

if (LH_DIR === ROOT || LH_DIR.startsWith(ROOT + path.sep) || OUT.startsWith(ROOT + path.sep)) {
  console.error('LH_DIR/LH_OUT dürfen nicht im Repo liegen.');
  process.exit(2);
}

const cli = path.join(LH_DIR, 'node_modules', 'lighthouse', 'cli', 'index.js');
if (!existsSync(cli)) {
  console.log(`Lighthouse 11 fehlt in ${LH_DIR} – installiere (einmalig) …`);
  mkdirSync(LH_DIR, { recursive: true });
  if (!existsSync(path.join(LH_DIR, 'package.json'))) {
    spawnSync('npm', ['init', '-y'], { cwd: LH_DIR, stdio: 'ignore' });
  }
  const r = spawnSync('npm', ['i', '--no-audit', '--no-fund', 'lighthouse@11'], { cwd: LH_DIR, stdio: 'inherit' });
  if (r.status !== 0 || !existsSync(cli)) { console.error('Installation von lighthouse@11 fehlgeschlagen.'); process.exit(2); }
}
const lhVersion = JSON.parse(readFileSync(path.join(LH_DIR, 'node_modules', 'lighthouse', 'package.json'), 'utf8')).version;
if (!lhVersion.startsWith('11.')) {
  console.error(`Lighthouse ${lhVersion} gefunden – die PWA-Kategorie gibt es nur bis Version 11.`);
  process.exit(2);
}

/** Läuft der Server schon? Sonst tools/serve.mjs für die Dauer der Prüfung starten. */
async function reachable(u) {
  try { const r = await fetch(u, { redirect: 'manual' }); return r.status < 500; } catch { return false; }
}
let server = null;
if (!(await reachable(URL_))) {
  server = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.mjs')], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await reachable(URL_)); i++) await new Promise((r) => setTimeout(r, 100));
}

mkdirSync(OUT, { recursive: true });
const outBase = path.join(OUT, 'lh');
const args = [
  cli, URL_,
  '--only-categories=pwa',
  '--chrome-flags=--headless=new --no-sandbox',
  '--output=json', '--output=html',
  `--output-path=${outBase}`,
  '--quiet',
];
const res = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...(CHROME ? { CHROME_PATH: CHROME } : {}) } });
if (server) server.kill();
if (res.status !== 0) { console.error('Lighthouse ist fehlgeschlagen.'); process.exit(res.status || 1); }

const report = JSON.parse(readFileSync(outBase + '.report.json', 'utf8'));
const cat = report.categories.pwa;
console.log(`Lighthouse ${report.lighthouseVersion} · PWA-Score ${cat.score} · ${URL_}`);
const failed = cat.auditRefs
  .map((r) => report.audits[r.id])
  .filter((a) => a && a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'manual');
for (const a of failed) console.log(`  ✗ ${a.id}: ${a.title}`);
console.log(`Berichte: ${outBase}.report.json, ${outBase}.report.html`);
process.exit(cat.score === 1 ? 0 : 1);
