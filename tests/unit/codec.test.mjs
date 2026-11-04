// Eigentümer: D – Tests für js/share/codec.js (docs/ARCHITEKTUR.md §5, §10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PAYLOAD, MAX_INFLATED, MAX_OPTIONS, MAX_NAME,
  encodeShare, decodeShare, buildShareUrl, extractPayload, toShareData, toPartnerRanking, ShareError,
} from '../../js/share/codec.js';

/** @returns {import('../../js/types.js').ShareData} */
function sample(extra = {}) {
  return {
    v: 1, l: 'l_ab12cd34ef', n: 'Urlaubsziele – Süden 🌞', p: 'Änne', d: 'd_x9y8z7w6v5', t: 1762290000,
    o: [['Lissabon', 1048, 6], ['Köln 🍺', 1016, 5], ['Ærø', 990, 4], ['Straße', 950, 3]],
    a: ['l_qq11ww22ee'],
    ...extra,
  };
}

/** @param {string} s */
const b64url = (s) => Buffer.from(s, 'utf8').toString('base64url');
/** @param {Uint8Array} b */
const b64urlBytes = (b) => Buffer.from(b).toString('base64url');

/** @param {Uint8Array} bytes */
async function deflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** @param {Promise<any>} p @param {string} code */
async function rejectsWith(p, code) {
  await assert.rejects(p, (err) => {
    assert.ok(err instanceof ShareError, `ShareError erwartet, bekam ${err}`);
    assert.equal(err.code, code);
    assert.ok(err.message.length > 0);
    return true;
  });
}

/** Führt fn ohne CompressionStream/DecompressionStream aus. */
async function withoutStreams(fn, { keepDecompress = false } = {}) {
  const cs = globalThis.CompressionStream, ds = globalThis.DecompressionStream;
  try {
    // @ts-ignore
    delete globalThis.CompressionStream;
    // @ts-ignore
    if (!keepDecompress) delete globalThis.DecompressionStream;
    return await fn();
  } finally {
    globalThis.CompressionStream = cs;
    globalThis.DecompressionStream = ds;
  }
}

test('Konstanten wie in §4D', () => {
  assert.equal(MAX_PAYLOAD, 65536);
  assert.equal(MAX_INFLATED, 262144);
  assert.equal(MAX_OPTIONS, 500);
  assert.equal(MAX_NAME, 120);
});

test('Roundtrip z mit Umlauten und Emoji', async () => {
  const many = sample({ o: Array.from({ length: 40 }, (_, i) => [`Option Nummer ${i} äöü 🎉`, 1200 - i, i % 7]) });
  const payload = await encodeShare(many);
  assert.match(payload, /^1\.z\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeShare(payload), many);
});

test('Roundtrip j (ohne CompressionStream)', async () => {
  const d = sample();
  const payload = await withoutStreams(() => encodeShare(d));
  assert.match(payload, /^1\.j\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeShare(payload), d);
  // j geht auch ganz ohne DecompressionStream
  assert.deepEqual(await withoutStreams(() => decodeShare(payload)), d);
});

test('CompressionStream ohne deflate-raw (Chrome < 103) → j', async () => {
  const cs = globalThis.CompressionStream;
  globalThis.CompressionStream = class { constructor() { throw new TypeError('Unsupported'); } };
  try {
    const payload = await encodeShare(sample());
    assert.ok(payload.startsWith('1.j.'));
  } finally { globalThis.CompressionStream = cs; }
});

test('z-Payload ohne DecompressionStream → version', async () => {
  const payload = await encodeShare(sample({ o: Array.from({ length: 30 }, (_, i) => [`O${i}`, 1000, 0]) }));
  assert.ok(payload.startsWith('1.z.'));
  await rejectsWith(withoutStreams(() => decodeShare(payload)), 'version');
});

test('Aliase a: optional, höchstens 20', async () => {
  const noA = sample(); delete noA.a;
  const back = await decodeShare(await encodeShare(noA));
  assert.equal('a' in back, false);
  const many = sample({ a: Array.from({ length: 25 }, (_, i) => `l_alias${i}`) });
  const back2 = await decodeShare(await encodeShare(many));
  assert.equal(back2.a?.length, 20);
  await rejectsWith(decodeShare('1.j.' + b64url(JSON.stringify(sample({ a: [1, 2] })))), 'format');
});

test('unbekannte Felder werden ignoriert', async () => {
  const d = await decodeShare('1.j.' + b64url(JSON.stringify({ ...sample(), x: 42, zukunft: { a: 1 } })));
  assert.equal('x' in d, false);
  assert.equal('zukunft' in d, false);
  assert.equal(d.n, sample().n);
});

test('Grenze: Payload-Länge vor dem Dekodieren', async () => {
  await rejectsWith(decodeShare('1.j.' + 'A'.repeat(MAX_PAYLOAD)), 'zu-gross');
});

test('Grenze: entpackt über 256 KB → zu-gross (Zip-Bombe)', async () => {
  const big = new TextEncoder().encode('{"v":1,"x":"' + ' '.repeat(2 * 1024 * 1024) + '"}');
  const packed = await deflate(big);
  const payload = '1.z.' + b64urlBytes(packed);
  assert.ok(payload.length < MAX_PAYLOAD, 'Payload selbst ist klein');
  await rejectsWith(decodeShare(payload), 'zu-gross');
});

test('Grenze: knapp unter 256 KB entpackt ist erlaubt', async () => {
  const filler = 'x'.repeat(MAX_INFLATED - 400);
  const json = JSON.stringify({ ...sample(), pad: filler });
  assert.ok(json.length <= MAX_INFLATED);
  const payload = '1.z.' + b64urlBytes(await deflate(new TextEncoder().encode(json)));
  const d = await decodeShare(payload);
  assert.equal(d.l, sample().l);
});

test('Grenze: 500 Optionen ok, 501 zu-gross', async () => {
  const o500 = Array.from({ length: 500 }, (_, i) => [`Option ${i}`, 1000, 0]);
  const ok = await decodeShare(await encodeShare(sample({ o: o500 })));
  assert.equal(ok.o.length, 500);
  const o501 = [...o500, ['Eine zu viel', 1000, 0]];
  await rejectsWith(decodeShare(await encodeShare(sample({ o: o501 }))), 'zu-gross');
});

test('Grenze: Namen ≤ 120 Zeichen', async () => {
  const ok = await decodeShare(await encodeShare(sample({ o: [['x'.repeat(120), 1000, 1]] })));
  assert.equal(ok.o[0][0].length, 120);
  await rejectsWith(decodeShare(await encodeShare(sample({ o: [['x'.repeat(121), 1000, 1]] }))), 'format');
  await rejectsWith(decodeShare(await encodeShare(sample({ n: 'n'.repeat(121) }))), 'format');
  await rejectsWith(decodeShare(await encodeShare(sample({ p: 'p'.repeat(121) }))), 'format');
});

test('Zahlen müssen endlich sein', async () => {
  // JSON kennt kein Infinity → null; ebenso Strings statt Zahlen
  await rejectsWith(decodeShare('1.j.' + b64url(JSON.stringify(sample({ o: [['A', null, 1]] })))), 'format');
  await rejectsWith(decodeShare('1.j.' + b64url(JSON.stringify(sample({ o: [['A', '1000', 1]] })))), 'format');
  await rejectsWith(decodeShare('1.j.' + b64url(JSON.stringify(sample({ t: null })))), 'format');
  await rejectsWith(decodeShare('1.j.' + b64url('{"v":1,"l":"l_x","n":"","p":"","d":"d_x","t":1e999,"o":[]}')), 'format');
});

test('ShareError-Codes: format', async () => {
  for (const bad of ['', 'hallo', '1.z', '1-z-abc', 'x.z.abc', '1.Z.abc', '1.z.ab+c', '1.z.ab=']) {
    await rejectsWith(decodeShare(bad), 'format');
  }
  await rejectsWith(decodeShare(/** @type {any} */ (null)), 'format');
  await rejectsWith(decodeShare('0.j.' + b64url(JSON.stringify(sample()))), 'format');
  await rejectsWith(decodeShare('1.j.' + b64url('[1,2,3]')), 'format');
  await rejectsWith(decodeShare('1.j.' + b64url(JSON.stringify({ ...sample(), v: 0 }))), 'format');
  await rejectsWith(decodeShare('1.j.' + b64url(JSON.stringify({ ...sample(), l: '' }))), 'format');
  await rejectsWith(decodeShare('1.j.' + b64url(JSON.stringify({ ...sample(), o: [['', 1000, 0]] }))), 'format');
  await rejectsWith(decodeShare('1.j.' + b64url(JSON.stringify({ ...sample(), o: 'x' }))), 'format');
});

test('ShareError-Codes: version', async () => {
  await rejectsWith(decodeShare('2.z.' + b64url('egal')), 'version');
  await rejectsWith(decodeShare('1.j.' + b64url(JSON.stringify({ ...sample(), v: 2 }))), 'version');
  await rejectsWith(decodeShare('1.b.' + b64url('egal')), 'version');
});

test('ShareError-Codes: beschaedigt', async () => {
  const good = await encodeShare(sample({ o: Array.from({ length: 30 }, (_, i) => [`O${i}`, 1000, 0]) }));
  await rejectsWith(decodeShare(good.slice(0, Math.floor(good.length / 2))), 'beschaedigt');
  await rejectsWith(decodeShare('1.z.' + b64url('das ist kein deflate')), 'beschaedigt');
  await rejectsWith(decodeShare('1.j.' + b64url('{"v":1,')), 'beschaedigt');
  await rejectsWith(decodeShare('1.j.' + b64urlBytes(new Uint8Array([0xff, 0xfe, 0x00]))), 'beschaedigt');
  await rejectsWith(decodeShare('1.j.A'), 'beschaedigt');
});

test('buildShareUrl', () => {
  const loc = { origin: 'https://user.github.io', pathname: '/elo-duell/' };
  assert.equal(buildShareUrl('1.z.abc', loc), 'https://user.github.io/elo-duell/#i=1.z.abc');
});

test('extractPayload: URL, #i=, nackt, Text drumherum', () => {
  assert.equal(extractPayload('https://user.github.io/elo-duell/#i=1.z.aB-_9'), '1.z.aB-_9');
  assert.equal(extractPayload('#i=1.j.xyz'), '1.j.xyz');
  assert.equal(extractPayload('  1.z.abcDEF  '), '1.z.abcDEF');
  assert.equal(extractPayload('Schau mal: https://x.io/elo-duell/#i=1.z.QQQ. Viel Spaß!'), '1.z.QQQ');
  assert.equal(extractPayload('https://x.io/elo-duell/%23i%3D1.z.QQQ'), '1.z.QQQ');
  assert.equal(extractPayload(''), null);
  assert.equal(extractPayload('https://example.com/'), null);
  assert.equal(extractPayload('hallo welt'), null);
  assert.equal(extractPayload(/** @type {any} */ (undefined)), null);
});

test('toShareData: sortiert, gerundet, Aliase, Sekunden', () => {
  /** @type {any} */
  const list = {
    id: 'l_abc', name: 'Essen', aliases: ['l_fremd'], createdAt: 0, updatedAt: 0, stableShown: false,
    history: [], partners: [],
    options: [
      { id: 'o_1', name: 'Pizza', rating: 1000.4, duels: 2, wins: 1, draws: 0, losses: 1 },
      { id: 'o_2', name: 'Sushi', rating: 1031.6, duels: 3, wins: 3, draws: 0, losses: 0 },
      { id: 'o_3', name: 'Döner', rating: 968.0, duels: 3, wins: 0, draws: 0, losses: 3 },
    ],
  };
  const d = toShareData(list, { id: 'd_me', name: 'Anna' }, 1762290000999);
  assert.deepEqual(d, {
    v: 1, l: 'l_abc', n: 'Essen', p: 'Anna', d: 'd_me', t: 1762290000,
    o: [['Sushi', 1032, 3], ['Pizza', 1000, 2], ['Döner', 968, 3]], a: ['l_fremd'],
  });
});

test('toPartnerRanking: sentAt = t*1000', () => {
  const p = toPartnerRanking(sample(), 5);
  assert.deepEqual(p, {
    deviceId: 'd_x9y8z7w6v5', name: 'Änne', receivedAt: 5, sentAt: 1762290000000,
    options: [
      { name: 'Lissabon', rating: 1048, duels: 6 }, { name: 'Köln 🍺', rating: 1016, duels: 5 },
      { name: 'Ærø', rating: 990, duels: 4 }, { name: 'Straße', rating: 950, duels: 3 },
    ],
  });
});

test('Größe: 30 Optionen bleiben deutlich unter 1000 Zeichen URL', async () => {
  const names = ['Lissabon', 'Kopenhagen', 'Rom', 'Bergen', 'Dolomiten', 'Kreta', 'Edinburgh', 'Ostsee', 'Porto', 'Sevilla',
    'Wien', 'Prag', 'Budapest', 'Krakau', 'Dubrovnik', 'Split', 'Athen', 'Santorini', 'Malta', 'Sizilien',
    'Sardinien', 'Korsika', 'Mallorca', 'Teneriffa', 'Madeira', 'Azoren', 'Island', 'Lofoten', 'Stockholm', 'Helsinki'];
  const d = sample({ o: names.map((n, i) => [n, 1100 - i * 7, 8]) });
  const url = buildShareUrl(await encodeShare(d), { origin: 'https://user-2268431.github.io', pathname: '/elo-duell/' });
  assert.ok(url.length < 700, `URL-Länge ${url.length}`);
});
