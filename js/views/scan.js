// Eigentümer: D – View scan (docs/ARCHITEKTUR.md §4D, §6, §7). Kamera + immer das Feld „Link einfügen“.
import { h } from '../ui.js';
import { canScan, scanQr } from '../share/scanner.js';
import { extractPayload } from '../share/codec.js';

/** @param {any} err @returns {string} */
function cameraMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Kein Zugriff auf die Kamera. Erlaube die Kamera in den Browser-Einstellungen oder füge den Link unten ein.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Keine Kamera gefunden. Füge den Link unten ein.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Die Kamera wird gerade von einer anderen App benutzt. Füge den Link unten ein.';
    default:
      return 'Die Kamera konnte nicht gestartet werden. Füge den Link unten ein.';
  }
}

export default {
  title: 'QR scannen',
  /** @param {HTMLElement} root @param {any} ctx @returns {void|(()=>void)} */
  render(root, ctx) {
    const { navigate, openImport } = ctx;
    let alive = true;
    /** @type {AbortController|null} */ let ctrl = null;
    /** @type {any} */ let retryTimer = null;

    const video = /** @type {HTMLVideoElement} */ (h('video', {
      class: 'scan-video', 'data-testid': 'scan-video', playsinline: true, muted: true, autoplay: true,
      'aria-label': 'Kamerabild',
    }));
    video.muted = true;
    const status = h('p', { class: 'scan-status muted', 'aria-live': 'polite' });
    const error = h('p', { class: 'card scan-error', 'data-testid': 'scan-error', role: 'alert', hidden: true });
    /** @param {string|null} text */
    const showError = (text) => {
      error.textContent = text || '';
      error.hidden = !text;
    };

    const stopCamera = () => {
      clearTimeout(retryTimer);
      if (ctrl) { ctrl.abort(); ctrl = null; }
    };

    const start = () => {
      if (!alive) return;
      stopCamera();
      ctrl = new AbortController();
      const myCtrl = ctrl;
      status.textContent = 'Kamera wird gestartet …';
      const shown = setTimeout(() => { if (alive && ctrl === myCtrl) status.textContent = 'Halte die Kamera auf den QR-Code der anderen Person.'; }, 1200);
      scanQr(video, { signal: myCtrl.signal }).then((text) => {
        clearTimeout(shown);
        if (!alive || ctrl !== myCtrl) return;
        const payload = extractPayload(text);
        if (payload) {
          ctrl = null;
          openImport(payload);
          return;
        }
        showError('Das ist kein Elo-Duell-Code. Scanne den QR-Code aus „Teilen“.');
        status.textContent = '';
        retryTimer = setTimeout(start, 1500);
      }, (err) => {
        clearTimeout(shown);
        if (!alive || myCtrl.signal.aborted) return;
        status.textContent = '';
        frame.hidden = true;
        showError(cameraMessage(err));
      });
    };

    const paste = /** @type {HTMLTextAreaElement} */ (h('textarea', {
      class: 'textarea scan-paste', 'data-testid': 'scan-paste', rows: 3, autocomplete: 'off', spellcheck: 'false',
      placeholder: 'https://…/elo-duell/#i=…',
    }));
    const applyPaste = () => {
      const payload = extractPayload(paste.value);
      if (!payload) {
        showError('Das ist kein gültiger Elo-Duell-Link. Kopiere den ganzen Link aus der Nachricht.');
        paste.focus();
        return;
      }
      stopCamera();
      openImport(payload);
    };
    paste.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); applyPaste(); }
    });

    const frame = h('div', { class: 'scan-frame' }, video, h('div', { class: 'scan-target', 'aria-hidden': 'true' }));

    root.append(h('div', { class: 'stack scan-view' },
      frame,
      status,
      error,
      h('button', { type: 'button', class: 'btn btn-block', 'data-testid': 'scan-cancel', on: { click: () => { stopCamera(); navigate('#/'); } } }, 'Abbrechen'),
      h('section', { class: 'card stack scan-paste-box' },
        h('label', { class: 'field' },
          h('span', { class: 'field-label' }, 'Link einfügen'),
          h('span', { class: 'field-hint' }, 'Hast du den Link per Nachricht bekommen? Hier einfügen.'),
          paste,
        ),
        h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'scan-paste-ok', on: { click: applyPaste } }, 'Übernehmen'),
      ),
    ));

    if (canScan() && globalThis.isSecureContext !== false) {
      start();
    } else {
      frame.hidden = true;
      showError('Die Kamera ist hier nicht verfügbar. Füge den Link unten ein.');
    }

    return () => {
      alive = false;
      stopCamera();
    };
  },
};
