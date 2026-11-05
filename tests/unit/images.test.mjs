// Bilder aus Wikipedia (js/images.js): Heuristik, Fallback de→en, Miss-Marker, LRU-Grenzen, Drosselung – mit Fake-fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImages, isSvg, isPhotoName, pickFromMediaList, cleanSrc, sizeSrc, META_KEY, LIMITS, loadImagesForList } from '../../js/images.js';

const T = 'https://thumb.wikimedia.org/wikipedia/commons/thumb';
const DAY = 24 * 3600 * 1000;

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
function fakeCaches() {
  const data = new Map();
  return {
    data,
    async open() {
      return {
        async put(k, r) { data.set(String(k), await r.blob()); },
        async match(k) { return data.has(String(k)) ? new Response(data.get(String(k))) : undefined; },
        async delete(k) { return data.delete(String(k)); },
      };
    },
    async delete() { data.clear(); return true; },
  };
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const jpeg = (size = 1000) => new Response(new Uint8Array(size), { status: 200, headers: { 'content-type': 'image/jpeg' } });
const summary = (title, thumb, extra = {}) => ({ type: 'standard', title, titles: { canonical: title.replace(/ /g, '_'), normalized: title },
  content_urls: { desktop: { page: `https://de.wikipedia.org/wiki/${encodeURIComponent(title)}` } },
  ...(thumb ? { thumbnail: { source: thumb, width: 330 }, originalimage: { source: thumb.replace(/\/thumb|\/\d+px-[^/]+$/g, ''), width: 2000 } } : {}), ...extra });

/** Fake-Umgebung: routes(url) → Response | Error; Uhr läuft über sleep. */
function env(routes, opts = {}) {
  let t = 1_700_000_000_000;
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), at: t, init });
    const r = await routes(String(url), calls.length);
    if (r instanceof Error) throw r;
    return r ?? new Response('nf', { status: 404 });
  };
  const storage = opts.storage || fakeStorage();
  const caches = opts.caches || fakeCaches();
  let n = 0;
  const inst = createImages({ fetch, caches, storage, now: () => t, sleep: async (ms) => { t += ms; },
    online: opts.online || (() => true), createObjectURL: () => `blob:${++n}`, revokeObjectURL: () => {}, limits: opts.limits });
  return { inst, calls, storage, caches, advance: (ms) => { t += ms; }, now: () => t };
}

test('Heuristik: SVG/Wappen/Karte verwerfen, Fotos behalten', () => {
  assert.ok(isSvg(`${T}/2/2d/Greater_coat_of_arms_of_Copenhagen.svg/500px-Greater_coat_of_arms_of_Copenhagen.svg.png`));
  assert.ok(!isPhotoName(`${T}/2/2d/Greater_coat_of_arms_of_Copenhagen.svg/500px-Greater_coat_of_arms_of_Copenhagen.svg.png`));
  assert.ok(!isPhotoName('Datei:Lissabon_Wappen.png'));
  assert.ok(!isPhotoName('Datei:Locator_map_Lisbon.png'));
  assert.ok(!isPhotoName('Datei:Animation.gif'));
  assert.ok(isPhotoName(`${T}/5/53/Copenhagen_Collage.jpg/500px-Copenhagen_Collage.jpg`));
  assert.ok(isPhotoName('Datei:Village_Mapleton.JPG'), 'Teilwörter wie „Village“/„Maple“ zählen nicht');
  assert.equal(cleanSrc('//thumb.wikimedia.org/a/500px-b.jpg?utm=1'), 'https://thumb.wikimedia.org/a/500px-b.jpg');
  assert.equal(cleanSrc('https://evil.example/a.jpg'), null);
  assert.equal(sizeSrc(`${T}/a/330px-b.jpg`, 2000), `${T}/a/500px-b.jpg`);
  assert.equal(sizeSrc(`${T}/a/330px-b.jpg`, 400), `${T}/a/330px-b.jpg`, 'nicht über das Original hinaus');
  const ml = { items: [
    { type: 'image', title: 'Datei:Flag_of_X.svg', srcset: [{ src: '//thumb.wikimedia.org/x/Flag.svg/500px-Flag.svg.png', scale: '1x' }] },
    { type: 'video', title: 'Datei:Film.webm', srcset: [{ src: '//thumb.wikimedia.org/x/f.jpg', scale: '1x' }] },
    { type: 'image', title: 'Datei:Stadt.jpg', srcset: [{ src: '//thumb.wikimedia.org/x/Stadt.jpg/500px-Stadt.jpg?u=1', scale: '1x' }] },
  ] };
  assert.equal(pickFromMediaList(ml), 'https://thumb.wikimedia.org/x/Stadt.jpg/500px-Stadt.jpg');
  const ml2 = { items: [
    { type: 'image', title: 'Datei:Bandeira_municipal_de_Lisboa.png', srcset: [{ src: '//thumb.wikimedia.org/x/B.png/500px-Bandeira_municipal_de_Lisboa.png', scale: '1x' }] },
    { type: 'image', title: 'Datei:Rome_Montage.png', srcset: [{ src: '//thumb.wikimedia.org/x/M.png/500px-Rome_Montage.png', scale: '1x' }] },
    { type: 'image', title: 'Datei:Kolosseum.jpg', srcset: [{ src: '//thumb.wikimedia.org/x/K.jpg/500px-Kolosseum.jpg', scale: '1x' }] }] };
  assert.equal(pickFromMediaList(ml2), 'https://thumb.wikimedia.org/x/K.jpg/500px-Kolosseum.jpg', 'Flagge (pt) verworfen, JPEG vor PNG');
  const sat = { type: 'image', title: 'Datei:Rome_-_Sentinel-2.jpg', srcset: [{ src: '//thumb.wikimedia.org/x/S.jpg/500px-Rome_-_Sentinel-2.jpg', scale: '1x' }] };
  assert.equal(pickFromMediaList({ items: [sat, ml2.items[2]] }), 'https://thumb.wikimedia.org/x/K.jpg/500px-Kolosseum.jpg', 'Satellitenbild nachrangig');
  assert.equal(pickFromMediaList({ items: [sat] }), 'https://thumb.wikimedia.org/x/S.jpg/500px-Rome_-_Sentinel-2.jpg');
  assert.equal(pickFromMediaList({ items: ml2.items.slice(0, 2) }), 'https://thumb.wikimedia.org/x/M.png/500px-Rome_Montage.png');
});

test('Wappen im Summary → erstes Foto aus media-list; Api-User-Agent wird gesendet', async () => {
  const e = env((url) => {
    if (url.includes('de.wikipedia.org/api/rest_v1/page/summary/Kopenhagen')) return json(summary('Kopenhagen', `${T}/2/2d/Wappen.svg/330px-Wappen.svg.png`));
    if (url.includes('/page/media-list/Kopenhagen')) return json({ items: [
      { type: 'image', title: 'Datei:Wappen.svg', srcset: [{ src: '//thumb.wikimedia.org/w/Wappen.svg/500px-Wappen.svg.png', scale: '1x' }] },
      { type: 'image', title: 'Datei:Nyhavn.jpg', srcset: [{ src: '//thumb.wikimedia.org/w/Nyhavn.jpg/500px-Nyhavn.jpg', scale: '1x' }] }] });
    if (url.endsWith('500px-Nyhavn.jpg')) return jpeg(2000);
  });
  assert.equal(await e.inst.fetchTerm('Kopenhagen'), true);
  const en = e.inst.entry('kopenhagen');
  assert.equal(en.src, 'https://thumb.wikimedia.org/w/Nyhavn.jpg/500px-Nyhavn.jpg');
  assert.equal(en.lang, 'de');
  assert.equal(en.page, 'https://de.wikipedia.org/wiki/Kopenhagen');
  assert.equal(e.calls[0].init.headers['Api-User-Agent'].startsWith('Elo-Duell/1.0.2'), true);
  assert.equal(e.calls[2].init.headers, undefined, 'Bild ohne Zusatz-Header (kein Preflight)');
  assert.ok(e.caches.data.has(en.src));
  assert.deepEqual(e.inst.usage(), { count: 1, bytes: 2000 });
  assert.equal(e.inst.urlFor('Kopenhagen'), 'blob:1');
});

test('Fallback de→en; Begriffsklärung zählt als kein Bild', async () => {
  const e = env((url) => {
    if (url.startsWith('https://de.wikipedia.org/api/rest_v1/page/summary/Emma')) return json({ type: 'disambiguation', title: 'Emma' });
    if (url.startsWith('https://en.wikipedia.org/api/rest_v1/page/summary/Emma')) return json(summary('Emma (novel)', `${T}/e/Emma.jpg/330px-Emma.jpg`));
    if (url.startsWith('https://de.wikipedia.org/api/rest_v1/page/summary/Eiffel_Tower')) return new Response('', { status: 404 });
    if (url.startsWith('https://en.wikipedia.org/api/rest_v1/page/summary/Eiffel_Tower')) return json({ type: 'disambiguation', title: 'Eiffel Tower' });
    if (url.endsWith('px-Emma.jpg')) return jpeg();
  });
  assert.equal(await e.inst.fetchTerm('Emma'), true);
  const en = e.inst.entry('Emma');
  assert.equal(en.lang, 'en');
  assert.equal(en.title, 'Emma (novel)');
  assert.ok(en.src.endsWith('/500px-Emma.jpg'), 'Vorschau auf 500 px angehoben');
  assert.equal(await e.inst.fetchTerm('Eiffel Tower'), false);
  assert.equal(e.inst.entry('Eiffel Tower'), null);
  assert.ok(e.calls.every((c) => !c.url.includes('media-list')), 'Begriffsklärung/404 ohne weitere Anfragen');
});

test('Miss-Marker: erst nach 30 Tagen neu versuchen; Netzfehler werden nicht gemerkt', async () => {
  let offline = false;
  const e = env((url) => {
    if (offline) return new TypeError('Failed to fetch');
    if (url.includes('/summary/')) return new Response('', { status: 404 });
  }, { online: () => true, limits: { retries: 0 } });
  await e.inst.request(['Xyzzy']);
  const n = e.calls.length;
  assert.equal(n, 2, 'de und en gefragt');
  assert.ok(JSON.parse(e.storage.getItem(META_KEY)).e.xyzzy.m > 0);
  await e.inst.request(['Xyzzy']);
  assert.equal(e.calls.length, n, 'Miss-Marker verhindert neue Anfrage');
  e.advance(29 * DAY);
  await e.inst.request(['Xyzzy']);
  assert.equal(e.calls.length, n);
  e.advance(2 * DAY);
  await e.inst.request(['Xyzzy']);
  assert.equal(e.calls.length, n + 2, 'nach 30 Tagen neu versucht');

  offline = true;
  await e.inst.request(['Neu', 'Andere']);
  assert.equal(JSON.parse(e.storage.getItem(META_KEY)).e.neu, undefined, 'Netzfehler → kein Miss-Marker');
  assert.equal(e.calls.filter((c) => c.url.includes('Andere')).length, 0, 'Lauf nach Netzfehler abgebrochen');
});

test('Kein Laden offline oder bei ausgeschaltetem Schalter', async () => {
  const e = env(() => json({}), { online: () => false });
  await e.inst.request(['Rom']);
  assert.equal(e.calls.length, 0);
  const e2 = env(() => json({}));
  e2.inst.setEnabledSource(() => false);
  await e2.inst.request(['Rom']);
  assert.equal(e2.calls.length, 0);
  assert.equal(e2.inst.enabled(), false);
});

test('Drosselung: Abstand ≥ 1 s, 429 → exponentiell zurückstellen', async () => {
  let n429 = 2;
  const e = env((url) => {
    if (url.includes('/summary/') && n429 > 0) { n429--; return new Response('', { status: 429 }); }
    if (url.includes('/summary/')) return json(summary(decodeURIComponent(url.split('/').pop()), `${T}/a/X.jpg/330px-X.jpg`));
    return jpeg();
  });
  await e.inst.request(['A', 'B']);
  const at = e.calls.map((c) => c.at);
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= LIMITS.gapMs, `Abstand ${i}: ${at[i] - at[i - 1]}`);
  assert.equal(at[1] - at[0], LIMITS.backoffMs, 'erste Rückstellung');
  assert.equal(at[2] - at[1], LIMITS.backoffMs * 2, 'zweite Rückstellung verdoppelt');
  assert.ok(e.inst.entry('A') && e.inst.entry('B'));
});

test('Zu großes Bild → kleinere Stufe', async () => {
  const e = env((url) => {
    if (url.includes('/summary/')) return json(summary('Ostsee', `${T}/o/Ostsee.png/330px-Ostsee.png`));
    if (url.endsWith('/500px-Ostsee.png')) return jpeg(LIMITS.maxImageBytes + 1);
    if (url.endsWith('/250px-Ostsee.png')) return jpeg(100_000);
  });
  assert.equal(await e.inst.fetchTerm('Ostsee'), true);
  assert.ok(e.inst.entry('Ostsee').src.endsWith('/250px-Ostsee.png'));
});

test('LRU-Grenzen: Anzahl, Byte, Metadaten; Aufräumen entfernt gelöschte Optionen', async () => {
  const e = env((url) => {
    if (url.includes('/summary/')) { const t = decodeURIComponent(url.split('/').pop()); return json(summary(t, `${T}/a/${t}.jpg/330px-${t}.jpg`)); }
    return jpeg(1000);
  }, { limits: { maxImages: 3, maxBytes: 2500, maxEntries: 5, gapMs: 0 } });
  for (const t of ['A', 'B']) await e.inst.fetchTerm(t);
  e.advance(1000);
  await e.inst.preload(['A']);            // A zuletzt benutzt
  e.advance(1000);
  await e.inst.fetchTerm('C');            // 3000 Byte > 2500 → ältestes (B) fliegt
  assert.deepEqual(['A', 'B', 'C'].map((t) => !!e.inst.entry(t)), [true, false, true]);
  assert.equal(e.caches.data.size, 2, 'Cache folgt den Metadaten');
  assert.ok(e.inst.usage().bytes <= 2500);

  await e.inst.prune(['C', 'Neu']);       // A gelöscht
  assert.equal(e.inst.entry('A'), null);
  assert.equal(e.caches.data.size, 1);
  assert.deepEqual(e.inst.usage(), { count: 1, bytes: 1000 });

  const raw = JSON.parse(e.storage.getItem(META_KEY)).e;
  for (let i = 0; i < 10; i++) raw['miss' + i] = { m: i };
  e.storage.setItem(META_KEY, JSON.stringify({ v: 1, e: raw }));
  const e2 = env(() => null, { storage: e.storage, caches: e.caches, limits: { maxEntries: 5 } });
  await e2.inst.prune(['C', ...Array.from({ length: 10 }, (_, i) => 'miss' + i)]);
  const keys = Object.keys(JSON.parse(e.storage.getItem(META_KEY)).e);
  assert.equal(keys.length, 5);
  assert.ok(keys.includes('c'), 'Bild bleibt, älteste Miss-Marker gehen zuerst');
});

test('Bild fehlt im Cache → Eintrag vergessen; clear leert alles; defekte Metadaten → leer', async () => {
  const e = env((url) => (url.includes('/summary/') ? json(summary('Rom', `${T}/r/Rom.jpg/500px-Rom.jpg`)) : jpeg()));
  await e.inst.fetchTerm('Rom');
  e.caches.data.clear();
  const e2 = env(() => null, { storage: e.storage, caches: e.caches });
  await e2.inst.preload(['Rom']);
  assert.equal(e2.inst.entry('Rom'), null);
  await e.inst.fetchTerm('Rom');
  await e.inst.clear();
  assert.deepEqual(e.inst.usage(), { count: 0, bytes: 0 });
  assert.equal(e.storage.getItem(META_KEY), null);
  e.storage.setItem(META_KEY, '{kaputt');
  const e3 = env(() => null, { storage: e.storage });
  assert.deepEqual(e3.inst.usage(), { count: 0, bytes: 0 });
});

test('loadImagesForList: räumt auf, lädt gespeicherte und holt fehlende', async () => {
  const e = env((url) => (url.includes('/summary/') ? json(summary('Rom', `${T}/r/Rom.jpg/500px-Rom.jpg`)) : jpeg()), { limits: { gapMs: 0 } });
  const store = {
    getList: () => ({ options: [{ name: 'Rom' }] }),
    listLists: () => [{ options: [{ name: 'Rom' }] }],
  };
  loadImagesForList(store, 'l1', e.inst);
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(e.inst.entry('Rom'));
  assert.equal(e.inst.urlFor('Rom'), 'blob:1');
});
