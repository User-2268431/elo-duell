// Eigentümer: C – View list (Zentrale einer Liste) (docs/ARCHITEKTUR.md §6, §7).
import { h, icon, fmtDate } from '../ui.js';
import { progress } from '../logic/stability.js';
import { loadImagesForList } from '../images.js';
import { t } from '../i18n.js';

export default {
  /** @param {any} ctx */
  title: (ctx) => ctx.store.getList(ctx.params.id)?.name || t('common.list'),
  /** @param {HTMLElement} root @param {any} ctx @returns {void|(()=>void)} */
  render(root, ctx) {
    const { store, navigate } = ctx;
    const id = ctx.params.id;
    const enc = encodeURIComponent(id);

    document.getElementById('bar-actions')?.append(
      h('button', {
        type: 'button', class: 'btn btn-ghost btn-icon', 'data-testid': 'list-edit', 'aria-label': t('common.editList'),
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
          h('span', { class: 'lists-progress-num' }, t('common.options', { n })),
          h('span', { class: 'muted' }, t('common.duels', { n: p.duels })),
        ),
        h('div', { class: ['bar', p.level === 'stabil' && 'is-stable'], role: 'progressbar', 'aria-label': t('common.progress'),
          'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p.ratio * 100), style: { '--p': p.ratio } }, h('span')),
        h('p', { class: 'lists-hint' }, p.hint),
      );

      const partners = Array.isArray(list.partners) ? list.partners : [];
      const partnerSection = h('section', { class: 'stack lists-partners' },
        h('h2', { class: 'lists-section-title' }, t('list.compare')),
        partners.length
          ? h('div', { class: 'stack lists-partner-list' }, ...partners.map((/** @type {any} */ pr) =>
            h('button', { type: 'button', class: 'btn btn-block lists-partner', 'data-testid': `list-compare-${pr.deviceId}`,
              on: { click: () => navigate(`#/vergleich/${enc}/${encodeURIComponent(pr.deviceId)}`) } },
              h('span', { class: 'lists-partner-name' }, t('list.compareWith', { name: pr.name || t('common.partner') })),
              h('span', { class: 'lists-partner-date muted' }, t('list.asOf', { date: fmtDate(pr.sentAt) })),
            )))
          : h('p', { class: 'card lists-partner-none muted' }, t('list.noPartner')),
      );

      box.replaceChildren(...[
        progressCard,
        tooFew ? h('p', { class: 'card lists-warn' }, t('list.tooFew') + ' ',
          h('a', { href: `#/liste/${enc}/bearbeiten` }, t('common.addOptions'))) : null,
        h('div', { class: 'stack lists-actions' },
          h('button', { type: 'button', class: 'btn btn-primary btn-block lists-duel-btn', 'data-testid': 'list-duel',
            on: { click: () => navigate(`#/duell/${enc}`) } }, icon('play', 24), t('list.duel')),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn', 'data-testid': 'list-ranking',
              on: { click: () => navigate(`#/rangliste/${enc}`) } }, icon('list'), t('common.ranking')),
            h('button', { type: 'button', class: 'btn', 'data-testid': 'list-share',
              on: { click: () => navigate(`#/teilen/${enc}`) } }, icon('share'), t('common.share')),
          ),
        ),
        partnerSection,
      ].filter(Boolean));
    }

    draw();
    loadImagesForList(store, id);   // Bilder im Hintergrund vorbereiten (für Duell und Rangliste)
    return store.subscribe(() => { if (root.contains(box)) draw(); });
  },
};
