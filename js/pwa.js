// Eigentümer: E – SW-Registrierung und Update-Hinweis (docs/ARCHITEKTUR.md §4E, §9).

/**
 * Registriert ./sw.js (Scope ./); wartender SW → onUpdateReady(apply).
 * apply(): erst dann 'controllerchange' abonnieren (einmalig reload), dann postMessage({type:'SKIP_WAITING'}).
 * @param {{onUpdateReady:(apply:()=>void)=>void}} opts
 * @returns {void}
 */
export function initPwa(opts) {
  // Commit 0: harmloser Platzhalter (noch keine Registrierung).
}
