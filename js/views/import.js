// Eigentümer: D – View import (docs/ARCHITEKTUR.md §3 findMatch, §5, §6, §7).
import { h, toast, fmtDate } from '../ui.js';
import { decodeShare, toPartnerRanking, buildShareUrl, ShareError } from '../share/codec.js';
import { normalizeName } from '../logic/text.js';
import { progress } from '../logic/stability.js';

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

/** @param {number} n @param {string} one @param {string} many */
const plural = (n, one, many) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;

export default {
  title: 'Import',
  /** @param {HTMLElement} root @param {any} ctx @returns {void|(()=>void)} */
  render(root, ctx) {
    const { store, navigate, getPendingImport, clearPendingImport } = ctx;
    let alive = true;
    const box = h('div', { class: 'stack import-view' }, h('p', { class: 'muted' }, 'Wird gelesen …'));
    root.append(box);

    /** @param {string} text @param {Node|null} [extra] */
    const showError = (text, extra = null) => {
      fill(box, 
        h('p', { class: 'card import-error', 'data-testid': 'import-error', role: 'alert' }, text),
        extra,
        h('div', { class: 'stack' },
          h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'import-scan',
            on: { click: () => navigate('#/scan') } }, 'QR scannen oder Link einfügen'),
          h('button', { type: 'button', class: 'btn btn-block', 'data-testid': 'import-home',
            on: { click: () => navigate('#/') } }, 'Zur Übersicht'),
        ),
      );
    };

    const payload = getPendingImport();
    if (!payload) {
      showError('Kein Link zum Importieren gefunden.');
      return () => { alive = false; };
    }

    (async () => {
      /** @type {import('../types.js').ShareData} */ let share;
      try {
        share = await decodeShare(payload);
      } catch (err) {
        if (!alive) return;
        clearPendingImport();
        showError(err instanceof ShareError ? err.message : 'Der Link konnte nicht gelesen werden.');
        return;
      }
      if (!alive) return;
      if (share.d === store.getDevice().id) {
        clearPendingImport();
        showError('Das ist deine eigene Rangliste');
        return;
      }
      draw(share);
    })().catch((err) => {
      console.error(err);
      if (alive) showError('Der Link konnte nicht gelesen werden.');
    });

    /** @param {import('../types.js').ShareData} share */
    function draw(share) {
      const who = share.p || 'Unbekannt';
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
            ? `Rangliste von ${who} konnte nicht gespeichert werden`
            : saved ? `Rangliste von ${who} gespeichert` : `Du hast schon einen neueren Stand von ${who}`;
          if (saved === null) {
            toast(status);
            navigate(`#/liste/${enc}`, { replace: true });
          } else if (own === 'start') {
            toast(`${status} – duelliere jetzt selbst`);
            navigate(`#/duell/${enc}`, { replace: true });
          } else {
            toast(status);
            navigate(`#/vergleich/${enc}/${encodeURIComponent(share.d)}`, { replace: true });
          }
        } else {
          toast('Liste übernommen');
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
        const list = store.createList(share.n || `Liste von ${who}`, share.o.map((o) => o[0]), share.l);
        finish(list.id);
      };

      /** @type {(Node|null)[]} */
      const actions = [];
      if (match.kind === 'id' && target) {
        actions.push(h('p', { class: 'import-match' }, `Gehört zu deiner Liste „${target.name}“.`));
        actions.push(h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'import-accept',
          on: { click: () => intoExisting(target.id, false) } }, 'Übernehmen'));
      } else if (match.kind === 'name' && target) {
        actions.push(h('p', { class: 'import-match' }, `Sieht aus wie deine Liste „${target.name}“.`));
        actions.push(h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': `import-link-${target.id}`,
          on: { click: () => intoExisting(target.id, true) } }, `Mit Liste „${target.name}“ verknüpfen`));
        actions.push(h('button', { type: 'button', class: 'btn btn-block', 'data-testid': 'import-new',
          on: { click: asNew } }, 'Als neue Liste'));
      } else {
        actions.push(h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'import-new',
          on: { click: asNew } }, 'Als neue Liste übernehmen'));
      }

      const sharedUrl = buildShareUrl(payload || '', location);
      fill(box, 
        isInAppBrowser()
          ? h('section', { class: 'card stack import-webview', 'data-testid': 'import-webview' },
            h('p', {}, 'Du bist in einem In-App-Browser. Was du hier übernimmst, landet nicht in deiner Elo-Duell-App. Öffne den Link besser in Chrome (Menü ⋮ → „In Chrome öffnen“).'),
            h('a', { class: 'btn btn-block', href: chromeIntent(sharedUrl) }, 'In Chrome öffnen'))
          : null,
        h('section', { class: 'card stack import-card' },
          h('h2', { class: 'import-summary', 'data-testid': 'import-summary' },
            `${partnerDuels > 0 ? 'Rangliste' : 'Liste'} von ${who}: ${share.n} (${plural(share.o.length, 'Option', 'Optionen')})`),
          h('p', { class: 'muted' }, partnerDuels > 0
            ? `${plural(partnerDuels / 2, 'Duell', 'Duelle')} · Stand ${fmtDate(share.t * 1000)}`
            : `Noch ohne Duelle · Stand ${fmtDate(share.t * 1000)}`),
        ),
        missing.length
          ? h('label', { class: 'card import-add' }, addBox,
            h('span', {}, `${plural(missing.length, 'neue Option', 'neue Optionen')} von ${who} übernehmen`))
          : null,
        h('div', { class: 'stack import-actions' }, ...actions,
          h('button', { type: 'button', class: 'btn btn-ghost btn-block', 'data-testid': 'import-cancel',
            on: { click: () => { clearPendingImport(); navigate('#/'); } } }, 'Abbrechen')),
      );
    }

    return () => { alive = false; };
  },
};
