// Eigentümer: A – Tests für js/logic/stability.js (Rahmen §4A, Werte nach DECISIONS.md F1 = A)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thresholds, progress } from '../../js/logic/stability.js';

const list = (...duels) => ({ options: duels.map((d) => ({ duels: d })) });
const even = (n, d) => list(...new Array(n).fill(d));

test('thresholds: Grenzfälle N = 2, 5, 10, 11, 30, 31', () => {
  const exp = {
    2: [3, 4], 5: [8, 10], 10: [15, 20], 11: [17, 28], 30: [45, 75], 31: [47, 93],
  };
  for (const [n, [p, s]] of Object.entries(exp)) {
    assert.deepEqual(thresholds(Number(n)),
      { prelimDuels: p, prelimMin: 2, stableDuels: s, stableMin: 3, targetDuels: s }, `N=${n}`);
  }
  // Werte aus elo-abbruch.md §3
  assert.equal(thresholds(8).stableDuels, 16);
  assert.equal(thresholds(15).stableDuels, 38);
  assert.equal(thresholds(20).stableDuels, 50);
  assert.equal(thresholds(50).stableDuels, 150);
});

test('progress: n < 2', () => {
  for (const l of [list(), list(3), {}, null]) {
    const p = progress(l);
    assert.equal(p.level, 'start');
    assert.equal(p.ratio, 0);
    assert.equal(p.hint, 'Füge mindestens zwei Optionen hinzu');
  }
});

test('progress: Rahmenwerte (M = Σduels/2, avg, minDuels)', () => {
  const p = progress(list(4, 2, 2, 0));
  assert.equal(p.duels, 4);
  assert.equal(p.n, 4);
  assert.equal(p.avg, 2);
  assert.equal(p.minDuels, 0);
});

test('progress: Start ohne Duelle (N = 5)', () => {
  const p = progress(even(5, 0));
  assert.equal(p.level, 'start');
  assert.equal(p.remaining, 8);          // max(8 − 0, fehlt(2) = 5)
  assert.equal(p.ratio, 0);
  assert.equal(p.hint, 'Noch ca. 8 Duelle bis zur ersten Rangliste');
});

test('progress: N = 2 durchläuft start → vorläufig → stabil', () => {
  let p = progress(list(2, 2));
  assert.equal(p.level, 'start');
  assert.equal(p.remaining, 1);
  assert.equal(p.hint, 'Noch ca. 1 Duell bis zur ersten Rangliste');
  p = progress(list(3, 3));
  assert.equal(p.level, 'vorlaeufig');
  assert.equal(p.remaining, 1);
  assert.equal(p.hint, 'Rangliste vorläufig – noch ca. 1 Duell bis zur stabilen Rangliste');
  assert.equal(p.ratio, 0.75);
  p = progress(list(4, 4));
  assert.equal(p.level, 'stabil');
  assert.equal(p.remaining, 0);
  assert.equal(p.ratio, 1);
  assert.equal(p.hint, 'Rangliste stabil ✓ Weitere Duelle machen sie noch genauer.');
  assert.equal(progress(list(40, 40)).ratio, 1);
});

test('progress: N = 10 Grenzen', () => {
  // 15 Duelle, alle ≥ 2 → vorläufig
  let p = progress(list(4, 4, 3, 3, 3, 3, 2, 2, 3, 3));
  assert.equal(p.duels, 15);
  assert.equal(p.level, 'vorlaeufig');
  assert.equal(p.remaining, 5);          // max(20 − 15, fehlt(3) = 1)
  assert.equal(p.hint, 'Rangliste vorläufig – noch ca. 5 Duelle bis zur stabilen Rangliste');
  // 15 Duelle, aber eine Option nur 1 Duell → start, fehlt(2) zählt
  p = progress(list(5, 4, 3, 3, 3, 3, 2, 1, 3, 3));
  assert.equal(p.level, 'start');
  assert.equal(p.remaining, 1);
  // 20 Duelle, alle ≥ 3 nötig: eine Option mit 2 → vorläufig, Rest durch fehlt(3)
  p = progress(list(6, 5, 4, 4, 4, 4, 4, 4, 3, 2));
  assert.equal(p.duels, 20);
  assert.equal(p.level, 'vorlaeufig');
  assert.equal(p.remaining, 1);
  p = progress(even(10, 4));
  assert.equal(p.level, 'stabil');
  assert.equal(p.ratio, 1);
});

test('progress: N = 11 exakt', () => {
  // M = 16,5 < 17 → start, obwohl alle ≥ 2
  let p = progress(even(11, 3));
  assert.equal(p.level, 'start');
  assert.equal(p.remaining, 1);          // ceil(17 − 16,5)
  p = progress(list(4, ...new Array(10).fill(3)));                // M = 17
  assert.equal(p.level, 'vorlaeufig');
  assert.equal(p.remaining, 11);         // 28 − 17
  p = progress(list(6, ...new Array(10).fill(5)));                // M = 28
  assert.equal(p.level, 'stabil');
});

test('progress: N = 30 und N = 31', () => {
  assert.equal(progress(even(30, 3)).level, 'vorlaeufig');        // M = 45
  assert.equal(progress(even(30, 3)).remaining, 30);              // 75 − 45
  assert.equal(progress(even(30, 5)).level, 'stabil');            // M = 75
  assert.equal(progress(even(31, 3)).level, 'start');             // M = 46,5 < 47
  assert.equal(progress(list(4, ...new Array(30).fill(3))).level, 'vorlaeufig'); // M = 47
  assert.equal(progress(even(31, 5)).level, 'vorlaeufig');        // M = 77,5 < 93
  assert.equal(progress(even(31, 6)).level, 'stabil');            // M = 93
  assert.equal(progress(even(31, 5)).ratio, 77.5 / 93);
});

test('progress: neue Option fällt zurück, eigener Hinweis', () => {
  const p = progress(list(...new Array(10).fill(4), 0));
  assert.equal(p.level, 'start');
  assert.equal(p.minDuels, 0);
  assert.equal(p.remaining, 1);          // max(17 − 20, fehlt(2) = 1)
  assert.equal(p.hint, 'Neue Option – noch ca. 1 Duell bis zur ersten Rangliste');
  const q = progress(list(...new Array(10).fill(4), 0, 0, 0, 0, 0));
  assert.equal(q.hint, 'Neue Option – noch ca. 5 Duelle bis zur ersten Rangliste'); // max(23 − 20, fehlt(2)=5)
  // ganz am Anfang kein „Neue Option“
  assert.match(progress(list(1, 1, 0, 0)).hint, /^Noch ca\./);
});

test('progress: Partner-Optionen ({name, rating, duels}) funktionieren', () => {
  const p = progress({ options: [{ name: 'a', rating: 1016, duels: 4 }, { name: 'b', rating: 984, duels: 4 }] });
  assert.equal(p.level, 'stabil');
});

test('progress: große Zahlen deutsch formatiert', () => {
  const p = progress(even(1000, 0));
  assert.equal(p.hint, 'Noch ca. 1.500 Duelle bis zur ersten Rangliste');
});
