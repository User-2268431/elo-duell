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
