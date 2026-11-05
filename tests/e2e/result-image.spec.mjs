// Eigentümer: D – E2E „Ergebnis teilen“: Button nur mit gemeinsamen Favoriten, PNG 1080×1350 per Download (de)
// bzw. navigator.share mit Datei (en, mit Fotos aus dem Bildspeicher per Wikimedia-Mock). Bilder → scratchpad/shots.
import { test, expect, devices } from 'playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import path from 'node:path';
import { isWikiUrl } from './helpers.mjs';

const BASE = 'http://localhost:4173/elo-duell/';
const SHOTS = process.env.SHOTS_DIR || '/tmp/claude-0/-workspace/e8b7b540-9411-57c5-8db6-1e088b3bf01a/scratchpad/shots';
const LIST = 'l_result0001';
const PARTNER = 'd_anna000001';
const PIZZA = ['Margherita', 'Quattro Formaggi con Funghi Porcini e Tartufo Nero', 'Diavola', 'Calzone', 'Hawaii', 'Tonno', 'Prosciutto', 'Marinara'];

/** Profil mit Liste und gespeicherter Partner-Rangliste. @param {string[]} names @param {string[]} partnerOrder */
function makeState(names, partnerOrder) {
  const now = Date.now();
  return {
    schema: 1, device: { id: 'd_ben0000001', name: 'Ben' }, settings: {}, order: [LIST],
    lists: { [LIST]: {
      id: LIST, aliases: [], name: 'Pizzaabend', createdAt: now, updatedAt: now, stableShown: true, history: [],
      options: names.map((name, i) => ({ id: `o_r${String(i).padStart(3, '0')}`, name, rating: 1200 - i * 30, duels: 6, wins: 3, draws: 0, losses: 3 })),
      partners: [{ deviceId: PARTNER, name: 'Anna', sentAt: now - 60_000, receivedAt: now,
        options: partnerOrder.map((name, i) => ({ name, rating: 1200 - i * 30, duels: 6 })) }],
    } },
  };
}

/** @param {import('playwright/test').Browser} browser @param {string} locale @param {any} state */
async function phone(browser, locale, state) {
  const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
  const context = await browser.newContext({ ...pixel, locale, baseURL: BASE, acceptDownloads: true });
  await context.addInitScript((s) => {
    if (!localStorage.getItem('elo-duell:state')) localStorage.setItem('elo-duell:state', s);
  }, JSON.stringify(state));
  const page = await context.newPage();
  return { context, page };
}

/** PNG-Breite/Höhe aus dem IHDR. @param {Buffer} buf */
const pngSize = (buf) => ({ sig: buf.subarray(1, 4).toString(), w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

/** Farbverlauf-PNG als „Foto“. @param {number} w @param {number} h @param {number[]} c */
function photoPng(w, h, [r, g, b]) {
  const chunk = (/** @type {string} */ type, /** @type {Buffer} */ data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = [0];
    for (let x = 0; x < w; x++) row.push((r + x) & 255, (g + y) & 255, (b + ((x + y) >> 1)) & 255);
    rows.push(Buffer.from(row));
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

/** Wikipedia/Wikimedia-Mock: jeder Begriff hat ein Foto. @param {import('playwright/test').BrowserContext} context */
async function mockWiki(context) {
  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'api-user-agent' };
  const colors = [[200, 60, 40], [40, 120, 200], [60, 170, 90], [190, 150, 30]];
  let i = 0;
  await context.route(isWikiUrl, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    if (url.hostname.endsWith('wikimedia.org')) {
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png' }, body: photoPng(240, 180, colors[i++ % colors.length]) });
    }
    const m = /\/api\/rest_v1\/page\/summary\/(.+)$/.exec(url.pathname);
    if (!m) return route.fulfill({ status: 404, headers: CORS, body: '{}' });
    const title = decodeURIComponent(m[1]).replace(/_/g, ' ');
    const src = `https://thumb.wikimedia.org/wikipedia/commons/thumb/x/${encodeURIComponent(title)}.png/500px-x.png`;
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({
      type: 'standard', title, content_urls: { desktop: { page: `https://${url.hostname}/wiki/${encodeURIComponent(title)}` } },
      thumbnail: { source: src, width: 500 }, originalimage: { source: src, width: 500 } }) });
  });
}

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

test('Deutsch: „Ergebnis teilen“ lädt ein PNG 1080×1350 herunter (ohne Fotos)', async ({ browser }) => {
  const { context, page } = await phone(browser, 'de-DE', makeState(PIZZA, PIZZA));
  try {
    await page.goto(`./#/vergleich/${LIST}/${PARTNER}`);
    const btn = page.getByTestId('cmp-share-image');
    await expect(btn).toHaveText('Ergebnis teilen');
    const [download] = await Promise.all([page.waitForEvent('download'), btn.click()]);
    expect(download.suggestedFilename()).toMatch(/^elo-duell-ergebnis-\d{4}-\d\d-\d\d\.png$/);
    const file = path.join(SHOTS, 'result-de-ohne-fotos.png');
    await download.saveAs(file);
    const buf = readFileSync(file);
    expect(buf.length).toBeGreaterThan(10_000);
    expect(pngSize(buf)).toEqual({ sig: 'PNG', w: 1080, h: 1350 });
    await expect(page.locator('#toast')).toContainText('Bild gespeichert');
  } finally {
    await context.close();
  }
});

test('Englisch: navigator.share erhält PNG-Datei mit Fotos aus dem Bildspeicher', async ({ browser }) => {
  const { context, page } = await phone(browser, 'en-US', makeState(PIZZA, PIZZA));
  try {
    await mockWiki(context);
    await context.addInitScript(() => {
      const nav = /** @type {any} */ (navigator);
      nav.canShare = (/** @type {any} */ d) => !!d?.files?.length;
      nav.share = async (/** @type {any} */ d) => {
        const f = d.files[0];
        const bmp = await createImageBitmap(f);
        const bytes = new Uint8Array(await f.arrayBuffer());
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        /** @type {any} */ (window).__shared = { name: f.name, type: f.type, size: f.size, w: bmp.width, h: bmp.height, title: d.title, text: d.text, b64: btoa(bin) };
      };
    });
    // Liste öffnen → Bilder werden geholt und im Bildspeicher abgelegt.
    await page.goto(`./#/liste/${LIST}`);
    await expect.poll(() => page.evaluate(() => {
      try { return Object.values(JSON.parse(localStorage.getItem('elo-duell:img') || '{}').e || {}).filter((e) => /** @type {any} */ (e).s).length; } catch { return -1; }
    }), { timeout: 20_000 }).toBeGreaterThanOrEqual(3);

    await page.goto(`./#/vergleich/${LIST}/${PARTNER}`);
    await expect(page.getByTestId('cmp-share-image')).toHaveText('Share result');
    await page.getByTestId('cmp-share-image').click();
    const shared = await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).__shared?.size ?? 0), { timeout: 15_000 }).toBeGreaterThan(10_000)
      .then(() => page.evaluate(() => /** @type {any} */ (window).__shared));
    expect(shared.name).toMatch(/^elo-duel-result-\d{4}-\d\d-\d\d\.png$/);
    expect(shared.type).toBe('image/png');
    expect([shared.w, shared.h]).toEqual([1080, 1350]);
    expect(shared.title).toBe('Pizzaabend');
    expect(shared.text).toContain('1. Margherita');
    const buf = Buffer.from(shared.b64, 'base64');
    expect(pngSize(buf)).toEqual({ sig: 'PNG', w: 1080, h: 1350 });
    writeFileSync(path.join(SHOTS, 'result-en-photos.png'), buf);
  } finally {
    await context.close();
  }
});

test('Ohne gemeinsame Favoriten kein „Ergebnis teilen“; Abbrechen des Teilen-Dialogs ist kein Fehler', async ({ browser }) => {
  const two = ['Rom', 'Kreta'];
  const { context, page } = await phone(browser, 'de-DE', makeState(two, [...two].reverse()));
  try {
    await page.goto(`./#/vergleich/${LIST}/${PARTNER}`);
    await expect(page.getByTestId('cmp-favorites')).toBeVisible();
    await expect(page.getByTestId('cmp-empty-favorites')).toBeVisible();
    await expect(page.getByTestId('cmp-share-image')).toHaveCount(0);
  } finally {
    await context.close();
  }
  const B = await phone(browser, 'de-DE', makeState(PIZZA, PIZZA));
  try {
    await B.context.addInitScript(() => {
      const nav = /** @type {any} */ (navigator);
      nav.canShare = () => true;
      nav.share = async () => { /** @type {any} */ (window).__asked = true; throw new DOMException('abgebrochen', 'AbortError'); };
    });
    await B.page.goto(`./#/vergleich/${LIST}/${PARTNER}`);
    await B.page.getByTestId('cmp-share-image').click();
    await expect.poll(() => B.page.evaluate(() => /** @type {any} */ (window).__asked === true)).toBe(true);
    await expect(B.page.getByTestId('cmp-share-image')).toBeEnabled();
    await expect(B.page.locator('#toast')).not.toContainText('nicht erstellt');
  } finally {
    await B.context.close();
  }
});
