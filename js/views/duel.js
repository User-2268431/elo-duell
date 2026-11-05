// Eigentümer: C – View duel (docs/ARCHITEKTUR.md §6, §7).
import { h, icon, toast } from '../ui.js';
import { pickPair } from '../logic/pairing.js';
import { progress } from '../logic/stability.js';
import { images, loadImagesForList } from '../images.js';
import { t } from '../i18n.js';

/** Nach jeder Entscheidung (auch Gleich gut, Überspringen, Rückgängig) Eingaben so lange ignorieren (M1: Doppeltipp). */
export const INPUT_LOCK_MS = 250;

export default {
  title: () => t('common.duel'),
  /** @param {HTMLElement} root @param {any} ctx @returns {void|(()=>void)} */
  render(root, ctx) {
    const { store, navigate } = ctx;
    const id = ctx.params.id;
    const enc = encodeURIComponent(id);

    function emptyState() {
      const count = store.getList(id)?.options.length ?? 0;
      root.replaceChildren(h('div', { class: 'card empty stack duel-empty', 'data-testid': 'duel-empty' },
        h('h2', null, t('duel.empty.title')),
        h('p', null, count === 1 ? t('duel.empty.one') : t('duel.empty.text')),
        h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'duel-empty-edit',
          on: { click: () => navigate(`#/liste/${enc}/bearbeiten`) } }, icon('plus'), t('common.addOptions')),
      ));
    }

    const list0 = store.getList(id);
    if (!list0) return;
    if (list0.options.length < 2) { emptyState(); return; }

    /* ---------- Sitzung (nur im Speicher der View) ---------- */
    /** @type {[string,string]|null} zuletzt gezeigtes Paar */ let lastShown = null;
    /** @type {[string,string][]} in dieser Sitzung übersprungen */ const avoid = [];
    /** @type {[string,string]|null} aktuell gezeigtes Paar (a, b) */ let current = null;
    /** Zeitpunkt (performance.now), bis zu dem Eingaben ignoriert werden. */ let lockedUntil = 0;
    /** @type {ReturnType<typeof setTimeout>|null} */ let lockTimer = null;

    /* ---------- Gerüst ---------- */
    const barFill = h('span');
    const bar = h('div', { class: 'bar duel-bar', role: 'progressbar', 'aria-label': t('common.progress'),
      'aria-valuemin': 0, 'aria-valuemax': 100 }, barFill);
    const hint = h('p', { class: 'duel-hint' });
    const progressBox = h('div', { class: 'duel-progress', 'data-testid': 'duel-progress', 'data-duels': '0' }, bar, hint);

    const nameA = h('span', { class: 'duel-name' });
    const nameB = h('span', { class: 'duel-name' });
    // Bild (Wikipedia) oben in der Karte; ohne Bild bleibt die Karte wie bisher (img hidden).
    const imgA = /** @type {HTMLImageElement} */ (h('img', { class: 'duel-img', 'data-testid': 'duel-img-a', alt: '', hidden: true, decoding: 'async' }));
    const imgB = /** @type {HTMLImageElement} */ (h('img', { class: 'duel-img', 'data-testid': 'duel-img-b', alt: '', hidden: true, decoding: 'async' }));
    const cardA = h('button', { type: 'button', class: 'duel-card duel-card-a', 'data-testid': 'duel-a',
      on: { click: () => decide(1) } }, imgA, nameA);
    const cardB = h('button', { type: 'button', class: 'duel-card duel-card-b', 'data-testid': 'duel-b',
      on: { click: () => decide(0) } }, imgB, nameB);
    // Quellenangabe als Geschwister der Karte (kein Link im Button): ein Tipp darauf wertet nicht.
    const creditA = /** @type {HTMLAnchorElement} */ (h('a', { class: 'duel-credit', 'data-testid': 'duel-credit-a', target: '_blank', rel: 'noopener', hidden: true }, t('common.imageCredit')));
    const creditB = /** @type {HTMLAnchorElement} */ (h('a', { class: 'duel-credit', 'data-testid': 'duel-credit-b', target: '_blank', rel: 'noopener', hidden: true }, t('common.imageCredit')));
    const slotA = h('div', { class: 'duel-slot' }, cardA, creditA);
    const slotB = h('div', { class: 'duel-slot' }, cardB, creditB);

    const undoBtn = h('button', { type: 'button', class: 'btn duel-action', 'data-testid': 'duel-undo',
      on: { click: undo } }, icon('undo', 20), h('span', null, t('duel.undo')));
    const actions = h('div', { class: 'duel-actions' },
      h('button', { type: 'button', class: 'btn duel-action', 'data-testid': 'duel-draw',
        on: { click: () => decide(0.5) } }, icon('equal', 20), h('span', null, t('duel.draw'))),
      h('button', { type: 'button', class: 'btn duel-action', 'data-testid': 'duel-skip',
        on: { click: skip } }, icon('skip', 20), h('span', null, t('duel.skip'))),
      undoBtn,
    );

    const stableBox = h('div', { class: 'duel-stable-slot' });
    const question = h('h2', { class: 'duel-question' }, t('duel.question'));

    const view = h('div', { class: 'duel-view' },
      h('div', { class: 'duel-top' }, progressBox, stableBox, question),
      h('div', { class: 'duel-cards' }, slotA, h('span', { class: 'duel-or', 'aria-hidden': 'true' }, t('duel.or')), slotB),
      actions,
    );
    root.append(view);

    /* ---------- Eingabesperre (M1) ---------- */
    const clock = () => (globalThis.performance?.now ? performance.now() : Date.now());
    /** @returns {boolean} true, wenn die Eingabe angenommen wird (und sperrt danach für INPUT_LOCK_MS) */
    function accept() {
      const t = clock();
      if (t < lockedUntil) return false;
      lockedUntil = t + INPUT_LOCK_MS;
      // Klasse schaltet pointer-events ab: ein zweiter Tipp trifft nichts. Kein disabled, damit nichts flackert.
      view.classList.add('is-locked');
      if (lockTimer) clearTimeout(lockTimer);
      lockTimer = setTimeout(() => { lockTimer = null; view.classList.remove('is-locked'); }, INPUT_LOCK_MS);
      return true;
    }

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
      hint.title = p.hint;
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
      showImages();
      for (const c of [cardA, cardB]) {
        c.classList.remove('duel-in');
        void c.offsetWidth; // Animation neu starten
        c.classList.add('duel-in');
      }
      updateStatus();
    }

    /** @param {HTMLElement} card @param {HTMLImageElement} img @param {HTMLAnchorElement} credit @param {string} name */
    function setImage(card, img, credit, name) {
      const url = images.enabled() ? images.urlFor(name) : null;
      const e = url ? images.entry(name) : null;
      if (url && e) {
        if (img.getAttribute('src') !== url) img.src = url;
        img.alt = name;
        credit.href = e.page;
        credit.title = t('common.imageFrom', { title: e.title });
      } else {
        img.removeAttribute('src');
        img.alt = '';
      }
      img.hidden = credit.hidden = !(url && e);
      card.classList.toggle('has-img', !!(url && e));
    }
    function showImages() {
      if (!current) return;
      setImage(cardA, imgA, creditA, nameA.textContent || '');
      setImage(cardB, imgB, creditB, nameB.textContent || '');
    }
    const unsubImages = images.subscribe(showImages);
    loadImagesForList(store, id);

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
      if (!current || !accept()) return;
      const [a, b] = current;
      lastShown = [a, b];
      store.recordDuel(id, a, b, s);
      const list = getList();
      if (!list) return;
      if (!list.stableShown && progress(list).level === 'stabil') showStable();
      next();
    }

    function skip() {
      if (!current || !accept()) return;
      lastShown = [current[0], current[1]];
      avoid.push([current[0], current[1]]);
      next();
    }

    function undo() {
      if (!accept()) return;
      const d = store.undoLastDuel(id);
      if (!d) { updateStatus(); return; }
      const list = getList();
      if (!list) return;
      toast(t('duel.undone', { a: optName(list, d.a), b: optName(list, d.b) }));
      show([d.a, d.b]);
    }

    function hideStable() {
      stableBox.replaceChildren();
      view.classList.remove('has-stable');
    }

    function showStable() {
      store.setStableShown(id, true);
      view.classList.add('has-stable');
      stableBox.replaceChildren(h('div', { class: 'card duel-stable', 'data-testid': 'duel-stable', role: 'status' },
        h('p', { class: 'duel-stable-title' }, t('duel.stable')),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'duel-stable-ranking',
            on: { click: () => navigate(`#/rangliste/${enc}`) } }, t('duel.viewRanking')),
          h('button', { type: 'button', class: 'btn', 'data-testid': 'duel-stable-continue',
            on: { click: hideStable } }, t('common.keepDueling')),
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
    return () => {
      unsubImages();
      document.removeEventListener('keydown', onKey);
      if (lockTimer) clearTimeout(lockTimer);
    };
  },
};
