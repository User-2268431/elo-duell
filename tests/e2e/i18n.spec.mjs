// Eigentümer: E – E2E Zweisprachigkeit: englisches Profil (en-US), Sprachumschaltung, deutsch ↔ englisch teilen.
import { test, expect, devices } from 'playwright/test';
import { createList, playDuels } from './helpers.mjs';

const BASE = 'http://localhost:4173/elo-duell/';
const PIZZA = ['Margherita', 'Funghi', 'Diavola', 'Calzone', 'Hawaii'];
/** Fester Geschmack: Reihenfolge in PIZZA (früher = besser). @param {string} a @param {string} b */
const prefer = (a, b) => (PIZZA.indexOf(a) <= PIZZA.indexOf(b) ? 'a' : 'b');
/** @param {string} a @param {string} b */
const preferReverse = (a, b) => (PIZZA.indexOf(a) >= PIZZA.indexOf(b) ? 'a' : 'b');

/** Neues „Handy“ mit Sprache. @param {import('playwright/test').Browser} browser @param {string} locale */
async function phone(browser, locale) {
  const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
  const context = await browser.newContext({ ...pixel, locale, baseURL: BASE });
  const page = await context.newPage();
  await page.goto('./#/');
  return { context, page };
}

/** @param {import('playwright/test').Page} page */
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('elo-duell:state') || '{}'));

/** Teilen öffnen, Namen eingeben, Link liefern. */
async function share(/** @type {import('playwright/test').Page} */ page, /** @type {string} */ id, /** @type {string} */ name, /** @type {RegExp} */ askTitle) {
  await page.goto(`./#/teilen/${id}`);
  await expect(page.locator('#dlg-title')).toHaveText(askTitle);
  await page.getByTestId('dialog-input').fill(name);
  await page.getByTestId('dialog-ok').click();
  await expect(page.getByTestId('share-url')).toHaveValue(/#i=1\.[zj]\./);
  return page.getByTestId('share-url').inputValue();
}

test('Englisch (en-US): Start, Liste, Duell, Rangliste, Teilen', async ({ browser }) => {
  const { context, page } = await phone(browser, 'en-US');
  try {
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const example = page.getByTestId('home-list-l_example01');
    await expect(example).toContainText('Holiday destinations');
    await expect(example).toContainText('8 options · 0 duels');
    await expect(page.getByTestId('home-new')).toHaveText('New list');
    await expect(page.getByTestId('home-scan')).toHaveText('Scan QR');
    expect(Object.keys((await state(page)).lists)).toEqual(['l_example01']);

    await page.getByTestId('home-new').click();
    await expect(page.getByTestId('app-title')).toHaveText('New list');
    await expect(page.getByTestId('edit-save')).toHaveText('Create list');
    const id = await createList(page, 'Pizza', PIZZA);
    await expect(page.getByTestId('list-duel')).toHaveText('Duel');
    await expect(page.getByTestId('list-progress')).toContainText('5 options');
    await expect(page.getByTestId('list-progress')).toContainText(/About \d+ more duels until the first ranking/);
    await expect(page.getByText('No ranking received yet')).toBeVisible();

    await page.getByTestId('list-duel').click();
    await expect(page.getByTestId('app-title')).toHaveText('Duel');
    await expect(page.getByText('Which do you prefer?')).toBeVisible();
    await expect(page.getByTestId('duel-draw')).toHaveText('Equally good');
    await expect(page.getByTestId('duel-skip')).toHaveText('Skip');
    await expect(page.getByTestId('duel-undo')).toHaveText('Undo');
    await playDuels(page, 3, prefer);
    await page.getByTestId('duel-undo').click();
    await expect(page.locator('#toast')).toContainText('Undone:');

    await page.goto(`./#/rangliste/${id}`);
    await expect(page.getByTestId('app-title')).toHaveText('Ranking');
    await expect(page.locator('.rank-head')).toContainText('Rank');
    await expect(page.locator('.rank-head')).toContainText('Points');
    await expect(page.getByTestId('rank-duel')).toHaveText('Keep dueling');

    await share(page, id, 'Ben', /What’s your name\?/);
    await expect(page.getByTestId('app-title')).toHaveText('Share');
    await expect(page.getByTestId('share-send')).toHaveText('Send link');
    await expect(page.getByTestId('share-copy')).toHaveText('Copy link');
    await expect(page.locator('.share-head')).toContainText('Your ranking · 5 options · 2 duels · as Ben');

    await page.goto('./#/einstellungen');
    await expect(page.getByTestId('app-title')).toHaveText('Settings');
    await expect(page.getByTestId('set-export')).toHaveText('Export backup');
  } finally {
    await context.close();
  }
});

test('Sprachumschaltung in den Einstellungen de ↔ en ohne Datenverlust', async ({ browser }) => {
  const { context, page } = await phone(browser, 'en-US');
  try {
    const id = await createList(page, 'Films', ['Alien', 'Heat', 'Up']);
    await page.goto(`./#/duell/${id}`);
    await playDuels(page, 2, () => 'a');
    const before = await state(page);

    await page.goto('./#/einstellungen');
    await expect(page.getByTestId('set-lang')).toHaveValue('auto');
    await page.getByTestId('set-lang').selectOption('de');
    await expect(page.getByTestId('app-title')).toHaveText('Einstellungen');
    await expect(page.getByTestId('set-export')).toHaveText('Sicherung exportieren');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByTestId('set-lang')).toHaveValue('de');

    const after = await state(page);
    expect(after.settings.lang).toBe('de');
    expect(after.lists).toEqual(before.lists);
    expect(after.device).toEqual(before.device);

    // Bleibt nach Neuladen Deutsch, obwohl das Handy Englisch ist.
    await page.goto(`./#/liste/${id}`);
    await page.reload();
    await expect(page.getByTestId('list-duel')).toHaveText('Duellieren');
    await expect(page.getByTestId('list-progress')).toContainText('3 Optionen');

    await page.goto('./#/einstellungen');
    await page.getByTestId('set-lang').selectOption('en');
    await expect(page.getByTestId('app-title')).toHaveText('Settings');
    await page.getByTestId('set-lang').selectOption('auto');
    await expect(page.getByTestId('app-title')).toHaveText('Settings');
    expect((await state(page)).lists).toEqual(before.lists);
  } finally {
    await context.close();
  }
});

test('Deutsches Profil teilt an englisches Profil und zurück; Vergleich in beiden Sprachen', async ({ browser }) => {
  const A = await phone(browser, 'de-DE');
  const B = await phone(browser, 'en-US');
  try {
    await expect(A.page.getByTestId('home-list-l_beispiel01')).toContainText('Urlaubsziele');
    const idA = await createList(A.page, 'Pizza', PIZZA);
    await A.page.goto(`./#/duell/${idA}`);
    await playDuels(A.page, 10, prefer);
    const urlA = await share(A.page, idA, 'Anna', /Wie heißt du\?/);

    await B.page.goto(urlA);
    await expect(B.page.getByTestId('import-summary')).toHaveText('Ranking from Anna: Pizza (5 options)');
    await expect(B.page.getByTestId('import-new')).toHaveText('Add as a new list');
    await B.page.getByTestId('import-new').click();
    await expect(B.page.locator('#toast')).toContainText('Ranking from Anna saved – now do your own duels');
    await B.page.waitForURL(/#\/duell\//);
    const idB = decodeURIComponent(/#\/duell\/([^/]+)$/.exec(B.page.url())?.[1] || '');
    await playDuels(B.page, 10, preferReverse);
    await B.page.goto(`./#/liste/${idB}`);
    await expect(B.page.getByText('Compare with Anna')).toBeVisible();
    await B.page.getByText('Compare with Anna').click();
    await expect(B.page.getByTestId('app-title')).toHaveText('Compare with Anna');
    await expect(B.page.getByTestId('cmp-favorites')).toContainText('Shared favourites');
    await expect(B.page.getByTestId('cmp-excluded')).toContainText('Clear no-gos');
    await expect(B.page.getByTestId('cmp-talk')).toContainText('Worth discussing');
    await expect(B.page.getByTestId('cmp-share-back')).toHaveText('Send my ranking back to Anna');

    const urlB = await share(B.page, idB, 'Ben', /What’s your name\?/);
    await A.page.goto(urlB);
    await expect(A.page.getByTestId('import-summary')).toHaveText('Rangliste von Ben: Pizza (5 Optionen)');
    await A.page.getByTestId('import-accept').click();
    await A.page.waitForURL(/#\/vergleich\//);
    await expect(A.page.getByTestId('app-title')).toHaveText('Vergleich mit Ben');
    await expect(A.page.getByTestId('cmp-favorites')).toContainText('Gemeinsame Favoriten');
    await expect(A.page.getByTestId('cmp-talk')).toContainText('Gesprächsstoff');
    // Daten sprachunabhängig: Optionsnamen unverändert, Partner gespeichert.
    const sA = await state(A.page);
    expect(sA.lists[idA].partners.map((/** @type {any} */ p) => p.name)).toEqual(['Ben']);
    expect(sA.lists[idA].partners[0].options.map((/** @type {any} */ o) => o.name).sort()).toEqual([...PIZZA].sort());
  } finally {
    await A.context.close();
    await B.context.close();
  }
});
