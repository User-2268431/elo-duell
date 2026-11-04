// Eigentümer: E – Rauchtest: alle Logik-/Daten-/Austausch-Module müssen in Node importierbar sein.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const MODULES = {
  '../../js/types.js': [],
  '../../js/version.js': ['VERSION'],
  '../../js/logic/elo.js': ['START_RATING', 'K', 'expected', 'applyResult', 'rankOptions'],
  '../../js/logic/text.js': ['normalizeName', 'parseOptionLines'],
  '../../js/logic/pairing.js': ['pickPair'],
  '../../js/logic/stability.js': ['thresholds', 'progress'],
  '../../js/logic/compare.js': ['compareRankings', 'excludedThreshold'],
  '../../js/data/store.js': ['STORAGE_KEY', 'createStore', 'store'],
  '../../js/data/schema.js': ['SCHEMA', 'SchemaError', 'defaultState', 'migrate', 'validateState'],
  '../../js/data/backup.js': ['exportBackup', 'backupFileName', 'downloadBackup', 'readBackupFile'],
  '../../js/share/codec.js': ['MAX_PAYLOAD', 'MAX_INFLATED', 'MAX_OPTIONS', 'MAX_NAME', 'ShareError',
    'encodeShare', 'decodeShare', 'buildShareUrl', 'extractPayload', 'toShareData', 'toPartnerRanking'],
  '../../js/share/qr.js': ['QR_MAX_URL', 'LINK_WARN_URL', 'renderQr'],
  '../../js/share/scanner.js': ['canScan', 'scanQr'],
};

for (const [path, names] of Object.entries(MODULES)) {
  test(`import ${path.replace('../../', '')}`, async () => {
    const mod = await import(path);
    for (const n of names) assert.ok(n in mod, `Export ${n} fehlt`);
  });
}

test('store-Methoden vorhanden', async () => {
  const { store } = await import('../../js/data/store.js');
  const methods = ['init', 'getState', 'getList', 'listLists', 'createList', 'renameList', 'deleteList', 'moveList',
    'addOptions', 'renameOption', 'removeOption', 'resetRatings', 'recordDuel', 'undoLastDuel', 'setStableShown',
    'setDeviceName', 'getDevice', 'savePartner', 'removePartner', 'findMatch', 'addAlias', 'replaceAll',
    'subscribe', 'status', 'onWarning'];
  for (const m of methods) assert.equal(typeof store[m], 'function', `store.${m} fehlt`);
});

test('vendor/jsQR.js per createRequire ladbar', () => {
  const require = createRequire(import.meta.url);
  assert.equal(typeof require('../../vendor/jsQR.js'), 'function');
});
