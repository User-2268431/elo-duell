// Eigentümer: A – Paarbildung (docs/ARCHITEKTUR.md §4A).
// Harte Regeln: `last` (zuletzt gezeigtes Paar) ab n ≥ 3 nie direkt wieder; `avoid` nur als letzte Wahl.
// Heuristik: Top-Fokus (DECISIONS.md F2 = B, siehe docs/research/elo-abbruch.md §4).
/** @typedef {import('../types.js').Option} Option */
/** @typedef {import('../types.js').Duel} Duel */

/**
 * @param {Option[]} options
 * @param {Duel[]} history
 * @param {{last?:[string,string]|null, avoid?:[string,string][], rng?:()=>number}} [opts]
 * @returns {[Option, Option] | null} null bei weniger als 2 Optionen
 */
export function pickPair(options, history, opts = {}) {
  throw new Error('TODO');
}
