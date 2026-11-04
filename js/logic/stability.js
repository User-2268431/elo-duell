// Eigentümer: A – Stabilitätsanzeige (docs/ARCHITEKTUR.md §4A).
// Rahmen fest (M = Σduels/2, level/remaining/ratio/hint); Inhalt von thresholds(): DECISIONS.md F1 = A (docs/research/elo-abbruch.md §3).

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

const fmt = (x) => x.toLocaleString('de-DE');
const duelWord = (x) => (x === 1 ? 'Duell' : 'Duelle');

/**
 * @param {{options:{duels:number}[]}} listLike List oder {options: partner.options}
 * @returns {{duels:number, n:number, avg:number, minDuels:number, level:'start'|'vorlaeufig'|'stabil',
 *   ratio:number, remaining:number, hint:string}}
 */
export function progress(listLike) {
  const options = Array.isArray(listLike?.options) ? listLike.options : [];
  const g = options.map((o) => Math.max(0, Number(o?.duels) || 0));
  const n = g.length;
  const M = g.reduce((s, x) => s + x, 0) / 2;
  const avg = n > 0 ? (2 * M) / n : 0;
  const minDuels = n > 0 ? Math.min(...g) : 0;

  if (n < 2) {
    return { duels: M, n, avg, minDuels, level: 'start', ratio: 0, remaining: 0,
      hint: 'Füge mindestens zwei Optionen hinzu' };
  }

  const t = thresholds(n);
  const fehlt = (m) => Math.ceil(g.reduce((s, x) => s + Math.max(0, m - x), 0) / 2);
  /** @type {'start'|'vorlaeufig'|'stabil'} */
  let level = 'start';
  if (M >= t.stableDuels && minDuels >= t.stableMin) level = 'stabil';
  else if (M >= t.prelimDuels && minDuels >= t.prelimMin) level = 'vorlaeufig';

  let remaining = 0;
  if (level === 'start') remaining = Math.max(t.prelimDuels - M, fehlt(t.prelimMin));
  else if (level === 'vorlaeufig') remaining = Math.max(t.stableDuels - M, fehlt(t.stableMin));
  remaining = Math.max(0, Math.ceil(remaining));
  const ratio = t.targetDuels > 0 ? Math.min(1, M / t.targetDuels) : 0;

  let hint;
  if (level === 'stabil') {
    hint = 'Rangliste stabil ✓ Weitere Duelle machen sie noch genauer.';
  } else if (level === 'vorlaeufig') {
    hint = `Rangliste vorläufig – noch ca. ${fmt(remaining)} ${duelWord(remaining)} bis zur stabilen Rangliste`;
  } else if (minDuels === 0 && M > 0 && g.every((x) => x === 0 || x >= t.prelimMin)) {
    // Nur neu hinzugefügte Optionen fehlen noch (elo-abbruch.md §3).
    hint = `Neue Option – noch ca. ${fmt(remaining)} ${duelWord(remaining)} bis zur ersten Rangliste`;
  } else {
    hint = `Noch ca. ${fmt(remaining)} ${duelWord(remaining)} bis zur ersten Rangliste`;
  }
  return { duels: M, n, avg, minDuels, level, ratio, remaining, hint };
}
