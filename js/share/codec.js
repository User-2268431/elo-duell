// Eigentümer: D – Austauschformat v1 (docs/ARCHITEKTUR.md §5). In Node importierbar.
// Payload "<Version>.<Kodierung>.<base64url ohne Padding>", Kodierung z = deflate-raw, j = reines JSON.
/** @typedef {import('../types.js').ShareData} ShareData */
/** @typedef {import('../types.js').List} List */
/** @typedef {import('../types.js').Device} Device */
/** @typedef {import('../types.js').PartnerRanking} PartnerRanking */

export const MAX_PAYLOAD = 65536, MAX_INFLATED = 262144, MAX_OPTIONS = 500, MAX_NAME = 120;
/** Höchstzahl Aliase im Payload (§5). */
export const MAX_ALIASES = 20;
const MAX_ID = 64;

/** @type {Record<string,string>} */
const MESSAGES = {
  format: 'Das ist kein gültiger Elo-Duell-Link.',
  version: 'Dieser Link stammt aus einer neueren App-Version – bitte App aktualisieren.',
  'zu-gross': 'Die Daten sind zu groß.',
  beschaedigt: 'Der Link ist beschädigt oder unvollständig. Bitte noch einmal senden lassen.',
};

export class ShareError extends Error {
  /** @param {'format'|'version'|'zu-gross'|'beschaedigt'} code @param {string} [message] */
  constructor(code, message) {
    super(message || MESSAGES[code] || code);
    this.name = 'ShareError';
    /** @type {'format'|'version'|'zu-gross'|'beschaedigt'} */
    this.code = code;
  }
}

const PAYLOAD_RE = /^(\d{1,3})\.([a-z])\.([A-Za-z0-9_-]*)$/;

// ---------- Base64url (blockweise, ohne Spread über das ganze Array) ----------
/** @param {Uint8Array} bytes @returns {string} */
function toB64url(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, /** @type {any} */ (bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} s @returns {Uint8Array} */
function fromB64url(s) {
  if (s.length % 4 === 1) throw new ShareError('beschaedigt');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  let bin;
  try { bin = atob(b64); } catch { throw new ShareError('beschaedigt'); }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- Kompression ----------
/** @param {Uint8Array} bytes @returns {Promise<Uint8Array|null>} null, wenn deflate-raw fehlt */
async function deflateRaw(bytes) {
  let cs;
  try {
    if (typeof globalThis.CompressionStream !== 'function') return null;
    cs = new globalThis.CompressionStream('deflate-raw');
  } catch {
    return null; // Chrome < 103: kein deflate-raw
  }
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Gestreamt entpacken, über MAX_INFLATED abbrechen. @param {Uint8Array} bytes @returns {Promise<Uint8Array>} */
async function inflateRaw(bytes) {
  let ds;
  try {
    if (typeof globalThis.DecompressionStream !== 'function') throw new Error('fehlt');
    ds = new globalThis.DecompressionStream('deflate-raw');
  } catch {
    throw new ShareError('version', 'Dieser Browser kann den Link nicht öffnen – bitte Chrome aktualisieren.');
  }
  const writer = ds.writable.getWriter();
  writer.write(bytes).catch(() => {});
  writer.close().catch(() => {});
  const reader = ds.readable.getReader();
  /** @type {Uint8Array[]} */ const chunks = [];
  let total = 0;
  for (;;) {
    let res;
    try { res = await reader.read(); } catch { throw new ShareError('beschaedigt'); }
    if (res.done) break;
    total += res.value.length;
    if (total > MAX_INFLATED) {
      try { await reader.cancel(); } catch { /* egal */ }
      throw new ShareError('zu-gross');
    }
    chunks.push(res.value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

// ---------- Prüfung ----------
/** @param {unknown} v @param {number} max @returns {v is string} */
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
/** @param {unknown} v @returns {v is number} */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** @param {any} raw @returns {ShareData} */
function validate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ShareError('format');
  if (isNum(raw.v) && raw.v > 1) throw new ShareError('version');
  if (raw.v !== 1) throw new ShareError('format');
  if (!isStr(raw.l, MAX_ID) || !raw.l) throw new ShareError('format');
  if (!isStr(raw.d, MAX_ID) || !raw.d) throw new ShareError('format');
  if (!isStr(raw.n, MAX_NAME)) throw new ShareError('format');
  if (!isStr(raw.p, MAX_NAME)) throw new ShareError('format');
  if (!isNum(raw.t)) throw new ShareError('format');
  if (!Array.isArray(raw.o)) throw new ShareError('format');
  if (raw.o.length > MAX_OPTIONS) throw new ShareError('zu-gross');
  /** @type {[string, number, number][]} */
  const o = raw.o.map((/** @type {any} */ e) => {
    if (!Array.isArray(e) || e.length < 3) throw new ShareError('format');
    const [name, rating, duels] = e;
    if (!isStr(name, MAX_NAME) || !name.trim()) throw new ShareError('format');
    if (!isNum(rating) || !isNum(duels)) throw new ShareError('format');
    return [name, rating, Math.max(0, Math.round(duels))];
  });
  /** @type {ShareData} */
  const out = { v: 1, l: raw.l, n: raw.n, p: raw.p, d: raw.d, t: raw.t, o };
  if (raw.a !== undefined) {
    if (!Array.isArray(raw.a) || !raw.a.every((/** @type {unknown} */ x) => isStr(x, MAX_ID))) throw new ShareError('format');
    out.a = raw.a.slice(0, MAX_ALIASES);
  }
  return out;
}

// ---------- Öffentliche API ----------
/** @param {ShareData} data @returns {Promise<string>} "1.z.<b64url>" bzw. "1.j.<b64url>" */
export async function encodeShare(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let packed = null;
  try { packed = await deflateRaw(bytes); } catch { packed = null; }
  // Das kürzere gewinnt (bei sehr kleinen Listen ist reines JSON manchmal kürzer).
  if (packed && packed.length < bytes.length) return `1.z.${toB64url(packed)}`;
  return `1.j.${toB64url(bytes)}`;
}

/** @param {string} payload @returns {Promise<ShareData>} wirft ShareError */
export async function decodeShare(payload) {
  if (typeof payload !== 'string') throw new ShareError('format');
  if (payload.length > MAX_PAYLOAD) throw new ShareError('zu-gross');
  const m = PAYLOAD_RE.exec(payload.trim());
  if (!m) throw new ShareError('format');
  const version = Number(m[1]);
  if (version > 1) throw new ShareError('version');
  if (version !== 1) throw new ShareError('format');
  const enc = m[2];
  if (enc !== 'z' && enc !== 'j') throw new ShareError('version');
  const raw = fromB64url(m[3]);
  const bytes = enc === 'z' ? await inflateRaw(raw) : raw;
  if (bytes.length > MAX_INFLATED) throw new ShareError('zu-gross');
  let json;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ShareError('beschaedigt');
  }
  return validate(json);
}

/** @param {string} payload @param {{origin:string, pathname:string}} [loc] @returns {string} origin+pathname+"#i="+payload */
export function buildShareUrl(payload, loc = globalThis.location) {
  return `${loc.origin}${loc.pathname}#i=${payload}`;
}

const IN_TEXT_RE = /#i=(\d{1,3}\.[a-z]\.[A-Za-z0-9_-]+)/;

/** Akzeptiert URL, "#i=…" oder das nackte Payload. @param {string} textOrUrl @returns {string|null} */
export function extractPayload(textOrUrl) {
  if (typeof textOrUrl !== 'string') return null;
  let s = textOrUrl.trim();
  if (!s) return null;
  if (/%23i%3D/i.test(s)) { try { s = decodeURIComponent(s); } catch { /* bleibt */ } }
  const m = IN_TEXT_RE.exec(s);
  if (m) return m[1];
  const bare = s.replace(/^i=/, '');
  return PAYLOAD_RE.test(bare) && bare.length > 4 ? bare : null;
}

/** @param {string} s @returns {string} */
const clip = (s) => String(s ?? '').slice(0, MAX_NAME);

/** @param {List} list @param {Device} device @param {number} now ms @returns {ShareData} inkl. a = list.aliases */
export function toShareData(list, device, now) {
  const sorted = [...list.options].sort(
    (x, y) => y.rating - x.rating || y.duels - x.duels || x.name.localeCompare(y.name, 'de'),
  );
  /** @type {ShareData} */
  const data = {
    v: 1,
    l: list.id,
    n: clip(list.name),
    p: clip(device.name),
    d: device.id,
    t: Math.floor(now / 1000),
    o: sorted.slice(0, MAX_OPTIONS).map((o) => [clip(o.name), Math.round(o.rating), o.duels]),
    a: (list.aliases || []).slice(-MAX_ALIASES),
  };
  return data;
}

/** @param {ShareData} d @param {number} now ms @returns {PartnerRanking} sentAt = t*1000, receivedAt = now */
export function toPartnerRanking(d, now) {
  return {
    deviceId: d.d,
    name: d.p,
    receivedAt: now,
    sentAt: d.t * 1000,
    options: d.o.map(([name, rating, duels]) => ({ name, rating, duels })),
  };
}
