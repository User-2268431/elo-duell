// Eigentümer: A – Textnormalisierung und Einfüge-Parser (docs/ARCHITEKTUR.md §4A). DOM-frei.

const MAX_LEN = 120;
// Aufzählungszeichen: • ◦ ▪ ‣ · immer; -, *, – (Gedankenstrich) nur mit folgendem Leerraum („-5 Grad“ bleibt).
const BULLET_RE = /^(?:[•◦▪‣·]\s*|[-*–]\s+)/u;
const ONLY_BULLETS_RE = /^[-*•◦▪‣·–]+$/u;
// Nummerierung „1.“ / „1)“ mit folgendem Leerraum, bzw. „1)“ direkt vor Text.
const NUMBER_RE = /^\d{1,4}(?:[.)]\s+|\)(?=\S))/u;

/**
 * NFC, trim, Leerraum zusammenfassen, toLocaleLowerCase('de').
 * @param {string} s @returns {string}
 */
export function normalizeName(s) {
  return String(s ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('de');
}

/** Kürzt auf höchstens max Zeichen (Codepoints, keine halben Surrogatpaare). */
function truncate(s, max) {
  const chars = Array.from(s);
  return chars.length <= max ? s : chars.slice(0, max).join('').trimEnd();
}

/**
 * Eine Option pro Zeile; Aufzählungszeichen immer entfernen, Nummern nur bei ≥ 2 so beginnenden Zeilen;
 * leere Zeilen weg, Duplikate (normalizeName) weg, auf 120 Zeichen kürzen.
 * @param {string} text @returns {string[]}
 */
export function parseOptionLines(text) {
  const lines = String(text ?? '')
    .split(/\r\n|\r|\n/u)
    .map((l) => l.normalize('NFC').replace(/\s+/gu, ' ').trim())
    .map((l) => (ONLY_BULLETS_RE.test(l) ? '' : l.replace(BULLET_RE, '').trim()))
    .filter((l) => l !== '');
  const numbered = lines.filter((l) => NUMBER_RE.test(l)).length;
  const out = [];
  const seen = new Set();
  for (let line of lines) {
    if (numbered >= 2) line = line.replace(NUMBER_RE, '').trim();
    line = truncate(line, MAX_LEN);
    if (line === '') continue;
    const key = normalizeName(line);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}
