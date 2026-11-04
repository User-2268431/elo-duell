// Eigentümer: D – QR-Erzeugung (docs/ARCHITEKTUR.md §4D, §5). Immer ECC L.
import qrcode from '../../vendor/qrcode-generator.mjs';

export const QR_MAX_URL = 1000, LINK_WARN_URL = 2000;

/**
 * Zeichnet einen <canvas> (schwarz auf weiß, Ruhezone 4 Module) in container.
 * @param {string} text @param {HTMLElement} container @param {{ecc?:'L'}} [opts]
 * @returns {{modules:number}}
 */
export function renderQr(text, container, opts = {}) {
  void qrcode;
  throw new Error('TODO');
}
