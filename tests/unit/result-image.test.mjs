// Eigentümer: D – Tests für js/share/result-image.js (Auswahl, Texte, Dateiname, Umbruch) und generische Fehlermeldung (en).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickTop, resultTexts, resultFileName, wrapText, RESULT_W, RESULT_H } from '../../js/share/result-image.js';
import { compareRankings } from '../../js/logic/compare.js';
import { translator, setLang } from '../../js/i18n.js';
import { migrateWithReport, SchemaError } from '../../js/data/schema.js';

const opt = (name, rating) => ({ name, rating, duels: 4 });
const mine = [opt('A', 1100), opt('B', 1080), opt('C', 1060), opt('D', 1040), opt('E', 1020), opt('F', 1000), opt('G', 980), opt('H', 960), opt('I', 940)];
const theirs = [opt('B', 1100), opt('A', 1080), opt('C', 1060), opt('E', 1040), opt('D', 1020), opt('F', 1000), opt('G', 980), opt('H', 960), opt('I', 940)];

test('pickTop: höchstens 3 gemeinsame Favoriten in der Reihenfolge der Ansicht', () => {
  const res = compareRankings(mine, theirs);
  assert.ok(res.favorites.length >= 3);
  const top = pickTop(res.favorites);
  assert.deepEqual(top.map((r) => r.name), res.favorites.slice(0, 3).map((f) => f.name));
  assert.deepEqual(top.map((r) => r.place), [1, 2, 3]);
  assert.deepEqual(top[0], { place: 1, name: res.favorites[0].name, rankA: res.favorites[0].rankA, rankB: res.favorites[0].rankB });
  assert.equal(pickTop(res.favorites.slice(0, 2)).length, 2);
  assert.deepEqual(pickTop([]), []);
  assert.deepEqual(pickTop(/** @type {any} */ (null)), []);
  assert.equal(RESULT_W, 1080);
  assert.equal(RESULT_H, 1350);
});

test('resultTexts: Deutsch (Standard) und Englisch, Plural, Quellenzeile nur mit Fotos', () => {
  const favorites = [{ name: 'Rom', rankA: 2, rankB: 1, ratingA: 1, ratingB: 1, veto: false },
    { name: 'Kreta', rankA: 1, rankB: 3, ratingA: 1, ratingB: 1, veto: false }];
  const de = resultTexts({ listName: 'Urlaub', me: 'Ben', partner: 'Anna', favorites, photos: true });
  assert.equal(de.title, 'Urlaub');
  assert.equal(de.subtitle, 'Unsere Top 2 · Ben & Anna');
  assert.equal(de.rows[0].detail, 'Platz 2 bei dir · Platz 1 bei Anna');
  assert.equal(de.credit, 'Fotos: Wikipedia');
  assert.equal(de.footer, 'user-2268431.github.io/elo-duell');
  assert.equal(de.shareText, 'Unser gemeinsamer Endstand „Urlaub“: 1. Rom, 2. Kreta');
  const en = resultTexts({ listName: 'Trip', me: '', partner: 'Anna', favorites: favorites.slice(0, 1) }, translator('en'));
  assert.equal(en.subtitle, 'Our favourite · Me & Anna');
  assert.equal(en.rows[0].detail, 'Rank 2 for you · rank 1 for Anna');
  assert.equal(en.credit, '');
});

test('resultFileName je Sprache', () => {
  const d = new Date(2026, 10, 5, 23, 59);
  assert.equal(resultFileName(d, 'de'), 'elo-duell-ergebnis-2026-11-05.png');
  assert.equal(resultFileName(d, 'en'), 'elo-duel-result-2026-11-05.png');
});

test('wrapText: Umbruch, Trennen langer Wörter, Kürzen mit …', () => {
  const m = (/** @type {string} */ s) => Array.from(s).length * 10;   // 10 px je Zeichen
  assert.deepEqual(wrapText('Quattro Formaggi', 100, m, 2), ['Quattro', 'Formaggi']);
  assert.deepEqual(wrapText('Rom', 100, m, 2), ['Rom']);
  assert.deepEqual(wrapText('Donaudampfschifffahrt', 100, m, 3), ['Donaudampf', 'schifffahr', 't']);
  const cut = wrapText('eins zwei drei vier fünf sechs', 100, m, 2);
  assert.equal(cut.length, 2);
  assert.ok(cut[1].endsWith('…'));
  for (const l of cut) assert.ok(m(l) <= 100, l);
});

test('fehlerhafte Daten: Deutsch mit Feld-Details, Englisch nur generische Meldung', () => {
  const bad = { schema: 1 };
  assert.throws(() => migrateWithReport(bad), (e) => e instanceof SchemaError && /^Die Daten sind fehlerhaft: /.test(e.message));
  try {
    setLang('en');
    assert.throws(() => migrateWithReport(bad), (e) => e instanceof SchemaError && e.message === 'The data is faulty.');
  } finally {
    setLang('de');
  }
});
