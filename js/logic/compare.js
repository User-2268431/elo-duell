// Eigentümer: A – Ranglistenvergleich (docs/ARCHITEKTUR.md §4A).
// Schwelle excludedThreshold(m) = max(1, floor(m/5)) (DECISIONS.md F3 = B).
import { normalizeName } from './text.js';

/** @typedef {{name:string, rankA:number, rankB:number, ratingA:number, ratingB:number, veto:boolean}} CmpItem */
/** @typedef {{common:number, favorites:CmpItem[], excluded:CmpItem[], talk:CmpItem[],
 *   onlyMine:string[], onlyTheirs:string[]}} CompareResult */

const collator = new Intl.Collator('de');
const byName = (a, b) => collator.compare(a.name, b.name);
const toNum = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

/** Normalisierter Index; bei doppelten Namen zählt der erste Eintrag. */
function index(entries) {
  const map = new Map();
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || typeof e.name !== 'string') continue;
    const key = normalizeName(e.name);
    if (key === '' || map.has(key)) continue;
    map.set(key, { name: e.name, rating: Math.round(toNum(e.rating)) });
  }
  return map;
}

/** Wettkampf-Ränge (1, 2, 2, 4): 1 + Anzahl strikt höherer Werte. */
function competitionRanks(values) {
  return values.map((v) => 1 + values.filter((w) => w > v).length);
}

/** Namen nach Wertung absteigend, dann Name. */
function sortedNames(entries) {
  return entries.slice().sort((a, b) => (b.rating - a.rating) || byName(a, b)).map((e) => e.name);
}

/**
 * @param {{name:string,rating:number,duels:number}[]} mine
 * @param {{name:string,rating:number,duels:number}[]} theirs
 * @returns {CompareResult}
 */
export function compareRankings(mine, theirs) {
  const a = index(mine);
  const b = index(theirs);
  const keys = [...a.keys()].filter((k) => b.has(k));
  const m = keys.length;
  const onlyMine = sortedNames([...a].filter(([k]) => !b.has(k)).map(([, e]) => e));
  const onlyTheirs = sortedNames([...b].filter(([k]) => !a.has(k)).map(([, e]) => e));
  if (m < 2) return { common: m, favorites: [], excluded: [], talk: [], onlyMine, onlyTheirs };

  const ratingsA = keys.map((k) => a.get(k).rating);
  const ratingsB = keys.map((k) => b.get(k).rating);
  const ranksA = competitionRanks(ratingsA);
  const ranksB = competitionRanks(ratingsB);
  const base = keys.map((k, i) => ({
    name: a.get(k).name, rankA: ranksA[i], rankB: ranksB[i], ratingA: ratingsA[i], ratingB: ratingsB[i],
  }));

  const limit = m - excludedThreshold(m);
  const isExcluded = (x) => x.rankA > limit || x.rankB > limit;
  const minR = (x) => Math.min(x.ratingA, x.ratingB);
  const maxR = (x) => Math.max(x.ratingA, x.ratingB);
  const diff = (x) => Math.abs(x.rankA - x.rankB);

  const excluded = base.filter(isExcluded)
    .sort((x, y) => (minR(x) - minR(y)) || byName(x, y))
    .map((x) => ({ ...x, veto: false }));

  const favorites = base.filter((x) => !isExcluded(x))
    .sort((x, y) => (minR(y) - minR(x)) || (maxR(y) - maxR(x)) || byName(x, y))
    .slice(0, Math.min(5, Math.ceil(m / 3)))
    .map((x) => ({ ...x, veto: false }));

  const talk = base.filter((x) => diff(x) >= 2)
    .sort((x, y) => (diff(y) - diff(x)) || (Math.min(x.rankA, x.rankB) - Math.min(y.rankA, y.rankB)) || byName(x, y))
    .slice(0, 5)
    .map((x) => ({ ...x, veto: isExcluded(x) }));

  return { common: m, favorites, excluded, talk, onlyMine, onlyTheirs };
}

/**
 * @param {number} m Größe der gemeinsamen Menge
 * @returns {number} t = Anzahl „unterer“ Ränge (≥ 1 für m ≥ 2)
 */
export function excludedThreshold(m) {
  return Math.max(1, Math.floor((Number(m) || 0) / 5));
}
