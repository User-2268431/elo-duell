// Eigentümer: C – View list (Zentrale einer Liste) (docs/ARCHITEKTUR.md §6, §7).
import { h, icon, fmtDate } from '../ui.js';
import { progress } from '../logic/stability.js';

/** @param {number} n @param {string} one @param {string} many */
function plural(n, one, many) {
  return `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;
}

export default {
  /** @param {any} ctx */
  title: (ctx) => ctx.store.getList(ctx.params.id)?.name || 'Liste',
  /** @param {HTMLElement} root @param {any} ctx @returns {void|(()=>void)} */
  render(root, ctx) {
    const { store, navigate } = ctx;
    const id = ctx.params.id;
    const enc = encodeURIComponent(id);

    document.getElementById('bar-actions')?.append(
      h('button', {
        type: 'button', class: 'btn btn-ghost btn-icon', 'data-testid': 'list-edit', 'aria-label': 'Liste bearbeiten',
        on: { click: () => navigate(`#/liste/${enc}/bearbeiten`) },
      }, icon('pencil', 22)),
    );

    const box = h('div', { class: 'stack lists-hub' });
    root.append(box);

    function draw() {
      const list = store.getList(id);
      if (!list) { navigate('#/', { replace: true }); return; }
      const titleEl = document.querySelector('[data-testid="app-title"]');
      if (titleEl) titleEl.textContent = list.name;

      const n = list.options.length;
      const p = progress(list);
      const tooFew = n < 2;

      const progressCard = h('section', { class: 'card stack lists-progress', 'data-testid': 'list-progress' },
        h('div', { class: 'lists-progress-head' },
          h('span', { class: 'lists-progress-num' }, plural(n, 'Option', 'Optionen')),
          h('span', { class: 'muted' }, plural(p.duels, 'Duell', 'Duelle')),
        ),
        h('div', { class: ['bar', p.level === 'stabil' && 'is-stable'], role: 'progressbar', 'aria-label': 'Fortschritt',
          'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p.ratio * 100), style: { '--p': p.ratio } }, h('span')),
        h('p', { class: 'lists-hint' }, p.hint),
      );

      const partners = Array.isArray(list.partners) ? list.partners : [];
      const partnerSection = h('section', { class: 'stack lists-partners' },
        h('h2', { class: 'lists-section-title' }, 'Vergleichen'),
        partners.length
          ? h('div', { class: 'stack lists-partner-list' }, ...partners.map((/** @type {any} */ pr) =>
            h('button', { type: 'button', class: 'btn btn-block lists-partner', 'data-testid': `list-compare-${pr.deviceId}`,
              on: { click: () => navigate(`#/vergleich/${enc}/${encodeURIComponent(pr.deviceId)}`) } },
              h('span', { class: 'lists-partner-name' }, `Vergleichen mit ${pr.name || 'Partner'}`),
              h('span', { class: 'lists-partner-date muted' }, `Stand ${fmtDate(pr.sentAt)}`),
            )))
          : h('p', { class: 'card lists-partner-none muted' }, 'Noch keine Rangliste empfangen – lass dir den QR-Code zeigen'),
      );

      box.replaceChildren(
        progressCard,
        tooFew ? h('p', { class: 'card lists-warn' }, 'Füge mindestens zwei Optionen hinzu, um zu duellieren. ',
          h('a', { href: `#/liste/${enc}/bearbeiten` }, 'Optionen hinzufügen')) : null,
        h('div', { class: 'stack lists-actions' },
          h('button', { type: 'button', class: 'btn btn-primary btn-block lists-duel-btn', 'data-testid': 'list-duel',
            on: { click: () => navigate(`#/duell/${enc}`) } }, icon('swords', 24), 'Duellieren'),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn', 'data-testid': 'list-ranking',
              on: { click: () => navigate(`#/rangliste/${enc}`) } }, icon('list'), 'Rangliste'),
            h('button', { type: 'button', class: 'btn', 'data-testid': 'list-share',
              on: { click: () => navigate(`#/teilen/${enc}`) } }, icon('share'), 'Teilen'),
          ),
        ),
        partnerSection,
      );
    }

    draw();
    return store.subscribe(() => { if (root.contains(box)) draw(); });
  },
};
