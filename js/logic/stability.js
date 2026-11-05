// Eigentümer: A – Stabilitätsanzeige (docs/ARCHITEKTUR.md §4A).
// Rahmen fest (M = Σduels/2, level/remaining/ratio/hint); Inhalt von thresholds(): DECISIONS.md F1 = A (docs/research/elo-abbruch.md §3).
import { t } from '../i18n.js';

/**
 * @param {number} n Anzahl Optionen
 * @returns {{prelimDuels:number, prelimMin:number, stableDuels:number, stableMin:number, targetDuels:number}}
 */
export function thresholds(n) {
  const N = Math.max(0, Math.floor(Number(n) || 0));
  const dStab = N <= 10 ? 4 : (N <= 30 ? 5 : 6);
  const prelimDuels = Math.ceil(1.5 * N);
  const stableDuels = Math.ceil((dStab * N) / 2);
  return { prelimDuels, prelimMin: 2, stableDuels, stableMin: 3, targetDuels: stableDuels };
}

/**
 * Hinweistext: Schlüssel + Parameter (hintKey/hintParams) und fertiger Text über den injizierbaren Übersetzer
 * `tr` (Standard: js/i18n.js t in der aktuellen UI-Sprache; ohne setLang Deutsch, z. B. in Node-Tests).
 * @param {{options:{duels:number}[]}} listLike List oder {options: partner.options}
 * @param {(key:string, params?:Record<string,any>)=>string} [tr]
 * @returns {{duels:number, n:number, avg:number, minDuels:number, level:'start'|'vorlaeufig'|'stabil',
 *   ratio:number, remaining:number, hint:string, hintKey:string, hintParams:Record<string,number>}}
 */
export function progress(listLike, tr = t) {
  const options = Array.isArray(listLike?.options) ? listLike.options : [];
  const g = options.map((o) => Math.max(0, Number(o?.duels) || 0));
  const n = g.length;
  const M = g.reduce((s, x) => s + x, 0) / 2;
  const avg = n > 0 ? (2 * M) / n : 0;
  const minDuels = n > 0 ? Math.min(...g) : 0;

  if (n < 2) {
    return { duels: M, n, avg, minDuels, level: 'start', ratio: 0, remaining: 0,
      hint: tr('hint.tooFew'), hintKey: 'hint.tooFew', hintParams: {} };
  }

  const th = thresholds(n);
  const fehlt = (m) => Math.ceil(g.reduce((s, x) => s + Math.max(0, m - x), 0) / 2);
  /** @type {'start'|'vorlaeufig'|'stabil'} */
  let level = 'start';
  if (M >= th.stableDuels && minDuels >= th.stableMin) level = 'stabil';
  else if (M >= th.prelimDuels && minDuels >= th.prelimMin) level = 'vorlaeufig';

  let remaining = 0;
  if (level === 'start') remaining = Math.max(th.prelimDuels - M, fehlt(th.prelimMin));
  else if (level === 'vorlaeufig') remaining = Math.max(th.stableDuels - M, fehlt(th.stableMin));
  remaining = Math.max(0, Math.ceil(remaining));
  const ratio = th.targetDuels > 0 ? Math.min(1, M / th.targetDuels) : 0;

  let hintKey;
  if (level === 'stabil') {
    hintKey = 'hint.stable';
  } else if (level === 'vorlaeufig') {
    hintKey = 'hint.provisional';
  } else if (minDuels === 0 && M > 0 && g.every((x) => x === 0 || x >= th.prelimMin)) {
    // Nur neu hinzugefügte Optionen fehlen noch (elo-abbruch.md §3).
    hintKey = 'hint.newOption';
  } else {
    hintKey = 'hint.start';
  }
  const hintParams = { n: remaining };
  return { duels: M, n, avg, minDuels, level, ratio, remaining, hint: tr(hintKey, hintParams), hintKey, hintParams };
}
