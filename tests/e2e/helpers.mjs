// Eigentümer: E – gemeinsame E2E-Helfer mit festen Signaturen (docs/ARCHITEKTUR.md §10).
// Arbeiten ausschließlich über die verbindlichen data-testid; funktionieren, sobald die Views von C/D fertig sind.
import { createRequire } from 'node:module';
import { expect } from 'playwright/test';

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
