// Eigentümer: C – View home (docs/ARCHITEKTUR.md §6, §7).
import { h, icon } from '../ui.js';
import { progress } from '../logic/stability.js';
import { t } from '../i18n.js';

/** @param {any} list */
function safeProgress(list) {
  try { return progress(list); } catch { return null; }
}

export default {
  title: 'Elo-Duell',
  /** @param {HTMLElement} root @param {any} ctx @returns {void|(()=>void)} */
  render(root, ctx) {
    const { store, navigate } = ctx;

    document.getElementById('bar-actions')?.append(
      h('button', {
        type: 'button', class: 'btn btn-ghost btn-icon', 'data-testid': 'home-settings', 'aria-label': t('settings.title'),
        on: { click: () => navigate('#/einstellungen') },
      }, icon('gear', 24)),
    );

    const listBox = h('div', { class: 'lists-grid' });

    function draw() {
      const lists = store.listLists();
      if (!lists.length) {
        listBox.replaceChildren(h('div', { class: 'card empty lists-empty' },
          h('h2', null, t('home.empty.title')),
          h('p', null, t('home.empty.text')),
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
              t('common.options', { n }), ' · ', t('common.duels', { n: m }),
              p && p.level === 'stabil' ? h('span', { class: 'badge lists-badge-ok' }, t('common.stable')) : null,
              list.partners?.length ? h('span', { class: 'badge' }, t('home.partners', { n: list.partners.length })) : null,
            ),
            h('div', { class: ['bar', p?.level === 'stabil' && 'is-stable'], role: 'progressbar',
              'aria-label': t('common.progress'), 'aria-valuemin': 0, 'aria-valuemax': 100,
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
            on: { click: () => navigate('#/neu') } }, icon('plus'), t('home.new')),
          h('button', { type: 'button', class: 'btn btn-block', 'data-testid': 'home-scan',
            on: { click: () => navigate('#/scan') } }, icon('scan'), t('scan.title')),
        ),
      ),
    );
    draw();
    return store.subscribe(draw);
  },
};
