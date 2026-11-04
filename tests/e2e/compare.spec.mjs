// Eigentümer: D – E2E Vergleich mit zwei Profilen: A teilt, B importiert und duelliert gegenläufig,
// Vergleich exakt gegen compareRankings, Hinweis bei zu wenigen Duellen, Rückweg B→A, Partner entfernen.
import { test, expect, devices } from 'playwright/test';
import { createList, playDuels, decodeQr } from './helpers.mjs';
import { compareRankings } from '../../js/logic/compare.js';

test.setTimeout(180_000);

const BASE = 'http://localhost:4173/elo-duell/';
const PIZZA = ['Margherita', 'Funghi', 'Diavola', 'Quattro Formaggi', 'Calzone', 'Hawaii', 'Tonno', 'Prosciutto'];
const DUELS = 20;

/** @param {import('playwright/test').Browser} browser */
async function phone(browser) {
  const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
  const context = await browser.newContext({ ...pixel, baseURL: BASE });
  const page = await context.newPage();
  await page.goto('./#/');
  return { context, page };
}

/** @param {import('playwright/test').Page} page @param {string} listId @param {string} name */
async function openShare(page, listId, name) {
  await page.goto(`./#/teilen/${listId}`);
  const input = page.getByTestId('dialog-input');
  await expect(input.or(page.getByTestId('share-url'))).toBeVisible();
  if (await input.isVisible()) {
    await input.fill(name);
    await page.getByTestId('dialog-ok').click();
  }
  await expect(page.getByTestId('share-url')).toHaveValue(/#i=1\.[zj]\./);
  const url = await page.getByTestId('share-url').inputValue();
  expect(await decodeQr(page)).toBe(url);
  return url;
}

/** Liest die angezeigte Rangliste. @param {import('playwright/test').Page} page @param {string} listId */
async function readRanking(page, listId) {
  await page.goto(`./#/rangliste/${listId}`);
  const rows = page.locator('[data-testid^="rank-row-"]');
  await expect(rows).toHaveCount(PIZZA.length);
  const out = [];
  for (const row of await rows.all()) {
    out.push({
      name: (await row.getByTestId('rank-name').innerText()).trim(),
      rating: Number((await row.getByTestId('rank-rating').innerText()).replace(/\./g, '').trim()),
      duels: Number((await row.getByTestId('rank-duels').innerText()).trim()),
    });
  }
  return out;
}

/** @param {import('playwright/test').Page} page */
const deviceId = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('elo-duell:state') || '{}').device?.id);

/**
 * Prüft die drei Abschnitte exakt gegen die Erwartung.
 * @param {import('playwright/test').Page} page @param {import('../../js/logic/compare.js').CompareResult} exp @param {string} who
 */
async function expectCompare(page, exp, who) {
  for (const key of /** @type {const} */ (['favorites', 'excluded', 'talk'])) {
    const items = page.locator(`[data-testid^="cmp-${key}-item-"]`);
    await expect(items).toHaveCount(exp[key].length);
    if (exp[key].length === 0) await expect(page.getByTestId(`cmp-empty-${key}`)).toBeVisible();
    for (let i = 0; i < exp[key].length; i++) {
      const it = exp[key][i];
      const el = page.getByTestId(`cmp-${key}-item-${i}`);
      await expect(el.locator('.cmp-name')).toHaveText(it.name);
      await expect(el).toContainText(`Platz ${it.rankA} bei dir · Platz ${it.rankB} bei ${who}`);
      if (key === 'talk') await expect(el.locator('.cmp-veto')).toHaveCount(it.veto ? 1 : 0);
    }
  }
}

test('Zwei Handys: teilen, importieren, gegenläufig duellieren, vergleichen, zurückschicken', async ({ browser }) => {
  const A = await phone(browser);
  const B = await phone(browser);
  try {
    // A: Liste anlegen, duellieren (vordere Pizza gewinnt), teilen
    const listId = await createList(A.page, 'Pizza-Abend', PIZZA);
    await A.page.getByTestId('list-duel').click();
    await playDuels(A.page, DUELS, (a, b) => (PIZZA.indexOf(a) < PIZZA.indexOf(b) ? 'a' : 'b'));
    const rankA = await readRanking(A.page, listId);
    const urlA = await openShare(A.page, listId, 'Anna');
    const idA = await deviceId(A.page);

    // B: Link öffnen, als neue Liste übernehmen → eigenes Level 'start' → Duell
    await B.page.goto(urlA);
    await expect(B.page.getByTestId('import-summary')).toHaveText('Rangliste von Anna: Pizza-Abend (8 Optionen)');
    await B.page.getByTestId('import-new').click();
    await expect(B.page).toHaveURL(new RegExp(`#/duell/${listId}$`));

    // Vergleich vor eigenen Duellen: Hinweis mit CTA
    await B.page.goto(`./#/liste/${listId}`);
    await B.page.getByTestId(`list-compare-${idA}`).click();
    await expect(B.page).toHaveURL(new RegExp(`#/vergleich/${listId}/${idA}$`));
    await expect(B.page.getByTestId('cmp-partner-date')).toContainText('Stand von Anna:');
    await expect(B.page.getByTestId('cmp-hint')).toContainText('Du hast noch kaum duelliert');
    await expect(B.page.getByTestId('cmp-share-back')).toHaveText('Meine Rangliste an Anna zurückschicken');
    await B.page.getByTestId('cmp-hint').getByRole('button', { name: 'Duelliere erst selbst' }).click();
    await expect(B.page).toHaveURL(new RegExp(`#/duell/${listId}$`));

    // B duelliert gegenläufig (hintere Pizza gewinnt)
    await playDuels(B.page, DUELS, (a, b) => (PIZZA.indexOf(a) > PIZZA.indexOf(b) ? 'a' : 'b'));
    const rankB = await readRanking(B.page, listId);

    // B vergleicht
    await B.page.goto(`./#/liste/${listId}`);
    await B.page.getByTestId(`list-compare-${idA}`).click();
    await expect(B.page.getByTestId('cmp-hint')).toHaveCount(0);
    const expB = compareRankings(rankB, rankA);
    expect(expB.common).toBe(8);
    expect(expB.excluded.length).toBeGreaterThan(0);
    expect(expB.talk.length).toBeGreaterThan(0);
    await expectCompare(B.page, expB, 'Anna');
    expect(await B.page.locator('#app').innerText()).not.toMatch(/\bnull\b|undefined/);
    await expect(B.page.getByTestId('cmp-only-mine')).toHaveCount(0);

    // Rückweg B → A
    await B.page.getByTestId('cmp-share-back').click();
    await expect(B.page).toHaveURL(new RegExp(`#/teilen/${listId}$`));
    const urlB = await openShare(B.page, listId, 'Ben');
    const idB = await deviceId(B.page);

    await A.page.goto(urlB);
    await expect(A.page.getByTestId('import-summary')).toHaveText('Rangliste von Ben: Pizza-Abend (8 Optionen)');
    await A.page.getByTestId('import-accept').click(); // gleiche Listen-ID → „Übernehmen“
    await expect(A.page).toHaveURL(new RegExp(`#/vergleich/${listId}/${idB}$`));
    await expect(A.page.getByTestId('cmp-share-back')).toHaveText('Meine Rangliste an Ben zurückschicken');
    const expA = compareRankings(rankA, rankB);
    await expectCompare(A.page, expA, 'Ben');
    // Favoriten und Ausschlüsse sind symmetrisch
    expect(expA.favorites.map((x) => x.name)).toEqual(expB.favorites.map((x) => x.name));
    expect(expA.excluded.map((x) => x.name).sort()).toEqual(expB.excluded.map((x) => x.name).sort());

    // Partner entfernen
    await A.page.getByTestId('cmp-remove-partner').click();
    await A.page.getByTestId('dialog-ok').click();
    await expect(A.page).toHaveURL(new RegExp(`#/liste/${listId}$`));
    await expect(A.page.getByTestId(`list-compare-${idB}`)).toHaveCount(0);
  } finally {
    await A.context.close();
    await B.context.close();
  }
});

test('Teilweise gemeinsame Optionen: „nur bei dir / nur bei …“ und zu wenig Gemeinsames', async ({ browser }) => {
  const B = await phone(browser);
  try {
    const listId = await createList(B.page, 'Kino', ['Alien', 'Brazil', 'Casablanca', 'Dune']);
    await B.page.getByTestId('list-duel').click();
    await playDuels(B.page, 8, (a, b) => (a < b ? 'a' : 'b'));
    // Fremde Rangliste direkt als Partner speichern (Datenweg wie nach einem Import)
    const share = {
      v: 1, l: listId, n: 'Kino', p: 'Anna', d: 'd_fremd00001', t: Math.floor(Date.now() / 1000),
      o: [['Dune', 1040, 1], ['brazil', 1010, 1], ['Eraserhead', 1000, 1], ['Alien', 960, 1]],
    };
    await B.page.goto(`./#i=1.j.${Buffer.from(JSON.stringify(share)).toString('base64url')}`);
    await expect(B.page.getByTestId('import-summary')).toHaveText('Rangliste von Anna: Kino (4 Optionen)');
    await expect(B.page.getByText('1 neue Option von Anna übernehmen')).toBeVisible();
    await B.page.getByTestId('import-accept').click();
    await expect(B.page).toHaveURL(/#\/vergleich\//);
    await B.page.getByText('Nur bei dir / nur bei Anna').click();
    await expect(B.page.getByTestId('cmp-only-mine')).toHaveText('Casablanca');
    await expect(B.page.getByTestId('cmp-only-theirs')).toHaveText('Eraserhead');
    await expect(B.page.getByTestId('cmp-favorites-item-0')).toContainText('von 3 gemeinsamen');
    await expect(B.page.getByTestId('cmp-hint')).toContainText('Anna hat noch kaum duelliert');

    // Nur eine gemeinsame Option
    const other = { ...share, d: 'd_fremd00002', p: 'Cem', o: [['Dune', 1000, 3], ['Zardoz', 1000, 3]] };
    await B.page.goto(`./#i=1.j.${Buffer.from(JSON.stringify(other)).toString('base64url')}`);
    await B.page.getByTestId('import-accept').click();
    await expect(B.page.getByTestId('cmp-too-few')).toHaveText('Zu wenig gemeinsame Optionen für einen Vergleich');
    await expect(B.page.locator('[data-testid^="cmp-favorites"]')).toHaveCount(0);
  } finally {
    await B.context.close();
  }
});
