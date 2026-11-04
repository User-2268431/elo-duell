// Eigentümer: D – renderQr erzeugen und in Node mit jsQR zurücklesen (docs/ARCHITEKTUR.md §5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderQr, QR_MAX_URL, LINK_WARN_URL } from '../../js/share/qr.js';
import { encodeShare, buildShareUrl } from '../../js/share/codec.js';

const require = createRequire(import.meta.url);
const jsQR = require('../../vendor/jsQR.js');

/** Minimaler Canvas-Ersatz: fillRect in ein RGBA-Bild. */
function fakeCanvas() {
  const c = {
    width: 0, height: 0, attrs: /** @type {Record<string,string>} */ ({}), data: /** @type {Uint8ClampedArray|null} */ (null),
    setAttribute(/** @type {string} */ k, /** @type {string} */ v) { c.attrs[k] = v; },
    getContext() {
      c.data = new Uint8ClampedArray(c.width * c.height * 4);
      let rgb = [0, 0, 0];
      return {
        set fillStyle(/** @type {string} */ v) { rgb = v === '#ffffff' ? [255, 255, 255] : [0, 0, 0]; },
        fillRect(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h) {
          const d = /** @type {Uint8ClampedArray} */ (c.data);
          for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
            const i = (yy * c.width + xx) * 4;
            d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
          }
        },
      };
    },
  };
  return c;
}

function fakeContainer() {
  /** @type {any[]} */ let children = [];
  return {
    ownerDocument: { createElement: (/** @type {string} */ tag) => { assert.equal(tag, 'canvas'); return fakeCanvas(); } },
    replaceChildren: (/** @type {any[]} */ ...c) => { children = c; },
    get children() { return children; },
  };
}

/** @param {number} n */
async function urlWith(n) {
  const o = Array.from({ length: n }, (_, i) => [`Reiseziel ${i} Ä`, 1200 - i * 3, 6]);
  const payload = await encodeShare({ v: 1, l: 'l_ab12cd34ef', n: 'Urlaub', p: 'Anna', d: 'd_x9y8z7w6v5', t: 1762290000, o, a: [] });
  return buildShareUrl(payload, { origin: 'https://user-2268431.github.io', pathname: '/elo-duell/' });
}

test('Konstanten', () => {
  assert.equal(QR_MAX_URL, 1000);
  assert.equal(LINK_WARN_URL, 2000);
});

for (const n of [3, 20, 45]) {
  test(`QR mit ${n} Optionen: zeichnen und mit jsQR zurücklesen`, async () => {
    const url = await urlWith(n);
    assert.ok(url.length <= QR_MAX_URL, `URL ${url.length}`);
    const box = fakeContainer();
    const { modules } = renderQr(url, /** @type {any} */ (box));
    assert.ok(modules >= 21 && modules <= 4 * 23 + 17, `Module ${modules} (höchstens v23)`);
    const canvas = box.children[0];
    assert.equal(canvas.width, canvas.height);
    assert.equal(canvas.width % (modules + 8), 0, 'ganzzahlige Modulgröße inkl. Ruhezone 4');
    const res = jsQR(canvas.data, canvas.width, canvas.height);
    assert.ok(res, 'jsQR hat nichts erkannt');
    assert.equal(res.data, url);
  });
}

test('URL mit 1000 Zeichen passt in höchstens v23 (ECC L)', () => {
  const url = 'https://user-2268431.github.io/elo-duell/#i=1.z.' + 'A'.repeat(1000 - 48);
  assert.equal(url.length, 1000);
  const box = fakeContainer();
  const { modules } = renderQr(url, /** @type {any} */ (box));
  assert.ok(modules <= 4 * 23 + 17, `Module ${modules}`);
  assert.equal(jsQR(box.children[0].data, box.children[0].width, box.children[0].height)?.data, url);
});
