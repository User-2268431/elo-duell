// Eigentümer: C – E2E Duell und Rangliste: 30 Duelle mit Rückgängig, Gleich gut, Überspringen, Rangliste prüfen.
import { test, expect } from 'playwright/test';
import { resetApp, createList, playDuels } from './helpers.mjs';

const OPTIONS = ['Lissabon', 'Kopenhagen', 'Rom', 'Bergen', 'Kreta'];
const PREF = ['Rom', 'Kreta', 'Lissabon', 'Bergen', 'Kopenhagen']; // Rom gefällt am besten

/** Elo wie js/logic/elo.js (K = 32), unabhängig nachgerechnet. */
function replay(/** @type {{a:string,b:string,s:number}[]} */ log) {
  /** @type {Record<string,{rating:number,duels:number}>} */
  const r = Object.fromEntries(OPTIONS.map((n) => [n, { rating: 1000, duels: 0 }]));
  for (const { a, b, s } of log) {
    const ea = 1 / (1 + 10 ** ((r[b].rating - r[a].rating) / 400));
    const eb = 1 / (1 + 10 ** ((r[a].rating - r[b].rating) / 400));
    r[a].rating += 32 * (s - ea);
    r[b].rating += 32 * ((1 - s) - eb);
    r[a].duels++; r[b].duels++;
  }
  return r;
}

/** de-DE-Zahl „1.016“ → 1016 */
const num = (/** @type {string} */ t) => Number(t.replace(/\./g, '').replace(/\s/g, '').replace('−', '-'));

test.beforeEach(async ({ page }) => {
  await resetApp(page);
});

test('30 Duelle mit Rückgängig, Gleich gut, Überspringen; Rangliste stimmt', async ({ page }) => {
  const id = await createList(page, 'Reiseziele', OPTIONS);
  await page.getByTestId('list-duel').click();
  await page.waitForURL(new RegExp(`#/duell/${id}$`));
  await expect(page.getByText('Was gefällt dir besser?')).toBeVisible();
  const progress = page.getByTestId('duel-progress');
  await expect(progress).toHaveAttribute('data-duels', '0');
  await expect(page.getByTestId('duel-undo')).toBeDisabled();

  // Zwei große Karten (je ≥ 35 % der Höhe), Buttons ≥ 56 px
  const vh = page.viewportSize()?.height ?? 0;
  for (const t of ['duel-a', 'duel-b']) {
    // offsetHeight statt boundingBox: unabhängig von der kurzen Einblend-Animation (scale)
    const height = await page.getByTestId(t).evaluate((el) => /** @type {HTMLElement} */ (el).offsetHeight);
    expect(height).toBeGreaterThanOrEqual(0.35 * vh - 1);
  }
  for (const t of ['duel-draw', 'duel-skip', 'duel-undo']) {
    const box = await page.getByTestId(t).boundingBox();
    expect(box && box.height).toBeGreaterThanOrEqual(56);
    expect(box && box.y + box.height).toBeLessThanOrEqual(vh + 1);
  }

  /** @type {{a:string,b:string,s:number}[]} */ const log = [];
  const choose = (/** @type {string} */ a, /** @type {string} */ b) => {
    const pick = PREF.indexOf(a) < PREF.indexOf(b) ? 'a' : 'b';
    log.push({ a, b, s: pick === 'a' ? 1 : 0 });
    return /** @type {'a'|'b'} */ (pick);
  };
  const names = async () => [
    (await page.getByTestId('duel-a').innerText()).trim(),
    (await page.getByTestId('duel-b').innerText()).trim(),
  ];

  await playDuels(page, 8, choose);
  await expect(page.getByTestId('duel-undo')).toBeEnabled();

  // Rückgängig: Toast nennt das Paar, das Paar erscheint erneut, M sinkt
  const [ua, ub] = await names();
  await page.getByTestId('duel-a').click();
  await expect(progress).toHaveAttribute('data-duels', '9');
  await page.getByTestId('duel-undo').click();
  await expect(progress).toHaveAttribute('data-duels', '8');
  await expect(page.getByTestId('toast')).toContainText(`Rückgängig: ${ua} – ${ub}`);
  expect(await names()).toEqual([ua, ub]);

  // Mehrfaches Rückgängig
  await page.getByTestId('duel-undo').click();
  await expect(progress).toHaveAttribute('data-duels', '7');
  const last = log[log.length - 1];
  await expect(page.getByTestId('toast')).toContainText(`Rückgängig: ${last.a} – ${last.b}`);
  expect(await names()).toEqual([last.a, last.b]);
  log.pop();

  // Gleich gut
  {
    const [a, b] = await names();
    await page.getByTestId('duel-draw').click();
    await expect(progress).toHaveAttribute('data-duels', '8');
    log.push({ a, b, s: 0.5 });
  }

  // Überspringen: kein Duell gezählt, anderes Paar
  {
    const before = (await names()).sort();
    await page.getByTestId('duel-skip').click();
    await expect(progress).toHaveAttribute('data-duels', '8');
    expect((await names()).sort()).not.toEqual(before);
  }

  await playDuels(page, 20, choose);
  {
    const [a, b] = await names();
    await page.getByTestId('duel-draw').click();
    log.push({ a, b, s: 0.5 });
  }
  await playDuels(page, 1, choose);
  await expect(progress).toHaveAttribute('data-duels', '30');
  expect(log.length).toBe(30);

  // Bei 5 Optionen ist die Rangliste nach 30 Duellen stabil → einmaliger Hinweis
  await expect(page.getByTestId('duel-stable')).toBeVisible();
  await page.getByTestId('duel-stable-continue').click();
  await expect(page.getByTestId('duel-stable')).toHaveCount(0);

  // Rangliste
  await page.goto(`./#/rangliste/${id}`);
  await expect(page.getByTestId('rank-hint')).toContainText('stabil');
  const expected = replay(log);
  const rows = page.locator('[data-testid^="rank-row-"]');
  await expect(rows).toHaveCount(OPTIONS.length);
  let sum = 0;
  let prev = Infinity;
  for (let i = 1; i <= OPTIONS.length; i++) {
    const row = page.getByTestId(`rank-row-${i}`);
    const name = (await row.getByTestId('rank-name').innerText()).trim();
    const rating = num(await row.getByTestId('rank-rating').innerText());
    const duels = num(await row.getByTestId('rank-duels').innerText());
    expect(OPTIONS).toContain(name);
    expect(rating).toBe(Math.round(expected[name].rating));
    expect(duels).toBe(expected[name].duels);
    expect(rating).toBeLessThanOrEqual(prev);
    prev = rating;
    sum += duels;
  }
  expect(sum).toBe(2 * 30);
  // Platz 1 = höchste nachgerechnete Wertung (bei Gleichstand reicht der Punktvergleich oben)
  const leader = (await page.getByTestId('rank-row-1').getByTestId('rank-name').innerText()).trim();
  expect(Math.round(expected[leader].rating)).toBe(Math.max(...Object.values(expected).map((v) => Math.round(v.rating))));
  await expect(page.getByTestId('rank-new')).toHaveCount(0);

  // Hinweis erscheint nicht noch einmal; Daten überleben Reload
  await page.reload();
  await expect(page.getByTestId('rank-row-1').getByTestId('rank-name')).toHaveText(leader);
  await page.goto(`./#/duell/${id}`);
  await playDuels(page, 1, choose);
  await expect(page.getByTestId('duel-stable')).toHaveCount(0);
});

test('Rangliste zeigt neue Optionen mit „neu“ am Ende', async ({ page }) => {
  const id = await createList(page, 'Sport', ['Fußball', 'Tennis', 'Schwimmen']);
  await page.goto(`./#/duell/${id}`);
  await playDuels(page, 1, () => 'a');
  await page.goto(`./#/rangliste/${id}`);
  await expect(page.getByTestId('rank-row-1').getByTestId('rank-rating')).toHaveText('1.016');
  await expect(page.getByTestId('rank-row-1').getByTestId('rank-duels')).toHaveText('1');
  await expect(page.getByTestId('rank-row-2').getByTestId('rank-rating')).toHaveText('984');
  await expect(page.getByTestId('rank-row-3').getByTestId('rank-new')).toHaveText('neu');
  await expect(page.getByTestId('rank-row-3').getByTestId('rank-duels')).toHaveText('0');
  await expect(page.getByTestId('rank-new')).toHaveCount(1);
});

test('Leerzustand bei weniger als zwei Optionen', async ({ page }) => {
  const id = await createList(page, 'Allein', ['Nur eine']);
  await page.getByTestId('list-duel').click();
  await expect(page.getByTestId('duel-empty')).toBeVisible();
  await expect(page.getByTestId('duel-a')).toHaveCount(0);
  await page.getByTestId('duel-empty-edit').click();
  await page.waitForURL(new RegExp(`#/liste/${id}/bearbeiten$`));
});
