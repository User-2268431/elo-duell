// Eigentümer: C – Hash-Router (docs/ARCHITEKTUR.md §4C, §6).
import { toast } from './ui.js';
import { t } from './i18n.js';

/** @typedef {{title:string|((ctx:any)=>string), render(root:HTMLElement, ctx:any): void|(()=>void)}} View */
/** @typedef {{pattern:string, view:View, parent?:(p:Record<string,string>)=>string}} Route */

const IMPORT_KEY = 'elo-duell:import';

/** @type {Route[]} */ let routesRef = [];
/** @type {any} */ let ctxRef = {};
/** @type {null|(()=>void)} */ let cleanup = null;
/** Fallback, falls sessionStorage nicht nutzbar ist. @type {string|null} */ let memPending = null;
let started = false;

/** @param {string} s */
function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** @param {string} hash @returns {{route:Route, params:Record<string,string>}|null} */
function match(hash) {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '') || '/';
  const segs = path.split('/');
  for (const route of routesRef) {
    const ps = (route.pattern.replace(/^#/, '').replace(/\/+$/, '') || '/').split('/');
    if (ps.length !== segs.length) continue;
    /** @type {Record<string,string>} */ const params = {};
    const ok = ps.every((p, i) => {
      if (p.startsWith(':')) {
        if (!segs[i]) return false;
        params[p.slice(1)] = safeDecode(segs[i]);
        return true;
      }
      return p === segs[i];
    });
    if (ok) return { route, params };
  }
  return null;
}

/** Schreibt ein Import-Payload aus dem Hash (#i=…) nach sessionStorage und ersetzt den Eintrag durch #/import. */
function captureImportHash() {
  const hash = location.hash;
  if (!hash.startsWith('#i=')) return false;
  setPending(hash.slice(3));
  history.replaceState(null, '', '#/import');
  return true;
}

/** @param {string} payload */
function setPending(payload) {
  memPending = payload;
  try { sessionStorage.setItem(IMPORT_KEY, payload); } catch { /* nur im Speicher */ }
}

function goHomeNotFound() {
  toast(t('common.listNotFound'));
  history.replaceState(null, '', '#/');
  render();
}

function render() {
  captureImportHash();
  if (!location.hash || location.hash === '#') history.replaceState(null, '', '#/');
  const m = match(location.hash);
  if (!m) { goHomeNotFound(); return; }
  // Routen mit :id beziehen sich immer auf eine Liste. Nachschlagen nur über eigene Schlüssel (store.getList prüft
  // Object.hasOwn), damit „#/liste/toString“ oder „#/liste/__proto__“ nicht auf Object.prototype landen (N1).
  if (m.params.id !== undefined && ctxRef.store) {
    let exists = false;
    try { exists = !!ctxRef.store.getList(m.params.id); } catch (e) { console.error(e); }
    if (!exists) { goHomeNotFound(); return; }
  }

  const root = /** @type {HTMLElement} */ (document.getElementById('app'));
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } }
  cleanup = null;
  root.replaceChildren();
  document.querySelectorAll('dialog.dlg').forEach((d) => d.remove());

  const ctx = { ...ctxRef, params: m.params };
  const view = m.route.view;
  let title = 'Elo-Duell';
  try { title = (typeof view.title === 'function' ? view.title(ctx) : view.title) || 'Elo-Duell'; } catch (e) { console.error(e); }
  const titleEl = document.querySelector('[data-testid="app-title"]');
  if (titleEl) titleEl.textContent = title;
  document.title = title === 'Elo-Duell' ? 'Elo-Duell' : `${title} – Elo-Duell`;

  const back = /** @type {HTMLButtonElement|null} */ (document.querySelector('[data-testid="app-back"]'));
  if (back) {
    const parent = m.route.parent;
    back.hidden = !parent;
    back.setAttribute('aria-label', t('common.back'));
    back.onclick = parent ? () => navigate(parent(m.params)) : null;
  }
  document.getElementById('bar-actions')?.replaceChildren(); // Views dürfen hier Kopfzeilen-Buttons ablegen
  root.dataset.route = m.route.pattern;
  window.scrollTo(0, 0);
  try {
    cleanup = view.render(root, ctx) || null;
  } catch (e) {
    console.error(e);
    root.replaceChildren();
    const p = document.createElement('p');
    p.className = 'card';
    p.textContent = t('common.viewFailed');
    root.append(p);
  }
}

/** @param {Route[]} routes @param {any} ctxBase @returns {void} */
export function startRouter(routes, ctxBase) {
  routesRef = routes;
  ctxRef = ctxBase;
  if (!started) {
    started = true;
    window.addEventListener('hashchange', render);
  }
  render();
}

/** @param {string} hash @param {{replace?:boolean}} [opts] @returns {void} */
export function navigate(hash, opts = {}) {
  const target = hash.startsWith('#') ? hash : `#${hash}`;
  if (opts.replace) {
    history.replaceState(null, '', target);
    render();
  } else if (location.hash === target) {
    render();
  } else {
    location.hash = target; // löst hashchange → render aus
  }
}

/** Setzt das Pending-Payload (sessionStorage elo-duell:import) und navigiert nach #/import. @param {string} payload */
export function openImport(payload) {
  setPending(payload);
  navigate('#/import');
}

/** @returns {string|null} */
export function getPendingImport() {
  try {
    const v = sessionStorage.getItem(IMPORT_KEY);
    if (v !== null) return v;
  } catch { /* Fallback unten */ }
  return memPending;
}

/** @returns {void} */
export function clearPendingImport() {
  memPending = null;
  try { sessionStorage.removeItem(IMPORT_KEY); } catch { /* egal */ }
}
