// Eigentümer: A – Paarbildung (docs/ARCHITEKTUR.md §4A).
// Harte Regeln: `last` (zuletzt gezeigtes Paar) ab n ≥ 3 nie direkt wieder; `avoid` nur als letzte Wahl.
// Heuristik: Top-Fokus (DECISIONS.md F2 = B, siehe docs/research/elo-abbruch.md §4).
/** @typedef {import('../types.js').Option} Option */
/** @typedef {import('../types.js').Duel} Duel */

const TOP_C = 3;          // Top-Fokus-Stärke (elo-abbruch.md §4)
const PHASE1_MIN = 2;     // erst jede Option 2 Duelle

const pairKey = (x, y) => (x < y ? `${x}\u0000${y}` : `${y}\u0000${x}`);
const isPair = (p) => Array.isArray(p) && p.length >= 2 && p[0] != null && p[1] != null;

/**
 * @param {Option[]} options
 * @param {Duel[]} history
 * @param {{last?:[string,string]|null, avoid?:[string,string][], rng?:()=>number}} [opts]
 * @returns {[Option, Option] | null} null bei weniger als 2 Optionen
 */
export function pickPair(options, history, opts = {}) {
  if (!Array.isArray(options) || options.length < 2) return null;
  const hist = Array.isArray(history) ? history : [];
  const rng = typeof opts?.rng === 'function' ? opts.rng : Math.random;
  const N = options.length;
  const id = options.map((o) => String(o.id));
  const g = options.map((o) => Math.max(0, Number(o.duels) || 0));
  const R = options.map((o) => (Number.isFinite(o.rating) ? o.rating : 1000));

  // Zuletzt gezeigte Paare: History (ältestes zuerst) plus `last`, falls es nicht der letzte Eintrag ist.
  const lastDuel = hist.length ? hist[hist.length - 1] : null;
  const histLast = lastDuel ? [String(lastDuel.a), String(lastDuel.b)] : null;
  const last = isPair(opts?.last) ? [String(opts.last[0]), String(opts.last[1])] : histLast;
  const shown = [];
  if (hist.length >= 2) { const d = hist[hist.length - 2]; shown.push([String(d.a), String(d.b)]); }
  if (histLast) shown.push(histLast);
  if (last && (!histLast || pairKey(...last) !== pairKey(...histLast))) shown.push(last);
  const lastKey = last ? pairKey(...last) : null;

  // S6: Optionen, die in den beiden zuletzt gezeigten Paaren vorkamen, nicht ein drittes Mal in Folge.
  const streak = new Set();
  if (shown.length >= 2) {
    const [p, q] = shown.slice(-2);
    for (const x of p) if (q.includes(x)) streak.add(x);
  }

  const avoid = new Set((Array.isArray(opts?.avoid) ? opts.avoid : []).filter(isPair)
    .map((p) => pairKey(String(p[0]), String(p[1]))));

  const playedCount = new Map();
  for (const d of hist) {
    if (!d) continue;
    const k = pairKey(String(d.a), String(d.b));
    playedCount.set(k, (playedCount.get(k) || 0) + 1);
  }

  const swap = (i, j) => (rng() < 0.5 ? [options[i], options[j]] : [options[j], options[i]]);
  if (N === 2) return swap(0, 1); // Wiederholung erlaubt

  // Top-Fokus: Bedarf je Option.
  const gmin = Math.min(...g);
  const phase1 = gmin < PHASE1_MIN;
  let need;
  if (phase1) {
    need = g.slice();
  } else {
    const order = g.map((_, i) => i).sort((i, j) => (R[j] - R[i]) || (i - j));
    const rank = new Array(N);
    order.forEach((i, p) => { rank[i] = p + 1; });
    need = g.map((x, i) => x + (TOP_C * (rank[i] - 1)) / (N - 1));
  }

  // Reihenfolge der Kandidaten für A (Phase 1: Zufall unter den wenigsten Duellen).
  const aScore = need.map((v) => v + (phase1 ? 0.999 * rng() : 0.3 * rng()));
  const aOrder = g.map((_, i) => i).sort((i, j) => aScore[i] - aScore[j]);
  const bNoise = g.map(() => 0.5 * rng());

  const cost = (A, j) => Math.abs(R[A] - R[j]) / 100
    + (phase1 ? g[j] - gmin : Math.max(0, need[j] - need[A]))
    + 3 * (playedCount.get(pairKey(id[A], id[j])) || 0)
    + bNoise[j];

  // Stufen: zuerst ohne avoid und ohne S6-Verstoß, dann S6 lockern, dann avoid, dann beides.
  const tiers = [
    { useAvoid: true, useStreak: true },
    { useAvoid: true, useStreak: false },
    { useAvoid: false, useStreak: true },
    { useAvoid: false, useStreak: false },
  ];
  for (const { useAvoid, useStreak } of tiers) {
    for (const A of aOrder) {
      if (useStreak && streak.has(id[A])) continue;
      let best = -1, bestCost = Infinity;
      for (let j = 0; j < N; j++) {
        if (j === A || id[j] === id[A]) continue;
        const k = pairKey(id[A], id[j]);
        if (k === lastKey) continue;
        if (useAvoid && avoid.has(k)) continue;
        if (useStreak && streak.has(id[j])) continue;
        const c = cost(A, j);
        if (c < bestCost) { bestCost = c; best = j; }
      }
      if (best >= 0) return swap(A, best);
    }
  }
  return null; // nur bei doppelten IDs denkbar
}
