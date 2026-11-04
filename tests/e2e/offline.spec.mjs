// Eigentümer: E – Offline und SW-Update (docs/ARCHITEKTUR.md §9, §10; docs/research/pwa-offline.md §2, §3b).
import { test, expect } from 'playwright/test';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPersistent, waitForSw, createList, makeJsonPayload } from './helpers.mjs';

test.describe.configure({ mode: 'serial' });

test('offline: Reload zeigt App-Shell, Daten bleiben, Duell funktioniert', async () => {
  const app = await launchPersistent();
  try {
    const { page, context } = app;
    await page.goto('./');
    await waitForSw(page);
    const listId = await createList(page, 'Offline-Test', ['Eins', 'Zwei', 'Drei']);
    const before = await page.evaluate(() => localStorage.getItem('elo-duell:state'));
    expect(before).toContain('Offline-Test');

    await context.setOffline(true);
    const resp = await page.reload();
    expect(resp?.status()).toBe(200);
    await expect(page).toHaveTitle(/Elo-Duell/);
    expect(await page.evaluate(() => localStorage.getItem('elo-duell:state'))).toContain('Offline-Test');

    await page.goto('./#/');
    await expect(page.getByTestId(`home-list-${listId}`)).toBeVisible();

    await page.goto(`./#/duell/${listId}`);
    const progress = page.getByTestId('duel-progress');
    await expect(progress).toHaveAttribute('data-duels', '0');
    await page.getByTestId('duel-a').click();
    await expect(progress).toHaveAttribute('data-duels', '1');
  } finally {
    await app.close();
  }
});

test('offline: neuer Tab mit #i=…-Link landet in der Import-Ansicht', async () => {
  const app = await launchPersistent();
  try {
    const { page, context } = app;
    await page.goto('./');
    await waitForSw(page);
    await context.setOffline(true);

    // Fragment mit Query und anderem Hash: Navigation fällt auf index.html zurück, Hash bleibt.
    const p0 = await context.newPage();
    const r0 = await p0.goto('./index.html?x=1#abc');
    expect(r0?.status()).toBe(200);
    await p0.close();

    const payload = makeJsonPayload({
      v: 1, l: 'l_offline001', n: 'Offline-Liste', p: 'Anna', d: 'd_anna000001',
      t: Math.floor(Date.now() / 1000), o: [['Lissabon', 1016, 1], ['Rom', 984, 1]],
    });
    const p2 = await context.newPage();
    const r2 = await p2.goto(`./#i=${payload}`);
    expect(r2?.status()).toBe(200);
    await expect(p2).toHaveTitle(/Elo-Duell/);
    await expect(p2).toHaveURL(/#\/import$/);
    await expect(p2.getByTestId('import-summary')).toContainText('Anna');
    await expect(p2.getByTestId('import-summary')).toContainText('Offline-Liste');
  } finally {
    await app.close();
  }
});

// ---------------------------------------------------------------------------------------------
// SW-Update: eigener Server auf freiem Port, der VERSION in sw.js umschreiben kann.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

/** @param {() => string} version @returns {Promise<{base:string, close:()=>Promise<void>}>} */
async function startVersionServer(version) {
  const server = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
    if (!p.startsWith('/elo-duell/')) { res.writeHead(404); return res.end(); }
    let file = path.join(ROOT, p.slice('/elo-duell/'.length));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file, 'index.html');
    let body = await readFile(file).catch(() => null);
    if (!body) { res.writeHead(404); return res.end(); }
    if (p === '/elo-duell/sw.js') {
      body = Buffer.from(body.toString('utf8').replace(/^const VERSION = '[^']+';$/m, `const VERSION = '${version()}';`));
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    base: `http://localhost:${addr.port}/elo-duell/`,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r(undefined)); }),
  };
}

test('SW-Update: kein Reload beim Erstbesuch, Banner „Neue Version verfügbar“, Neu laden aktiviert neue Version', async () => {
  let version = 'test-a';
  const srv = await startVersionServer(() => version);
  const app = await launchPersistent({ baseURL: srv.base });
  try {
    const { page } = app;
    await page.goto('./');
    await page.evaluate(() => { /** @type {any} */ (window).__marker = 1; });
    // clients.claim() übernimmt die Seite; pwa.js darf dabei NICHT neu laden.
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => /** @type {any} */ (window).__marker)).toBe(1);
    await expect(page.getByTestId('banner-update')).toHaveCount(0);

    version = 'test-b';
    await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg?.update(); });
    const banner = page.getByTestId('banner-update');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText('Neue Version verfügbar');
    // Noch kein Wechsel: alter SW kontrolliert, neuer wartet, Seite nicht neu geladen.
    expect(await page.evaluate(() => /** @type {any} */ (window).__marker)).toBe(1);
    expect(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);

    await Promise.all([
      page.waitForEvent('load'),
      banner.getByRole('button', { name: 'Neu laden' }).click(),
    ]);
    expect(await page.evaluate(() => /** @type {any} */ (window).__marker)).toBeUndefined();
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('elo-duell-'))))
      .toEqual(['elo-duell-test-b']);
    await expect(page.getByTestId('banner-update')).toHaveCount(0);
  } finally {
    await app.close();
    await srv.close();
  }
});
