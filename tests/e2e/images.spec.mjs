// Bilder aus Wikipedia (js/images.js) – ausschließlich mit Mocks (context.route), kein echtes Netz.
import { test, expect } from 'playwright/test';
import { deflateSync, crc32 } from 'node:zlib';
import { resetApp, createList, waitForSw, isWikiUrl } from './helpers.mjs';

/** Einfarbiges PNG (w×h) – damit jede Option ein eigenes, sichtbares Bild hat. */
function solidPng(w, h, [r, g, b]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const COLORS = [[220, 90, 60], [60, 140, 220], [80, 180, 100], [200, 170, 40], [150, 90, 200]];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'api-user-agent', 'access-control-allow-methods': 'GET,HEAD' };
const thumb = (name) => `//thumb.wikimedia.org/wikipedia/commons/thumb/x/${name}.png/500px-${name}.png`;

/**
 * Wikimedia-Mock: Kopenhagen hat nur ein SVG-Wappen als Vorschau (→ media-list), Emma ist auf de eine Begriffsklärung (→ en).
 * @param {import('playwright/test').BrowserContext} context
 */
async function mockWiki(context) {
  /** @type {string[]} */ const calls = [];
  let color = 0;
  await context.route(isWikiUrl, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    calls.push(url.href);
    const json = (o, status = 200) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(o) });
    if (url.hostname.endsWith('wikimedia.org')) {
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png' }, body: solidPng(40, 30, COLORS[color++ % COLORS.length]) });
    }
    const lang = url.hostname.slice(0, 2);
    const m = /\/api\/rest_v1\/page\/(summary|media-list)\/(.+)$/.exec(url.pathname);
    if (!m) return route.fulfill({ status: 200, headers: { 'content-type': 'text/html' }, body: '<h1>Wikipedia</h1>' });
    const title = decodeURIComponent(m[2]).replace(/_/g, ' ');
    if (m[1] === 'media-list') {
      return json({ items: [
        { type: 'image', title: 'Datei:Wappen.svg', srcset: [{ src: '//thumb.wikimedia.org/w/Wappen.svg/500px-Wappen.svg.png', scale: '1x' }] },
        { type: 'image', title: `Datei:${title}_Foto.png`, srcset: [{ src: thumb(`${title}_Foto`), scale: '1x' }] },
      ] });
    }
    if (title === 'Emma' && lang === 'de') return json({ type: 'disambiguation', title });
    if (title === 'Ohnebild') return json({}, 404);
    const src = title === 'Kopenhagen' ? '//thumb.wikimedia.org/w/Wappen.svg/330px-Wappen.svg.png' : thumb(title);
    return json({ type: 'standard', title, titles: { canonical: title.replace(/ /g, '_'), normalized: title },
      content_urls: { desktop: { page: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}` } },
      thumbnail: { source: 'https:' + src, width: 500 }, originalimage: { source: 'https:' + src, width: 500 } });
  });
  return calls;
}

/** Wartet, bis der Bildspeicher n Bilder hat. @param {import('playwright/test').Page} page */
async function waitForImages(page, n) {
  await expect.poll(async () => page.evaluate(() => {
    try { return Object.values(JSON.parse(localStorage.getItem('elo-duell:img') || '{}').e || {}).filter((e) => e.s).length; } catch { return -1; }
  }), { timeout: 30_000 }).toBe(n);
}

test('Bilder erscheinen in Duell und Rangliste; Wappen verworfen, Fallback en; Quelle wertet nicht', async ({ page, context }) => {
  const calls = await mockWiki(context);
  await resetApp(page);
  const id = await createList(page, 'Bilder', ['Kopenhagen', 'Emma', 'Ohnebild']);
  await waitForImages(page, 2);
  expect(calls.some((u) => u.includes('/media-list/Kopenhagen'))).toBe(true);
  expect(calls.some((u) => u.startsWith('https://en.wikipedia.org/api/rest_v1/page/summary/Emma'))).toBe(true);
  expect(calls.some((u) => u.includes('Wappen.svg/'))).toBe(false);

  await page.goto(`./#/duell/${id}`);
  const cards = ['a', 'b'];
  for (const s of cards) await expect(page.getByTestId(`duel-${s}`)).toBeVisible();
  // Mit drei Optionen ist mindestens eine Karte mit Bild dabei; das Paar mit „Ohnebild“ hat genau ein Bild.
  for (const s of cards) {
    const name = (await page.getByTestId(`duel-${s}`).innerText()).trim();
    const img = page.getByTestId(`duel-img-${s}`);
    if (name === 'Ohnebild') { await expect(img).toBeHidden(); await expect(page.getByTestId(`duel-credit-${s}`)).toBeHidden(); continue; }
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute('alt', name);
    await expect(img).toHaveAttribute('src', /^blob:/);
    expect(await img.evaluate((el) => /** @type {HTMLImageElement} */ (el).naturalWidth)).toBeGreaterThan(0);
    const credit = page.getByTestId(`duel-credit-${s}`);
    await expect(credit).toHaveText('Bild: Wikipedia');
    await expect(credit).toHaveAttribute('target', '_blank');
    await expect(credit).toHaveAttribute('href', name === 'Emma' ? 'https://en.wikipedia.org/wiki/Emma' : 'https://de.wikipedia.org/wiki/Kopenhagen');
  }
  // Pixel 7: kein Scrollen, Karten vollständig sichtbar
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);

  // Tipp auf die Quellenangabe öffnet einen Tab, wertet aber kein Duell
  const credit = page.locator('.duel-credit:not([hidden])').first();
  const [popup] = await Promise.all([context.waitForEvent('page'), credit.click()]);
  await popup.close();
  await expect(page.getByTestId('duel-progress')).toHaveAttribute('data-duels', '0');

  await page.goto(`./#/rangliste/${id}`);
  await expect(page.getByTestId('rank-img')).toHaveCount(2);
  await expect(page.getByTestId('rank-img').first()).toHaveAttribute('src', /^blob:/);

  // Mit Stabil-Hinweis: Karten (mit Bild) bleiben vollständig sichtbar und antippbar, kein Scrollen
  await page.goto(`./#/duell/${id}`);
  for (let i = 0; i < 40 && !(await page.getByTestId('duel-stable').isVisible()); i++) {
    await page.getByTestId('duel-a').click();
    await page.waitForTimeout(280);
  }
  await expect(page.getByTestId('duel-stable')).toBeVisible();
  await expect(page.locator('.duel-img:not([hidden])').first()).toBeVisible();
  const vh = await page.evaluate(() => innerHeight);
  const actionsTop = (await page.locator('.duel-actions').boundingBox())?.y ?? 0;
  for (const s of cards) {
    const box = await page.getByTestId(`duel-${s}`).boundingBox();
    expect(box && box.y >= 0 && box.y + box.height <= actionsTop + 1 && box.height >= 60, `Karte ${s} sichtbar`).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  expect(actionsTop).toBeLessThan(vh);
  const n = Number(await page.getByTestId('duel-progress').getAttribute('data-duels'));
  await page.getByTestId('duel-b').click();
  await expect(page.getByTestId('duel-progress')).toHaveAttribute('data-duels', String(n + 1));
  await page.screenshot({ path: test.info().outputPath('duell-stabil-bilder.png') });
});

test('Schalter aus: keine Anfragen, keine Bilder; Speicher leeren', async ({ page, context }) => {
  const calls = await mockWiki(context);
  await resetApp(page);
  await page.goto('./#/einstellungen');
  const toggle = page.getByTestId('set-images');
  await expect(toggle).toBeChecked();
  await expect(page.getByTestId('set-images-section')).toContainText('Die Begriffe deiner Listen werden dafür an Wikipedia gesendet.');
  await toggle.uncheck();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('elo-duell:state') || '{}').settings.images)).toBe(false);
  const id = await createList(page, 'Aus', ['Rom', 'Paris']);
  await page.goto(`./#/duell/${id}`);
  await page.goto(`./#/rangliste/${id}`);
  await page.waitForTimeout(1500);
  expect(calls).toEqual([]);
  await expect(page.getByTestId('rank-img')).toHaveCount(0);

  // wieder an → Bilder kommen; „Bildspeicher leeren“ setzt die Anzeige zurück
  await page.goto('./#/einstellungen');
  await page.getByTestId('set-images').check();
  await page.goto(`./#/liste/${id}`);
  await waitForImages(page, 2);
  await page.goto('./#/einstellungen');
  await expect(page.getByTestId('set-images-usage')).toContainText('2 Bilder');
  await page.getByTestId('set-images-clear').click();
  await expect(page.getByTestId('set-images-usage')).toContainText('0 Bilder, 0,0 MB');
  expect(await page.evaluate(async () => (await (await caches.open('elo-duell-img')).keys()).length)).toBe(0);
});

test('offline: kein Fehler, gespeicherte Bilder bleiben sichtbar, keine neuen Anfragen', async ({ page, context }) => {
  const calls = await mockWiki(context);
  /** @type {string[]} */ const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await resetApp(page);
  await waitForSw(page);
  const id = await createList(page, 'Offline', ['Rom', 'Paris']);
  await waitForImages(page, 2);
  await page.evaluate((lid) => {
    // eine Option ohne Bild ergänzen, die offline nicht geholt werden darf
    const s = JSON.parse(localStorage.getItem('elo-duell:state') || '{}');
    s.lists[lid].options.push({ id: 'o_neu001', name: 'Lissabon', rating: 1000, duels: 0, wins: 0, draws: 0, losses: 0 });
    localStorage.setItem('elo-duell:state', JSON.stringify(s));
  }, id);
  const before = calls.length;
  await context.setOffline(true);
  await page.goto(`./#/rangliste/${id}`);
  await page.reload();
  await expect(page.getByTestId('rank-img')).toHaveCount(2);
  await page.goto(`./#/duell/${id}`);
  await expect(page.locator('.duel-img:not([hidden])').first()).toBeVisible();
  await page.waitForTimeout(500);
  expect(calls.length).toBe(before);
  expect(errors).toEqual([]);
  await context.setOffline(false);
});

test('Grenze: höchstens maxImages Bilder im Cache (LRU), gelöschte Optionen werden aufgeräumt', async ({ page, context }) => {
  await mockWiki(context);
  await resetApp(page);
  const res = await page.evaluate(async () => {
    const m = await import('./js/images.js');
    await caches.delete(m.IMG_CACHE);
    localStorage.removeItem(m.META_KEY);
    const inst = m.createImages({ limits: { maxImages: 2, gapMs: 0 } });
    for (const t of ['Rom', 'Paris', 'Kreta', 'Bergen']) await inst.fetchTerm(t);
    const keys = async () => (await (await caches.open(m.IMG_CACHE)).keys()).map((r) => decodeURIComponent(r.url.split('/').pop() || ''));
    const afterFetch = await keys();
    await inst.prune(['Bergen']);
    return { afterFetch, afterPrune: await keys(), usage: inst.usage() };
  });
  expect(res.afterFetch.sort()).toEqual(['500px-Bergen.png', '500px-Kreta.png']);
  expect(res.afterPrune).toEqual(['500px-Bergen.png']);
  expect(res.usage.count).toBe(1);
});
