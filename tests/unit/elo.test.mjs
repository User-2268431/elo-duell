// Eigentümer: A – Tests für js/logic/elo.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { START_RATING, K, expected, applyResult, rankOptions } from '../../js/logic/elo.js';

const opt = (id, name, rating, duels) => ({ id, name, rating, duels, wins: 0, draws: 0, losses: 0 });

test('Konstanten', () => {
  assert.equal(START_RATING, 1000);
  assert.equal(K, 32);
});

test('expected: gleich stark 0,5; symmetrisch; 400 Punkte Abstand ≈ 10:1', () => {
  assert.equal(expected(1000, 1000), 0.5);
  assert.ok(Math.abs(expected(1200, 1000) + expected(1000, 1200) - 1) < 1e-12);
  assert.ok(Math.abs(expected(1400, 1000) - 10 / 11) < 1e-12);
});

test('1000 gegen 1000: Sieg → 1016/984', () => {
  const r = applyResult(1000, 1000, 1);
  assert.deepEqual(r, { ra: 1016, rb: 984, da: 16, db: -16 });
  const l = applyResult(1000, 1000, 0);
  assert.deepEqual(l, { ra: 984, rb: 1016, da: -16, db: 16 });
});

test('Remis bei gleicher Wertung ändert nichts; sonst Annäherung', () => {
  const r = applyResult(1000, 1000, 0.5);
  assert.equal(r.ra, 1000); assert.equal(r.rb, 1000);
  assert.equal(r.da + r.db, 0);
  const s = applyResult(1100, 1000, 0.5);
  assert.ok(s.ra < 1100 && s.rb > 1000);
});

test('Summe der Wertungen bleibt konstant, eigenes k', () => {
  for (const [ra, rb] of [[1000, 1000], [1234.5, 987.25], [700, 1500]]) {
    for (const s of [1, 0.5, 0]) {
      const r = applyResult(ra, rb, s);
      assert.ok(Math.abs(r.ra + r.rb - (ra + rb)) < 1e-9);
      assert.ok(Math.abs(r.da + r.db) < 1e-12);
    }
  }
  assert.equal(applyResult(1000, 1000, 1, 16).ra, 1008);
});

test('Außenseitersieg bringt mehr als Favoritensieg', () => {
  assert.ok(applyResult(900, 1100, 1).da > applyResult(1100, 900, 1).da);
});

test('rankOptions: Wertung ab, dann Duelle ab, dann Name; neue ans Ende nach Name', () => {
  const input = [
    opt('o_1', 'Zürich', 0 + 1000, 0),
    opt('o_2', 'Rom', 1016, 1),
    opt('o_3', 'Bergen', 1000, 2),
    opt('o_4', 'Ägypten', 1000, 2),
    opt('o_5', 'Kreta', 1000, 4),
    opt('o_6', 'Oslo', 984, 1),
    opt('o_7', 'Athen', 1000, 0),
  ];
  const copy = structuredClone(input);
  const r = rankOptions(input);
  assert.deepEqual(r.map((o) => o.name), ['Rom', 'Kreta', 'Ägypten', 'Bergen', 'Oslo', 'Athen', 'Zürich']);
  assert.deepEqual(r.map((o) => o.rank), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(r.map((o) => o.isNew), [false, false, false, false, false, true, true]);
  assert.equal(r[0].id, 'o_2');
  assert.equal(r[0].wins, 0);
  assert.deepEqual(input, copy, 'Eingabe bleibt unverändert');
});

test('rankOptions: leer und alle neu', () => {
  assert.deepEqual(rankOptions([]), []);
  const r = rankOptions([opt('a', 'b', 1000, 0), opt('c', 'a', 1000, 0)]);
  assert.deepEqual(r.map((o) => [o.name, o.rank, o.isNew]), [['a', 1, true], ['b', 2, true]]);
});
