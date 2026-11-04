// Eigentümer: B – Sicherung (docs/ARCHITEKTUR.md §4B, §10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportBackup, backupFileName, readBackupFile } from '../../js/data/backup.js';
import { defaultState, EXAMPLE_LIST_ID, SchemaError } from '../../js/data/schema.js';
import { createStore } from '../../js/data/store.js';

const blob = (text) => new Blob([text], { type: 'application/json' });

test('backupFileName: elo-duell-sicherung-JJJJ-MM-TT.json', () => {
  assert.equal(backupFileName(new Date(2026, 0, 5, 23, 59)), 'elo-duell-sicherung-2026-01-05.json');
  assert.equal(backupFileName(new Date(2026, 10, 24)), 'elo-duell-sicherung-2026-11-24.json');
  assert.match(backupFileName(), /^elo-duell-sicherung-\d{4}-\d{2}-\d{2}\.json$/);
});

test('exportBackup: Hülle und Inhalt', async () => {
  const s = defaultState();
  const b = exportBackup(s);
  assert.ok(b instanceof Blob);
  assert.equal(b.type, 'application/json');
  const doc = JSON.parse(await b.text());
  assert.equal(doc.app, 'elo-duell');
  assert.equal(doc.kind, 'backup');
  assert.equal(doc.schema, 1);
  assert.ok(!Number.isNaN(Date.parse(doc.exportedAt)));
  assert.deepEqual(doc.state, s);
});

test('Roundtrip über Store: exportieren, löschen, importieren; eigene device.id bleibt', async () => {
  const a = createStore({ storage: null });
  a.init();
  const l = a.createList('Essen mit Ümläüten 🍕', ['Pizza', 'Sushi', 'Döner']);
  const [p, s] = a.getList(l.id).options.map((o) => o.id);
  a.recordDuel(l.id, p, s, 1);
  a.savePartner(l.id, { deviceId: 'd_anna000001', name: 'Anna', receivedAt: 1, sentAt: 2, options: [{ name: 'Pizza', rating: 1010, duels: 2 }] });
  const file = exportBackup(a.getState());

  const b = createStore({ storage: null });
  b.init();
  const bId = b.getDevice().id;
  for (const x of b.listLists()) b.deleteList(x.id);
  const restored = await readBackupFile(file);
  b.replaceAll(restored);
  assert.equal(b.getDevice().id, bId);
  const got = b.getList(l.id);
  assert.deepEqual(got, a.getList(l.id));
  assert.deepEqual(b.getState().order, a.getState().order);
});

test('readBackupFile: Fehler auf Deutsch', async () => {
  await assert.rejects(readBackupFile(blob('{kein json')), (e) => e instanceof SchemaError && /kein JSON/.test(e.message));
  await assert.rejects(readBackupFile(blob('{"foo":1}')), /keine Elo-Duell-Sicherung/);
  await assert.rejects(readBackupFile(blob('[1,2]')), /keine Elo-Duell-Sicherung/);
  await assert.rejects(readBackupFile(blob(JSON.stringify({ app: 'elo-duell', kind: 'backup', schema: 2, state: {} }))), /neueren App-Version/);
  await assert.rejects(readBackupFile(blob(JSON.stringify({ app: 'elo-duell', kind: 'backup', schema: 1, state: { schema: 1, lists: 3 } }))), /beschädigt/);
  await assert.rejects(readBackupFile(null), /Keine Datei/);
});

test('readBackupFile: BOM und nackter State werden akzeptiert', async () => {
  const s = defaultState();
  const fromBom = await readBackupFile(blob('﻿' + JSON.stringify({ app: 'elo-duell', kind: 'backup', schema: 1, state: s })));
  assert.equal(fromBom.lists[EXAMPLE_LIST_ID].name, 'Urlaubsziele');
  const bare = await readBackupFile(blob(JSON.stringify(s)));
  assert.deepEqual(bare, s);
});
