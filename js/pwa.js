// Eigentümer: E – SW-Registrierung und Update-Hinweis (docs/ARCHITEKTUR.md §4E, §9).

/** Nachricht an den wartenden SW; muss zu sw.js passen. */
const SKIP_WAITING_MSG = Object.freeze({ type: 'SKIP_WAITING' });

/**
 * Registriert ./sw.js (Scope ./); wartender SW → onUpdateReady(apply).
 * apply(): erst dann 'controllerchange' abonnieren (einmalig reload), dann postMessage({type:'SKIP_WAITING'}).
 * Wegen clients.claim() wird vorher nie auf controllerchange gelauscht (sonst Reload beim ersten Besuch).
 * @param {{onUpdateReady:(apply:()=>void)=>void}} opts
 * @returns {void}
 */
export function initPwa(opts) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  const notify = typeof opts?.onUpdateReady === 'function' ? opts.onUpdateReady : fallbackBanner;

  let announced = false;
  /** @param {ServiceWorkerRegistration} reg */
  const announce = (reg) => {
    // Nur melden, wenn ein alter SW die Seite kontrolliert (sonst ist es die Erstinstallation).
    if (announced || !reg.waiting || !sw.controller) return;
    announced = true;
    let applied = false;
    const apply = () => {
      if (applied) return;
      applied = true;
      let reloaded = false;
      sw.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        location.reload();
      });
      const waiting = reg.waiting;
      if (waiting) waiting.postMessage(SKIP_WAITING_MSG);
      else location.reload(); // Wartender SW schon aktiv (z. B. anderer Tab) → einfach neu laden.
    };
    try { notify(apply); } catch (e) { console.error(e); }
  };

  const register = () => {
    sw.register('./sw.js', { scope: './' }).then((reg) => {
      announce(reg);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed') announce(reg);
        });
      });
      // Bei langer Laufzeit (installierte App) gelegentlich nach Updates sehen.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch((e) => console.warn('Service Worker nicht registriert:', e));
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

/** Fallback, falls kein Callback übergeben wird: Banner über ui.setBanner. @param {()=>void} apply */
function fallbackBanner(apply) {
  import('./ui.js')
    .then((ui) => ui.setBanner('update', 'Neue Version verfügbar', { label: 'Neu laden', onClick: apply }))
    .catch((e) => console.error(e));
}
