// Eigentümer: C – View home (docs/ARCHITEKTUR.md §6, §7).
import { h, icon } from '../ui.js';
import { progress } from '../logic/stability.js';

/** @param {any} list */
function safeProgress(list) {
  try { return progress(list); } catch { return null; }
}

/** @param {number} n @param {string} one @param {string} many */
function plural(n, one, many) {
  return `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;
}

export default {
  title: 'Elo-Duell',
  /** @param {HTMLElement} root @param {any} ctx @returns {void|(()=>void)} */
  render(root, ctx) {
    const { store, navigate } = ctx;

    document.getElementById('bar-actions')?.append(
      h('button', {
        type: 'button', class: 'btn btn-ghost btn-icon', 'data-testid': 'home-settings', 'aria-label': 'Einstellungen',
        on: { click: () => navigate('#/einstellungen') },
      }, icon('gear', 24)),
    );

    const listBox = h('div', { class: 'lists-grid' });

    function draw() {
      const lists = store.listLists();
      if (!lists.length) {
        listBox.replaceChildren(h('div', { class: 'card empty lists-empty' },
          h('h2', null, 'Noch keine Listen'),
          h('p', null, 'Lege eine Liste an, zum Beispiel Urlaubsziele, Restaurants oder Filme – und finde im Duell heraus, was dir am besten gefällt.'),
        ));
        return;
      }
      listBox.replaceChildren(...lists.map((/** @type {any} */ list) => {
        const p = safeProgress(list);
        const n = list.options.length;
        const m = p ? p.duels : 0;
        return h('a', {
          href: `#/liste/${encodeURIComponent(list.id)}`, class: 'card lists-card', 'data-testid': `home-list-${list.id}`,
        },
          h('div', { class: 'lists-card-main' },
            h('h2', { class: 'lists-card-name' }, list.name),
            h('p', { class: 'lists-card-meta' },
              plural(n, 'Option', 'Optionen'), ' · ', plural(m, 'Duell', 'Duelle'),
              p && p.level === 'stabil' ? h('span', { class: 'badge lists-badge-ok' }, 'stabil') : null,
              list.partners?.length ? h('span', { class: 'badge' }, plural(list.partners.length, 'Partner', 'Partner')) : null,
            ),
            h('div', { class: ['bar', p?.level === 'stabil' && 'is-stable'], role: 'progressbar',
              'aria-label': 'Fortschritt', 'aria-valuemin': 0, 'aria-valuemax': 100,
              'aria-valuenow': Math.round((p?.ratio ?? 0) * 100), style: { '--p': p?.ratio ?? 0 } }, h('span')),
          ),
          h('span', { class: 'lists-card-chevron' }, icon('chevron', 22)),
        );
      }));
    }

    root.append(
      h('div', { class: 'stack lists-home' },
        listBox,
        h('div', { class: 'bottom-bar' },
          h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'home-new',
            on: { click: () => navigate('#/neu') } }, icon('plus'), 'Neue Liste'),
          h('button', { type: 'button', class: 'btn btn-block', 'data-testid': 'home-scan',
            on: { click: () => navigate('#/scan') } }, icon('scan'), 'QR scannen'),
        ),
      ),
    );
    draw();
    return store.subscribe(draw);
  },
};
