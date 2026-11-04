// Eigentümer: A – Elo-Formel und Rangfolge (docs/ARCHITEKTUR.md §4A). DOM-frei.
/** @typedef {import('../types.js').Option} Option */

export const START_RATING = 1000, K = 32;

const collator = new Intl.Collator('de');

/**
 * Erwartungswert 1/(1+10^((opp-own)/400)).
 * @param {number} own @param {number} opp @returns {number}
 */
export function expected(own, opp) {
  return 1 / (1 + Math.pow(10, (opp - own) / 400));
}

/**
 * @param {number} ra @param {number} rb @param {1|0.5|0} sA Ergebnis aus Sicht von a
 * @param {number} [k]
 * @returns {{ra:number, rb:number, da:number, db:number}}
 */
export function applyResult(ra, rb, sA, k = K) {
  const da = k * (sA - expected(ra, rb));
  const db = -da; // = k * ((1 - sA) - expected(rb, ra)); Summe bleibt konstant
  return { ra: ra + da, rb: rb + db, da, db };
}

/**
 * Zuerst duels>0 (rating ab, duels ab, name 'de'), danach duels==0 (isNew) nach name; rank = Position 1..n.
 * @param {Option[]} options
 * @returns {(Option & {rank:number, isNew:boolean})[]}
 */
export function rankOptions(options) {
  const list = Array.isArray(options) ? options : [];
  const played = list.filter((o) => o.duels > 0);
  const fresh = list.filter((o) => !(o.duels > 0));
  played.sort((a, b) => (b.rating - a.rating) || (b.duels - a.duels) || collator.compare(a.name, b.name));
  fresh.sort((a, b) => collator.compare(a.name, b.name));
  return [...played, ...fresh].map((o, i) => ({ ...o, rank: i + 1, isNew: !(o.duels > 0) }));
}
