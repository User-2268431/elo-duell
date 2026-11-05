// Eigentümer: D – QR-Erzeugung (docs/ARCHITEKTUR.md §4D, §5). Immer ECC L.
import qrcode from '../../vendor/qrcode-generator.mjs';
import { t } from '../i18n.js';

export const QR_MAX_URL = 1000, LINK_WARN_URL = 2000;
const QUIET = 4;          // Ruhezone in Modulen
const TARGET_PX = 800;    // ungefähre Canvas-Kantenlänge (intern), Anzeige per CSS skaliert

/**
 * Zeichnet einen <canvas> (schwarz auf weiß, Ruhezone 4 Module) in container.
 * Komplette Eingabe im Byte-Modus, kleinste Version automatisch, Fehlerkorrektur immer L.
 * @param {string} text @param {HTMLElement} container @param {{ecc?:'L'}} [opts]
 * @returns {{modules:number}}
 */
export function renderQr(text, container, opts = {}) {
  void opts; // ECC ist bewusst fest L (§5)
  const qr = qrcode(0, 'L');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const scale = Math.max(4, Math.ceil(TARGET_PX / (n + 2 * QUIET)));
  const size = (n + 2 * QUIET) * scale;
  const doc = container.ownerDocument || globalThis.document;
  const canvas = /** @type {HTMLCanvasElement} */ (doc.createElement('canvas'));
  canvas.width = size;
  canvas.height = size;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', t('share.qrAria'));
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + QUIET) * scale, (r + QUIET) * scale, scale, scale);
    }
  }
  container.replaceChildren(canvas);
  return { modules: n };
}
