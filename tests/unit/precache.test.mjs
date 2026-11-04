// Eigentümer: E – Precache-Abgleich per Whitelist und VERSION-Gleichheit (docs/ARCHITEKTUR.md §8, §10).
// Wird bewusst rot, sobald jemand eine Datei in css/, js/, icons/ oder vendor/ anlegt oder entfernt,
// ohne dass PRECACHE in sw.js nachgezogen wurde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const SW = read('sw.js');

/** Liest PRECACHE: genau ein String pro Zeile zwischen `const PRECACHE = [` und `];`. */
function parsePrecache(src) {
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((l) => /^const PRECACHE = \[\s*$/.test(l));
  assert.notEqual(start, -1, 'sw.js: Zeile "const PRECACHE = [" fehlt');
  const entries = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l === '];') return entries;
    if (l === '' || l.startsWith('//')) continue;
    const m = /^'([^']+)',$/.exec(l);
    assert.ok(m, `sw.js Zeile ${i + 1}: erwartet genau einen String pro Zeile ('./pfad',), gefunden: ${l}`);
    entries.push(m[1]);
  }
  assert.fail('sw.js: PRECACHE ohne abschließendes "];"');
}

/** Alle Dateien unter dir (rekursiv), als './dir/…'. */
function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(rel));
    else if (e.isFile()) out.push(`./${rel}`);
  }
  return out;
}

/** Whitelist §8: ./, index.html, manifest.webmanifest, css/**, js/**, icons/**, vendor/*.{mjs,js} */
function expectedFiles() {
  const vendor = readdirSync(path.join(ROOT, 'vendor'), { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(mjs|js)$/.test(e.name))
    .map((e) => `./vendor/${e.name}`);
  return ['./', './index.html', './manifest.webmanifest', ...walk('css'), ...walk('js'), ...walk('icons'), ...vendor];
}

const PRECACHE = parsePrecache(SW);

test('PRECACHE hat keine Duplikate und nur relative Pfade', () => {
  assert.equal(new Set(PRECACHE).size, PRECACHE.length, 'Duplikate in PRECACHE');
  for (const u of PRECACHE) assert.ok(u.startsWith('./'), `nicht relativ: ${u}`);
});

test('PRECACHE entspricht genau der Whitelist-Dateimenge', () => {
  const want = new Set(expectedFiles());
  const have = new Set(PRECACHE);
  const missing = [...want].filter((f) => !have.has(f)).sort();
  const extra = [...have].filter((f) => !want.has(f)).sort();
  assert.deepEqual(
    { fehltInPrecache: missing, ueberzaehligInPrecache: extra },
    { fehltInPrecache: [], ueberzaehligInPrecache: [] },
    'sw.js PRECACHE an die Dateiliste anpassen (Eigentümer E)'
  );
});

test('Ausgeschlossenes steht nicht in PRECACHE', () => {
  for (const u of PRECACHE) {
    assert.ok(!/^\.\/(sw\.js|docs\/|tests\/|tools\/|node_modules\/)/.test(u), `gehört nicht in PRECACHE: ${u}`);
    assert.ok(!/LICENSE|\/package\.json$/.test(u), `gehört nicht in PRECACHE: ${u}`);
  }
});

test('index.html: alle lokalen <link>/<script> sind im PRECACHE', () => {
  const html = read('index.html');
  const refs = [...html.matchAll(/<(?:link|script)\b[^>]*\b(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 0);
  for (const r of refs) {
    if (/^[a-z]+:/i.test(r)) assert.fail(`index.html lädt Fremdressource: ${r}`);
    assert.ok(r.startsWith('./'), `index.html: Pfad nicht relativ: ${r}`);
    assert.ok(PRECACHE.includes(r), `index.html referenziert ${r}, fehlt in PRECACHE`);
  }
});

test('Manifest-Icons sind im PRECACHE', () => {
  const man = JSON.parse(read('manifest.webmanifest'));
  for (const i of man.icons) assert.ok(PRECACHE.includes(i.src), `Icon ${i.src} fehlt in PRECACHE`);
});

test('Alle statischen ES-Importe zeigen auf vorhandene, gecachte Dateien', () => {
  for (const f of PRECACHE.filter((u) => /\.m?js$/.test(u))) {
    // Kommentare grob entfernen (JSDoc-Typimporte wie import('./x.js').T sind kein Laden).
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s;])\/\/.*$/gm, '$1');
    const specs = [
      ...src.matchAll(/\bimport\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g),
      ...src.matchAll(/\bexport\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/g),
      ...src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((m) => m[1]);
    for (const s of specs) {
      assert.ok(s.startsWith('./') || s.startsWith('../'), `${f}: nicht-relativer Import "${s}" (kein Build, kein CDN)`);
      const target = './' + path.posix.normalize(path.posix.join(path.posix.dirname(f.slice(2)), s));
      assert.ok(PRECACHE.includes(target), `${f} importiert ${s} → ${target}, fehlt in PRECACHE/Dateien`);
    }
  }
});

test('VERSION in sw.js gleich js/version.js', async () => {
  const m = /^const VERSION = '([^']+)';$/m.exec(SW);
  assert.ok(m, 'sw.js: Zeile "const VERSION = \'…\';" fehlt');
  const { VERSION } = await import('../../js/version.js');
  assert.equal(m[1], VERSION);
});

test('sw.js: Cache-Präfix, cache:reload, clients.claim, SKIP_WAITING nur per Nachricht', () => {
  assert.match(SW, /const PREFIX = 'elo-duell-';/);
  assert.match(SW, /cache: 'reload'/);
  assert.match(SW, /clients\.claim\(\)/);
  assert.match(SW, /type === 'SKIP_WAITING'/);
  assert.equal((SW.match(/skipWaiting\(\)/g) || []).length, 1, 'skipWaiting() genau einmal (im message-Handler)');
});
