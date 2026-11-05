// Eigentümer: B – Store-Tests mit Fake-Storage (docs/ARCHITEKTUR.md §4B, §10).
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, STORAGE_KEY, BROKEN_KEY, BROKEN_PREFIX, MAX_BROKEN } from '../../js/data/store.js';
import { defaultState, EXAMPLE_LIST_ID, validateState } from '../../js/data/schema.js';

class FakeStorage {
  constructor(init = {}) { this.map = new Map(Object.entries(init)); this.quota = false; this.security = false; this.writes = 0; }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { if (this.security) throw Object.assign(new Error('denied'), { name: 'SecurityError' }); return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) {
    if (this.security) throw Object.assign(new Error('denied'), { name: 'SecurityError' });
    if (this.quota) throw Object.assign(new Error('voll'), { name: 'QuotaExceededError', code: 22 });
    this.writes++;
    this.map.set(k, String(v));
  }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

/** Fake-Uhr */
function clock(start = 1_000_000) { let t = start; return () => ++t; }

function mk(init) {
  const storage = new FakeStorage(init);
  const store = createStore({ storage, now: clock() });
  const res = store.init();
  return { storage, store, res };
}

const saved = (storage) => JSON.parse(storage.getItem(STORAGE_KEY));

describe('init', () => {
  test('leerer Storage → Beispielliste, Geräte-ID wird sofort gespeichert', () => {
    const { store, storage, res } = mk();
    assert.deepEqual(res, { mode: 'local', warning: null });
    const lists = store.listLists();
    assert.equal(lists.length, 1);
    assert.equal(lists[0].id, EXAMPLE_LIST_ID);
    assert.equal(lists[0].name, 'Urlaubsziele');
    assert.deepEqual(lists[0].options.map((o) => o.name),
      ['Lissabon', 'Kopenhagen', 'Rom', 'Bergen', 'Dolomiten', 'Kreta', 'Edinburgh', 'Ostsee']);
    assert.match(store.getDevice().id, /^d_[a-z0-9]{10}$/);
    assert.equal(saved(storage).device.id, store.getDevice().id);
  });

  test('vorhandener State wird geladen, keine Beispielliste bei leeren Listen', () => {
    const s = defaultState();
    s.lists = {}; s.order = [];
    const { store, storage } = mk({ [STORAGE_KEY]: JSON.stringify(s) });
    assert.equal(store.listLists().length, 0);
    assert.equal(store.getDevice().id, s.device.id);
    assert.equal(storage.writes, 0, 'unveränderter State wird nicht neu geschrieben');
  });

  test('Storage null → memory mit Warnung, App funktioniert', () => {
    const store = createStore({ storage: null });
    const res = store.init();
    assert.equal(res.mode, 'memory');
    assert.ok(res.warning);
    const l = store.createList('Test', ['a', 'b']);
    assert.equal(store.getList(l.id).options.length, 2);
    assert.equal(store.status().mode, 'memory');
  });

  test('SecurityError beim Lesen → memory', () => {
    const storage = new FakeStorage();
    storage.security = true;
    const store = createStore({ storage });
    const res = store.init();
    assert.equal(res.mode, 'memory');
    assert.ok(res.warning);
    store.createList('x', ['a']);   // wirft nicht
  });

  test('defektes JSON → elo-duell:defekt, Default-State, Warnung', () => {
    const { store, storage, res } = mk({ [STORAGE_KEY]: '{kaputt' });
    assert.equal(res.mode, 'local');
    assert.ok(res.warning && /beschädigt/.test(res.warning));
    assert.equal(storage.getItem(BROKEN_KEY), '{kaputt');
    assert.equal(store.listLists()[0].id, EXAMPLE_LIST_ID);
    assert.equal(validateState(saved(storage)).length, 0);
  });

  test('unbrauchbarer State (Schema-Fehler) wird beiseitegelegt, ohne einen älteren Defekt zu überschreiben (H1)', () => {
    const bad = JSON.stringify({ schema: 1, lists: 5 });
    const { storage, store, res } = mk({ [STORAGE_KEY]: bad, [BROKEN_KEY]: 'alt' });
    assert.equal(storage.getItem(BROKEN_KEY), 'alt');
    const extra = [...storage.map.keys()].filter((k) => k.startsWith(BROKEN_PREFIX));
    assert.equal(extra.length, 1);
    assert.equal(storage.getItem(extra[0]), bad);
    assert.match(res.warning, /Einstellungen herunterladen/);
    assert.deepEqual(store.listBroken().map((e) => e.key), [BROKEN_KEY, extra[0]]);
    assert.equal(store.getBroken(extra[0]), bad);
    assert.equal(store.getBroken(STORAGE_KEY), null, 'nur Defekt-Ablagen lesbar');
  });

  test('höchstens drei Defekt-Ablagen; die älteste bleibt, gleicher Inhalt wird nicht doppelt abgelegt', () => {
    const storage = new FakeStorage();
    let t = 5000;
    const boot = (raw) => {
      storage.setItem(STORAGE_KEY, raw);
      const s = createStore({ storage, now: () => (t += 10) });
      s.init();
      return s;
    };
    boot('{eins'); boot('{zwei'); boot('{drei'); boot('{drei');
    let s = boot('{vier');
    const contents = s.listBroken().map((e) => s.getBroken(e.key));
    assert.equal(contents.length, MAX_BROKEN);
    assert.equal(contents[0], '{eins', 'älteste bleibt');
    assert.ok(contents.includes('{zwei'));
    assert.equal(contents[2], '{vier', 'jüngste ersetzt');
  });

  test('ein ungültiger Partner (sentAt null, K1) verwirft nicht alles: reparieren, warnen, Original sichern', () => {
    const st = defaultState(1);
    st.device = { id: 'd_meins00001', name: 'Anna' };
    st.lists.l_zweite0001 = { ...structuredClone(st.lists[EXAMPLE_LIST_ID]), id: 'l_zweite0001', name: 'Zweite' };
    st.order.push('l_zweite0001');
    const l = st.lists[EXAMPLE_LIST_ID];
    l.partners.push({ deviceId: 'd_eve', name: 'Eve', sentAt: null, receivedAt: 2, options: [{ name: 'Rom', rating: 1000, duels: 1 }] });
    l.partners.push({ deviceId: 7, name: 'kaputt', sentAt: 1, receivedAt: 2, options: [] });
    l.history.push({ a: 'o_gibtsnicht', b: l.options[0].id, s: 1, da: 16, db: -16, t: 1 });
    l.options.push({ id: l.options[0].id, name: 'Doppelt', rating: 1000, duels: 0, wins: 0, draws: 0, losses: 0 });
    l.options[1].rating = null;
    st.lists.l_muell00001 = 'kein Objekt';
    st.order.push('l_muell00001');
    const raw = JSON.stringify(st);
    const { store, storage, res } = mk({ [STORAGE_KEY]: raw });
    assert.match(res.warning, /6 beschädigte Einträge entfernt oder repariert/);
    assert.equal(storage.getItem(BROKEN_KEY), raw, 'Original liegt beiseite');
    assert.deepEqual(store.listLists().map((x) => x.id).sort(), [EXAMPLE_LIST_ID, 'l_zweite0001']);
    assert.equal(store.getDevice().id, 'd_meins00001');
    const fixed = store.getList(EXAMPLE_LIST_ID);
    assert.equal(fixed.options.length, 8);
    assert.equal(fixed.options[1].rating, 1000);
    assert.equal(fixed.history.length, 0);
    assert.deepEqual(fixed.partners.map((x) => [x.deviceId, x.sentAt]), [['d_eve', 0]]);
    assert.equal(validateState(saved(storage)).length, 0, 'reparierter Stand gespeichert');
  });

  test('völlig unbrauchbarer State: Geräte-ID wird aus dem Rohinhalt gerettet', () => {
    const { store } = mk({ [STORAGE_KEY]: JSON.stringify({ schema: 1, device: { id: 'd_alt0000001', name: 'Bert' }, lists: 'x' }) });
    assert.equal(store.getDevice().id, 'd_alt0000001');
    assert.equal(store.getDevice().name, 'Bert');
    assert.equal(store.listLists()[0].id, EXAMPLE_LIST_ID);
  });

  test('Liste mit Infinity-sentAt übersteht einen Neustart (K1)', () => {
    const { store, storage } = mk();
    assert.throws(() => store.savePartner(EXAMPLE_LIST_ID, { deviceId: 'd_eve', name: 'Eve', sentAt: Infinity, receivedAt: 1, options: [] }));
    assert.throws(() => store.savePartner(EXAMPLE_LIST_ID, { deviceId: 'd_eve', name: 'Eve', sentAt: 1, receivedAt: 1, options: [{ name: 'Rom', rating: -Infinity, duels: 1 }] }));
    assert.throws(() => store.savePartner(EXAMPLE_LIST_ID, { deviceId: 'd_eve', name: 'Eve', sentAt: NaN, receivedAt: 1, options: [] }));
    const again = createStore({ storage, now: clock() });
    assert.equal(again.init().warning, null);
    assert.equal(again.listBroken().length, 0);
  });

  test('Store-Import fasst keinen Storage an (Node)', async () => {
    const mod = await import('../../js/data/store.js');
    assert.equal(typeof mod.store.init, 'function');
  });
});

describe('Speichern', () => {
  test('QuotaExceeded → RAM-Stand bleibt, Warnung einmal, status.lastError', () => {
    const { store, storage } = mk();
    const msgs = [];
    store.onWarning((m) => msgs.push(m));
    storage.quota = true;
    const l = store.createList('Groß', ['a', 'b']);
    store.addOptions(l.id, ['c']);
    assert.equal(store.getList(l.id).options.length, 3, 'RAM-Stand bleibt');
    assert.equal(msgs.length, 1);
    assert.match(msgs[0], /Speicher voll/);
    assert.match(msgs[0], /Sicherung/);
    assert.match(store.status().lastError, /Speicher voll/);
    storage.quota = false;
    store.addOptions(l.id, ['d']);
    assert.equal(store.status().lastError, null);
    assert.equal(saved(storage).lists[l.id].options.length, 4);
  });

  test('persist() erst nach dem ersten Schreiben durch eine Änderung, einmal', () => {
    let calls = 0;
    const orig = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      value: { storage: { persist: () => { calls++; return Promise.resolve(true); } } }, configurable: true,
    });
    try {
      const { store } = mk();
      assert.equal(calls, 0, 'nicht beim Laden');
      store.createList('A', ['x']);
      assert.equal(calls, 1);
      store.createList('B', ['y']);
      assert.equal(calls, 1);
    } finally {
      if (orig) Object.defineProperty(globalThis, 'navigator', orig); else delete globalThis.navigator;
    }
  });

  test('subscribe/unsubscribe und frische Objekte', () => {
    const { store } = mk();
    let n = 0;
    const off = store.subscribe(() => n++);
    store.renameList(EXAMPLE_LIST_ID, 'Reisen');
    assert.equal(n, 1);
    off();
    store.renameList(EXAMPLE_LIST_ID, 'Reisen 2');
    assert.equal(n, 1);
    const l = store.getList(EXAMPLE_LIST_ID);
    l.options.length = 0;   // Mutation der Kopie wirkt nicht auf den Store
    assert.equal(store.getList(EXAMPLE_LIST_ID).options.length, 8);
  });
});

describe('storage-Event', () => {
  let target;
  let origAdd;
  beforeEach(() => {
    target = new EventTarget();
    origAdd = globalThis.addEventListener;
    globalThis.addEventListener = target.addEventListener.bind(target);
  });
  afterEach(() => { globalThis.addEventListener = origAdd; });

  const fire = (props) => target.dispatchEvent(Object.assign(new Event('storage'), props));

  test('nur eigener Schlüssel lädt neu (letzter Schreiber gewinnt)', () => {
    const { store, storage } = mk();
    let n = 0;
    store.subscribe(() => n++);
    fire({ key: 'anderes-repo:daten', newValue: '{}', storageArea: storage });
    assert.equal(n, 0);
    const other = saved(storage);
    other.lists[EXAMPLE_LIST_ID].name = 'Von Tab 2';
    fire({ key: STORAGE_KEY, newValue: JSON.stringify(other), storageArea: storage });
    assert.equal(n, 1);
    assert.equal(store.getList(EXAMPLE_LIST_ID).name, 'Von Tab 2');
  });

  test('kaputter Fremdstand wird ignoriert', () => {
    const { store, storage } = mk();
    fire({ key: STORAGE_KEY, newValue: '{nope', storageArea: storage });
    assert.equal(store.getList(EXAMPLE_LIST_ID).name, 'Urlaubsziele');
  });

  test('key null (fremdes clear) → RAM-Stand bleibt und wird neu geschrieben', () => {
    const { store, storage } = mk();
    const l = store.createList('Bleibt', ['a', 'b']);
    storage.clear();
    fire({ key: null, newValue: null, storageArea: storage });
    assert.ok(store.getList(l.id));
    assert.ok(saved(storage).lists[l.id]);
  });
});

describe('Listen und Optionen', () => {
  test('createList: IDs, Duplikate, Reihenfolge, feste ID', () => {
    const { store } = mk();
    const l = store.createList('  Essen ', ['Pizza', 'pizza ', ' Sushi', '', 'Döner']);
    assert.match(l.id, /^l_[a-z0-9]{10}$/);
    assert.equal(l.name, 'Essen');
    assert.deepEqual(l.options.map((o) => o.name), ['Pizza', 'Sushi', 'Döner']);
    for (const o of l.options) {
      assert.match(o.id, /^o_[a-z0-9]{6}$/);
      assert.deepEqual({ ...o, id: 0, name: 0 }, { id: 0, name: 0, rating: 1000, duels: 0, wins: 0, draws: 0, losses: 0 });
    }
    assert.equal(new Set(l.options.map((o) => o.id)).size, 3);
    assert.equal(store.listLists()[0].id, l.id, 'neue Liste oben');
    const f = store.createList('Fremd', ['x'], 'l_fremd00001');
    assert.equal(f.id, 'l_fremd00001');
    const g = store.createList('Fremd 2', ['x'], 'l_fremd00001');
    assert.notEqual(g.id, 'l_fremd00001');
    assert.deepEqual(g.aliases, ['l_fremd00001']);
  });

  test('renameList, moveList, deleteList', () => {
    const { store } = mk();
    const a = store.createList('A', []);
    const b = store.createList('B', []);
    assert.deepEqual(store.listLists().map((l) => l.id), [b.id, a.id, EXAMPLE_LIST_ID]);
    // moveList ändert nur `order`; die Übersicht sortiert nach updatedAt (F5 = C).
    store.moveList(b.id, 2);
    assert.deepEqual(store.getState().order, [a.id, EXAMPLE_LIST_ID, b.id]);
    assert.deepEqual(store.listLists().map((l) => l.id), [b.id, a.id, EXAMPLE_LIST_ID]);
    store.moveList(b.id, -5);
    assert.deepEqual(store.getState().order, [b.id, a.id, EXAMPLE_LIST_ID]);
    store.renameList(a.id, 'A2');
    assert.equal(store.getList(a.id).name, 'A2');
    store.deleteList(a.id);
    assert.equal(store.getList(a.id), undefined);
    assert.deepEqual(store.getState().order, [b.id, EXAMPLE_LIST_ID]);
  });

  test('listLists: nach letzter Änderung absteigend (F5 = C)', () => {
    const { store } = mk();
    const a = store.createList('A', ['x', 'y']);
    const b = store.createList('B', ['x', 'y']);
    const ids = () => store.listLists().map((l) => l.id);
    const ex = EXAMPLE_LIST_ID;
    assert.deepEqual(ids(), [b.id, a.id, ex], 'neue Listen oben');
    const [x, y] = store.getList(a.id).options.map((o) => o.id);
    store.recordDuel(a.id, x, y, 1);
    assert.deepEqual(ids(), [a.id, b.id, ex], 'Duell');
    store.renameList(ex, 'Ziele');
    assert.deepEqual(ids(), [ex, a.id, b.id], 'Umbenennen');
    store.undoLastDuel(a.id);
    assert.deepEqual(ids(), [a.id, ex, b.id], 'Rückgängig');
    store.addOptions(b.id, ['z']);
    assert.equal(ids()[0], b.id, 'Option hinzufügen');
    const ea = store.getList(ex).options[0].id;
    store.renameOption(ex, ea, 'Neu benannt');
    assert.equal(ids()[0], ex, 'Option umbenennen');
    store.removeOption(a.id, x);
    assert.equal(ids()[0], a.id, 'Option entfernen');
    store.resetRatings(b.id);
    assert.equal(ids()[0], b.id, 'Reset');
    store.savePartner(ex, { deviceId: 'd_p', name: 'P', sentAt: 1, receivedAt: 1, options: [] });
    assert.equal(ids()[0], ex, 'Partner speichern');
    store.removePartner(a.id, 'd_unbekannt');
    assert.equal(ids()[0], ex, 'nichts entfernt → keine Änderung');
    store.savePartner(a.id, { deviceId: 'd_p', name: 'P', sentAt: 1, receivedAt: 1, options: [] });
    store.renameList(b.id, 'B2');
    store.removePartner(a.id, 'd_p');
    assert.equal(ids()[0], a.id, 'Partner entfernen');
  });

  test('listLists: Gleichstand → createdAt absteigend, dann Name', () => {
    const storage = new FakeStorage();
    const store = createStore({ storage, now: () => 5 });
    store.init();
    const s = store.getState();
    const base = s.lists[EXAMPLE_LIST_ID];
    s.lists = {
      l_b: { ...base, id: 'l_b', name: 'Beta', createdAt: 1, updatedAt: 9 },
      l_a: { ...base, id: 'l_a', name: 'Alpha', createdAt: 1, updatedAt: 9 },
      l_c: { ...base, id: 'l_c', name: 'Gamma', createdAt: 2, updatedAt: 9 },
      l_d: { ...base, id: 'l_d', name: 'Delta', createdAt: 3, updatedAt: 4 },
    };
    s.order = ['l_d', 'l_b', 'l_a', 'l_c'];
    store.replaceAll(s);
    assert.deepEqual(store.listLists().map((l) => l.id), ['l_c', 'l_a', 'l_b', 'l_d']);
  });

  test('Prototyp-Namen als Listen-ID (N1)', () => {
    const { store } = mk();
    for (const id of ['toString', '__proto__', 'constructor', 'hasOwnProperty']) {
      assert.equal(store.getList(id), undefined, id);
      assert.throws(() => store.addOptions(id, ['x']), /nicht gefunden/, id);
      store.deleteList(id);
    }
    const l = store.createList('Proto', ['A', 'B'], 'toString');
    assert.equal(l.id, 'toString');
    assert.equal(store.getList('toString').name, 'Proto');
    const l2 = store.createList('Proto2', ['A', 'B'], '__proto__');
    assert.notEqual(l2.id, '__proto__');
    assert.deepEqual(store.getList(l2.id).aliases, ['__proto__']);
    assert.equal(store.listLists().length, 3);
  });

  test('Namen werden an Codepoint-Grenzen auf 120 Zeichen gekürzt (N4)', () => {
    const { store } = mk();
    const l = store.createList('😀'.repeat(130), ['a'.repeat(119) + '😀', 'b'.repeat(119) + '😀x', 'c'.repeat(200)]);
    const names = l.options.map((o) => o.name);
    assert.equal(names[0], 'a'.repeat(119) + '😀');
    assert.equal(names[1], 'b'.repeat(119) + '😀');
    assert.equal(names[2], 'c'.repeat(120));
    assert.equal(l.name, '😀'.repeat(120));
    for (const n of [...names, l.name]) assert.ok(!/[\uD800-\uDBFF]$/.test(n), 'kein halbes Surrogatpaar');
    const o = l.options[2];
    store.renameOption(l.id, o.id, 'd'.repeat(119) + '🎉🎉');
    assert.equal(store.getList(l.id).options[2].name, 'd'.repeat(119) + '🎉');
  });

  test('addOptions gibt Anzahl neuer zurück', () => {
    const { store } = mk();
    assert.equal(store.addOptions(EXAMPLE_LIST_ID, ['rom', 'Paris', 'PARIS', 'Wien']), 2);
    assert.equal(store.getList(EXAMPLE_LIST_ID).options.length, 10);
  });

  test('renameOption: leer und Duplikat abgelehnt, Wertung bleibt', () => {
    const { store } = mk();
    const l = store.createList('L', ['Rom', 'Kreta']);
    const [rom, kreta] = l.options;
    store.recordDuel(l.id, rom.id, kreta.id, 1);
    assert.equal(store.renameOption(l.id, rom.id, '   '), false);
    assert.equal(store.renameOption(l.id, rom.id, ' kreta '), false);
    assert.equal(store.renameOption(l.id, rom.id, 'ROM'), true, 'eigene Schreibweise ändern ist erlaubt');
    assert.equal(store.renameOption(l.id, rom.id, 'Roma'), true);
    const after = store.getList(l.id);
    assert.equal(after.options[0].name, 'Roma');
    assert.equal(after.options[0].rating, 1016);
    assert.equal(after.history.length, 1);
  });

  test('removeOption entfernt History-Einträge mit ihr; Undo nimmt jüngstes verbliebenes Duell', () => {
    const { store } = mk();
    const l = store.createList('L', ['A', 'B', 'C']);
    const [a, b, c] = l.options.map((o) => o.id);
    store.recordDuel(l.id, a, b, 1);
    store.recordDuel(l.id, b, c, 0.5);
    store.recordDuel(l.id, c, a, 0);
    store.removeOption(l.id, c);
    const after = store.getList(l.id);
    assert.equal(after.options.length, 2);
    assert.deepEqual(after.history.map((d) => [d.a, d.b]), [[a, b]]);
    const undone = store.undoLastDuel(l.id);
    assert.deepEqual([undone.a, undone.b], [a, b]);
  });

  test('resetRatings leert History und Zähler, stableShown=false', () => {
    const { store } = mk();
    const l = store.createList('L', ['A', 'B']);
    const [a, b] = l.options.map((o) => o.id);
    store.recordDuel(l.id, a, b, 1);
    store.recordDuel(l.id, a, b, 0.5);
    store.setStableShown(l.id, true);
    store.resetRatings(l.id);
    const r = store.getList(l.id);
    assert.equal(r.history.length, 0);
    assert.equal(r.stableShown, false);
    for (const o of r.options) assert.deepEqual([o.rating, o.duels, o.wins, o.draws, o.losses], [1000, 0, 0, 0, 0]);
    assert.equal(store.undoLastDuel(l.id), null);
  });
});

describe('Duelle und Rückgängig', () => {
  test('recordDuel nutzt applyResult (1000:1000 Sieg → 1016/984) und zählt', () => {
    const { store, storage } = mk();
    const l = store.createList('L', ['A', 'B']);
    const [a, b] = l.options.map((o) => o.id);
    const d = store.recordDuel(l.id, a, b, 1);
    assert.equal(d.a, a); assert.equal(d.b, b); assert.equal(d.s, 1);
    assert.equal(d.da, 16); assert.equal(d.db, -16);
    assert.equal(typeof d.t, 'number');
    const r = store.getList(l.id);
    assert.deepEqual(r.options.map((o) => [o.rating, o.duels, o.wins, o.draws, o.losses]),
      [[1016, 1, 1, 0, 0], [984, 1, 0, 0, 1]]);
    assert.equal(saved(storage).lists[l.id].history.length, 1);
    assert.throws(() => store.recordDuel(l.id, a, a, 1));
    assert.throws(() => store.recordDuel(l.id, a, b, 2));
  });

  test('Undo-Kette beliebig oft stellt den Ausgangszustand her', () => {
    const { store } = mk();
    const l = store.createList('L', ['A', 'B', 'C', 'D']);
    const ids = l.options.map((o) => o.id);
    const results = [1, 0.5, 0, 1, 1, 0, 0.5, 1, 0, 1];
    const pairs = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2], [0, 1], [2, 0], [3, 1], [0, 1]];
    const snapshots = [];
    for (let i = 0; i < results.length; i++) {
      snapshots.push(store.getList(l.id).options);
      store.recordDuel(l.id, ids[pairs[i][0]], ids[pairs[i][1]], results[i]);
    }
    for (let i = results.length - 1; i >= 0; i--) {
      const d = store.undoLastDuel(l.id);
      assert.ok(d);
      const now = store.getList(l.id).options;
      const exp = snapshots[i];
      for (let k = 0; k < 4; k++) {
        assert.ok(Math.abs(now[k].rating - exp[k].rating) < 1e-9);
        assert.deepEqual([now[k].duels, now[k].wins, now[k].draws, now[k].losses],
          [exp[k].duels, exp[k].wins, exp[k].draws, exp[k].losses]);
      }
    }
    assert.equal(store.undoLastDuel(l.id), null);
    for (const o of store.getList(l.id).options) assert.equal(o.rating, 1000);
  });
});

describe('Gerät, Partner, Abgleich', () => {
  const partner = (deviceId, sentAt, extra = {}) => ({
    deviceId, name: 'Anna', receivedAt: 5, sentAt, options: [{ name: 'Rom', rating: 1016, duels: 1 }], ...extra,
  });

  test('setDeviceName/getDevice', () => {
    const { store } = mk();
    store.setDeviceName('  Anna  ');
    assert.equal(store.getDevice().name, 'Anna');
  });

  test('savePartner: neuer ersetzt, älterer sentAt überschreibt kein neueres', () => {
    const { store } = mk();
    assert.equal(store.savePartner(EXAMPLE_LIST_ID, partner('d_anna000001', 2000)), true);
    assert.equal(store.savePartner(EXAMPLE_LIST_ID, partner('d_anna000001', 1000, { name: 'Alt' })), false);
    assert.equal(store.getList(EXAMPLE_LIST_ID).partners[0].name, 'Anna');
    assert.equal(store.savePartner(EXAMPLE_LIST_ID, partner('d_anna000001', 3000, { name: 'Neu' })), true);
    assert.equal(store.savePartner(EXAMPLE_LIST_ID, partner('d_bert000001', 1000)), true);
    const ps = store.getList(EXAMPLE_LIST_ID).partners;
    assert.equal(ps.length, 2);
    assert.equal(ps.find((p) => p.deviceId === 'd_anna000001').name, 'Neu');
    store.removePartner(EXAMPLE_LIST_ID, 'd_anna000001');
    assert.deepEqual(store.getList(EXAMPLE_LIST_ID).partners.map((p) => p.deviceId), ['d_bert000001']);
  });

  test('savePartner: Stand aus der Zukunft wird auf jetzt begrenzt und blockiert keine echten Updates (N2)', () => {
    const storage = new FakeStorage();
    let t = 1_000_000_000;
    const store = createStore({ storage, now: () => t });
    store.init();
    const year2100 = 4102444800 * 1000;
    assert.equal(store.savePartner(EXAMPLE_LIST_ID, partner('d_anna000001', year2100, { name: 'Zukunft' })), true);
    assert.equal(store.getList(EXAMPLE_LIST_ID).partners[0].sentAt, t);
    t += 1000;
    assert.equal(store.savePartner(EXAMPLE_LIST_ID, partner('d_anna000001', t, { name: 'Echt' })), true);
    assert.equal(store.getList(EXAMPLE_LIST_ID).partners[0].name, 'Echt');
    // bis 1 Tag Vorlauf (Uhrabweichung) bleibt unverändert
    assert.equal(store.savePartner(EXAMPLE_LIST_ID, partner('d_bert000001', t + 3600_000)), true);
    assert.equal(store.getList(EXAMPLE_LIST_ID).partners[1].sentAt, t + 3600_000);
  });

  test('alter Stand aus der Zukunft im Speicher blockiert echte Updates nicht (N2)', () => {
    const st = defaultState(1);
    st.lists[EXAMPLE_LIST_ID].partners.push({ deviceId: 'd_anna000001', name: 'Alt', sentAt: 4102444800000, receivedAt: 1, options: [] });
    const { store } = mk({ [STORAGE_KEY]: JSON.stringify(st) });
    assert.equal(store.savePartner(EXAMPLE_LIST_ID, partner('d_anna000001', 5_000_000, { name: 'Neu' })), true);
    assert.equal(store.getList(EXAMPLE_LIST_ID).partners[0].name, 'Neu');
  });

  const share = (l, names, a) => ({ v: 1, l, n: 'X', p: 'Anna', d: 'd_anna000001', t: 1, o: names.map((n) => [n, 1000, 0]), a });
  const EX = ['Lissabon', 'Kopenhagen', 'Rom', 'Bergen', 'Dolomiten', 'Kreta', 'Edinburgh', 'Ostsee'];

  test('findMatch: id, aliases, share.a', () => {
    const { store } = mk();
    assert.equal(store.findMatch(share(EXAMPLE_LIST_ID, ['ganz', 'anders'])).kind, 'id');
    store.addAlias(EXAMPLE_LIST_ID, 'l_fremd00001');
    const m = store.findMatch(share('l_fremd00001', []));
    assert.equal(m.kind, 'id');
    assert.equal(m.list.id, EXAMPLE_LIST_ID);
    assert.equal(store.findMatch(share('l_unbekannt1', [], [EXAMPLE_LIST_ID])).kind, 'id');
  });

  test('findMatch: Namensabgleich Jaccard ≥ 0,6, sonst none', () => {
    const { store } = mk();
    // 6 von 8 gemeinsam, keine zusätzlichen: 6/8 = 0,75
    let m = store.findMatch(share('l_fremd00001', EX.slice(0, 6).map((n) => n.toUpperCase())));
    assert.equal(m.kind, 'name');
    assert.equal(m.list.id, EXAMPLE_LIST_ID);
    assert.equal(m.overlap, 0.75);
    // genau 0,6: 6 gemeinsam, 2 fehlend, 2 zusätzlich → 6/10
    m = store.findMatch(share('l_fremd00001', [...EX.slice(0, 6), 'Paris', 'Wien']));
    assert.equal(m.kind, 'name');
    assert.equal(m.overlap, 0.6);
    // 5 gemeinsam, 3 fehlend, 1 zusätzlich → 5/9 < 0,6
    m = store.findMatch(share('l_fremd00001', [...EX.slice(0, 5), 'Paris']));
    assert.equal(m.kind, 'none');
    assert.equal(m.list, null);
    assert.ok(m.overlap > 0.5 && m.overlap < 0.6);
  });

  test('addAlias ignoriert eigene ID und Duplikate', () => {
    const { store } = mk();
    store.addAlias(EXAMPLE_LIST_ID, EXAMPLE_LIST_ID);
    store.addAlias(EXAMPLE_LIST_ID, 'l_x');
    store.addAlias(EXAMPLE_LIST_ID, 'l_x');
    assert.deepEqual(store.getList(EXAMPLE_LIST_ID).aliases, ['l_x']);
  });
});

describe('replaceAll', () => {
  test('behält eigene device.id, Name aus Sicherung nur, wenn aktuell leer', () => {
    const { store, storage } = mk();
    const myId = store.getDevice().id;
    const backup = defaultState();
    backup.device = { id: 'd_fremd00001', name: 'Bert' };
    backup.lists[EXAMPLE_LIST_ID].name = 'Aus Sicherung';
    store.replaceAll(backup);
    assert.equal(store.getDevice().id, myId);
    assert.equal(store.getDevice().name, 'Bert');
    assert.equal(store.getList(EXAMPLE_LIST_ID).name, 'Aus Sicherung');
    assert.equal(saved(storage).device.id, myId);

    store.setDeviceName('Anna');
    store.replaceAll(backup);
    assert.equal(store.getDevice().name, 'Anna');
  });

  test('wirft bei ungültigem State und lässt den Stand unverändert', () => {
    const { store } = mk();
    assert.throws(() => store.replaceAll({ schema: 1, lists: [] }), { name: 'SchemaError' });
    assert.equal(store.listLists().length, 1);
  });
});

test('Einstellungen: alter Stand ohne Feld = Bilder an; setSetting speichert', () => {
  const { store, storage } = mk();
  assert.equal(store.getSettings().images, undefined);
  store.setSetting('images', false);
  assert.equal(store.getSettings().images, false);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).settings.images, false);
  assert.deepEqual(validateState(store.getState()), []);
});
