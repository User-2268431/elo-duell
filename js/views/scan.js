// Eigentümer: D – View scan (docs/ARCHITEKTUR.md §4D, §6, §7). Kamera + immer das Feld „Link einfügen“.
import { h } from '../ui.js';
import { canScan, scanQr } from '../share/scanner.js';
import { extractPayload } from '../share/codec.js';
import { t } from '../i18n.js';

/** @param {any} err @returns {string} */
function cameraMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return t('scan.denied');
    case 'NotFoundError':
    case 'OverconstrainedError':
      return t('scan.noCamera');
    case 'NotReadableError':
    case 'AbortError':
      return t('scan.busy');
    default:
      return t('scan.failed');
  }
}

export default {
  title: () => t('scan.title'),
  /** @param {HTMLElement} root @param {any} ctx @returns {void|(()=>void)} */
  render(root, ctx) {
    const { navigate, openImport } = ctx;
    let alive = true;
    /** @type {AbortController|null} */ let ctrl = null;
    /** @type {any} */ let retryTimer = null;

    const video = /** @type {HTMLVideoElement} */ (h('video', {
      class: 'scan-video', 'data-testid': 'scan-video', playsinline: true, muted: true, autoplay: true,
      'aria-label': t('scan.videoAria'),
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
      status.textContent = t('scan.starting');
      const shown = setTimeout(() => { if (alive && ctrl === myCtrl) status.textContent = t('scan.aim'); }, 1200);
      scanQr(video, { signal: myCtrl.signal }).then((text) => {
        clearTimeout(shown);
        if (!alive || ctrl !== myCtrl) return;
        const payload = extractPayload(text);
        if (payload) {
          ctrl = null;
          openImport(payload);
          return;
        }
        showError(t('scan.notOurs'));
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
        showError(t('scan.badLink'));
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
      h('button', { type: 'button', class: 'btn btn-block', 'data-testid': 'scan-cancel', on: { click: () => { stopCamera(); navigate('#/'); } } }, t('common.cancel')),
      h('section', { class: 'card stack scan-paste-box' },
        h('label', { class: 'field' },
          h('span', { class: 'field-label' }, t('scan.paste')),
          h('span', { class: 'field-hint' }, t('scan.pasteHint')),
          paste,
        ),
        h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'scan-paste-ok', on: { click: applyPaste } }, t('import.accept')),
      ),
    ));

    if (canScan() && globalThis.isSecureContext !== false) {
      start();
    } else {
      frame.hidden = true;
      showError(t('scan.unavailable'));
    }

    return () => {
      alive = false;
      stopCamera();
    };
  },
};
