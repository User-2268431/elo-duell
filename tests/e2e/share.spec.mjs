// Eigentümer: D – E2E Teilen/Import: QR = Link, Link öffnen, Einfügefeld, eigene Rangliste, Optionen ergänzen, zu groß für QR.
import { test, expect, devices, chromium } from 'playwright/test';
import { existsSync, writeFileSync } from 'node:fs';
import qrcode from '../../vendor/qrcode-generator.mjs';
import { createList, playDuels, decodeQr } from './helpers.mjs';

const BASE = 'http://localhost:4173/elo-duell/';
const PIZZA = ['Margherita', 'Funghi', 'Diavola', 'Quattro Formaggi', 'Calzone', 'Hawaii', 'Tonno', 'Prosciutto'];

/** Neues „Handy“ = eigener Browser-Kontext (eigenes Profil, eigener Speicher). @param {import('playwright/test').Browser} browser */
async function phone(browser, /** @type {(() => void)|null} */ initScript = null) {
  const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
  const context = await browser.newContext({ ...pixel, baseURL: BASE });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:4173' });
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  await page.goto('./#/');
  return { context, page };
}

/** Öffnet „Teilen“, beantwortet ggf. die Namensfrage und liefert den Link. */
async function openShare(/** @type {import('playwright/test').Page} */ page, /** @type {string} */ listId, /** @type {string} */ name) {
  await page.goto(`./#/teilen/${listId}`);
  const input = page.getByTestId('dialog-input');
  await expect(input.or(page.getByTestId('share-url'))).toBeVisible();
  if (await input.isVisible()) {
    await input.fill(name);
    await page.getByTestId('dialog-ok').click();
  }
  await expect(page.getByTestId('share-url')).toHaveValue(/#i=1\.[zj]\./);
  return page.getByTestId('share-url').inputValue();
}

/** @param {import('playwright/test').Page} page */
const deviceId = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('elo-duell:state') || '{}').device?.id);

test('A teilt per QR und Link, B öffnet den Link; eigener Link wird abgewiesen', async ({ browser }) => {
  const A = await phone(browser);
  const B = await phone(browser);
  try {
    const listId = await createList(A.page, 'Pizza-Abend', PIZZA);
    await A.page.getByTestId('list-duel').click();
    await playDuels(A.page, 10, (a, b) => (PIZZA.indexOf(a) < PIZZA.indexOf(b) ? 'a' : 'b'));

    const url = await openShare(A.page, listId, 'Anna');
    expect(url.startsWith(`${BASE}#i=1.`)).toBe(true);
    await expect(A.page.getByTestId('share-too-big')).toHaveCount(0);
    expect(await decodeQr(A.page)).toBe(url);
    await expect(A.page.getByText('Auf dem anderen Handy: Elo-Duell → QR scannen, oder Link öffnen')).toBeVisible();

    // „Link kopieren“ → Zwischenablage
    await A.page.getByTestId('share-copy').click();
    await expect(A.page.getByTestId('toast')).toContainText('Link kopiert');
    expect(await A.page.evaluate(() => navigator.clipboard.readText())).toBe(url);

    // Eigener Link → abgewiesen
    await A.page.goto(url);
    await expect(A.page.getByTestId('import-error')).toHaveText('Das ist deine eigene Rangliste');
    await expect(A.page).toHaveURL(/#\/import$/);

    // B öffnet den Link (wie aus dem Messenger)
    await B.page.goto(url);
    await expect(B.page).toHaveURL(/#\/import$/);
    await expect(B.page.getByTestId('import-summary')).toHaveText('Rangliste von Anna: Pizza-Abend (8 Optionen)');
    await B.page.getByTestId('import-new').click();
    await expect(B.page.getByTestId('toast')).toContainText('Rangliste von Anna gespeichert – duelliere jetzt selbst');
    await expect(B.page).toHaveURL(new RegExp(`#/duell/${listId}$`)); // gleiche Listen-ID
    await B.page.goto(`./#/liste/${listId}`);
    await expect(B.page.getByTestId(`list-compare-${await deviceId(A.page)}`)).toBeVisible();
    // Reload auf #/import importiert nicht erneut
    expect(await B.page.evaluate(() => sessionStorage.getItem('elo-duell:import'))).toBeNull();
  } finally {
    await A.context.close();
    await B.context.close();
  }
});

test('„Link senden“ nutzt navigator.share, ohne share die Zwischenablage', async ({ browser }) => {
  const A = await phone(browser, () => {
    // @ts-ignore
    navigator.share = async (d) => { window.__shared = d; };
  });
  try {
    const listId = await createList(A.page, 'Pizza-Abend', PIZZA);
    const url = await openShare(A.page, listId, 'Anna');
    await A.page.getByTestId('share-send').click();
    await expect.poll(() => A.page.evaluate(() => /** @type {any} */ (window).__shared?.url)).toBe(url);
  } finally {
    await A.context.close();
  }
  const C = await phone(browser);
  try {
    const listId = await createList(C.page, 'Pizza-Abend', PIZZA);
    const url = await openShare(C.page, listId, 'Cem');
    expect(await C.page.evaluate(() => typeof navigator.share)).toBe('undefined');
    await C.page.getByTestId('share-send').click();
    await expect(C.page.getByTestId('toast')).toContainText('Link kopiert');
    expect(await C.page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  } finally {
    await C.context.close();
  }
});

test('Einfügefeld im Scanner; ungültiger Link; Teilen vor dem Duellieren; fehlende Optionen ergänzen', async ({ browser }) => {
  const A = await phone(browser);
  const B = await phone(browser);
  try {
    // Beide haben die Beispielliste (gleiche ID). A ergänzt eine Option und teilt vor dem Duellieren.
    await A.page.goto('./#/liste/l_beispiel01/bearbeiten');
    await A.page.getByTestId('edit-options').fill('Porto\nSevilla');
    await A.page.getByTestId('edit-save').click();
    await A.page.waitForURL(/#\/liste\/l_beispiel01$/);
    const url = await openShare(A.page, 'l_beispiel01', 'Anna');

    await B.page.getByTestId('home-scan').click();
    await expect(B.page).toHaveURL(/#\/scan$/);
    await expect(B.page.getByTestId('scan-video')).toHaveAttribute('playsinline', '');
    await B.page.getByTestId('scan-paste').fill('Hallo, das ist kein Link');
    await B.page.getByTestId('scan-paste-ok').click();
    await expect(B.page.getByTestId('scan-error')).toContainText('kein gültiger Elo-Duell-Link');

    await B.page.getByTestId('scan-paste').fill(`Hier meine Liste: ${url} – viel Spaß!`);
    await B.page.getByTestId('scan-paste-ok').click();
    await expect(B.page).toHaveURL(/#\/import$/);
    await expect(B.page.getByTestId('import-summary')).toHaveText('Liste von Anna: Urlaubsziele (10 Optionen)');
    await expect(B.page.getByTestId('import-add-options')).toBeVisible();
    await expect(B.page.getByText('2 neue Optionen von Anna übernehmen')).toBeVisible();
    await B.page.getByTestId('import-add-options').check();
    await B.page.getByTestId('import-accept').click();
    await expect(B.page.getByTestId('toast')).toContainText('Liste übernommen');
    await expect(B.page).toHaveURL(/#\/liste\/l_beispiel01$/);
    await expect(B.page.getByTestId('list-progress')).toContainText('10 Optionen');
    // ohne Duelle kein Partner
    await expect(B.page.locator('[data-testid^="list-compare-"]')).toHaveCount(0);
  } finally {
    await A.context.close();
    await B.context.close();
  }
});

test('Beschädigter Link zeigt Fehler; zu große Liste nur als Link', async ({ browser }) => {
  const A = await phone(browser);
  try {
    await A.page.goto('./#i=1.z.dasistkaputt');
    await expect(A.page).toHaveURL(/#\/import$/);
    await expect(A.page.getByTestId('import-error')).toContainText('beschädigt');

    await A.page.goto('./#i=9.z.abc');
    await expect(A.page.getByTestId('import-error')).toContainText('aktualisieren');

    // pseudozufällige Namen, damit deflate sie nicht wegkomprimiert
    let seed = 7;
    const word = () => Array.from({ length: 9 }, () => { seed = (seed * 48271) % 2147483647; return 'abcdefghijklmnopqrstuvwxyz'[seed % 26]; }).join('');
    const many = Array.from({ length: 90 }, () => `${word()} ${word()}`);
    const listId = await createList(A.page, 'Riesig', many);
    const url = await openShare(A.page, listId, 'Anna');
    expect(url.length).toBeGreaterThan(1000);
    await expect(A.page.getByTestId('share-too-big')).toHaveText('Liste zu groß für QR – bitte Link senden');
    await expect(A.page.getByTestId('share-qr')).toHaveCount(0);
    await expect(A.page.getByTestId('share-send')).toBeVisible();
  } finally {
    await A.context.close();
  }
});

/** Schreibt ein Y4M-Video (640×480, 20 Bilder) mit dem QR-Code von text – für die Fake-Kamera von Chromium. */
function writeQrVideo(/** @type {string} */ file, /** @type {string} */ text) {
  const qr = qrcode(0, 'L'); qr.addData(text, 'Byte'); qr.make();
  const n = qr.getModuleCount(), W = 640, H = 480, s = Math.floor(440 / (n + 8));
  const ox = Math.floor((W - (n + 8) * s) / 2), oy = Math.floor((H - (n + 8) * s) / 2);
  const Y = Buffer.alloc(W * H, 60);
  for (let y = 0; y < (n + 8) * s; y++) for (let x = 0; x < (n + 8) * s; x++) {
    const r = Math.floor(y / s) - 4, c = Math.floor(x / s) - 4;
    Y[(oy + y) * W + ox + x] = r >= 0 && c >= 0 && r < n && c < n && qr.isDark(r, c) ? 16 : 235;
  }
  const UV = Buffer.alloc(W * H / 2, 128);
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`)];
  for (let i = 0; i < 20; i++) parts.push(Buffer.from('FRAME\n'), Y, UV);
  writeFileSync(file, Buffer.concat(parts));
}

test('Kamera-Scan (Fake-Kamera, jsQR-Fallback) und Kamera stoppt beim Abbrechen', async ({}, testInfo) => {
  const share = { v: 1, l: 'l_kamera0001', n: 'Kameratest', p: 'Kim', d: 'd_kamera0001', t: 1762290000, o: [['Eins', 1016, 1], ['Zwei', 984, 1]] };
  const url = `${BASE}#i=1.j.${Buffer.from(JSON.stringify(share)).toString('base64url')}`;
  const video = testInfo.outputPath('qr.y4m');
  writeQrVideo(video, url);
  const exe = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch({
    ...(!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(exe) ? { executablePath: exe } : {}),
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
  });
  try {
    const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
    const context = await browser.newContext({ ...pixel, baseURL: BASE });
    await context.grantPermissions(['camera'], { origin: 'http://localhost:4173' });
    const page = await context.newPage();
    await page.goto('./#/scan');
    await expect(page).toHaveURL(/#\/import$/, { timeout: 15_000 });
    await expect(page.getByTestId('import-summary')).toHaveText('Rangliste von Kim: Kameratest (2 Optionen)');

    await page.goto('./#/scan');
    await page.waitForFunction(() => /** @type {HTMLVideoElement} */ (document.querySelector('[data-testid=scan-video]'))?.srcObject);
    await page.evaluate(() => { /** @type {any} */ (window).__s = /** @type {HTMLVideoElement} */ (document.querySelector('[data-testid=scan-video]')).srcObject; });
    await page.getByTestId('scan-cancel').click();
    await expect(page).toHaveURL(/#\/$/);
    expect(await page.evaluate(() => /** @type {any} */ (window).__s.getVideoTracks().map((/** @type {any} */ t) => t.readyState))).toEqual(['ended']);
  } finally {
    await browser.close();
  }
});
