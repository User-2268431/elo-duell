// Eigentümer: E – Abnahme-Durchlauf des Auftraggebers (docs/ARCHITEKTUR.md §10, Prüfung M9).
// Zwei Handys (Pixel 7, zwei getrennte Browser-Kontexte = zwei Profile):
// A legt per Einfügen an, spielt genau 30 gewertete Duelle (mit Gleich gut, Überspringen, Rückgängig),
// prüft Rangliste und QR, teilt den Link. B importiert, duelliert gegenläufig, vergleicht (gegen compareRankings
// nachgerechnet), schickt zurück; A sieht den Vergleich. Zum Schluss A offline: Reload, App und Rangliste da.
// Jede Eingabe in der Duell-View wartet auf das neue Paar und wiederholt den Tipp nur, wenn er (z. B. wegen
// einer kurzen Eingabesperre nach jeder Entscheidung) nachweislich nicht angekommen ist.
import { test, expect, devices } from 'playwright/test';
import { decodeQr, waitForSw } from './helpers.mjs';
import { compareRankings, excludedThreshold } from '../../js/logic/compare.js';

test.setTimeout(240_000);

const BASE = 'http://localhost:4173/elo-duell/';
const LIST_NAME = 'Sommerurlaub';
// absichtlich nicht alphabetisch eingefügt
const ZIELE = ['Lissabon', 'Amsterdam', 'Kreta', 'Barcelona', 'Zürich', 'Edinburgh', 'Florenz', 'Rom', 'Helsinki', 'Dubrovnik'];
const DUELS = 30;
const collator = new Intl.Collator('de');

/** Neues „Handy“ = eigener Browser-Kontext. @param {import('playwright/test').Browser} browser */
async function phone(browser) {
  const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
  const context = await browser.newContext({ ...pixel, locale: 'de-DE', baseURL: BASE });
  const page = await context.newPage();
  /** @type {string[]} */ const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./#/');
  return { context, page, errors };
}

/** @param {import('playwright/test').Page} page @returns {Promise<[string,string]>} */
async function currentPair(page) {
  return [
    (await page.getByTestId('duel-a').innerText()).trim(),
    (await page.getByTestId('duel-b').innerText()).trim(),
  ];
}
const pairKey = (/** @type {string[]} */ p) => [...p].sort(collator.compare).join(' | ');
/** @param {import('playwright/test').Page} page */
const duelCount = async (page) => Number(await page.getByTestId('duel-progress').getAttribute('data-duels'));

/**
 * Tippt testId an, bis isDone() gilt. Vor jedem erneuten Tipp wird geprüft, ob der vorige schon gewirkt hat,
 * damit nie doppelt gewertet wird.
 * @param {import('playwright/test').Page} page @param {string} testId @param {() => Promise<boolean>} isDone
 */
async function tapUntil(page, testId, isDone) {
  await expect(async () => {
    if (await isDone()) return;
    await page.getByTestId(testId).click({ timeout: 2_000 });
    await expect.poll(isDone, { timeout: 800, intervals: [30, 60, 100] }).toBe(true);
  }).toPass({ timeout: 15_000, intervals: [50, 100, 250] });
}

/**
 * Eine Duell-Entscheidung über die UI; wartet auf M+1 und das neue Paar.
 * @param {import('playwright/test').Page} page @param {'a'|'b'|'draw'} pick
 * @returns {Promise<{a:string,b:string,s:number}>}
 */
async function decideOne(page, pick) {
  const before = await duelCount(page);
  const [a, b] = await currentPair(page);
  expect(a).not.toBe('');
  expect(b).not.toBe('');
  const key = pairKey([a, b]);
  await tapUntil(page, pick === 'a' ? 'duel-a' : pick === 'b' ? 'duel-b' : 'duel-draw',
    async () => (await duelCount(page)) === before + 1 && pairKey(await currentPair(page)) !== key);
  return { a, b, s: pick === 'a' ? 1 : pick === 'b' ? 0 : 0.5 };
}

/** Spielt Duelle bis M = target; choose bestimmt die Wahl. @returns {Promise<{a:string,b:string,s:number}[]>} */
async function duelUntil(/** @type {import('playwright/test').Page} */ page, /** @type {number} */ target,
  /** @type {(a:string,b:string)=>'a'|'b'} */ choose, /** @type {{a:string,b:string,s:number}[]} */ log = []) {
  while ((await duelCount(page)) < target) {
    const [a, b] = await currentPair(page);
    log.push(await decideOne(page, choose(a, b)));
  }
  expect(await duelCount(page)).toBe(target);
  return log;
}

/** Elo wie js/logic/elo.js (Start 1000, K = 32), unabhängig nachgerechnet. */
function replay(/** @type {{a:string,b:string,s:number}[]} */ log) {
  /** @type {Record<string,{rating:number,duels:number}>} */
  const r = Object.fromEntries(ZIELE.map((n) => [n, { rating: 1000, duels: 0 }]));
  for (const { a, b, s } of log) {
    const ea = 1 / (1 + 10 ** ((r[b].rating - r[a].rating) / 400));
    const eb = 1 / (1 + 10 ** ((r[a].rating - r[b].rating) / 400));
    r[a].rating += 32 * (s - ea);
    r[b].rating += 32 * ((1 - s) - eb);
    r[a].duels++; r[b].duels++;
  }
  return r;
}

/** Liest die angezeigte Rangliste und prüft Grundeigenschaften. @param {import('playwright/test').Page} page @param {string} listId */
async function readRanking(page, listId) {
  await page.goto(`./#/rangliste/${listId}`);
  const rows = page.locator('[data-testid^="rank-row-"]');
  await expect(rows).toHaveCount(ZIELE.length);
  /** @type {{place:number,name:string,rating:number,duels:number}[]} */ const out = [];
  for (const row of await rows.all()) {
    const place = Number((await row.getAttribute('data-testid'))?.replace('rank-row-', ''));
    const ratingText = (await row.getByTestId('rank-rating').innerText()).trim();
    expect(ratingText, 'Punkte ganzzahlig (de-DE, ohne Nachkommastellen)').toMatch(/^\d{1,3}(\.\d{3})*$/);
    const duelsText = (await row.getByTestId('rank-duels').innerText()).trim();
    expect(duelsText).toMatch(/^\d+$/);
    out.push({ place, name: (await row.getByTestId('rank-name').innerText()).trim(),
      rating: Number(ratingText.replace(/\./g, '')), duels: Number(duelsText) });
  }
  expect(out.map((r) => r.place)).toEqual(ZIELE.map((_, i) => i + 1));
  expect([...out.map((r) => r.name)].sort(collator.compare)).toEqual([...ZIELE].sort(collator.compare));
  for (let i = 1; i < out.length; i++) expect(out[i - 1].rating).toBeGreaterThanOrEqual(out[i].rating);
  return out;
}

/** Prüft die Rangliste gegen das Duell-Protokoll. */
function checkRanking(/** @type {Awaited<ReturnType<typeof readRanking>>} */ rank, /** @type {{a:string,b:string,s:number}[]} */ log) {
  const sumDuels = rank.reduce((s, r) => s + r.duels, 0);
  expect(sumDuels, 'Summe der Duelle = 2 × 30').toBe(2 * DUELS);
  const sumRating = rank.reduce((s, r) => s + r.rating, 0);
  expect(Math.abs(sumRating - 1000 * ZIELE.length), `Summe der Punkte ${sumRating} ≈ 10.000`).toBeLessThanOrEqual(ZIELE.length / 2);
  const exp = replay(log);
  for (const r of rank) {
    expect(r.duels, `Duelle von ${r.name}`).toBe(exp[r.name].duels);
    expect(r.rating, `Punkte von ${r.name}`).toBe(Math.round(exp[r.name].rating));
  }
}

/** Öffnet „Teilen“, beantwortet ggf. die Namensfrage, prüft QR = Link. @returns {Promise<string>} */
async function openShare(/** @type {import('playwright/test').Page} */ page, /** @type {string} */ listId, /** @type {string} */ name) {
  await page.goto(`./#/teilen/${listId}`);
  const input = page.getByTestId('dialog-input');
  await expect(input.or(page.getByTestId('share-url'))).toBeVisible();
  if (await input.isVisible()) {
    await input.fill(name);
    await page.getByTestId('dialog-ok').click();
  }
  await expect(page.getByTestId('share-url')).toHaveValue(/#i=1\.[zj]\./);
  const url = await page.getByTestId('share-url').inputValue();
  expect(url.startsWith(`${BASE}#i=1.`)).toBe(true);
  await expect(page.getByTestId('share-too-big')).toHaveCount(0);
  await expect(page.getByTestId('share-qr').locator('canvas')).toHaveCount(1);
  expect(await decodeQr(page), 'QR-Inhalt = share-url').toBe(url);
  return url;
}

/** @param {import('playwright/test').Page} page */
const deviceId = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('elo-duell:state') || '{}').device?.id);

/** Wettkampf-Ränge (1, 2, 2, 4) auf gerundeten Wertungen, unabhängig von compare.js. */
function compRanks(/** @type {{name:string,rating:number}[]} */ rank) {
  return new Map(rank.map((r) => [r.name, 1 + rank.filter((x) => x.rating > r.rating).length]));
}

/**
 * Prüft die angezeigten Abschnitte exakt gegen compareRankings und zusätzlich die Regeln unabhängig.
 * @param {import('playwright/test').Page} page
 * @param {Awaited<ReturnType<typeof readRanking>>} mine @param {Awaited<ReturnType<typeof readRanking>>} theirs
 * @param {string} who
 */
async function checkCompare(page, mine, theirs, who) {
  const exp = compareRankings(mine, theirs);
  expect(exp.common).toBe(ZIELE.length);
  await expect(page.getByTestId('cmp-hint')).toHaveCount(0);
  await expect(page.getByTestId('cmp-share-back')).toHaveText(`Meine Rangliste an ${who} zurückschicken`);

  /** @type {Record<string, {name:string, rankA:number, rankB:number}[]>} */ const shown = {};
  for (const key of /** @type {const} */ (['favorites', 'excluded', 'talk'])) {
    const items = page.locator(`[data-testid^="cmp-${key}-item-"]`);
    await expect(items).toHaveCount(exp[key].length);
    if (exp[key].length === 0) await expect(page.getByTestId(`cmp-empty-${key}`)).toBeVisible();
    shown[key] = [];
    for (let i = 0; i < exp[key].length; i++) {
      const it = exp[key][i];
      const el = page.getByTestId(`cmp-${key}-item-${i}`);
      await expect(el.locator('.cmp-name')).toHaveText(it.name);
      await expect(el).toContainText(`Platz ${it.rankA} bei dir · Platz ${it.rankB} bei ${who}`);
      if (key === 'talk') await expect(el.locator('.cmp-veto')).toHaveCount(it.veto ? 1 : 0);
      const txt = await el.innerText();
      const m = /Platz (\d+) bei dir · Platz (\d+) bei /.exec(txt);
      expect(m).not.toBeNull();
      shown[key].push({ name: (await el.locator('.cmp-name').innerText()).trim(), rankA: Number(m?.[1]), rankB: Number(m?.[2]) });
    }
  }

  // Unabhängige Regelprüfung auf Basis der angezeigten Ranglisten
  const m = ZIELE.length, t = Math.max(1, Math.floor(m / 5));
  expect(excludedThreshold(m)).toBe(t);
  const rA = compRanks(mine), rB = compRanks(theirs);
  const ratA = new Map(mine.map((r) => [r.name, r.rating])), ratB = new Map(theirs.map((r) => [r.name, r.rating]));
  for (const key of Object.keys(shown)) {
    for (const it of shown[key]) {
      expect(it.rankA, `${key}: Platz bei dir für ${it.name}`).toBe(rA.get(it.name));
      expect(it.rankB, `${key}: Platz bei ${who} für ${it.name}`).toBe(rB.get(it.name));
    }
  }
  // favorites: nach der niedrigeren der beiden Wertungen absteigend, disjunkt zu excluded, höchstens min(5, ⌈m/3⌉)
  const minRat = (/** @type {string} */ n) => Math.min(/** @type {number} */ (ratA.get(n)), /** @type {number} */ (ratB.get(n)));
  expect(shown.favorites.length).toBeLessThanOrEqual(Math.min(5, Math.ceil(m / 3)));
  for (let i = 1; i < shown.favorites.length; i++) {
    expect(minRat(shown.favorites[i - 1].name), 'favorites nach min(Wertung) absteigend').toBeGreaterThanOrEqual(minRat(shown.favorites[i].name));
  }
  const exNames = new Set(shown.excluded.map((x) => x.name));
  for (const f of shown.favorites) expect(exNames.has(f.name), `${f.name} nicht zugleich Favorit und Ausschluss`).toBe(false);
  // excluded: genau die Optionen, die bei mindestens einer Person auf den letzten t Plätzen liegen (Wettkampf-Rang > m − t)
  const expectedEx = ZIELE.filter((n) => /** @type {number} */ (rA.get(n)) > m - t || /** @type {number} */ (rB.get(n)) > m - t);
  expect([...exNames].sort(collator.compare)).toEqual(expectedEx.sort(collator.compare));
  for (const x of shown.excluded) expect(x.rankA > m - t || x.rankB > m - t).toBe(true);
  // talk: Platzdifferenz ≥ 2, absteigend sortiert
  const diffs = shown.talk.map((x) => Math.abs(x.rankA - x.rankB));
  for (const d of diffs) expect(d).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < diffs.length; i++) expect(diffs[i - 1], 'talk nach Platzdifferenz absteigend').toBeGreaterThanOrEqual(diffs[i]);
  expect(await page.locator('#app').innerText()).not.toMatch(/\bnull\b|undefined|NaN/);
  return exp;
}

test('Abnahme M9: zwei Handys – anlegen, 30 Duelle, Rangliste, QR/Link, Import, Gegenläufig, Vergleich, Rückweg, offline', async ({ browser }) => {
  const A = await phone(browser);
  const B = await phone(browser);
  try {
    // ---------- Profil A: Service Worker bereit (für den Offline-Schluss) ----------
    await waitForSw(A.page);

    // ---------- A: Liste per Einfügen anlegen ----------
    await A.page.goto('./#/');
    await A.page.getByTestId('home-new').click();
    await A.page.getByTestId('edit-name').fill(LIST_NAME);
    await A.page.getByTestId('edit-options').fill(ZIELE.join('\n') + '\n');
    await expect(A.page.getByTestId('edit-count')).toContainText('10');
    await A.page.getByTestId('edit-save').click();
    await A.page.waitForURL(/#\/liste\/[^/]+$/);
    const listId = decodeURIComponent(/** @type {RegExpExecArray} */ (/#\/liste\/([^/]+)$/.exec(A.page.url()))[1]);
    await expect(A.page.getByTestId('list-progress')).toContainText('10 Optionen');

    // ---------- A: genau 30 gewertete Duelle (alphabetisch frühere gewinnt) ----------
    await A.page.getByTestId('list-duel').click();
    await A.page.waitForURL(new RegExp(`#/duell/${listId}$`));
    await expect(A.page.getByTestId('duel-progress')).toHaveAttribute('data-duels', '0');
    await expect(A.page.getByTestId('duel-undo')).toBeDisabled();
    const prefA = (/** @type {string} */ a, /** @type {string} */ b) => /** @type {'a'|'b'} */ (collator.compare(a, b) < 0 ? 'a' : 'b');
    /** @type {{a:string,b:string,s:number}[]} */ const logA = [];

    await duelUntil(A.page, 3, prefA, logA);
    // 1× „Gleich gut“ (zählt)
    logA.push(await decideOne(A.page, 'draw'));
    expect(await duelCount(A.page)).toBe(4);
    await duelUntil(A.page, 6, prefA, logA);
    // 1× „Überspringen“ (zählt nicht, neues Paar)
    {
      const before = await duelCount(A.page);
      const key = pairKey(await currentPair(A.page));
      await tapUntil(A.page, 'duel-skip', async () => pairKey(await currentPair(A.page)) !== key);
      expect(await duelCount(A.page)).toBe(before);
    }
    await duelUntil(A.page, 9, prefA, logA);
    // 1× „Rückgängig“: letztes Duell zurück, dasselbe Paar wird erneut gezeigt
    {
      const last = /** @type {{a:string,b:string,s:number}} */ (logA.pop());
      await expect(A.page.getByTestId('duel-undo')).toBeEnabled();
      await tapUntil(A.page, 'duel-undo',
        async () => (await duelCount(A.page)) === 8 && pairKey(await currentPair(A.page)) === pairKey([last.a, last.b]));
      await expect(A.page.getByTestId('toast')).toContainText(`Rückgängig: ${last.a} – ${last.b}`);
      // Das zurückgenommene Duell jetzt andersherum entscheiden (sonst würde die Rücknahme nichts zeigen)
      const [a] = await currentPair(A.page);
      const flip = last.s === 1 ? (a === last.a ? 'b' : 'a') : (a === last.a ? 'a' : 'b');
      logA.push(await decideOne(A.page, flip));
    }
    await duelUntil(A.page, DUELS, prefA, logA);
    expect(logA.length).toBe(DUELS);
    expect(logA.filter((d) => d.s === 0.5).length).toBeGreaterThanOrEqual(1);

    // ---------- A: Rangliste prüfen ----------
    const rankA = await readRanking(A.page, listId);
    checkRanking(rankA, logA);
    await expect(A.page.getByTestId('rank-hint')).toBeVisible();

    // ---------- A: Teilen, QR dekodieren, Link verwenden ----------
    const urlA = await openShare(A.page, listId, 'Anna');
    const idA = await deviceId(A.page);

    // ---------- Profil B: Link öffnen → Import → als neue Liste ----------
    await B.page.goto(urlA);
    await expect(B.page).toHaveURL(/#\/import$/);
    await expect(B.page.getByTestId('import-summary')).toHaveText(`Rangliste von Anna: ${LIST_NAME} (10 Optionen)`);
    await expect(B.page.getByTestId('import-new')).toHaveText(/Als neue Liste übernehmen/);
    await B.page.getByTestId('import-new').click();
    await expect(B.page.getByTestId('toast')).toContainText('Rangliste von Anna gespeichert – duelliere jetzt selbst');
    await expect(B.page).toHaveURL(new RegExp(`#/duell/${listId}$`));
    await expect(B.page.getByTestId('duel-progress')).toHaveAttribute('data-duels', '0');

    // ---------- B: 30 Duelle gegenläufig (alphabetisch spätere gewinnt) ----------
    const prefB = (/** @type {string} */ a, /** @type {string} */ b) => /** @type {'a'|'b'} */ (collator.compare(a, b) > 0 ? 'a' : 'b');
    const logB = await duelUntil(B.page, DUELS, prefB);
    const rankB = await readRanking(B.page, listId);
    checkRanking(rankB, logB);
    // gegenläufig: Spitze von A liegt bei B in der unteren Hälfte und umgekehrt
    expect(rankB.findIndex((r) => r.name === rankA[0].name)).toBeGreaterThanOrEqual(5);
    expect(rankA.findIndex((r) => r.name === rankB[0].name)).toBeGreaterThanOrEqual(5);

    // ---------- B: Vergleich öffnen und prüfen ----------
    await B.page.goto(`./#/liste/${listId}`);
    await B.page.getByTestId(`list-compare-${idA}`).click();
    await expect(B.page).toHaveURL(new RegExp(`#/vergleich/${listId}/${idA}$`));
    await expect(B.page.getByTestId('cmp-partner-date')).toContainText('Stand von Anna:');
    const expB = await checkCompare(B.page, rankB, rankA, 'Anna');
    expect(expB.excluded.length).toBeGreaterThan(0);
    expect(expB.talk.length).toBeGreaterThan(0);

    // ---------- Rückweg B → A ----------
    await B.page.getByTestId('cmp-share-back').click();
    await expect(B.page).toHaveURL(new RegExp(`#/teilen/${listId}$`));
    const urlB = await openShare(B.page, listId, 'Ben');
    const idB = await deviceId(B.page);
    expect(idB).not.toBe(idA);

    await A.page.goto(urlB);
    await expect(A.page).toHaveURL(/#\/import$/);
    await expect(A.page.getByTestId('import-summary')).toHaveText(`Rangliste von Ben: ${LIST_NAME} (10 Optionen)`);
    await A.page.getByTestId('import-accept').click(); // gleiche Listen-ID → „Übernehmen“
    await expect(A.page).toHaveURL(new RegExp(`#/vergleich/${listId}/${idB}$`));
    await expect(A.page.getByTestId('cmp-partner-date')).toContainText('Stand von Ben:');
    const expA = await checkCompare(A.page, rankA, rankB, 'Ben');
    // Favoriten und Ausschlüsse sind symmetrisch
    expect(expA.favorites.map((x) => x.name)).toEqual(expB.favorites.map((x) => x.name));
    expect(expA.excluded.map((x) => x.name).sort()).toEqual(expB.excluded.map((x) => x.name).sort());

    // ---------- A offline: neu laden, App und Rangliste da ----------
    await A.context.setOffline(true);
    expect(await A.page.evaluate(() => navigator.onLine)).toBe(false);
    const resp = await A.page.reload();
    expect(resp?.status()).toBe(200);
    await expect(A.page).toHaveTitle(/Elo-Duell/);
    await A.page.goto('./#/');
    await expect(A.page.getByTestId(`home-list-${listId}`)).toBeVisible();
    expect(await readRanking(A.page, listId)).toEqual(rankA);
    await A.page.goto(`./#/liste/${listId}`);
    await expect(A.page.getByTestId(`list-compare-${idB}`)).toBeVisible();

    expect(A.errors, 'keine Laufzeitfehler in A').toEqual([]);
    expect(B.errors, 'keine Laufzeitfehler in B').toEqual([]);
  } finally {
    await A.context.close();
    await B.context.close();
  }
});
