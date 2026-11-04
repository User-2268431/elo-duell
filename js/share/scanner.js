// Eigentümer: D – QR-Scan per Kamera (docs/ARCHITEKTUR.md §4D). BarcodeDetector, sonst vendor/jsQR.js (lazy).

/** @returns {boolean} getUserMedia vorhanden */
export function canScan() {
  return !!globalThis.navigator?.mediaDevices?.getUserMedia;
}

/**
 * @param {HTMLVideoElement} video
 * @param {{signal:AbortSignal}} opts
 * @returns {Promise<string>} Rohtext
 */
export async function scanQr(video, { signal }) {
  throw new Error('TODO');
}
