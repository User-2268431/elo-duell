// Eigentümer: A – Stabilitätsanzeige (docs/ARCHITEKTUR.md §4A).
// Rahmen fest (M = Σduels/2, level/remaining/ratio/hint); Inhalt von thresholds(): OFFEN F1, Entscheidung folgt in DECISIONS.md.

/**
 * @param {number} n Anzahl Optionen
 * @returns {{prelimDuels:number, prelimMin:number, stableDuels:number, stableMin:number, targetDuels:number}}
 */
export function thresholds(n) {
  throw new Error('TODO');
}

/**
 * @param {{options:{duels:number}[]}} listLike List oder {options: partner.options}
 * @returns {{duels:number, n:number, avg:number, minDuels:number, level:'start'|'vorlaeufig'|'stabil',
 *   ratio:number, remaining:number, hint:string}}
 */
export function progress(listLike) {
  throw new Error('TODO');
}
