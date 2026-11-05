// Eigentümer: E – Dunkelmodus (docs/ARCHITEKTUR.md §8 CSS, §10 Weitere Szenarien):
// colorScheme 'dark' – Start, Liste, Duell, Rangliste, Teilen, Vergleich rendern ohne Fehler, Hintergrund dunkel, Screenshots.
import { test, expect, devices } from 'playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createList, makeJsonPayload, isWikiUrl } from './helpers.mjs';

const BASE = 'http://localhost:4173/elo-duell/';
// Screenshots bewusst außerhalb des Repos (überschreibbar per Umgebungsvariable)
const SHOTS = process.env.ELO_SHOTS_DIR || '/tmp/claude-0/-home-user/e8b7b540-9411-57c5-8db6-1e088b3bf01a/scratchpad/shots';
const ZIELE = ['Lissabon', 'Kopenhagen', 'Rom', 'Bergen', 'Kreta', 'Dubrovnik'];

/** Relative Luminanz (WCAG) einer CSS-Farbe rgb()/rgba(). @param {string} css */
function luminance(css) {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(css);
  if (!m) throw new Error(`Farbe nicht lesbar: ${css}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return { L: 0.2126 * r + 0.7152 * g + 0.0722 * b, alpha: m[4] === undefined ? 1 : Number(m[4]) };
}

test('Dunkelmodus: alle Hauptansichten rendern dunkel und ohne Fehler', async ({ browser }) => {
  mkdirSync(SHOTS, { recursive: true });
  const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
  const context = await browser.newContext({ ...pixel, locale: 'de-DE', baseURL: BASE, colorScheme: 'dark' });
  const page = await context.newPage();
  /** @type {string[]} */ const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  // Wikimedia ist in Tests gesperrt (playwright.config.mjs); deren Fehlschläge sind erwartet.
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isWikiUrl(msg.location()?.url || '')) errors.push(`console: ${msg.text()}`);
  });
  page.on('requestfailed', (r) => { if (!isWikiUrl(r.url())) errors.push(`requestfailed: ${r.url()}`); });

  /** Prüft Hintergrund und Textinhalt, speichert Screenshot. @param {string} name */
  async function check(name) {
    await page.waitForLoadState('load');
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(350); // Einblend-Animationen abklingen lassen
    expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const { L, alpha } = luminance(bg);
    expect(alpha, `${name}: body hat eine deckende Hintergrundfarbe (${bg})`).toBe(1);
    expect(L, `${name}: body-Hintergrund ${bg} dunkel`).toBeLessThan(0.2);
    // Text muss hell sein, sonst ist er auf dunklem Grund unlesbar
    const fg = await page.evaluate(() => getComputedStyle(document.body).color);
    expect(luminance(fg).L, `${name}: Schriftfarbe ${fg} hell`).toBeGreaterThan(0.5);
    const text = await page.locator('#app').innerText();
    expect(text.trim().length, `${name}: Inhalt vorhanden`).toBeGreaterThan(0);
    expect(text).not.toMatch(/\bnull\b|undefined|NaN|In Arbeit/);
    await page.screenshot({ path: path.join(SHOTS, `dark-${name}.png`), fullPage: true });
  }

  try {
    // Start
    await page.goto('./#/');
    await expect(page.getByTestId('home-new')).toBeVisible();
    await check('start');

    // Liste
    const listId = await createList(page, 'Reiseziele', ZIELE);
    await check('liste');

    // Duell (einige Duelle, dann Paar sichtbar; wartet nach jeder Entscheidung auf das neue Paar)
    await page.getByTestId('list-duel').click();
    await page.waitForURL(new RegExp(`#/duell/${listId}$`));
    const progress = page.getByTestId('duel-progress');
    for (let i = 0; i < 14; i++) {
      const before = Number(await progress.getAttribute('data-duels'));
      const pair = async () => `${await page.getByTestId('duel-a').innerText()}|${await page.getByTestId('duel-b').innerText()}`;
      const old = await pair();
      await expect(async () => {
        if (Number(await progress.getAttribute('data-duels')) === before + 1 && (await pair()) !== old) return;
        await page.getByTestId(i % 2 ? 'duel-a' : 'duel-b').click({ timeout: 2_000 });
        await expect(progress).toHaveAttribute('data-duels', String(before + 1), { timeout: 800 });
        await expect.poll(pair, { timeout: 800 }).not.toBe(old);
      }).toPass({ timeout: 15_000 });
    }
    await expect(page.getByTestId('duel-a')).toBeVisible();
    await check('duell');

    // Rangliste
    await page.goto(`./#/rangliste/${listId}`);
    await expect(page.locator('[data-testid^="rank-row-"]')).toHaveCount(ZIELE.length);
    await check('rangliste');

    // Teilen (Namensfrage beantworten)
    await page.goto(`./#/teilen/${listId}`);
    const input = page.getByTestId('dialog-input');
    await expect(input.or(page.getByTestId('share-url'))).toBeVisible();
    if (await input.isVisible()) {
      await check('teilen-dialog');
      await input.fill('Dana');
      await page.getByTestId('dialog-ok').click();
    }
    await expect(page.getByTestId('share-url')).toHaveValue(/#i=1\./);
    await check('teilen');

    // Vergleich: Partner-Rangliste für dieselbe Liste importieren (umgekehrte Reihenfolge)
    const payload = makeJsonPayload({
      v: 1, l: listId, n: 'Reiseziele', p: 'Anna', d: 'd_dunkel0001', t: Math.floor(Date.now() / 1000),
      o: ZIELE.map((n, i) => [n, 1080 - i * 30, 5]),
    });
    await page.goto(`./#i=${payload}`);
    await expect(page).toHaveURL(/#\/import$/);
    await expect(page.getByTestId('import-summary')).toContainText('Anna');
    await check('import');
    await page.getByTestId('import-accept').click();
    await expect(page).toHaveURL(new RegExp(`#/vergleich/${listId}/d_dunkel0001$`));
    await expect(page.getByTestId('cmp-favorites')).toBeVisible();
    await check('vergleich');

    expect(errors, 'keine Fehler in Konsole/Seite').toEqual([]);
  } finally {
    await context.close();
  }
});
