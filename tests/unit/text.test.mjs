// Eigentümer: A – Tests für js/logic/text.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, parseOptionLines } from '../../js/logic/text.js';

test('normalizeName: NFC, trim, Leerraum, Kleinschreibung', () => {
  assert.equal(normalizeName('  Köln   Hbf\t'), 'köln hbf');
  assert.equal(normalizeName('Köln'), normalizeName('Köln'));
  assert.equal(normalizeName('STRASSE'), 'strasse');
  assert.equal(normalizeName('ÄÖÜ'), 'äöü');
  assert.equal(normalizeName(''), '');
});

test('parseOptionLines: eine Option pro Zeile, leere Zeilen weg, trim', () => {
  assert.deepEqual(parseOptionLines('Rom\n\n  Kreta  \r\nBergen\r\n   \n'), ['Rom', 'Kreta', 'Bergen']);
  assert.deepEqual(parseOptionLines(''), []);
});

test('parseOptionLines: Aufzählungszeichen werden immer entfernt', () => {
  assert.deepEqual(parseOptionLines('- Rom\n* Kreta\n• Bergen\n•Oslo\n– Lissabon'), ['Rom', 'Kreta', 'Bergen', 'Oslo', 'Lissabon']);
  assert.deepEqual(parseOptionLines('- Rom'), ['Rom']);
  assert.deepEqual(parseOptionLines('-\n*\nRom'), ['Rom']);
  assert.deepEqual(parseOptionLines('-5 Grad'), ['-5 Grad']);
});

test('parseOptionLines: „1. FC Köln“ allein bleibt unverändert', () => {
  assert.deepEqual(parseOptionLines('1. FC Köln'), ['1. FC Köln']);
  assert.deepEqual(parseOptionLines('1. FC Köln\nBayern München\nWerder Bremen'), ['1. FC Köln', 'Bayern München', 'Werder Bremen']);
});

test('parseOptionLines: Nummern ab zwei nummerierten Zeilen entfernt', () => {
  assert.deepEqual(parseOptionLines('1. Rom\n2. Kreta\n3) Bergen'), ['Rom', 'Kreta', 'Bergen']);
  assert.deepEqual(parseOptionLines('1) Rom\n2)Kreta'), ['Rom', 'Kreta']);
  assert.deepEqual(parseOptionLines('1. 1. FC Köln\n2. Bayern'), ['1. FC Köln', 'Bayern']);
  assert.deepEqual(parseOptionLines('- 1. Rom\n- 2. Kreta'), ['Rom', 'Kreta']);
  assert.deepEqual(parseOptionLines('2024 Urlaub\n1.5 Liter'), ['2024 Urlaub', '1.5 Liter']);
});

test('parseOptionLines: Duplikate über normalizeName, erste Schreibweise bleibt', () => {
  assert.deepEqual(parseOptionLines('Rom\nrom\n ROM \nKöln\nKöln\nRom  Stadt\nrom stadt'), ['Rom', 'Köln', 'Rom Stadt']);
});

test('parseOptionLines: auf 120 Zeichen gekürzt, Emoji nicht zerschnitten', () => {
  const long = 'x'.repeat(130);
  const [r] = parseOptionLines(long);
  assert.equal(r.length, 120);
  assert.deepEqual(parseOptionLines('y'.repeat(120)), ['y'.repeat(120)]);
  const emoji = '😀'.repeat(125);
  const [e] = parseOptionLines(emoji);
  assert.equal(Array.from(e).length, 120);
  assert.equal(e, '😀'.repeat(120));
  // nach dem Kürzen identisch → Duplikat
  assert.equal(parseOptionLines('a'.repeat(121) + '\n' + 'a'.repeat(125)).length, 1);
});

test('parseOptionLines: Ausgabe in NFC', () => {
  assert.deepEqual(parseOptionLines('Köln'), ['Köln']);
});
