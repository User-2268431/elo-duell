// Eigentümer: D – QR-Scan per Kamera (docs/ARCHITEKTUR.md §4D). BarcodeDetector, sonst vendor/jsQR.js (lazy).

const FRAME_MS = 150;     // ca. 6–7 Bilder/s
const JSQR_WIDTH = 640;   // Auswertung auf ~640 px Breite

/** @returns {boolean} getUserMedia vorhanden */
export function canScan() {
  return !!globalThis.navigator?.mediaDevices?.getUserMedia;
}

/** @type {Promise<any>|null} */
let jsQrPromise = null;

/** Lädt vendor/jsQR.js einmalig per <script> (UMD → window.jsQR). @returns {Promise<(d:Uint8ClampedArray,w:number,h:number,o?:any)=>({data:string}|null)>} */
function loadJsQr() {
  const w = /** @type {any} */ (globalThis);
  if (w.jsQR) return Promise.resolve(w.jsQR);
  if (!jsQrPromise) {
    jsQrPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../../vendor/jsQR.js', import.meta.url).href;
      s.async = true;
      s.onload = () => (w.jsQR ? resolve(w.jsQR) : reject(new Error('jsQR fehlt')));
      s.onerror = () => { jsQrPromise = null; reject(new Error('jsQR could not be loaded')); };
      document.head.appendChild(s);
    });
  }
  return jsQrPromise;
}

/** @returns {Promise<any|null>} BarcodeDetector-Instanz oder null */
async function makeBarcodeDetector() {
  try {
    const BD = /** @type {any} */ (globalThis).BarcodeDetector;
    if (typeof BD !== 'function') return null;
    const formats = await BD.getSupportedFormats();
    if (!Array.isArray(formats) || !formats.includes('qr_code')) return null;
    return new BD({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

/** @returns {DOMException} */
const abortError = () => new DOMException('Abgebrochen', 'AbortError');

/**
 * Startet die Kamera im übergebenen <video>, sucht nach einem QR-Code und liefert dessen Rohtext.
 * Bei signal.abort (oder nach einem Treffer) werden alle Tracks gestoppt.
 * @param {HTMLVideoElement} video
 * @param {{signal:AbortSignal}} opts
 * @returns {Promise<string>} Rohtext
 */
export async function scanQr(video, { signal }) {
  if (signal?.aborted) throw abortError();
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.setAttribute('autoplay', '');
  video.muted = true;
  video.playsInline = true;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  });
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const t of stream.getTracks()) { try { t.stop(); } catch { /* egal */ } }
    try { video.pause(); } catch { /* egal */ }
    video.srcObject = null;
  };
  if (signal?.aborted) { stop(); throw abortError(); }

  return new Promise((resolve, reject) => {
    /** @type {any} */ let timer = null;
    const onAbort = () => { clearTimeout(timer); stop(); reject(abortError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
    /** @param {string} text */
    const done = (text) => { signal?.removeEventListener('abort', onAbort); clearTimeout(timer); stop(); resolve(text); };
    /** @param {any} err */
    const fail = (err) => { signal?.removeEventListener('abort', onAbort); clearTimeout(timer); stop(); reject(err); };

    (async () => {
      video.srcObject = stream;
      try { await video.play(); } catch { /* autoplay reicht meist */ }
      let detector = await makeBarcodeDetector();
      /** @type {any} */ let jsQR = null;
      /** @type {HTMLCanvasElement|null} */ let canvas = null;
      /** @type {CanvasRenderingContext2D|null} */ let ctx = null;

      const ensureJsQr = async () => {
        if (!jsQR) jsQR = await loadJsQr();
        if (!canvas) {
          canvas = document.createElement('canvas');
          ctx = canvas.getContext('2d', { willReadFrequently: true });
        }
      };
      if (!detector) await ensureJsQr();

      const tick = async () => {
        if (stopped) return;
        try {
          if (video.readyState >= 2 && video.videoWidth > 0) {
            /** @type {string|null} */ let text = null;
            if (detector) {
              try {
                const codes = await detector.detect(video);
                const hit = codes.find((/** @type {any} */ c) => c.rawValue);
                if (hit) text = hit.rawValue;
              } catch {
                detector = null; // kaputter Detektor (z. B. ohne Play-Dienste) → jsQR
                await ensureJsQr();
              }
            } else if (canvas && ctx) {
              const w = Math.min(JSQR_WIDTH, video.videoWidth);
              const h = Math.round((video.videoHeight / video.videoWidth) * w);
              if (canvas.width !== w) canvas.width = w;
              if (canvas.height !== h) canvas.height = h;
              ctx.drawImage(video, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              const res = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
              if (res && res.data) text = res.data;
            }
            if (text && !stopped) { done(text); return; }
          }
        } catch (err) {
          fail(err);
          return;
        }
        if (!stopped) timer = setTimeout(tick, FRAME_MS);
      };
      tick();
    })().catch(fail);
  });
}
