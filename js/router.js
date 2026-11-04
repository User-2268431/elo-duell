// Eigentümer: C – Hash-Router (docs/ARCHITEKTUR.md §4C, §6).
// Commit 0: minimaler, harmloser Platzhalter (rendert die passende View, kein Import-Handling). C ersetzt ihn.
/** @typedef {{title:string|((ctx:any)=>string), render(root:HTMLElement, ctx:any): void|(()=>void)}} View */
/** @typedef {{pattern:string, view:View, parent?:(p:Record<string,string>)=>string}} Route */

/** @type {Route[]} */ let routesRef = [];
/** @type {any} */ let ctxRef = {};
/** @type {null|(()=>void)} */ let cleanup = null;

/** @param {string} hash @returns {{route:Route, params:Record<string,string>}|null} */
function match(hash) {
  const segs = hash.replace(/^#/, '').split('/');
  for (const route of routesRef) {
    const ps = route.pattern.replace(/^#/, '').split('/');
    if (ps.length !== segs.length) continue;
    /** @type {Record<string,string>} */ const params = {};
    if (ps.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = decodeURIComponent(segs[i])), true) : p === segs[i]))) {
      return { route, params };
    }
  }
  return null;
}

function render() {
  if (!location.hash || location.hash === '#') history.replaceState(null, '', '#/');
  const m = match(location.hash) || match('#/');
  if (!m) return;
  const root = /** @type {HTMLElement} */ (document.getElementById('app'));
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } }
  root.replaceChildren();
  const ctx = { ...ctxRef, params: m.params };
  const view = m.route.view;
  const title = typeof view.title === 'function' ? view.title(ctx) : view.title;
  const titleEl = document.querySelector('[data-testid="app-title"]');
  if (titleEl) titleEl.textContent = title;
  const back = /** @type {HTMLButtonElement|null} */ (document.querySelector('[data-testid="app-back"]'));
  if (back) {
    back.hidden = !m.route.parent;
    back.onclick = m.route.parent ? () => navigate(/** @type {any} */ (m.route.parent)(m.params)) : null;
  }
  cleanup = view.render(root, ctx) || null;
}

/** @param {Route[]} routes @param {any} ctxBase @returns {void} */
export function startRouter(routes, ctxBase) {
  routesRef = routes;
  ctxRef = ctxBase;
  window.addEventListener('hashchange', render);
  render();
}

/** @param {string} hash @param {{replace?:boolean}} [opts] @returns {void} */
export function navigate(hash, opts = {}) {
  if (opts.replace) location.replace(hash); else location.hash = hash;
}

/** Setzt das Pending-Payload (sessionStorage elo-duell:import) und navigiert nach #/import. @param {string} payload */
export function openImport(payload) {
  throw new Error('TODO');
}

/** @returns {string|null} */
export function getPendingImport() {
  return null;
}

/** @returns {void} */
export function clearPendingImport() {}
