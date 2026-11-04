// Eigentümer: B – Sicherung exportieren und importieren (docs/ARCHITEKTUR.md §7, §10).
import { test, expect } from 'playwright/test';
import { readFile } from 'node:fs/promises';
import { resetApp, createList } from './helpers.mjs';
import { VERSION } from '../../js/version.js';

const KEY = 'elo-duell:state';

/** @param {import('playwright/test').Page} page */
const readState = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);

test('Sicherung exportieren, Daten löschen, Sicherung importieren', async ({ page }) => {
  await resetApp(page);
  const listId = await createList(page, 'Pizzabeläge', ['Salami', 'Pilze', 'Ananas', 'Rucola']);

  // Name setzen und Einstellungen prüfen
  await page.goto('./#/einstellungen');
  await page.getByTestId('set-name').fill('Anna');
  await page.getByTestId('set-name').press('Enter');
  await expect(page.getByTestId('set-version')).toContainText(VERSION);
  await expect(page.getByTestId('set-storage')).toContainText('2 Listen');

  const before = await readState(page);
  expect(before.lists[listId].options.map((/** @type {any} */ o) => o.name)).toEqual(['Salami', 'Pilze', 'Ananas', 'Rucola']);
  expect(before.device.name).toBe('Anna');

  // Exportieren (Download abfangen)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('set-export').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^elo-duell-sicherung-\d{4}-\d{2}-\d{2}\.json$/);
  // Inhalt sofort als Buffer lesen (test-results/ kann von parallelen Läufen geleert werden).
  const buffer = await readFile(/** @type {string} */ (await download.path()));
  const file = { name: download.suggestedFilename(), mimeType: 'application/json', buffer };
  const doc = JSON.parse(buffer.toString('utf8'));
  expect(doc).toMatchObject({ app: 'elo-duell', kind: 'backup', schema: 1 });
  expect(doc.state.lists[listId].name).toBe('Pizzabeläge');

  // Daten löschen → neue Geräte-ID, nur Beispielliste
  await resetApp(page);
  await expect(page.getByTestId(`home-list-${listId}`)).toHaveCount(0);
  const fresh = await readState(page);
  expect(fresh.lists[listId]).toBeUndefined();
  expect(fresh.device.id).not.toBe(before.device.id);

  // Kaputte Datei wird abgewiesen, ohne etwas zu ändern
  const bad = { name: 'kaputt.json', mimeType: 'application/json', buffer: Buffer.from('{kein json') };
  await page.goto('./#/einstellungen');
  let chooser = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('set-import').click()]);
  await chooser[0].setFiles(bad);
  await expect(page.getByTestId('set-import-error')).toContainText('keine gültige Sicherung');
  expect((await readState(page)).lists[listId]).toBeUndefined();

  // Importieren (mit Bestätigung)
  chooser = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('set-import').click()]);
  await chooser[0].setFiles(file);
  await page.getByTestId('dialog-ok').click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId(`home-list-${listId}`)).toBeVisible();

  const after = await readState(page);
  expect(after.lists[listId]).toEqual(before.lists[listId]);
  expect(after.order).toEqual(before.order);
  expect(after.device.id).toBe(fresh.device.id);   // eigene Geräte-ID bleibt
  expect(after.device.name).toBe('Anna');          // Name aus der Sicherung, weil aktuell leer

  // Nach Neuladen weiterhin da
  await page.reload();
  await expect(page.getByTestId(`home-list-${listId}`)).toBeVisible();
});

test('Import abbrechen lässt die Daten unverändert', async ({ page }) => {
  await resetApp(page);
  const state = await readState(page);
  const other = JSON.parse(JSON.stringify(state));
  other.lists['l_beispiel01'].name = 'Geändert';
  const file = {
    name: 'sicherung.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'elo-duell', kind: 'backup', schema: 1, exportedAt: '2026-11-04T00:00:00Z', state: other })),
  };
  await page.goto('./#/einstellungen');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('set-import').click()]);
  await chooser.setFiles(file);
  await page.getByTestId('dialog-cancel').click();
  await expect(page).toHaveURL(/#\/einstellungen$/);
  expect((await readState(page)).lists['l_beispiel01'].name).toBe('Urlaubsziele');
});
