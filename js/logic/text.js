// Eigentümer: A – Textnormalisierung und Einfüge-Parser (docs/ARCHITEKTUR.md §4A). DOM-frei.

/**
 * NFC, trim, Leerraum zusammenfassen, toLocaleLowerCase('de').
 * @param {string} s @returns {string}
 */
export function normalizeName(s) {
  throw new Error('TODO');
}

/**
 * Eine Option pro Zeile; Aufzählungszeichen immer entfernen, Nummern nur bei ≥ 2 so beginnenden Zeilen;
 * leere Zeilen weg, Duplikate (normalizeName) weg, auf 120 Zeichen kürzen.
 * @param {string} text @returns {string[]}
 */
export function parseOptionLines(text) {
  throw new Error('TODO');
}
