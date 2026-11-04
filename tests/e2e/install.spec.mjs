// Eigentümer: E – Installierbarkeit (docs/ARCHITEKTUR.md §9, §10; docs/research/pwa-offline.md §3b).
// Persistenter Kontext ist Pflicht: browser.newContext() ist inkognito → Fehler „in-incognito“.
import { test, expect } from 'playwright/test';
import { readFileSync } from 'node:fs';
import { launchPersistent, waitForSw, BASE_URL } from './helpers.mjs';

const SW_SRC = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
const SW_VERSION = /^const VERSION = '([^']+)';$/m.exec(SW_SRC)?.[1];
const PRECACHE = [...SW_SRC.matchAll(/^\s*'(\.\/[^']*)',$/gm)].map((m) => m[1]);

/** @type {Awaited<ReturnType<typeof launchPersistent>>} */
let app;

test.beforeAll(async () => {
  app = await launchPersistent();
  await app.page.goto('./');
  await waitForSw(app.page);
});

test.afterAll(async () => {
  await app?.close();
});

test('CDP: keine Installierbarkeitsfehler, Manifest fehlerfrei', async () => {
  const cdp = await app.context.newCDPSession(app.page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors).toEqual([]);
  const man = await cdp.send('Page.getAppManifest');
  expect(man.url).toBe(BASE_URL + 'manifest.webmanifest');
  expect(man.errors).toEqual([]);
  // Page.getAppId liefert in Chromium 153 nichts mehr; die id prüft der Manifest-Test.
});

test('Service Worker kontrolliert die Seite, Scope /elo-duell/', async () => {
  const info = await app.page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return {
      controlled: !!navigator.serviceWorker.controller,
      scope: reg?.scope,
      script: reg?.active?.scriptURL,
      waiting: !!reg?.waiting,
    };
  });
  expect(info).toEqual({ controlled: true, scope: BASE_URL, script: BASE_URL + 'sw.js', waiting: false });
});

test('Cache elo-duell-<VERSION> enthält die komplette Precache-Liste', async () => {
  expect(SW_VERSION).toBeTruthy();
  expect(PRECACHE.length).toBeGreaterThan(10);
  const res = await app.page.evaluate(async ({ name, urls }) => {
    const keys = await caches.keys();
    const c = await caches.open(name);
    const missing = [];
    for (const u of urls) if (!(await c.match(new URL(u, location.href).href))) missing.push(u);
    return { keys, missing };
  }, { name: 'elo-duell-' + SW_VERSION, urls: PRECACHE });
  expect(res.keys.filter((k) => k.startsWith('elo-duell-'))).toEqual(['elo-duell-' + SW_VERSION]);
  expect(res.missing).toEqual([]);
});

test('Manifest-Felder und Icon-Größen', async () => {
  const r = await app.page.evaluate(async () => {
    const link = /** @type {HTMLLinkElement} */ (document.querySelector('link[rel="manifest"]'));
    const resp = await fetch(link.href);
    const m = await resp.json();
    const base = new URL(link.href);
    const sizes = [];
    for (const i of m.icons) {
      const img = new Image();
      img.src = new URL(i.src, base).href;
      await img.decode();
      sizes.push({ src: i.src, purpose: i.purpose, declared: i.sizes, w: img.naturalWidth, h: img.naturalHeight });
    }
    return {
      ctype: resp.headers.get('content-type'),
      id: new URL(m.id, base).href,
      start: new URL(m.start_url, base).href,
      scope: new URL(m.scope, base).href,
      name: m.name, short: m.short_name, display: m.display, lang: m.lang,
      theme: m.theme_color, bg: m.background_color, prefer: m.prefer_related_applications,
      sizes,
      themeMeta: [...document.querySelectorAll('meta[name="theme-color"]')].map((x) => /** @type {HTMLMetaElement} */ (x).content),
      viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content'),
    };
  });
  expect(r.ctype).toContain('application/manifest+json');
  expect([r.id, r.start, r.scope]).toEqual([BASE_URL, BASE_URL, BASE_URL]);
  expect([r.name, r.short, r.display, r.lang]).toEqual(['Elo-Duell', 'Elo-Duell', 'standalone', 'de']);
  expect([r.theme, r.bg]).toEqual(['#f7f7fb', '#f7f7fb']);
  expect(r.prefer).not.toBe(true);
  expect(r.themeMeta).toContain('#f7f7fb');
  expect(r.viewport).toContain('width=device-width');

  const png = r.sizes.filter((s) => s.src.endsWith('.png'));
  const has = (w, purpose) => png.some((s) => s.w === w && s.h === w && s.declared === `${w}x${w}` && s.purpose === purpose);
  expect(has(192, 'any')).toBe(true);
  expect(has(512, 'any')).toBe(true);
  expect(has(512, 'maskable')).toBe(true);
  for (const s of png) expect(`${s.w}x${s.h}`).toBe(s.declared);
});
