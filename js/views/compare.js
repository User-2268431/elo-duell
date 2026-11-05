// Eigentümer: D – View compare (docs/ARCHITEKTUR.md §4A Vergleichsregeln, §6, §7).
import { h, toast, confirmDialog, fmtDate } from '../ui.js';
import { compareRankings, excludedThreshold } from '../logic/compare.js';
import { progress } from '../logic/stability.js';
import { t } from '../i18n.js';

/** replaceChildren ohne null/false (natives replaceChildren würde „null“ schreiben). @param {Element} el @param {...any} kids */
const fill = (el, ...kids) => el.replaceChildren(...kids.filter((k) => k !== null && k !== undefined && k !== false));

/** @typedef {import('../logic/compare.js').CmpItem} CmpItem */

/** @param {any} ctx */
function partnerOf(ctx) {
  const list = ctx.store.getList(ctx.params.id);
  const partner = list?.partners?.find((/** @type {any} */ p) => p.deviceId === ctx.params.partner);
  return { list, partner };
}

export default {
  /** @param {any} ctx */
  title: (ctx) => {
    const { partner } = partnerOf(ctx);
    return partner ? t('cmp.titleWith', { name: partner.name || t('common.partner') }) : t('cmp.title');
  },
  /** @param {HTMLElement} root @param {any} ctx @returns {void|(()=>void)} */
  render(root, ctx) {
    const { store, navigate } = ctx;
    const id = ctx.params.id;
    const enc = encodeURIComponent(id);
    const box = h('div', { class: 'stack cmp-view' });
    root.append(box);
    let leaving = false;

    function draw() {
      if (leaving) return;
      const { list, partner } = partnerOf(ctx);
      if (!list) { navigate('#/', { replace: true }); return; }
      if (!partner) {
        toast(t('cmp.notFound'));
        navigate(`#/liste/${enc}`, { replace: true });
        return;
      }
      const who = partner.name || t('common.partner');
      const res = compareRankings(list.options, partner.options);
      const m = res.common;
      const thr = excludedThreshold(m);
      const partial = res.onlyMine.length > 0 || res.onlyTheirs.length > 0;

      /** @param {CmpItem} it */
      const places = (it) => t('cmp.places', { a: it.rankA, b: it.rankB, who }) + (partial ? ` ${t('cmp.ofCommon', { n: m })}` : '');
      /** Veto: nur eine Person hat die Option in der unteren Gruppe. @param {CmpItem} it */
      const vetoText = (it) => {
        const lowA = it.rankA > m - thr, lowB = it.rankB > m - thr;
        if (lowA && !lowB) return t('cmp.vetoMine');
        if (lowB && !lowA) return t('cmp.vetoTheirs', { who });
        return it.veto ? t('cmp.vetoOne') : null;
      };

      /**
       * @param {'favorites'|'excluded'|'talk'} key @param {string} heading @param {string} intro
       * @param {CmpItem[]} items @param {string} emptyText @param {boolean} markVeto
       */
      const section = (key, heading, intro, items, emptyText, markVeto) =>
        h('section', { class: `card stack cmp-section cmp-${key}`, 'data-testid': `cmp-${key}` },
          h('div', {}, h('h2', { class: 'cmp-heading' }, heading), h('p', { class: 'cmp-intro muted' }, intro)),
          items.length
            ? h('ol', { class: 'cmp-items' }, ...items.map((it, i) => {
              const veto = markVeto ? vetoText(it) : null;
              return h('li', { class: ['cmp-item', veto && 'is-veto'], 'data-testid': `cmp-${key}-item-${i}`, 'data-name': it.name },
                h('span', { class: 'cmp-name' }, it.name),
                h('span', { class: 'cmp-places muted' }, places(it)),
                veto ? h('span', { class: 'badge cmp-veto' }, veto) : null,
              );
            }))
            : h('p', { class: 'cmp-empty muted', 'data-testid': `cmp-empty-${key}` }, emptyText),
        );

      // Hinweise bei zu wenigen Duellen (§7)
      const ownLevel = progress(list).level;
      const partnerLevel = progress({ options: partner.options }).level;
      const hint = ownLevel === 'start' || partnerLevel === 'start'
        ? h('section', { class: 'card stack cmp-hint', 'data-testid': 'cmp-hint' },
          ownLevel === 'start' ? h('p', {}, t('cmp.hintOwn')) : null,
          ownLevel === 'start'
            ? h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'cmp-hint-duel',
              on: { click: () => navigate(`#/duell/${enc}`) } }, t('cmp.hintDuel'))
            : null,
          partnerLevel === 'start' ? h('p', {}, t('cmp.hintPartner', { who })) : null,
        )
        : null;

      const onlyPart = partial
        ? h('details', { class: 'card cmp-only' },
          h('summary', { class: 'cmp-only-summary' }, t('cmp.onlySummary', { who })),
          h('div', { class: 'stack cmp-only-body' },
            h('div', {},
              h('h3', {}, t('cmp.onlyMine', { n: res.onlyMine.length })),
              res.onlyMine.length
                ? h('ul', { class: 'cmp-only-list', 'data-testid': 'cmp-only-mine' }, ...res.onlyMine.map((n) => h('li', {}, n)))
                : h('p', { class: 'muted', 'data-testid': 'cmp-only-mine' }, '–')),
            h('div', {},
              h('h3', {}, t('cmp.onlyTheirs', { who, n: res.onlyTheirs.length })),
              res.onlyTheirs.length
                ? h('ul', { class: 'cmp-only-list', 'data-testid': 'cmp-only-theirs' }, ...res.onlyTheirs.map((n) => h('li', {}, n)))
                : h('p', { class: 'muted', 'data-testid': 'cmp-only-theirs' }, '–')),
          ),
        )
        : null;

      const removeBtn = h('button', { type: 'button', class: 'btn btn-ghost cmp-remove', 'data-testid': 'cmp-remove-partner',
        on: { click: async () => {
          const ok = await confirmDialog({
            title: t('cmp.removeTitle'), text: t('cmp.removeText', { who }),
            okLabel: t('cmp.removeOk'), danger: true,
          });
          if (!ok) return;
          leaving = true;
          store.removePartner(id, partner.deviceId);
          toast(t('cmp.removed', { who }));
          navigate(`#/liste/${enc}`, { replace: true });
        } } }, t('cmp.remove'));

      fill(box, 
        h('div', { class: 'cmp-head row' },
          h('p', { class: 'cmp-date muted', 'data-testid': 'cmp-partner-date' }, t('cmp.date', { who, date: fmtDate(partner.sentAt) })),
          removeBtn,
        ),
        hint,
        m < 2
          ? h('p', { class: 'card cmp-too-few', 'data-testid': 'cmp-too-few' }, t('cmp.tooFew'))
          : null,
        m >= 2 ? section('favorites', t('cmp.fav'), t('cmp.favIntro'), res.favorites, t('cmp.favEmpty'), false) : null,
        m >= 2 ? section('excluded', t('cmp.excl'), t('cmp.exclIntro'), res.excluded, t('cmp.exclEmpty'), true) : null,
        m >= 2 ? section('talk', t('cmp.talk'), t('cmp.talkIntro'), res.talk, t('cmp.talkEmpty'), true) : null,
        onlyPart,
        h('button', { type: 'button', class: 'btn btn-primary btn-block cmp-share-back', 'data-testid': 'cmp-share-back',
          on: { click: () => navigate(`#/teilen/${enc}`) } }, t('cmp.shareBack', { who })),
      );
    }

    draw();
    return store.subscribe(() => { if (root.contains(box)) draw(); });
  },
};
