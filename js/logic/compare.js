// Eigentümer: A – Ranglistenvergleich (docs/ARCHITEKTUR.md §4A).
// Schwelle excludedThreshold(m): OFFEN F3, Entscheidung folgt in DECISIONS.md.

/** @typedef {{name:string, rankA:number, rankB:number, ratingA:number, ratingB:number, veto:boolean}} CmpItem */
/** @typedef {{common:number, favorites:CmpItem[], excluded:CmpItem[], talk:CmpItem[],
 *   onlyMine:string[], onlyTheirs:string[]}} CompareResult */

/**
 * @param {{name:string,rating:number,duels:number}[]} mine
 * @param {{name:string,rating:number,duels:number}[]} theirs
 * @returns {CompareResult}
 */
export function compareRankings(mine, theirs) {
  throw new Error('TODO');
}

/**
 * @param {number} m Größe der gemeinsamen Menge
 * @returns {number} t = Anzahl „unterer“ Ränge (≥ 1 für m ≥ 2)
 */
export function excludedThreshold(m) {
  throw new Error('TODO');
}
