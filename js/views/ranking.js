// Eigentümer: C – View ranking (docs/ARCHITEKTUR.md §6, §7).
import { h, icon, fmtRating } from '../ui.js';
import { rankOptions } from '../logic/elo.js';
import { progress } from '../logic/stability.js';
import { images, loadImagesForList } from '../images.js';
import { t, fmtNumber } from '../i18n.js';

export default {
  title: () => t('common.ranking'),
  /** @param {HTMLElement} root @param {any} ctx @returns {void|(()=>void)} */
  render(root, ctx) {
    const { store, navigate } = ctx;
    const id = ctx.params.id;
    const enc = encodeURIComponent(id);
    const box = h('div', { class: 'stack rank-view' });
    root.append(box);

    /** @param {string} name */
    function rankImg(name) {
      const url = images.enabled() ? images.urlFor(name) : null;
      return url ? h('img', { class: 'rank-img', 'data-testid': 'rank-img', src: url, alt: name, decoding: 'async' }) : null;
    }

    function draw() {
      const list = store.getList(id);
      if (!list) { navigate('#/', { replace: true }); return; }
      const p = progress(list);
      const ranked = rankOptions(list.options);

      const hint = h('p', { class: ['card', 'rank-hint', `rank-hint-${p.level}`], 'data-testid': 'rank-hint' }, p.hint);

      const rows = ranked.map((o) => h('li', {
        class: ['rank-row', o.isNew && 'rank-row-new', !o.isNew && o.rank <= 3 && `rank-top rank-top-${o.rank}`],
        'data-testid': `rank-row-${o.rank}`,
      },
        h('span', { class: 'rank-place', 'aria-label': o.isNew ? t('rank.noPlace') : t('rank.placeN', { n: o.rank }) },
          o.isNew ? '–' : `${o.rank}.`),
        h('span', { class: 'rank-name-cell' },
          rankImg(o.name),
          h('span', { class: 'rank-name-text' },
            h('span', { class: 'rank-name', 'data-testid': 'rank-name' }, o.name),
            o.isNew ? h('span', { class: 'badge rank-badge-new', 'data-testid': 'rank-new' }, t('rank.new')) : null,
          ),
        ),
        h('span', { class: 'rank-rating', 'data-testid': 'rank-rating' }, fmtRating(o.rating)),
        h('span', { class: 'rank-duels', 'data-testid': 'rank-duels' }, fmtNumber(o.duels)),
      ));

      box.replaceChildren(
        hint,
        ranked.length
          ? h('section', { class: 'card rank-table', 'aria-label': t('common.ranking') },
            h('div', { class: 'rank-head', 'aria-hidden': 'true' },
              h('span', { class: 'rank-place' }, t('rank.place')),
              h('span', null, t('rank.name')),
              h('span', { class: 'rank-rating' }, t('rank.points')),
              h('span', { class: 'rank-duels' }, t('rank.duels')),
            ),
            h('ol', { class: 'rank-list' }, ...rows))
          : h('p', { class: 'card empty' }, t('rank.empty')),
        h('div', { class: 'bottom-bar' },
          h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'rank-share',
            on: { click: () => navigate(`#/teilen/${enc}`) } }, icon('share'), t('common.share')),
          h('button', { type: 'button', class: 'btn btn-block', 'data-testid': 'rank-duel',
            on: { click: () => navigate(`#/duell/${enc}`) } }, icon('play'), t('common.keepDueling')),
        ),
      );
    }

    draw();
    loadImagesForList(store, id);
    const unsubImages = images.subscribe(() => { if (root.contains(box)) draw(); });
    const unsub = store.subscribe(() => { if (root.contains(box)) draw(); });
    return () => { unsub(); unsubImages(); };
  },
};
