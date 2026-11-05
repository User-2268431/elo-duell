// Bilder zu Optionen aus Wikipedia (seit v1.0.2). DOM-arm und in Node testbar (alle Abhängigkeiten injizierbar).
// Ablauf je Begriff: Wikipedia der UI-Sprache → (kein Foto) die andere (de/en). REST „page/summary“ liefert Seitentyp und Vorschaubild;
// ist das ein SVG (Wappen, Flagge, Karte, Logo) oder ein Symbolbild, wird über „page/media-list“ das erste Foto genommen.
// Speicher: Bilddaten im Cache `elo-duell-img` (von sw.js beim activate verschont), Metadaten unter `elo-duell:img`.
// Harte Grenzen (LRU): maxImages Bilder, maxBytes Byte, maxEntries Metadaten-Einträge (inkl. Miss-Marker).
import { normalizeName } from './logic/text.js';
import { getLang } from './i18n.js';

export const IMG_CACHE = 'elo-duell-img';
export const META_KEY = 'elo-duell:img';
export const API_USER_AGENT = 'Elo-Duell/1.0.4 (https://github.com/User-2268431/elo-duell)';
const DAY = 24 * 60 * 60 * 1000;
export const LIMITS = Object.freeze({
  maxImages: 300,
  maxBytes: 20 * 1024 * 1024,
  maxEntries: 600,
  maxImageBytes: 512 * 1024,  // größer → einmal in kleinerer Stufe (smallWidth) versuchen
  smallWidth: 250,
  missTtl: 30 * DAY,
  gapMs: 1000,        // Mindestabstand zwischen zwei Anfragen an Wikimedia
  retries: 4,         // bei 429/503 (oder CORS-losem Fehler bei bestehender Verbindung)
  backoffMs: 4000,    // 4 s, 8 s, 16 s, 32 s
  width: 500,         // Vorschaubreite in px (Wikimedia-Standardstufe)
});
/** Wikipedia-Sprachen in Suchreihenfolge: UI-Sprache zuerst (Deutsch: de → en, Englisch: en → de). */
const langOrder = () => (getLang() === 'en' ? ['en', 'de'] : ['de', 'en']);
const HOSTS = new Set(['upload.wikimedia.org', 'thumb.wikimedia.org']);
/** Wörter im Dateinamen, die auf Wappen, Flaggen, Karten, Logos u. Ä. statt eines Fotos hindeuten. */
const NOT_PHOTO = new Set(['wappen', 'coat', 'flag', 'flagge', 'fahne', 'logo', 'karte', 'map', 'locator', 'lagekarte',
  'signatur', 'signature', 'unterschrift', 'icon', 'symbol', 'emblem', 'seal', 'siegel', 'banner', 'blason', 'escudo',
  'stemma', 'wordmark', 'schriftzug', 'diagram', 'diagramm', 'chart', 'bandeira', 'bandera', 'bandiera', 'drapeau', 'flagga',
  'vlag', 'herb', 'brasão', 'armoiries', 'grb', 'insignia']);
/** Bevorzugt: JPEG und keine Satellitenaufnahme (zu abstrakt als Kartenbild). @param {string} u */
const isPreferred = (u) => /\.jpe?g$/i.test(fileName(u)) && !/sentinel|satellit|landsat|cloudless|\bnasa\b|\besa\d*\b/i.test(fileName(u).replace(/_/g, ' '));

export class NetError extends Error {
  /** @param {string} m */ constructor(m) { super(m); this.name = 'NetError'; }
}

/** @param {string} u */
export function isSvg(u) { return /\.svg(?:[/.?#]|$)/i.test(String(u)); }

/** Dateiname (dekodiert, ohne „500px-“) aus einer Bild-URL oder einem Titel „Datei:…“. @param {string} u */
export function fileName(u) {
  let s = String(u).split(/[?#]/)[0];
  s = s.slice(s.lastIndexOf('/') + 1).replace(/^\d+px-/, '').replace(/^(Datei|File|Bild|Image):/i, '');
  try { s = decodeURIComponent(s); } catch { /* bleibt */ }
  return s;
}

/** Foto-Kandidat: kein SVG/GIF, Endung jpg/jpeg/png/webp, kein Wappen-/Karten-/Logo-Wort im Namen. @param {string} u */
export function isPhotoName(u) {
  const n = fileName(u);
  if (isSvg(u) || isSvg(n) || !/\.(jpe?g|png|webp)$/i.test(n)) return false;
  return !n.toLowerCase().split(/[^\p{L}\p{N}]+/u).some((w) => NOT_PHOTO.has(w));
}

/** Absolute https-URL auf erlaubtem Wikimedia-Host, ohne Query. @param {any} u @returns {string|null} */
export function cleanSrc(u) {
  if (typeof u !== 'string' || !u) return null;
  try {
    const url = new URL(u.startsWith('//') ? 'https:' + u : u);
    if (url.protocol !== 'https:' || !HOSTS.has(url.hostname)) return null;
    return url.origin + url.pathname;
  } catch { return null; }
}

/** Setzt die Vorschaubreite auf `width`, wenn das Original breit genug ist. @param {string} src @param {number} [orig] */
export function sizeSrc(src, orig, width = LIMITS.width) {
  const m = /\/(\d+)px-[^/]+$/.exec(src);
  if (!m || Number(m[1]) >= width || !(Number(orig) > width)) return src;
  return src.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`);
}

/**
 * Erstes Foto aus einer media-list-Antwort: JPEG bevorzugt (PNGs sind oft Flaggen, Karten, Collagen), sonst das erste PNG/WebP.
 * @param {any} json @returns {string|null}
 */
export function pickFromMediaList(json) {
  /** @type {string|null} */ let other = null;
  for (const it of Array.isArray(json?.items) ? json.items : []) {
    if (it?.type !== 'image' || !Array.isArray(it.srcset) || !it.srcset.length) continue;
    if (it.title && !isPhotoName(it.title)) continue;
    const s = it.srcset.find((/** @type {any} */ x) => x?.scale === '1x') || it.srcset[0];
    const src = cleanSrc(s?.src);
    if (!src || !isPhotoName(src)) continue;
    if (isPreferred(src)) return src;
    other ??= src;
  }
  return other;
}

/** @param {string} lang @param {string} title */
export const pageUrl = (lang, title) => `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

/** @typedef {{t:string, l:string, s:string, b:number, u:number, c:number}} ImgEntry  // Titel, Sprache, Bild-URL, Byte, zuletzt benutzt, geprüft */
/** @typedef {{m:number}} MissEntry  // kein Bild gefunden (Zeitpunkt) */
/** @typedef {{lang:string, title:string, page:string, src:string}} Found */

/**
 * @param {{fetch?:typeof fetch|null, caches?:CacheStorage|null, storage?:Storage|null, now?:()=>number,
 *   sleep?:(ms:number)=>Promise<void>, online?:()=>boolean, isEnabled?:()=>boolean,
 *   createObjectURL?:(b:Blob)=>string, revokeObjectURL?:(u:string)=>void, limits?:Partial<typeof LIMITS>}} [deps]
 */
export function createImages(deps = {}) {
  const L = { ...LIMITS, ...(deps.limits || {}) };
  const g = /** @type {any} */ (globalThis);
  const fetchFn = deps.fetch !== undefined ? deps.fetch : (typeof g.fetch === 'function' ? g.fetch.bind(g) : null);
  const cachesApi = deps.caches !== undefined ? deps.caches : (() => { try { return g.caches ?? null; } catch { return null; } })();
  const now = deps.now || Date.now;
  const sleep = deps.sleep || ((/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms)));
  const online = deps.online || (() => g.navigator?.onLine !== false);
  let isEnabled = deps.isEnabled || (() => true);
  const langs = deps.langs || langOrder;
  const mkUrl = deps.createObjectURL || ((/** @type {Blob} */ b) => URL.createObjectURL(b));
  const rmUrl = deps.revokeObjectURL || ((/** @type {string} */ u) => URL.revokeObjectURL(u));
  /** @returns {Storage|null} */
  const storage = () => { if (deps.storage !== undefined) return deps.storage; try { return g.localStorage ?? null; } catch { return null; } };

  /* ---------- Metadaten ---------- */
  /** @type {Record<string, ImgEntry|MissEntry>|null} */ let meta = null;
  function load() {
    if (meta) return meta;
    meta = {};
    try {
      const raw = storage()?.getItem(META_KEY);
      const j = raw ? JSON.parse(raw) : null;
      if (j && j.v === 1 && j.e && typeof j.e === 'object') meta = j.e;
    } catch { /* defekt → leer */ }
    return /** @type {Record<string, ImgEntry|MissEntry>} */ (meta);
  }
  function save() {
    const st = storage();
    if (!st || !meta) return;
    try { st.setItem(META_KEY, JSON.stringify({ v: 1, e: meta })); } catch {
      // Speicher voll: Miss-Marker opfern und einmal erneut versuchen.
      for (const [k, e] of Object.entries(meta)) if ('m' in e) delete meta[k];
      try { st.setItem(META_KEY, JSON.stringify({ v: 1, e: meta })); } catch { /* aufgeben */ }
    }
  }
  /** @param {string} term */ const keyOf = (term) => normalizeName(term);
  /** @param {any} e @returns {e is ImgEntry} */ const isImg = (e) => !!e && typeof e.s === 'string';

  /* ---------- Anzeige-URLs (Blob) ---------- */
  /** @type {Map<string, string>} key → objectURL */ const urls = new Map();
  /** @type {Set<(key:string|null)=>void>} */ const subs = new Set();
  /** @param {string|null} key */ const emit = (key) => { for (const f of subs) { try { f(key); } catch { /* egal */ } } };
  /** @param {string} key */
  function dropUrl(key) { const u = urls.get(key); if (u) { urls.delete(key); try { rmUrl(u); } catch { /* egal */ } } }

  async function openCache() { return cachesApi ? cachesApi.open(IMG_CACHE) : null; }

  /* ---------- Netz: strikt nacheinander, gedrosselt, 429 → exponentiell zurückstellen ---------- */
  let nextAt = 0;
  /** @type {Promise<any>} */ let chain = Promise.resolve();
  /** @param {string} url @param {RequestInit} [init] @returns {Promise<Response>} */
  function request(url, init) {
    const run = async () => {
      if (!fetchFn) throw new NetError('kein fetch');
      for (let attempt = 0; ; attempt++) {
        const wait = nextAt - now();
        if (wait > 0) await sleep(wait);
        nextAt = now() + L.gapMs;
        /** @type {Response} */ let r;
        try { r = await fetchFn(url, init); } catch (e) {
          // Offline: sofort aufgeben. Online: oft ein 429 ohne CORS-Header → wie 429 behandeln.
          if (!online() || attempt >= L.retries) throw new NetError(String(e));
          nextAt = now() + L.backoffMs * 2 ** attempt;
          continue;
        }
        if (r.status !== 429 && r.status !== 503) return r;
        if (attempt >= L.retries) throw new NetError(`HTTP ${r.status}`);
        nextAt = now() + L.backoffMs * 2 ** attempt;
      }
    };
    const p = chain.then(run, run);
    chain = p.catch(() => {});
    return p;
  }
  const apiInit = /** @type {RequestInit} */ ({ headers: { 'Api-User-Agent': API_USER_AGENT }, credentials: 'omit' });
  /** @param {string} url */
  async function getJson(url) {
    const r = await request(url, apiInit);
    if (r.status === 404) return null;
    if (!r.ok) throw new NetError(`HTTP ${r.status}`);
    try { return await r.json(); } catch { throw new NetError('kein JSON'); }
  }

  /**
   * Sucht ein Foto in einer Sprache. null = kein Bild (fehlt, Begriffsklärung, nur Wappen/Karten). Wirft NetError.
   * @param {string} term @param {string} lang @returns {Promise<Found|null>}
   */
  async function lookupLang(term, lang) {
    const base = `https://${lang}.wikipedia.org/api/rest_v1/page/`;
    const s = await getJson(base + 'summary/' + encodeURIComponent(term.trim().replace(/ /g, '_')));
    if (!s || s.type === 'disambiguation' || typeof s.title !== 'string') return null;
    const canonical = s.titles?.canonical || s.title.replace(/ /g, '_');
    const title = s.titles?.normalized || s.title;
    const page = cleanPage(s.content_urls?.desktop?.page, lang) || pageUrl(lang, title);
    const thumb = cleanSrc(s.thumbnail?.source);
    const orig = s.originalimage?.source;
    const lead = thumb && isPhotoName(thumb) && (!orig || isPhotoName(orig)) ? sizeSrc(thumb, s.originalimage?.width) : null;
    // JPEG-Vorschau direkt nehmen; bei PNG (oft Flagge/Collage) oder ohne Foto in der media-list nach einem JPEG suchen.
    let src = lead && isPreferred(lead) ? lead : null;
    if (!src) {
      const pick = pickFromMediaList(await getJson(base + 'media-list/' + encodeURIComponent(canonical)));
      src = pick && isPreferred(pick) ? pick : lead || pick;
    }
    return src ? { lang, title, page, src } : null;
  }
  /** @param {any} u @param {string} lang */
  function cleanPage(u, lang) {
    try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === `${lang}.wikipedia.org` ? x.href : null; } catch { return null; }
  }
  /** UI-Sprache zuerst, dann die andere. @param {string} term @returns {Promise<Found|null>} */
  async function lookup(term) {
    if (!String(term).trim()) return null;
    for (const lang of langs()) {
      const f = await lookupLang(term, lang);
      if (f) return f;
    }
    return null;
  }

  /** Bild laden und ablegen; zu groß → kleinere Stufe. @param {string} src @returns {Promise<{src:string, blob:Blob}|null>} */
  async function download(src) {
    const r = await download1(src);
    if (r !== 'big') return r ? { src, blob: r } : null;
    const small = src.replace(/\/(\d+)px-([^/]+)$/, (all, w, f) => (Number(w) > L.smallWidth ? `/${L.smallWidth}px-${f}` : all));
    if (small === src) return null;
    const r2 = await download1(small);
    return r2 && r2 !== 'big' ? { src: small, blob: r2 } : null;
  }
  /** null = Bild unbrauchbar (zählt als Miss), 'big' = zu groß. Wirft NetError. @param {string} src @returns {Promise<Blob|null|'big'>} */
  async function download1(src) {
    const r = await request(src, { mode: 'cors', credentials: 'omit' });
    if (r.status === 404) return null;
    if (!r.ok) throw new NetError(`HTTP ${r.status}`);
    const type = r.headers.get('content-type') || '';
    if (!/^image\//i.test(type)) return null;
    /** @type {Blob} */ let blob;
    try { blob = await r.blob(); } catch (e) { throw new NetError(String(e)); }
    if (!blob.size) return null;
    if (blob.size > L.maxImageBytes) return 'big';
    const c = await openCache();
    if (!c) return null;
    await c.put(src, new Response(blob, { headers: { 'content-type': type, 'content-length': String(blob.size) } }));
    return blob;
  }

  /* ---------- Grenzen ---------- */
  /** Entfernt Einträge (älteste zuerst), bis alle Grenzen eingehalten sind. @param {string} [protect] */
  async function enforce(protect) {
    const m = load();
    const imgs = Object.entries(m).filter(([, e]) => isImg(e)).sort((a, b) => /** @type {ImgEntry} */ (a[1]).u - /** @type {ImgEntry} */ (b[1]).u);
    let count = imgs.length;
    let bytes = imgs.reduce((s, [, e]) => s + (/** @type {ImgEntry} */ (e).b || 0), 0);
    /** @type {string[]} */ const gone = [];
    for (const [k, e] of imgs) {
      if (count <= L.maxImages && bytes <= L.maxBytes) break;
      if (k === protect) continue;
      count--; bytes -= /** @type {ImgEntry} */ (e).b || 0;
      gone.push(/** @type {ImgEntry} */ (e).s);
      delete m[k]; dropUrl(k);
    }
    let removed = gone.length;
    const keys = Object.keys(m);
    if (keys.length > L.maxEntries) {
      // Zuerst die ältesten Miss-Marker, danach die am längsten unbenutzten Bilder.
      const age = (/** @type {any} */ e) => (isImg(e) ? 1e15 + e.u : e.m);
      keys.sort((a, b) => age(m[a]) - age(m[b]));
      for (const k of keys.slice(0, keys.length - L.maxEntries)) {
        if (k === protect) continue;
        const e = m[k];
        if (isImg(e)) gone.push(e.s);
        delete m[k]; dropUrl(k); removed++;
      }
    }
    if (gone.length) await removeFromCache(gone);
    return removed;
  }
  /** @param {string[]} srcs */
  async function removeFromCache(srcs) {
    try {
      const c = await openCache();
      const still = new Set(Object.values(load()).filter(isImg).map((e) => e.s));
      if (c) for (const s of srcs) if (!still.has(s)) await c.delete(s);
    } catch { /* egal */ }
  }

  /* ---------- Hintergrund-Abruf ---------- */
  /** @type {Map<string, string>} key → Begriff */ const queue = new Map();
  /** @type {Promise<void>|null} */ let worker = null;

  /** @param {string} key */
  function needs(key) {
    const e = load()[key];
    if (!e) return true;
    if (isImg(e)) return false;
    return now() - e.m >= L.missTtl;
  }

  /** Holt einen Begriff (Suche + Bild) und legt ihn ab. Wirft NetError. @param {string} term @returns {Promise<boolean>} Bild gefunden */
  async function fetchTerm(term) {
    const key = keyOf(term);
    const f = await lookup(term);
    const d = f ? await download(f.src) : null;
    const m = load();
    if (!f || !d) { m[key] = { m: now() }; await enforce(); save(); return false; }
    const { blob, src } = d;
    const old = m[key];
    m[key] = { t: f.title, l: f.lang, s: src, b: blob.size, u: now(), c: now() };
    dropUrl(key);
    await enforce(key);
    if (isImg(old) && old.s !== src) await removeFromCache([old.s]);
    save();
    try { urls.set(key, mkUrl(blob)); } catch { /* keine Blob-URLs */ }
    emit(key);
    return true;
  }

  async function work() {
    while (queue.size) {
      if (!isEnabled() || !online()) { queue.clear(); break; }
      const [key, term] = queue.entries().next().value;
      queue.delete(key);
      if (!needs(key)) continue;
      try { await fetchTerm(term); } catch (e) {
        if (e instanceof NetError || (e && /** @type {any} */ (e).name === 'TypeError')) { queue.clear(); break; } // offline o. ä.: nächstes Öffnen
        // Unerwartetes (z. B. Cache voll): diesen Begriff überspringen.
      }
    }
    worker = null;
  }

  return {
    LIMITS: L,
    lookup,
    fetchTerm,
    /** @param {()=>boolean} fn */ setEnabledSource(fn) { isEnabled = fn; },
    enabled() { try { return !!isEnabled() && !!cachesApi; } catch { return false; } },
    /** Metadaten zu einem Begriff mit Bild. @param {string} term @returns {(Found & {bytes:number})|null} */
    entry(term) {
      const e = load()[keyOf(term)];
      return isImg(e) ? { lang: e.l, title: e.t, page: pageUrl(e.l, e.t), src: e.s, bytes: e.b } : null;
    },
    /** Anzeige-URL (Blob) – nur nach preload/Abruf vorhanden. @param {string} term @returns {string|null} */
    urlFor(term) { return urls.get(keyOf(term)) ?? null; },
    /**
     * Legt Blob-URLs für bereits gespeicherte Bilder an (auch offline) und markiert sie als benutzt (LRU).
     * Fehlt ein Bild im Cache (vom Browser geräumt), wird der Eintrag vergessen und später neu geholt.
     * @param {string[]} terms
     */
    async preload(terms) {
      if (!cachesApi) return;
      const m = load();
      let changed = false;
      /** @type {Cache|null} */ let c = null;
      try { c = await openCache(); } catch { return; }
      for (const term of terms) {
        const key = keyOf(term);
        const e = m[key];
        if (!isImg(e)) continue;
        e.u = now(); changed = true;
        if (urls.has(key)) continue;
        /** @type {Response|undefined} */ let r;
        try { r = await c?.match(e.s); } catch { r = undefined; }
        if (!r) { delete m[key]; continue; }
        try { urls.set(key, mkUrl(await r.blob())); emit(key); } catch { /* egal */ }
      }
      if (changed) save();
    },
    /** Fehlende Bilder im Hintergrund nacheinander holen. @param {string[]} terms @returns {Promise<void>} */
    request(terms) {
      if (!fetchFn || !cachesApi || !this.enabled() || !online()) return worker || Promise.resolve();
      for (const t of terms) { const k = keyOf(t); if (k && needs(k)) queue.set(k, t); }
      if (!worker && queue.size) worker = work();
      return worker || Promise.resolve();
    },
    /** Entfernt Einträge zu Begriffen, die in keiner Liste mehr vorkommen, und hält die Grenzen ein. @param {Iterable<string>} liveTerms */
    async prune(liveTerms) {
      const live = new Set(Array.from(liveTerms, keyOf));
      const m = load();
      /** @type {string[]} */ const gone = [];
      for (const [k, e] of Object.entries(m)) {
        if (live.has(k)) continue;
        if (isImg(e)) gone.push(e.s);
        delete m[k]; dropUrl(k);
      }
      if (gone.length) await removeFromCache(gone);
      const n = await enforce();
      if (gone.length || n) save();
    },
    /** @returns {{count:number, bytes:number}} */
    usage() {
      const imgs = Object.values(load()).filter(isImg);
      return { count: imgs.length, bytes: imgs.reduce((s, e) => s + (e.b || 0), 0) };
    },
    async clear() {
      queue.clear();
      for (const k of [...urls.keys()]) dropUrl(k);
      meta = {};
      try { storage()?.removeItem(META_KEY); } catch { /* egal */ }
      try { await cachesApi?.delete(IMG_CACHE); } catch { /* egal */ }
      emit(null);
    },
    /** @param {(key:string|null)=>void} fn */
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    keyOf,
  };
}

/** Standard-Instanz der App. */
export const images = createImages();

/**
 * Beim Öffnen einer Liste: Aufräumen (gelöschte Optionen/Listen), gespeicherte Bilder bereitstellen, fehlende holen.
 * @param {{listLists():any[], getList(id:string):any}} store @param {string} listId
 */
export function loadImagesForList(store, listId, inst = images) {
  if (!inst.enabled()) return;
  const list = store.getList(listId);
  if (!list) return;
  const terms = list.options.map((/** @type {any} */ o) => o.name);
  const live = store.listLists().flatMap((l) => l.options.map((/** @type {any} */ o) => o.name));
  inst.prune(live).then(() => inst.preload(terms)).then(() => inst.request(terms)).catch(() => {});
}
