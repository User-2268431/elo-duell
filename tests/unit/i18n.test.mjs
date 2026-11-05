// Eigentümer: E – Tests für js/i18n.js und die Wörterbücher (Deutsch/Englisch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICTS, t, getLang, setLang, resolveLang, translator, fmtNumber, fmtDateTime } from '../../js/i18n.js';
import { progress } from '../../js/logic/stability.js';
import { defaultState, EXAMPLE_LIST_ID, EXAMPLE_LIST_ID_EN, validateState } from '../../js/data/schema.js';

/** @param {any} v @returns {string[]} */
const variants = (v) => (typeof v === 'object' ? [v.one, v.other] : [v]);
/** @param {string} s */
const placeholders = (s) => [...new Set(s.match(/\{\w+\}/g) || [])].sort();

test('beide Wörterbücher haben genau dieselben Schlüssel, keine leeren Texte', () => {
  const de = Object.keys(DICTS.de).sort();
  const en = Object.keys(DICTS.en).sort();
  assert.deepEqual(en, de);
  assert.ok(de.length > 100);
  for (const lang of /** @type {const} */ (['de', 'en'])) {
    for (const [k, v] of Object.entries(DICTS[lang])) {
      for (const s of variants(v)) assert.ok(typeof s === 'string' && s.trim(), `${lang}:${k} leer`);
    }
  }
});

test('Platzhalter und Pluralform sind in beiden Sprachen identisch', () => {
  for (const [k, dv] of Object.entries(DICTS.de)) {
    const ev = DICTS.en[k];
    assert.equal(typeof ev, typeof dv, `${k}: Plural nur in einer Sprache`);
    if (typeof dv === 'object') {
      assert.deepEqual(Object.keys(dv).sort(), ['one', 'other'], `${k} de`);
      assert.deepEqual(Object.keys(/** @type {any} */ (ev)).sort(), ['one', 'other'], `${k} en`);
    }
    const ph = placeholders(variants(dv).join(' '));
    assert.deepEqual(placeholders(variants(ev).join(' ')), ph, `${k}: Platzhalter`);
    if (typeof dv === 'object') assert.ok(ph.includes('{n}'), `${k}: Plural ohne {n}`);
  }
});

test('t: Platzhalter, Plural, Zahlenformat je Sprache, Rückfall auf Schlüssel', () => {
  assert.equal(getLang(), 'de');                       // Standard in Node ohne setLang
  assert.equal(t('common.duels', { n: 1 }), '1 Duell');
  assert.equal(t('common.duels', { n: 0 }), '0 Duelle');
  assert.equal(t('common.duels', { n: 1500 }), '1.500 Duelle');
  assert.equal(t('common.duels', { n: 1500 }, 'en'), '1,500 duels');
  assert.equal(t('common.options', { n: 1 }, 'en'), '1 option');
  assert.equal(t('list.compareWith', { name: 'Ben' }, 'en'), 'Compare with Ben');
  assert.equal(t('duel.question', undefined, 'en'), 'Which do you prefer?');
  assert.equal(t('gibt.es.nicht'), 'gibt.es.nicht');
  assert.equal(t('list.compareWith'), 'Vergleichen mit {name}');   // fehlender Parameter bleibt stehen
});

test('resolveLang/setLang: auto nach navigator.language, sonst Einstellung', () => {
  assert.equal(resolveLang('auto', 'de-AT'), 'de');
  assert.equal(resolveLang('auto', 'DE'), 'de');
  assert.equal(resolveLang('auto', 'en-US'), 'en');
  assert.equal(resolveLang('auto', 'fr-FR'), 'en');
  assert.equal(resolveLang(undefined, ''), 'en');
  assert.equal(resolveLang('de', 'en-US'), 'de');
  assert.equal(resolveLang('en', 'de-DE'), 'en');
  try {
    assert.equal(setLang('en'), 'en');
    assert.equal(t('duel.skip'), 'Skip');
    assert.equal(fmtNumber(1234.5), '1,234.5');
    assert.match(fmtDateTime(Date.UTC(2026, 10, 4, 12, 0)), /^04\/11\/2026/);
  } finally {
    setLang('de');
  }
  assert.equal(fmtNumber(1234.5), '1.234,5');
  assert.equal(fmtDateTime(NaN), '–');
});

test('stability: Deutsch als Standard, Englisch über injizierten Übersetzer, Schlüssel+Parameter', () => {
  const list = { options: [{ duels: 0 }, { duels: 0 }, { duels: 0 }] };
  const de = progress(list);
  const en = progress(list, translator('en'));
  assert.equal(de.hintKey, en.hintKey);
  assert.deepEqual(de.hintParams, en.hintParams);
  assert.equal(de.hint, t(de.hintKey, de.hintParams));
  assert.match(de.hint, /^Noch ca\. \d+ Duelle bis zur ersten Rangliste$/);
  assert.match(en.hint, /^About \d+ more duels until the first ranking$/);
  assert.equal(progress({ options: [] }, translator('en')).hint, 'Add at least two options');
});

test('Beispielliste je Sprache mit eigener fester ID; beide gültig', () => {
  const de = defaultState(1, 'de');
  const en = defaultState(1, 'en');
  assert.deepEqual(de.order, [EXAMPLE_LIST_ID]);
  assert.deepEqual(en.order, [EXAMPLE_LIST_ID_EN]);
  assert.equal(EXAMPLE_LIST_ID_EN, 'l_example01');
  assert.equal(en.lists[EXAMPLE_LIST_ID_EN].name, 'Holiday destinations');
  assert.deepEqual(en.lists[EXAMPLE_LIST_ID_EN].options.map((o) => o.name),
    ['Lisbon', 'Copenhagen', 'Rome', 'Bergen', 'Dolomites', 'Crete', 'Edinburgh', 'Baltic Sea']);
  assert.deepEqual(validateState(en), []);
  assert.equal(defaultState(1).order[0], EXAMPLE_LIST_ID);   // Node-Standard: Deutsch
});
