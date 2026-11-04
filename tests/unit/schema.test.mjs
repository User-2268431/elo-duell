// Eigentümer: B – Schema, Default-State, Migration, Validierung (docs/ARCHITEKTUR.md §3, §4B).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA, SchemaError, defaultState, migrate, migrateWithReport, validateState, newId, EXAMPLE_LIST_ID } from '../../js/data/schema.js';

test('defaultState ist gültig und enthält die Beispielliste', () => {
  const s = defaultState(123);
  assert.equal(s.schema, SCHEMA);
  assert.deepEqual(validateState(s), []);
  assert.deepEqual(s.order, [EXAMPLE_LIST_ID]);
  const l = s.lists[EXAMPLE_LIST_ID];
  assert.equal(l.name, 'Urlaubsziele');
  assert.equal(l.createdAt, 123);
  assert.equal(l.options.length, 8);
  assert.ok(l.options.every((o) => /^o_[a-z0-9]{6}$/.test(o.id) && o.rating === 1000 && o.duels === 0));
  assert.match(s.device.id, /^d_[a-z0-9]{10}$/);
  assert.equal(s.device.name, '');
  assert.notEqual(defaultState().device.id, defaultState().device.id);
});

test('newId', () => {
  assert.match(newId('l_', 10), /^l_[a-z0-9]{10}$/);
  assert.match(newId('o_', 6), /^o_[a-z0-9]{6}$/);
});

test('migrate v1 ist identisch, aber eine Kopie', () => {
  const s = defaultState();
  const m = migrate(s);
  assert.deepEqual(m, s);
  assert.notEqual(m, s);
  assert.deepEqual(migrate(JSON.stringify(s)), s, 'JSON-String wird akzeptiert');
});

test('migrate v0 (ohne schema-Feld) → v1, fehlende Felder ergänzt, order repariert', () => {
  const s = defaultState();
  const v0 = JSON.parse(JSON.stringify(s));
  delete v0.schema;
  delete v0.settings;
  delete v0.lists[EXAMPLE_LIST_ID].aliases;
  delete v0.lists[EXAMPLE_LIST_ID].partners;
  delete v0.lists[EXAMPLE_LIST_ID].stableShown;
  v0.order = ['l_weg', EXAMPLE_LIST_ID, EXAMPLE_LIST_ID];
  const m = migrate(v0);
  assert.equal(m.schema, 1);
  assert.deepEqual(m.settings, {});
  assert.deepEqual(m.order, [EXAMPLE_LIST_ID]);
  assert.deepEqual(m.lists[EXAMPLE_LIST_ID].aliases, []);
  assert.deepEqual(m.lists[EXAMPLE_LIST_ID].partners, []);
  assert.equal(m.lists[EXAMPLE_LIST_ID].stableShown, false);
});

test('migrate wirft SchemaError bei Unbrauchbarem', () => {
  for (const bad of [null, 42, 'kaputt{', [], { schema: 1 }, { schema: 'x' }, { schema: -1 }]) {
    assert.throws(() => migrate(bad), SchemaError, JSON.stringify(bad));
  }
  const newer = { ...defaultState(), schema: SCHEMA + 1 };
  assert.throws(() => migrate(newer), /neueren App-Version/);
});

test('validateState erkennt Fehler', () => {
  const s = defaultState();
  const l = s.lists[EXAMPLE_LIST_ID];
  l.options[0].rating = NaN;
  l.options[1].id = l.options[2].id;
  l.history.push({ a: 'o_nix000', b: l.options[0].id, s: 1, da: 1, db: -1, t: 1 });
  s.order.push('l_fehlt');
  const errs = validateState(s);
  assert.ok(errs.length >= 4, errs.join('\n'));
  assert.ok(errs.some((e) => /Wertung/.test(e)));
  assert.ok(errs.some((e) => /doppelt/.test(e)));
  assert.ok(errs.some((e) => /Duell/.test(e)));
  assert.ok(errs.some((e) => /order/.test(e)));
  assert.deepEqual(validateState('x'), ['State ist kein Objekt']);
});

test('validateState prüft Partner', () => {
  const s = defaultState();
  s.lists[EXAMPLE_LIST_ID].partners.push({ deviceId: 'd_x', name: 'A', sentAt: 1, receivedAt: 2, options: [{ name: 'Rom', rating: 1000, duels: 1 }] });
  assert.deepEqual(validateState(s), []);
  s.lists[EXAMPLE_LIST_ID].partners[0].options[0].rating = 'hoch';
  assert.ok(validateState(s).some((e) => /Partner/.test(e)));
});

test('migrateWithReport: gültiger State → nichts repariert', () => {
  const s = defaultState();
  const r = migrateWithReport(s);
  assert.equal(r.repaired, 0);
  assert.deepEqual(r.state, s);
});

test('migrateWithReport: einzelne ungültige Teile werden repariert oder entfernt statt alles zu verwerfen (H1)', () => {
  const s = defaultState();
  const l = s.lists[EXAMPLE_LIST_ID];
  l.options.push(null);                                                     // entfernt
  l.options[0].wins = 1.5;                                                  // repariert
  l.history.push({ a: l.options[0].id, b: l.options[0].id, s: 1, da: 1, db: -1, t: 1 }); // entfernt
  l.partners.push({ deviceId: 'd_x', name: 'A', sentAt: null, receivedAt: 2,
    options: [{ name: 'Rom', rating: 1000, duels: 1 }, { name: 'Kreta', rating: null, duels: 1 }] }); // 2× repariert
  l.aliases.push(5);                                                        // repariert
  s.lists.toString = { id: 'toString' };                                    // Liste ohne options → repariert (name+options)
  s.order.push('constructor');
  const r = migrateWithReport(s);
  assert.equal(r.repaired, 8);
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(r.state.order, [EXAMPLE_LIST_ID, 'toString']);
  assert.equal(r.state.lists[EXAMPLE_LIST_ID].options.length, 8);
  assert.equal(r.state.lists[EXAMPLE_LIST_ID].options[0].wins, 2);
  assert.deepEqual(r.state.lists[EXAMPLE_LIST_ID].partners[0].options.map((o) => o.name), ['Rom']);
  assert.equal(r.state.lists[EXAMPLE_LIST_ID].partners[0].sentAt, 0);
});

test('validateState: order mit Prototyp-Namen ist ungültig (N1)', () => {
  const s = defaultState();
  s.order.push('toString');
  assert.ok(validateState(s).some((e) => /toString/.test(e)));
});
