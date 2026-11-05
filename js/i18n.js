// Eigentümer: C – Übersetzung Deutsch/Englisch (t, getLang, setLang, Zahlen-/Datumsformat). DOM-frei bis auf <html lang>.
// Wörterbücher: js/i18n/de.js, js/i18n/en.js (flache Schlüssel). Ohne setLang() gilt Deutsch (Node-Tests).
import de from './i18n/de.js';
import en from './i18n/en.js';

/** @typedef {'de'|'en'} Lang */
/** @typedef {'auto'|'de'|'en'} LangSetting */

export const DICTS = /** @type {Record<Lang, Record<string, string|{one:string, other:string}>>} */ ({ de, en });
/** Zahlen und Datum: Deutsch de-DE, Englisch en-GB (britische Schreibweise auch in den Texten). */
export const LOCALES = /** @type {Record<Lang, string>} */ ({ de: 'de-DE', en: 'en-GB' });

/** @type {Lang} */ let lang = 'de';

/**
 * @param {any} setting 'auto' | 'de' | 'en'
 * @param {string} [navLang] navigator.language
 * @returns {Lang}
 */
export function resolveLang(setting, navLang) {
  if (setting === 'de' || setting === 'en') return setting;
  return String(navLang || '').toLowerCase().startsWith('de') ? 'de' : 'en';
}

/** @returns {Lang} */
export function getLang() { return lang; }

/** @returns {string} 'de-DE' | 'en-GB' */
export function getLocale() { return LOCALES[lang]; }

/**
 * Setzt die Sprache aus der Einstellung ('auto' wertet navigator.language aus) und <html lang>.
 * @param {any} setting @returns {Lang}
 */
export function setLang(setting) {
  lang = resolveLang(setting, globalThis.navigator?.language);
  if (globalThis.document?.documentElement) document.documentElement.lang = lang;
  return lang;
}

/** @param {number} n @param {Intl.NumberFormatOptions} [opts] @returns {string} */
export function fmtNumber(n, opts) {
  return Number(n).toLocaleString(getLocale(), opts);
}

/** @param {number} ms @returns {string} z. B. „04.11.2026, 22:35“ / „04/11/2026, 22:35“ */
export function fmtDateTime(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleString(getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Übersetzt einen Schlüssel. Platzhalter {name}; Zahlen werden je Sprache formatiert.
 * Plural: Eintrag {one, other}, gewählt über params.n (1 → one).
 * Fehlt ein Schlüssel in der aktuellen Sprache, gilt Deutsch, sonst der Schlüssel selbst.
 * @param {string} key @param {Record<string, any>} [params] @param {Lang} [forLang] @returns {string}
 */
export function t(key, params, forLang) {
  const l = forLang || lang;
  let v = DICTS[l][key] ?? DICTS.de[key];
  if (v === undefined) return key;
  if (typeof v === 'object') v = Number(params?.n) === 1 ? v.one : v.other;
  if (!params) return v;
  return v.replace(/\{(\w+)\}/g, (m, k) => {
    if (!(k in params)) return m;
    const p = params[k];
    return typeof p === 'number' ? Number(p).toLocaleString(LOCALES[l]) : String(p);
  });
}

/** Übersetzer für eine feste Sprache (z. B. für Logik-Module). @param {Lang} l */
export const translator = (l) => (/** @type {string} */ key, /** @type {any} */ params) => t(key, params, l);
