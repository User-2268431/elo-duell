// Eigentümer: D – View import (docs/ARCHITEKTUR.md §3 findMatch, §5, §6, §7).
import { h, toast, fmtDate } from '../ui.js';
import { decodeShare, toPartnerRanking, buildShareUrl, ShareError } from '../share/codec.js';
import { normalizeName } from '../logic/text.js';
import { progress } from '../logic/stability.js';
import { t } from '../i18n.js';

/** replaceChildren ohne null/false (natives replaceChildren würde „null“ schreiben). @param {Element} el @param {...any} kids */
const fill = (el, ...kids) => el.replaceChildren(...kids.filter((k) => k !== null && k !== undefined && k !== false));

/** In-App-Browser (eigener Speicher, nicht der von Chrome) grob am UA erkennen (§12). */
function isInAppBrowser() {
  const ua = globalThis.navigator?.userAgent || '';
  return /; wv\)|Instagram|FBAN|FBAV|Telegram/i.test(ua);
}

/** intent://-Link, der dieselbe Adresse in Chrome öffnet (nur Android). @param {string} url */
function chromeIntent(url) {
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=${u.protocol.replace(':', '')};package=com.android.chrome;end`;
}

export default {
  title: () => t('import.title'),
  /** @param {HTMLElement} root @param {any} ctx @returns {void|(()=>void)} */
  render(root, ctx) {
    const { store, navigate, getPendingImport, clearPendingImport } = ctx;
    let alive = true;
    const box = h('div', { class: 'stack import-view' }, h('p', { class: 'muted' }, t('import.reading')));
    root.append(box);

    /** @param {string} text @param {Node|null} [extra] */
    const showError = (text, extra = null) => {
      fill(box, 
        h('p', { class: 'card import-error', 'data-testid': 'import-error', role: 'alert' }, text),
        extra,
        h('div', { class: 'stack' },
          h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'import-scan',
            on: { click: () => navigate('#/scan') } }, t('import.scanOrPaste')),
          h('button', { type: 'button', class: 'btn btn-block', 'data-testid': 'import-home',
            on: { click: () => navigate('#/') } }, t('import.home')),
        ),
      );
    };

    const payload = getPendingImport();
    if (!payload) {
      showError(t('import.none'));
      return () => { alive = false; };
    }

    (async () => {
      /** @type {import('../types.js').ShareData} */ let share;
      try {
        share = await decodeShare(payload);
      } catch (err) {
        if (!alive) return;
        clearPendingImport();
        showError(err instanceof ShareError ? err.message : t('import.unreadable'));
        return;
      }
      if (!alive) return;
      if (share.d === store.getDevice().id) {
        clearPendingImport();
        showError(t('import.own'));
        return;
      }
      draw(share);
    })().catch((err) => {
      console.error(err);
      if (alive) showError(t('import.unreadable'));
    });

    /** @param {import('../types.js').ShareData} share */
    function draw(share) {
      const who = share.p || t('import.unknown');
      const partnerDuels = share.o.reduce((s, o) => s + o[2], 0);
      const match = store.findMatch(share);
      const target = match.list;

      /** Optionen von who, die in target fehlen. */
      const missing = target
        ? (() => {
          const have = new Set(target.options.map((/** @type {any} */ o) => normalizeName(o.name)));
          return share.o.map((o) => o[0]).filter((n) => !have.has(normalizeName(n)));
        })()
        : [];
      const addBox = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', class: 'import-check', 'data-testid': 'import-add-options' }));

      /** Abschluss gemäß §7 („Danach“). @param {string} listId */
      const finish = (listId) => {
        clearPendingImport();
        const enc = encodeURIComponent(listId);
        if (partnerDuels > 0) {
          /** @type {boolean|null} null = konnte nicht gespeichert werden */ let saved = null;
          try {
            saved = store.savePartner(listId, toPartnerRanking(share, Date.now()));
          } catch (err) {
            console.error(err);
          }
          const list = store.getList(listId);
          const own = list ? progress(list).level : 'start';
          // Toast nur „gespeichert“, wenn wirklich gespeichert (N2).
          const status = saved === null
            ? t('import.saveFailed', { who })
            : saved ? t('import.saved', { who }) : t('import.newer', { who });
          if (saved === null) {
            toast(status);
            navigate(`#/liste/${enc}`, { replace: true });
          } else if (own === 'start') {
            toast(t('import.duelNow', { status }));
            navigate(`#/duell/${enc}`, { replace: true });
          } else {
            toast(status);
            navigate(`#/vergleich/${enc}/${encodeURIComponent(share.d)}`, { replace: true });
          }
        } else {
          toast(t('import.listTaken'));
          navigate(`#/liste/${enc}`, { replace: true });
        }
      };

      /** In bestehende Liste übernehmen (ggf. vorher verknüpfen). @param {string} listId @param {boolean} link */
      const intoExisting = (listId, link) => {
        if (link) store.addAlias(listId, share.l);
        if (missing.length && addBox.checked) store.addOptions(listId, missing);
        finish(listId);
      };
      const asNew = () => {
        const list = store.createList(share.n || t('import.listOf', { who }), share.o.map((o) => o[0]), share.l);
        finish(list.id);
      };

      /** @type {(Node|null)[]} */
      const actions = [];
      if (match.kind === 'id' && target) {
        actions.push(h('p', { class: 'import-match' }, t('import.belongs', { name: target.name })));
        actions.push(h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'import-accept',
          on: { click: () => intoExisting(target.id, false) } }, t('import.accept')));
      } else if (match.kind === 'name' && target) {
        actions.push(h('p', { class: 'import-match' }, t('import.looksLike', { name: target.name })));
        actions.push(h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': `import-link-${target.id}`,
          on: { click: () => intoExisting(target.id, true) } }, t('import.link', { name: target.name })));
        actions.push(h('button', { type: 'button', class: 'btn btn-block', 'data-testid': 'import-new',
          on: { click: asNew } }, t('import.asNew')));
      } else {
        actions.push(h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'import-new',
          on: { click: asNew } }, t('import.asNewTake')));
      }

      const sharedUrl = buildShareUrl(payload || '', location);
      fill(box, 
        isInAppBrowser()
          ? h('section', { class: 'card stack import-webview', 'data-testid': 'import-webview' },
            h('p', {}, t('import.webview')),
            h('a', { class: 'btn btn-block', href: chromeIntent(sharedUrl) }, t('import.openChrome')))
          : null,
        h('section', { class: 'card stack import-card' },
          h('h2', { class: 'import-summary', 'data-testid': 'import-summary' },
            t(partnerDuels > 0 ? 'import.summaryRanking' : 'import.summaryList',
              { who, name: share.n, options: t('common.options', { n: share.o.length }) })),
          h('p', { class: 'muted' }, partnerDuels > 0
            ? `${t('common.duels', { n: partnerDuels / 2 })} · ${t('list.asOf', { date: fmtDate(share.t * 1000) })}`
            : `${t('import.noDuels')} · ${t('list.asOf', { date: fmtDate(share.t * 1000) })}`),
        ),
        missing.length
          ? h('label', { class: 'card import-add' }, addBox,
            h('span', {}, t('import.addMissing', { n: missing.length, who })))
          : null,
        h('div', { class: 'stack import-actions' }, ...actions,
          h('button', { type: 'button', class: 'btn btn-ghost btn-block', 'data-testid': 'import-cancel',
            on: { click: () => { clearPendingImport(); navigate('#/'); } } }, t('common.cancel'))),
      );
    }

    return () => { alive = false; };
  },
};
