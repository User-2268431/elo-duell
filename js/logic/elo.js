// Eigentümer: A – Elo-Formel und Rangfolge (docs/ARCHITEKTUR.md §4A). DOM-frei.
/** @typedef {import('../types.js').Option} Option */

export const START_RATING = 1000, K = 32;

/**
 * Erwartungswert 1/(1+10^((opp-own)/400)).
 * @param {number} own @param {number} opp @returns {number}
 */
export function expected(own, opp) {
  throw new Error('TODO');
}

/**
 * @param {number} ra @param {number} rb @param {1|0.5|0} sA Ergebnis aus Sicht von a
 * @param {number} [k]
 * @returns {{ra:number, rb:number, da:number, db:number}}
 */
export function applyResult(ra, rb, sA, k = K) {
  throw new Error('TODO');
}

/**
 * Zuerst duels>0 (rating ab, duels ab, name 'de'), danach duels==0 (isNew) nach name; rank = Position 1..n.
 * @param {Option[]} options
 * @returns {(Option & {rank:number, isNew:boolean})[]}
 */
export function rankOptions(options) {
  throw new Error('TODO');
}
