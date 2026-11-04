// Eigentümer: C – E2E Listen: anlegen per Einfügen, bearbeiten, Optionen umbenennen/löschen, Liste löschen, Reload.
import { test, expect } from 'playwright/test';
import { resetApp, createList } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await resetApp(page);
});

test('Liste per Einfügen anlegen mit Live-Zähler', async ({ page }) => {
  await page.getByTestId('home-new').click();
  await expect(page.getByTestId('app-title')).toHaveText('Neue Liste');
  await expect(page.getByText('Eine Option pro Zeile (Einfügen möglich)')).toBeVisible();
  await page.getByTestId('edit-name').fill('Restaurants');
  // Eingefügter Text mit Aufzählungszeichen, Leerzeilen und Duplikat
  await page.getByTestId('edit-options').fill('- Pizzeria Roma\n• Sushi Bar\n\n* Taverne\nsushi bar\n');
  await expect(page.getByTestId('edit-count')).toHaveText('3 Optionen erkannt');
  await page.getByTestId('edit-save').click();
  await page.waitForURL(/#\/liste\/[^/]+$/);
  await expect(page.getByTestId('app-title')).toHaveText('Restaurants');
  await expect(page.getByTestId('list-progress')).toContainText('3 Optionen');

  await page.getByTestId('app-back').click();
  await expect(page.locator('[data-testid^="home-list-"]', { hasText: 'Restaurants' })).toBeVisible();
});

test('Bearbeiten: hinzufügen, umbenennen, Duplikat, löschen, Reload, Liste löschen', async ({ page }) => {
  const id = await createList(page, 'Filme', ['Alien', 'Brazil', 'Casablanca']);
  await page.getByTestId('list-edit').click();
  await page.waitForURL(new RegExp(`#/liste/${id}/bearbeiten$`));
  await expect(page.getByTestId('app-title')).toHaveText('Liste bearbeiten');
  await expect(page.getByText('Optionen hinzufügen (eine pro Zeile)')).toBeVisible();
  await expect(page.locator('[data-testid^="edit-opt-o"]')).toHaveCount(3);

  // Hinzufügen: vorhandene Namen zählen nicht mit
  await page.getByTestId('edit-name').fill('Lieblingsfilme');
  await page.getByTestId('edit-options').fill('Dune\nalien\nEt');
  await expect(page.getByTestId('edit-count')).toHaveText('2 neue Optionen erkannt');
  await page.getByTestId('edit-save').click();
  await page.waitForURL(new RegExp(`#/liste/${id}$`));
  await expect(page.getByTestId('app-title')).toHaveText('Lieblingsfilme');
  await expect(page.getByTestId('list-progress')).toContainText('5 Optionen');

  // Umbenennen
  await page.getByTestId('list-edit').click();
  const rows = page.locator('li[data-testid^="edit-opt-"]');
  await expect(rows).toHaveCount(5);
  const byName = (/** @type {string} */ n) => rows.filter({ has: page.locator('.lists-opt-name', { hasText: new RegExp(`^${n}$`) }) });
  const etRow = byName('Et');
  const etId = (await etRow.getAttribute('data-testid'))?.replace('edit-opt-', '');
  expect(etId).toBeTruthy();
  await page.getByTestId(`edit-opt-rename-${etId}`).click();
  await expect(page.getByTestId('dialog-input')).toHaveValue('Et');
  await page.getByTestId('dialog-input').fill('E.T.');
  await page.getByTestId('dialog-ok').click();
  await expect(page.getByTestId(`edit-opt-${etId}`)).toContainText('E.T.');

  // Umbenennen auf vorhandenen Namen → abgelehnt
  await page.getByTestId(`edit-opt-rename-${etId}`).click();
  await page.getByTestId('dialog-input').fill('  brazil ');
  await page.getByTestId('dialog-ok').click();
  await expect(page.getByTestId('toast')).toContainText('Gibt es schon');
  await expect(page.getByTestId(`edit-opt-${etId}`)).toContainText('E.T.');

  // Abbrechen ändert nichts
  await page.getByTestId(`edit-opt-rename-${etId}`).click();
  await page.getByTestId('dialog-input').fill('Nichts');
  await page.getByTestId('dialog-cancel').click();
  await expect(page.getByTestId(`edit-opt-${etId}`)).toContainText('E.T.');

  // Löschen (ohne Duelle → ohne Rückfrage)
  const duneId = (await byName('Dune').getAttribute('data-testid'))?.replace('edit-opt-', '');
  await page.getByTestId(`edit-opt-remove-${duneId}`).click();
  await expect(page.getByTestId(`edit-opt-${duneId}`)).toHaveCount(0);
  await expect(rows).toHaveCount(4);

  // Reload behält die Daten
  await page.reload();
  await expect(page.getByTestId('app-title')).toHaveText('Liste bearbeiten');
  await expect(rows).toHaveCount(4);
  await expect(page.getByTestId('edit-name')).toHaveValue('Lieblingsfilme');
  await expect(page.getByTestId(`edit-opt-${etId}`)).toContainText('E.T.');
  await expect(page.locator('li[data-testid^="edit-opt-"]', { hasText: 'Dune' })).toHaveCount(0);

  // Liste löschen: Abbrechen, dann bestätigen
  await page.getByTestId('edit-delete-list').click();
  await page.getByTestId('dialog-cancel').click();
  await expect(page).toHaveURL(new RegExp(`#/liste/${id}/bearbeiten$`));
  await page.getByTestId('edit-delete-list').click();
  await page.getByTestId('dialog-ok').click();
  await page.waitForURL(/#\/$/);
  await expect(page.getByTestId('toast')).toContainText('Liste gelöscht');
  await expect(page.getByTestId(`home-list-${id}`)).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('home-new')).toBeVisible();
  await expect(page.getByTestId(`home-list-${id}`)).toHaveCount(0);

  // Gelöschte Liste direkt aufrufen → Hinweis und Startseite
  await page.goto(`./#/liste/${id}`);
  await expect(page.getByTestId('toast')).toContainText('Liste nicht gefunden');
  await page.waitForURL(/#\/$/);
});

test('Option mit Duellen löschen fragt nach; Reset setzt Wertungen zurück', async ({ page }) => {
  const id = await createList(page, 'Obst', ['Apfel', 'Birne', 'Kirsche']);
  await page.getByTestId('list-duel').click();
  await page.getByTestId('duel-a').click();
  await expect(page.getByTestId('duel-progress')).toHaveAttribute('data-duels', '1');
  await page.goto(`./#/liste/${id}/bearbeiten`);
  const played = page.locator('li[data-testid^="edit-opt-"]', { hasText: '1 Duell' }).first();
  const optId = (await played.getAttribute('data-testid'))?.replace('edit-opt-', '');
  await page.getByTestId(`edit-opt-remove-${optId}`).click();
  await expect(page.locator('dialog[open]')).toContainText('1 Duell');
  await page.getByTestId('dialog-cancel').click();
  await expect(page.getByTestId(`edit-opt-${optId}`)).toBeVisible();

  await page.getByTestId('edit-reset').click();
  await page.getByTestId('dialog-ok').click();
  await expect(page.getByTestId('toast')).toContainText('Wertungen zurückgesetzt');
  await expect(page.locator('li[data-testid^="edit-opt-"]', { hasText: '0 Duelle' })).toHaveCount(3);
});

test('Neue Liste ohne Namen wird nicht angelegt', async ({ page }) => {
  await page.getByTestId('home-new').click();
  await page.getByTestId('edit-options').fill('A\nB');
  await page.getByTestId('edit-save').click();
  await expect(page.getByTestId('toast')).toContainText('Namen');
  await expect(page).toHaveURL(/#\/neu$/);
});

test('Neue Liste mit weniger als zwei Optionen lässt sich nicht speichern (F10)', async ({ page }) => {
  await page.getByTestId('home-new').click();
  const save = page.getByTestId('edit-save');
  const count = page.getByTestId('edit-count');
  await page.getByTestId('edit-name').fill('Zu kurz');
  await expect(count).toHaveText('0 Optionen erkannt – Mindestens 2 Optionen nötig');
  await expect(save).toBeDisabled();
  await page.getByTestId('edit-options').fill('Nur eine\nnur eine');
  await expect(count).toHaveText('1 Option erkannt – Mindestens 2 Optionen nötig');
  await expect(save).toBeDisabled();
  // Enter im Namensfeld schickt das Formular ab → Meldung statt Speichern
  await page.getByTestId('edit-name').press('Enter');
  await expect(page.getByTestId('toast')).toContainText('Mindestens 2 Optionen nötig');
  await expect(page).toHaveURL(/#\/neu$/);
  await page.getByTestId('edit-options').fill('Nur eine\nZweite');
  await expect(count).toHaveText('2 Optionen erkannt');
  await expect(save).toBeEnabled();
  await save.click();
  await page.waitForURL(/#\/liste\/[^/]+$/);
  await expect(page.getByTestId('list-progress')).toContainText('2 Optionen');
});

test('Bearbeiten: Löschen unter zwei Optionen gesperrt, „Liste löschen“ geht', async ({ page }) => {
  const id = await createList(page, 'Paar', ['Links', 'Mitte', 'Rechts']);
  await page.goto(`./#/liste/${id}/bearbeiten`);
  const rows = page.locator('li[data-testid^="edit-opt-"]');
  const removeBtns = page.locator('[data-testid^="edit-opt-remove-"]');
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId('edit-opt-min')).toBeHidden();
  await removeBtns.first().click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId('edit-opt-min')).toBeVisible();
  await expect(page.getByTestId('edit-opt-min')).toContainText('Mindestens 2 Optionen nötig');
  await expect(removeBtns).toHaveCount(2);
  for (const b of await removeBtns.all()) await expect(b).toBeDisabled();
  // Reload: Sperre bleibt
  await page.reload();
  await expect(rows).toHaveCount(2);
  for (const b of await removeBtns.all()) await expect(b).toBeDisabled();
  // Neue Option hinzufügen hebt die Sperre auf
  await page.getByTestId('edit-options').fill('Oben');
  await page.getByTestId('edit-save').click();
  await page.waitForURL(new RegExp(`#/liste/${id}$`));
  await page.goto(`./#/liste/${id}/bearbeiten`);
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId('edit-opt-min')).toBeHidden();
  for (const b of await removeBtns.all()) await expect(b).toBeEnabled();
  // Ganze Liste löschen bleibt möglich
  await page.getByTestId('edit-delete-list').click();
  await page.getByTestId('dialog-ok').click();
  await page.waitForURL(/#\/$/);
  await expect(page.getByTestId(`home-list-${id}`)).toHaveCount(0);
});

test('Übersicht sortiert nach letzter Änderung (F5)', async ({ page }) => {
  const a = await createList(page, 'Erste', ['A', 'B']);
  const b = await createList(page, 'Zweite', ['C', 'D']);
  await page.goto('./#/');
  const cards = page.locator('[data-testid^="home-list-"]');
  await expect(cards.nth(0)).toHaveAttribute('data-testid', `home-list-${b}`);
  await expect(cards.nth(1)).toHaveAttribute('data-testid', `home-list-${a}`);
  // Duell in der älteren Liste → sie rückt nach oben
  await page.goto(`./#/duell/${a}`);
  await page.getByTestId('duel-a').click();
  await expect(page.getByTestId('duel-progress')).toHaveAttribute('data-duels', '1');
  await page.goto('./#/');
  await expect(cards.nth(0)).toHaveAttribute('data-testid', `home-list-${a}`);
  await expect(cards.nth(1)).toHaveAttribute('data-testid', `home-list-${b}`);
});
