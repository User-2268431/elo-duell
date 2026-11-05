// Eigentümer: E – gemeinsame E2E-Helfer mit festen Signaturen (docs/ARCHITEKTUR.md §10).
// Arbeiten ausschließlich über die verbindlichen data-testid; funktionieren, sobald die Views von C/D fertig sind.
import { createRequire } from 'node:module';
import { expect, chromium, devices } from 'playwright/test';
import { mkdtempSync, rmSync, existsSync as fsExists } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
/** @type {(data:Uint8ClampedArray, w:number, h:number) => ({data:string}|null)} */
const jsQR = require('../../vendor/jsQR.js');

/**
 * Leert localStorage/sessionStorage dieser Origin und lädt die Startseite neu.
 * @param {import('playwright/test').Page} page
 * @returns {Promise<void>}
 */
export async function resetApp(page) {
  await page.goto('./');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto('./#/');
  await page.reload();
}

/**
 * Legt über „Neue Liste“ eine Liste per Einfügen an.
 * @param {import('playwright/test').Page} page
 * @param {string} name
 * @param {string[]} options
 * @returns {Promise<string>} listId (aus dem Hash #/liste/:id)
 */
export async function createList(page, name, options) {
  await page.goto('./#/');
  await page.getByTestId('home-new').click();
  await page.getByTestId('edit-name').fill(name);
  await page.getByTestId('edit-options').fill(options.join('\n'));
  await page.getByTestId('edit-save').click();
  await page.waitForURL(/#\/liste\/[^/]+$/);
  const m = /#\/liste\/([^/]+)$/.exec(page.url());
  if (!m) throw new Error('createList: keine Listen-ID im Hash');
  return decodeURIComponent(m[1]);
}

/**
 * Spielt count Duelle in der geöffneten Duell-View (#/duell/:id).
 * Wartet nach jedem Klick, bis data-duels an duel-progress gestiegen ist.
 * @param {import('playwright/test').Page} page
 * @param {number} count
 * @param {(a:string, b:string) => 'a'|'b'|'draw'} choose erhält die Texte von duel-a und duel-b
 * @returns {Promise<void>}
 */
export async function playDuels(page, count, choose) {
  const progress = page.getByTestId('duel-progress');
  for (let i = 0; i < count; i++) {
    const before = Number(await progress.getAttribute('data-duels'));
    const a = (await page.getByTestId('duel-a').innerText()).trim();
    const b = (await page.getByTestId('duel-b').innerText()).trim();
    const pick = choose(a, b);
    await page.getByTestId(pick === 'a' ? 'duel-a' : pick === 'b' ? 'duel-b' : 'duel-draw').click();
    await expect(progress).toHaveAttribute('data-duels', String(before + 1));
  }
}

/**
 * Liest den QR-Code aus dem <canvas> in share-qr und dekodiert ihn in Node mit jsQR.
 * @param {import('playwright/test').Page} page
 * @returns {Promise<string|null>} dekodierter Text oder null
 */
export async function decodeQr(page) {
  const img = await page.getByTestId('share-qr').locator('canvas').first().evaluate((c) => {
    const canvas = /** @type {HTMLCanvasElement} */ (c);
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { w: d.width, h: d.height, data: Array.from(d.data) };
  });
  const res = jsQR(Uint8ClampedArray.from(img.data), img.w, img.h);
  return res ? res.data : null;
}

// ---------------------------------------------------------------------------------------------
// Zusätzliche Helfer für PWA-Tests (E): persistenter Kontext (sonst „in-incognito“) und SW-Bereitschaft.

export const BASE_URL = 'http://localhost:4173/elo-duell/';

/**
 * Startet Chromium mit persistentem Profil (Pixel 7, baseURL wie in der Config).
 * close() schließt den Kontext und löscht das Profil.
 * @param {import('playwright/test').BrowserContextOptions} [extra]
 * @returns {Promise<{context:import('playwright/test').BrowserContext, page:import('playwright/test').Page, close:()=>Promise<void>}>}
 */
/** Wie in playwright.config.mjs: Wikipedia/Wikimedia lösen in Tests nicht auf (kein echtes Netz). */
export const BLOCK_WIKI_ARGS = [
  '--host-resolver-rules=MAP de.wikipedia.org ~NOTFOUND, MAP en.wikipedia.org ~NOTFOUND, ' +
  'MAP thumb.wikimedia.org ~NOTFOUND, MAP upload.wikimedia.org ~NOTFOUND',
];
/** Wikimedia-Anfrage (Bilder, js/images.js)? @param {string} url */
export const isWikiUrl = (url) => /^https:\/\/([a-z]+\.wikipedia\.org|(thumb|upload)\.wikimedia\.org)\//.test(url);

export async function launchPersistent(extra = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'elo-duell-pw-'));
  const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
  const exe = '/opt/pw-browsers/chromium';
  const context = await chromium.launchPersistentContext(dir, {
    ...pixel,
    baseURL: BASE_URL,
    ...(!process.env.PLAYWRIGHT_BROWSERS_PATH && fsExists(exe) ? { executablePath: exe } : {}),
    args: BLOCK_WIKI_ARGS,
    ...extra,
  });
  const page = context.pages()[0] || (await context.newPage());
  return {
    context,
    page,
    close: async () => {
      await context.close().catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Lädt ./, wartet auf den aktiven SW und lädt neu, bis die Seite kontrolliert ist.
 * @param {import('playwright/test').Page} page
 * @returns {Promise<void>}
 */
export async function waitForSw(page) {
  if (!page.url().startsWith(BASE_URL)) await page.goto('./');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (reg.active && reg.active.state !== 'activated') {
      await new Promise((r) => reg.active?.addEventListener('statechange', () => reg.active?.state === 'activated' && r(undefined)));
    }
  });
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

/**
 * Baut ein gültiges Payload v1 (Kodierung „j“, unkomprimiert) ohne Abhängigkeit von js/share/codec.js.
 * @param {any} data ShareData
 * @returns {string} "1.j.<base64url>"
 */
export function makeJsonPayload(data) {
  return '1.j.' + Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
}
