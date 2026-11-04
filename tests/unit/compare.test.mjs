// Eigentümer: A – Tests für js/logic/compare.js (Regeln §4A, Schwelle F3 = B)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareRankings, excludedThreshold } from '../../js/logic/compare.js';

const side = (pairs) => pairs.map(([name, rating, duels = 3]) => ({ name, rating, duels }));
const names = (items) => items.map((x) => x.name);

test('excludedThreshold = max(1, floor(m/5))', () => {
  const exp = { 0: 1, 1: 1, 2: 1, 4: 1, 5: 1, 9: 1, 10: 2, 14: 2, 15: 3, 24: 4, 25: 5, 100: 20 };
  for (const [m, t] of Object.entries(exp)) assert.equal(excludedThreshold(Number(m)), t, `m=${m}`);
});

test('m < 2: keine Abschnitte, nur onlyMine/onlyTheirs', () => {
  const r = compareRankings(side([['Rom', 1050], ['Kreta', 990]]), side([['rom', 1010], ['Oslo', 1100], ['Bergen', 900]]));
  assert.equal(r.common, 1);
  assert.deepEqual([r.favorites, r.excluded, r.talk], [[], [], []]);
  assert.deepEqual(r.onlyMine, ['Kreta']);
  assert.deepEqual(r.onlyTheirs, ['Oslo', 'Bergen']);
  const e = compareRankings([], []);
  assert.deepEqual(e, { common: 0, favorites: [], excluded: [], talk: [], onlyMine: [], onlyTheirs: [] });
});

test('m = 2: einig → ein Favorit, ein Ausschluss, kein Gesprächsstoff', () => {
  const r = compareRankings(side([['Rom', 1016], ['Kreta', 984]]), side([['Rom', 1020], ['Kreta', 980]]));
  assert.equal(r.common, 2);
  assert.deepEqual(names(r.favorites), ['Rom']);
  assert.deepEqual(names(r.excluded), ['Kreta']);
  assert.deepEqual(r.talk, []);
});

test('m = 2: uneinig → beide ausgeschlossen, keine Favoriten (Leertext-Fall)', () => {
  const r = compareRankings(side([['Rom', 1016], ['Kreta', 984]]), side([['Rom', 984], ['Kreta', 1016]]));
  assert.deepEqual(r.favorites, []);
  assert.deepEqual(names(r.excluded), ['Kreta', 'Rom']); // min-Wertung gleich (984) → Name
  assert.deepEqual(r.talk, []);
});

test('Wettkampf-Ränge auf gerundeten Wertungen (1, 2, 2, 4)', () => {
  const mine = side([['A', 1040.4], ['B', 1019.6], ['C', 1020.2], ['D', 980]]);
  const theirs = side([['A', 1000], ['B', 1000], ['C', 990], ['D', 1000]]);
  const r = compareRankings(mine, theirs);
  const all = [...r.favorites, ...r.excluded, ...r.talk];
  const get = (n) => all.find((x) => x.name === n);
  // B 1019,6 → 1020 = C 1020,2 → 1020: geteilter Rang 2; Partner: A, B, D teilen Rang 1
  assert.deepEqual([get('A').rankA, get('B').rankA, get('C').rankA, get('D').rankA], [1, 2, 2, 4]);
  assert.deepEqual([get('A').rankB, get('B').rankB, get('C').rankB, get('D').rankB], [1, 1, 4, 1]);
  assert.equal(get('B').ratingA, 1020);
  assert.equal(get('C').ratingA, 1020);
  assert.deepEqual(names(r.favorites), ['A', 'B']);     // B vor C: gleiche min/max-Wertung → Name
  assert.deepEqual(names(r.excluded), ['D', 'C']);      // min 980 vor 990
  assert.deepEqual(names(r.talk), ['D', 'C']);          // Differenz 3 vor 2
});

test('Gleichstand überall (frische Listen): keine Schein-Ausschlüsse, kein Gesprächsstoff', () => {
  const opts = ['Rom', 'Kreta', 'Bergen', 'Oslo', 'Lissabon', 'Dolomiten'];
  const r = compareRankings(side(opts.map((n) => [n, 1000, 0])), side(opts.map((n) => [n, 1000, 0])));
  assert.equal(r.common, 6);
  assert.deepEqual(r.excluded, []);
  assert.deepEqual(r.talk, []);
  assert.equal(r.favorites.length, 2); // min(5, ceil(6/3))
});

test('geteilter Rang an der Grenze: Gruppe mit Rang ≤ m − t bleibt draußen', () => {
  // m = 5, t = 1 → ausgeschlossen bei Rang > 4. D und E teilen Rang 4 → nicht ausgeschlossen.
  const mine = side([['A', 1100], ['B', 1050], ['C', 1020], ['D', 950], ['E', 950]]);
  const theirs = side([['A', 1100], ['B', 1050], ['C', 1020], ['D', 950], ['E', 900]]);
  const r = compareRankings(mine, theirs);
  assert.deepEqual(names(r.excluded), ['E']);
  const r2 = compareRankings(mine, mine);
  assert.deepEqual(r2.excluded, []);
});

test('favorites: disjunkt zu excluded, nach min-Wertung, dann max, dann Name; höchstens min(5, ceil(m/3))', () => {
  const mine = side([
    ['A', 1100], ['B', 1090], ['C', 1080], ['D', 1070], ['E', 1060], ['F', 1050],
    ['G', 1040], ['H', 1030], ['I', 1020], ['J', 1010], ['K', 900], ['L', 890],
  ]);
  const theirs = side([
    ['A', 1000], ['B', 1095], ['C', 1050], ['D', 1050], ['E', 1060], ['F', 1200],
    ['G', 1100], ['H', 1110], ['I', 1105], ['J', 1101], ['K', 800], ['L', 1300],
  ]);
  const r = compareRankings(mine, theirs);
  assert.equal(r.common, 12);
  // t = 2 → ausgeschlossen bei Rang > 10 auf einer Seite
  // bei mir: K (11), L (12); beim Partner: K (12), A (11)
  assert.deepEqual(names(r.excluded), ['K', 'L', 'A']); // min 800, 890, 1000
  const ex = new Set(names(r.excluded));
  for (const f of r.favorites) assert.ok(!ex.has(f.name), `${f.name} in beiden`);
  assert.equal(r.favorites.length, 4); // min(5, ceil(12/3))
  // min-Werte: B 1090, E 1060, F 1050, C 1050 (max 1080), D 1050 (max 1070), G 1040 …
  assert.deepEqual(names(r.favorites), ['B', 'E', 'F', 'C']);
  for (let i = 1; i < r.favorites.length; i++) {
    const p = r.favorites[i - 1], q = r.favorites[i];
    assert.ok(Math.min(p.ratingA, p.ratingB) >= Math.min(q.ratingA, q.ratingB));
  }
  for (const x of [...r.favorites, ...r.excluded]) assert.equal(x.veto, false);
});

test('favorites-Gleichstand: max-Wertung, dann Name (de)', () => {
  const mine = side([['Ägypten', 1050], ['Zypern', 1050], ['Bali', 1050], ['X', 900], ['Y', 890], ['Z', 880]]);
  const theirs = side([['Ägypten', 1050], ['Zypern', 1050], ['Bali', 1060], ['X', 900], ['Y', 890], ['Z', 880]]);
  const r = compareRankings(mine, theirs);
  assert.deepEqual(names(r.favorites), ['Bali', 'Ägypten']);
});

test('talk: Platzdifferenz ≥ 2, nach Differenz, dann min(Rang), dann Name; höchstens 5; veto bei Ausschluss', () => {
  const order = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const mine = side(order.map((n, i) => [n, 1100 - 10 * i]));
  // Partner: umgekehrte Reihenfolge
  const theirs = side(order.map((n, i) => [n, 1030 + 10 * i]));
  const r = compareRankings(mine, theirs);
  // Ränge mir: A1..H8; Partner: H1..A8 → Diffs A7 B5 C3 D1 E1 F3 G5 H7
  assert.deepEqual(r.talk.map((x) => [x.name, Math.abs(x.rankA - x.rankB)]),
    [['A', 7], ['H', 7], ['B', 5], ['G', 5], ['C', 3]]);
  assert.equal(r.talk.length, 5);
  // A und H sind ausgeschlossen (Rang 8 bei einer Person) → veto
  assert.deepEqual(r.talk.map((x) => x.veto), [true, true, false, false, false]);
  assert.deepEqual(names(r.excluded).sort(), ['A', 'H']);
  for (const x of r.talk) assert.ok(Math.abs(x.rankA - x.rankB) >= 2);
});

test('talk: gleiche Differenz und gleicher min-Rang → Name', () => {
  const mine = side([['Zug', 1100], ['Bus', 1090], ['Rad', 1000], ['Auto', 990], ['Boot', 900]]);
  const theirs = side([['Zug', 1000], ['Bus', 1000], ['Rad', 1100], ['Auto', 1100], ['Boot', 900]]);
  const r = compareRankings(mine, theirs);
  // mir: Zug1 Bus2 Rad3 Auto4 Boot5; Partner: Rad1 Auto1 Zug3 Bus3 Boot5
  assert.deepEqual(r.talk.map((x) => x.name), ['Auto', 'Rad', 'Zug']);
});

test('Abgleich über normalizeName; name = eigener Name; Ränge nur in der gemeinsamen Menge', () => {
  const mine = side([['  Köln ', 1100], ['ROM', 1050], ['Nur Ich', 1200], ['Kreta', 990]]);
  const theirs = side([['köln', 1070], ['rom', 1060], ['kreta', 950], ['Nur Du', 1300], ['Auch Du', 900]]);
  const r = compareRankings(mine, theirs);
  assert.equal(r.common, 3);
  const all = [...r.favorites, ...r.excluded];
  assert.ok(all.some((x) => x.name === '  Köln '));
  const koeln = all.find((x) => x.name === '  Köln ');
  assert.equal(koeln.rankA, 1); // „Nur Ich“ (1200) zählt nicht mit
  assert.deepEqual(r.onlyMine, ['Nur Ich']);
  assert.deepEqual(r.onlyTheirs, ['Nur Du', 'Auch Du']);
});

test('onlyMine/onlyTheirs nach Wertung absteigend', () => {
  const r = compareRankings(
    side([['A', 1000], ['B', 1000], ['x', 900], ['y', 1100], ['z', 1000.4]]),
    side([['A', 1000], ['B', 1000], ['p', 950], ['q', 1050]]),
  );
  assert.deepEqual(r.onlyMine, ['y', 'z', 'x']);
  assert.deepEqual(r.onlyTheirs, ['q', 'p']);
});

test('doppelte Namen auf einer Seite: erster Eintrag zählt', () => {
  const r = compareRankings(side([['Rom', 1100], ['rom', 900], ['Kreta', 1000]]), side([['Rom', 1100], ['Kreta', 1000]]));
  assert.equal(r.common, 2);
  assert.equal(r.favorites[0].name, 'Rom');
  assert.equal(r.favorites[0].ratingA, 1100);
});
