// Eigentümer: A – Tests für js/logic/pairing.js (harte Regeln §4A, Top-Fokus F2 = B, S6)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPair } from '../../js/logic/pairing.js';
import { applyResult } from '../../js/logic/elo.js';

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mkOptions = (n, duels = 0) => Array.from({ length: n }, (_, i) => ({
  id: `o_${String(i).padStart(6, '0')}`, name: `Option ${i + 1}`, rating: 1000, duels, wins: 0, draws: 0, losses: 0,
}));
const key = (x, y) => [x, y].sort().join('|');
const pairKeyOf = (p) => key(p[0].id, p[1].id);

/** Spielt `count` Duelle mit fortgeschriebener History; rule(a,b) → 1|0.5|0. */
function simulate(n, count, rng, rule = () => (rng() < 0.5 ? 1 : 0), onPick = () => {}) {
  const options = mkOptions(n);
  const history = [];
  const picks = [];
  for (let i = 0; i < count; i++) {
    const pair = pickPair(options, history, { rng });
    onPick(pair, history, picks);
    picks.push(pair);
    const [a, b] = pair;
    const s = rule(a, b);
    const r = applyResult(a.rating, b.rating, s);
    a.rating = r.ra; b.rating = r.rb; a.duels++; b.duels++;
    history.push({ a: a.id, b: b.id, s, da: r.da, db: r.db, t: i });
  }
  return { options, history, picks };
}

test('null bei weniger als 2 Optionen', () => {
  assert.equal(pickPair([], []), null);
  assert.equal(pickPair(mkOptions(1), []), null);
  assert.equal(pickPair(null, []), null);
});

test('liefert zwei verschiedene Optionen-Objekte aus der Eingabe', () => {
  const options = mkOptions(5);
  const p = pickPair(options, [], { rng: mulberry32(1) });
  assert.equal(p.length, 2);
  assert.notEqual(p[0].id, p[1].id);
  assert.ok(options.includes(p[0]) && options.includes(p[1]));
});

test('n = 2: Wiederholung erlaubt, Seiten werden zufällig vertauscht', () => {
  const options = mkOptions(2);
  const rng = mulberry32(7);
  const first = new Set();
  for (let i = 0; i < 200; i++) {
    const p = pickPair(options, [{ a: options[0].id, b: options[1].id, s: 1, da: 16, db: -16, t: 0 }],
      { rng, last: [options[0].id, options[1].id], avoid: [[options[0].id, options[1].id]] });
    assert.equal(pairKeyOf(p), key(options[0].id, options[1].id));
    first.add(p[0].id);
  }
  assert.equal(first.size, 2);
});

test('n = 3..8: 1000 Ziehungen, letztes Paar nie direkt wieder, Option nie dreimal in Folge (S6)', () => {
  for (let n = 3; n <= 8; n++) {
    const rng = mulberry32(100 + n);
    simulate(n, 1000, rng, undefined, (pair, history, picks) => {
      assert.notEqual(pair[0].id, pair[1].id);
      if (picks.length >= 1) {
        assert.notEqual(pairKeyOf(pair), pairKeyOf(picks.at(-1)), `n=${n}: Paar direkt wiederholt`);
      }
      if (picks.length >= 2) {
        const [p, q] = picks.slice(-2);
        for (const o of pair) {
          const inP = p.includes(o), inQ = q.includes(o);
          assert.ok(!(inP && inQ), `n=${n}: ${o.id} dreimal in Folge`);
        }
      }
    });
  }
});

test('n = 3..6: `last` aus übersprungenem Paar (nicht in der History) kommt nie direkt wieder', () => {
  for (let n = 3; n <= 6; n++) {
    const rng = mulberry32(200 + n);
    const options = mkOptions(n);
    const history = [];
    let last = null;
    for (let i = 0; i < 1000; i++) {
      const pair = pickPair(options, history, { rng, last });
      if (last) assert.notEqual(pairKeyOf(pair), key(last[0], last[1]), `n=${n}`);
      last = [pair[0].id, pair[1].id];
      if (rng() < 0.3) continue; // überspringen: History unverändert
      const [a, b] = pair;
      const r = applyResult(a.rating, b.rating, 1);
      a.rating = r.ra; b.rating = r.rb; a.duels++; b.duels++;
      history.push({ a: a.id, b: b.id, s: 1, da: r.da, db: r.db, t: i });
    }
  }
});

test('Default für `last` ist das Paar des letzten History-Eintrags', () => {
  const options = mkOptions(3, 2);
  const history = [{ a: options[0].id, b: options[1].id, s: 1, da: 0, db: 0, t: 0 }];
  for (let seed = 0; seed < 300; seed++) {
    const p = pickPair(options, history, { rng: mulberry32(seed) });
    assert.notEqual(pairKeyOf(p), key(options[0].id, options[1].id));
    const q = pickPair(options, history, { rng: mulberry32(seed), last: null });
    assert.notEqual(pairKeyOf(q), key(options[0].id, options[1].id));
  }
});

test('avoid nur als letzte Wahl', () => {
  // n = 4, last = AB; avoid = alle Paare außer CD → immer CD
  const options = mkOptions(4, 2);
  const [A, B, C, D] = options.map((o) => o.id);
  const avoid = [[A, C], [A, D], [B, C], [B, D]];
  for (let seed = 0; seed < 300; seed++) {
    const p = pickPair(options, [], { rng: mulberry32(seed), last: [A, B], avoid });
    assert.equal(pairKeyOf(p), key(C, D));
  }
  // n = 3, last = AB, avoid = AC und BC → kein anderes Paar: avoid wird genutzt, last nie
  const three = mkOptions(3, 2);
  const [X, Y, Z] = three.map((o) => o.id);
  const seen = new Set();
  for (let seed = 0; seed < 300; seed++) {
    const p = pickPair(three, [], { rng: mulberry32(seed), last: [X, Y], avoid: [[X, Z], [Y, Z]] });
    assert.notEqual(pairKeyOf(p), key(X, Y));
    seen.add(pairKeyOf(p));
  }
  assert.ok(seen.size >= 1);
});

test('bevorzugt Optionen mit wenigen Duellen (neue Option wird sofort einbezogen)', () => {
  const options = mkOptions(6, 6);
  options[5].duels = 0;
  options.forEach((o, i) => { o.rating = 1000 + 20 * (5 - i); });
  options[5].rating = 1000;
  let withNew = 0;
  for (let seed = 0; seed < 1000; seed++) {
    const p = pickPair(options, [], { rng: mulberry32(seed) });
    if (p.includes(options[5])) withNew++;
  }
  assert.equal(withNew, 1000);
});

test('Phase 1: nach 2·N Duellen hat jede Option mindestens 2 Duelle', () => {
  for (let n = 2; n <= 8; n++) {
    const { options } = simulate(n, 2 * n, mulberry32(300 + n));
    assert.ok(Math.min(...options.map((o) => o.duels)) >= 2, `n=${n}`);
  }
});

test('Phase 2 (Top-Fokus): obere Ränge bekommen mehr Duelle', () => {
  // feste Vorliebe: kleinere Nummer gewinnt immer
  const rng = mulberry32(42);
  const idx = (o) => Number(o.id.slice(2));
  const { options } = simulate(8, 400, rng, (a, b) => (idx(a) < idx(b) ? 1 : 0));
  const byRating = options.slice().sort((a, b) => b.rating - a.rating);
  assert.deepEqual(byRating.slice(0, 3).map(idx).sort(), [0, 1, 2]);
  const top = byRating.slice(0, 2).reduce((s, o) => s + o.duels, 0);
  const bottom = byRating.slice(-2).reduce((s, o) => s + o.duels, 0);
  assert.ok(top > bottom, `oben ${top} vs unten ${bottom}`);
});

test('meidet bereits gespielte Paare', () => {
  // n = 4, alle haben 2 Duelle; AB dreimal gespielt → AB kaum gewählt
  const options = mkOptions(4, 3);
  const [A, B, C, D] = options.map((o) => o.id);
  const history = [
    { a: A, b: B, s: 1, da: 0, db: 0, t: 1 }, { a: A, b: B, s: 1, da: 0, db: 0, t: 2 },
    { a: A, b: B, s: 1, da: 0, db: 0, t: 3 }, { a: C, b: D, s: 1, da: 0, db: 0, t: 4 },
  ];
  let ab = 0;
  for (let seed = 0; seed < 500; seed++) {
    if (pairKeyOf(pickPair(options, history, { rng: mulberry32(seed) })) === key(A, B)) ab++;
  }
  assert.equal(ab, 0);
});

test('deterministisch bei gleichem rng', () => {
  const a = simulate(6, 50, mulberry32(9)).history.map((d) => d.a + d.b);
  const b = simulate(6, 50, mulberry32(9)).history.map((d) => d.a + d.b);
  assert.deepEqual(a, b);
});
