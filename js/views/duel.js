// Eigentümer: C – View duel (docs/ARCHITEKTUR.md §6, §7).
import { h, icon, toast } from '../ui.js';
import { pickPair } from '../logic/pairing.js';
import { progress } from '../logic/stability.js';

export default {
  title: 'Duell',
  /** @param {HTMLElement} root @param {any} ctx @returns {void|(()=>void)} */
  render(root, ctx) {
    const { store, navigate } = ctx;
    const id = ctx.params.id;
    const enc = encodeURIComponent(id);

    function emptyState() {
      const count = store.getList(id)?.options.length ?? 0;
      root.replaceChildren(h('div', { class: 'card empty stack duel-empty', 'data-testid': 'duel-empty' },
        h('h2', null, 'Noch nichts zu vergleichen'),
        h('p', null, count === 1
          ? 'Für ein Duell brauchst du mindestens zwei Optionen. Füge noch eine hinzu.'
          : 'Für ein Duell brauchst du mindestens zwei Optionen.'),
        h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'duel-empty-edit',
          on: { click: () => navigate(`#/liste/${enc}/bearbeiten`) } }, icon('plus'), 'Optionen hinzufügen'),
      ));
    }

    const list0 = store.getList(id);
    if (!list0) return;
    if (list0.options.length < 2) { emptyState(); return; }

    /* ---------- Sitzung (nur im Speicher der View) ---------- */
    /** @type {[string,string]|null} zuletzt gezeigtes Paar */ let lastShown = null;
    /** @type {[string,string][]} in dieser Sitzung übersprungen */ const avoid = [];
    /** @type {[string,string]|null} aktuell gezeigtes Paar (a, b) */ let current = null;

    /* ---------- Gerüst ---------- */
    const barFill = h('span');
    const bar = h('div', { class: 'bar duel-bar', role: 'progressbar', 'aria-label': 'Fortschritt',
      'aria-valuemin': 0, 'aria-valuemax': 100 }, barFill);
    const hint = h('p', { class: 'duel-hint' });
    const progressBox = h('div', { class: 'duel-progress', 'data-testid': 'duel-progress', 'data-duels': '0' }, bar, hint);

    const nameA = h('span', { class: 'duel-name' });
    const nameB = h('span', { class: 'duel-name' });
    const cardA = h('button', { type: 'button', class: 'duel-card duel-card-a', 'data-testid': 'duel-a',
      on: { click: () => decide(1) } }, nameA);
    const cardB = h('button', { type: 'button', class: 'duel-card duel-card-b', 'data-testid': 'duel-b',
      on: { click: () => decide(0) } }, nameB);

    const undoBtn = h('button', { type: 'button', class: 'btn duel-action', 'data-testid': 'duel-undo',
      on: { click: undo } }, icon('undo', 20), h('span', null, 'Rückgängig'));
    const actions = h('div', { class: 'duel-actions' },
      h('button', { type: 'button', class: 'btn duel-action', 'data-testid': 'duel-draw',
        on: { click: () => decide(0.5) } }, icon('equal', 20), h('span', null, 'Gleich gut')),
      h('button', { type: 'button', class: 'btn duel-action', 'data-testid': 'duel-skip',
        on: { click: skip } }, icon('skip', 20), h('span', null, 'Überspringen')),
      undoBtn,
    );

    const stableBox = h('div', { class: 'duel-stable-slot' });
    const question = h('h2', { class: 'duel-question' }, 'Was gefällt dir besser?');

    root.append(h('div', { class: 'duel-view' },
      h('div', { class: 'duel-top' }, progressBox, stableBox, question),
      h('div', { class: 'duel-cards' }, cardA, h('span', { class: 'duel-or', 'aria-hidden': 'true' }, 'oder'), cardB),
      actions,
    ));

    /* ---------- Ablauf ---------- */
    function getList() {
      const l = store.getList(id);
      if (!l) navigate('#/', { replace: true });
      return l;
    }

    /** @param {any} list @param {string} oid */
    const optName = (list, oid) => list.options.find((/** @type {any} */ o) => o.id === oid)?.name ?? '?';

    function updateStatus() {
      const list = getList();
      if (!list) return;
      const p = progress(list);
      progressBox.setAttribute('data-duels', String(p.duels));
      bar.classList.toggle('is-stable', p.level === 'stabil');
      bar.style.setProperty('--p', String(p.ratio));
      bar.setAttribute('aria-valuenow', String(Math.round(p.ratio * 100)));
      hint.textContent = p.hint;
      /** @type {HTMLButtonElement} */ (undoBtn).disabled = !list.history.length;
    }

    /** @param {[string,string]|null} pair */
    function show(pair) {
      const list = getList();
      if (!list) return;
      current = pair;
      if (!pair) { emptyState(); return; }
      nameA.textContent = optName(list, pair[0]);
      nameB.textContent = optName(list, pair[1]);
      for (const c of [cardA, cardB]) {
        c.classList.remove('duel-in');
        void c.offsetWidth; // Animation neu starten
        c.classList.add('duel-in');
      }
      updateStatus();
    }

    function next() {
      const list = getList();
      if (!list) return;
      /** @type {any} */ const opts = { avoid };
      if (lastShown) opts.last = lastShown;
      const pair = pickPair(list.options, list.history, opts);
      show(pair ? [pair[0].id, pair[1].id] : null);
    }

    /** @param {1|0.5|0} s */
    function decide(s) {
      if (!current) return;
      const [a, b] = current;
      lastShown = [a, b];
      store.recordDuel(id, a, b, s);
      const list = getList();
      if (!list) return;
      if (!list.stableShown && progress(list).level === 'stabil') showStable();
      next();
    }

    function skip() {
      if (!current) return;
      lastShown = [current[0], current[1]];
      avoid.push([current[0], current[1]]);
      next();
    }

    function undo() {
      const d = store.undoLastDuel(id);
      if (!d) { updateStatus(); return; }
      const list = getList();
      if (!list) return;
      toast(`Rückgängig: ${optName(list, d.a)} – ${optName(list, d.b)}`);
      show([d.a, d.b]);
    }

    function showStable() {
      store.setStableShown(id, true);
      stableBox.replaceChildren(h('div', { class: 'card duel-stable', 'data-testid': 'duel-stable', role: 'status' },
        h('p', { class: 'duel-stable-title' }, 'Rangliste ist jetzt aussagekräftig'),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'duel-stable-ranking',
            on: { click: () => navigate(`#/rangliste/${enc}`) } }, 'Rangliste ansehen'),
          h('button', { type: 'button', class: 'btn', 'data-testid': 'duel-stable-continue',
            on: { click: () => stableBox.replaceChildren() } }, 'Weiter duellieren'),
        ),
      ));
    }

    /** Tastatur: ↑/1 = oben, ↓/2 = unten, 0/= = gleich gut, Rücktaste = rückgängig. @param {KeyboardEvent} e */
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
      const t = /** @type {HTMLElement} */ (e.target);
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const map = /** @type {Record<string, ()=>void>} */ ({
        ArrowUp: () => decide(1), 1: () => decide(1), ArrowDown: () => decide(0), 2: () => decide(0),
        0: () => decide(0.5), '=': () => decide(0.5), Backspace: undo,
      });
      const fn = map[e.key];
      if (fn) { e.preventDefault(); fn(); }
    }
    document.addEventListener('keydown', onKey);

    next();
    return () => document.removeEventListener('keydown', onKey);
  },
};
