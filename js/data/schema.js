// Eigentümer: B – Schema, Default-State, Migration, Validierung (docs/ARCHITEKTUR.md §3, §4B).
// DOM-frei, in Node importierbar.
/** @typedef {import('../types.js').AppState} AppState */
/** @typedef {import('../types.js').List} List */

export const SCHEMA = 1;

export class SchemaError extends Error {
  /** @param {string} message */
  constructor(message) { super(message); this.name = 'SchemaError'; }
}

/** ID der festen Beispielliste. */
export const EXAMPLE_LIST_ID = 'l_beispiel01';
const EXAMPLE_NAME = 'Urlaubsziele';
const EXAMPLE_OPTIONS = ['Lissabon', 'Kopenhagen', 'Rom', 'Bergen', 'Dolomiten', 'Kreta', 'Edinburgh', 'Ostsee'];

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Zufalls-ID aus [a-z0-9] (crypto.getRandomValues, Fallback Math.random).
 * @param {string} prefix z. B. "l_", "o_", "d_" @param {number} len Anzahl Zeichen nach dem Präfix
 * @returns {string}
 */
export function newId(prefix, len) {
  const bytes = new Uint8Array(len);
  try {
    globalThis.crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = prefix;
  // Byte % 36 ist minimal ungleich verteilt; für IDs unerheblich.
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/**
 * Default-State mit Beispielliste „Urlaubsziele“ (ID l_beispiel01) und frischer Geräte-ID.
 * @param {number} [now] ms seit Epoch (für Tests)
 * @returns {AppState}
 */
export function defaultState(now = Date.now()) {
  /** @type {List} */
  const example = {
    id: EXAMPLE_LIST_ID,
    aliases: [],
    name: EXAMPLE_NAME,
    createdAt: now,
    updatedAt: now,
    stableShown: false,
    options: EXAMPLE_OPTIONS.map((name, i) => ({
      id: 'o_bsp' + String(i + 1).padStart(3, '0'),
      name, rating: 1000, duels: 0, wins: 0, draws: 0, losses: 0,
    })),
    history: [],
    partners: [],
  };
  return {
    schema: SCHEMA,
    device: { id: newId('d_', 10), name: '' },
    lists: { [EXAMPLE_LIST_ID]: example },
    order: [EXAMPLE_LIST_ID],
    settings: {},
  };
}

/** @param {any} v @returns {v is Record<string, any>} */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Migrationskette: MIGRATIONS[n] hebt einen State von Version n auf n+1.
 * v0 = Vorabformat ohne Feld `schema` (sonst gleicher Aufbau wie v1).
 * @type {Record<number, (s:any)=>any>}
 */
const MIGRATIONS = {
  0: (s) => ({ ...s, schema: 1 }),
};

/** @param {any} o @param {string} k */
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Ergänzt fehlende optionale Felder, damit kleine Abweichungen nicht zum Totalverlust führen (wird nicht als Schaden gezählt).
 * @param {any} s @returns {any}
 */
function normalize(s) {
  if (!isObj(s.settings)) s.settings = {};
  if (isObj(s.device) && typeof s.device.name !== 'string') s.device.name = '';
  if (!isObj(s.lists)) return s;
  for (const [key, l] of Object.entries(s.lists)) {
    if (!isObj(l)) continue;
    if (typeof l.id !== 'string') l.id = key;
    if (!Array.isArray(l.aliases)) l.aliases = [];
    if (!Array.isArray(l.history)) l.history = [];
    if (!Array.isArray(l.partners)) l.partners = [];
    if (typeof l.stableShown !== 'boolean') l.stableShown = false;
    if (!Number.isFinite(l.createdAt)) l.createdAt = 0;
    if (!Number.isFinite(l.updatedAt)) l.updatedAt = l.createdAt;
    if (Array.isArray(l.options)) {
      for (const o of l.options) {
        if (!isObj(o)) continue;
        for (const f of ['duels', 'wins', 'draws', 'losses']) if (o[f] === undefined) o[f] = 0;
      }
    }
  }
  return s;
}

/** order reparieren: nur bekannte, eindeutige IDs; fehlende Listen hinten anhängen. @param {any} s */
function fixOrder(s) {
  if (!isObj(s.lists)) return;
  const ids = Object.keys(s.lists);
  const order = Array.isArray(s.order) ? s.order.filter((/** @type {any} */ id, /** @type {number} */ i, /** @type {any[]} */ a) =>
    typeof id === 'string' && own(s.lists, id) && a.indexOf(id) === i) : [];
  for (const id of ids) if (!order.includes(id)) order.push(id);
  s.order = order;
}

/** @param {any} v @returns {number} gültiger Zähler (ganzzahlig ≥ 0) */
const toCount = (v) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

/**
 * Repariert oder entfernt einzelne ungültige Teile (H1), statt den ganzen State zu verwerfen.
 * Nicht reparierbar bleibt nur, was validateState danach noch meldet (z. B. lists kein Objekt).
 * @param {any} s @returns {number} Anzahl entfernter oder reparierter Einträge
 */
function repair(s) {
  let n = 0;
  if (!isObj(s.device) || !isStr(s.device.id) || !s.device.id) {
    const name = isObj(s.device) && isStr(s.device.name) ? s.device.name : '';
    s.device = { id: newId('d_', 10), name };
    n++;
  }
  if (!isObj(s.lists)) return n;
  for (const [key, l] of Object.entries(s.lists)) {
    if (!isObj(l) || key === '__proto__') { delete s.lists[key]; n++; continue; }
    if (l.id !== key) { l.id = key; n++; }
    if (!isStr(l.name)) { l.name = 'Liste'; n++; }
    if (!l.aliases.every(isStr)) { l.aliases = l.aliases.filter(isStr); n++; }
    if (!Array.isArray(l.options)) { l.options = []; n++; }
    const optIds = new Set();
    const before = l.options.length;
    l.options = l.options.filter((/** @type {any} */ o) => {
      if (!isObj(o) || !isStr(o.id) || !o.id || !isStr(o.name) || optIds.has(o.id)) return false;
      optIds.add(o.id);
      return true;
    });
    n += before - l.options.length;
    for (const o of l.options) {
      if (!isNum(o.rating)) { o.rating = 1000; n++; }
      for (const f of ['duels', 'wins', 'draws', 'losses']) if (!isCount(o[f])) { o[f] = toCount(o[f]); n++; }
    }
    const hBefore = l.history.length;
    l.history = l.history.filter((/** @type {any} */ d) => isObj(d) && optIds.has(d.a) && optIds.has(d.b) && d.a !== d.b
      && [1, 0.5, 0].includes(d.s) && isNum(d.da) && isNum(d.db) && isNum(d.t));
    n += hBefore - l.history.length;
    const pBefore = l.partners.length;
    l.partners = l.partners.filter((/** @type {any} */ pr) => isObj(pr) && isStr(pr.deviceId) && pr.deviceId && Array.isArray(pr.options));
    n += pBefore - l.partners.length;
    for (const pr of l.partners) {
      if (!isStr(pr.name)) { pr.name = ''; n++; }
      if (!isNum(pr.sentAt)) { pr.sentAt = 0; n++; }
      if (!isNum(pr.receivedAt)) { pr.receivedAt = pr.sentAt; n++; }
      const oBefore = pr.options.length;
      pr.options = pr.options.filter((/** @type {any} */ o) => isObj(o) && isStr(o.name) && isNum(o.rating) && isNum(o.duels));
      n += oBefore - pr.options.length;
    }
  }
  return n;
}

/**
 * Wie migrate, meldet aber zusätzlich, wie viele beschädigte Einträge entfernt oder repariert wurden.
 * @param {any} raw geparstes JSON (oder JSON-String)
 * @returns {{state:AppState, repaired:number}}
 */
export function migrateWithReport(raw) {
  let s = raw;
  if (typeof s === 'string') {
    try { s = JSON.parse(s); } catch { throw new SchemaError('Die Daten sind kein gültiges JSON.'); }
  }
  if (!isObj(s)) throw new SchemaError('Die Daten haben ein unbekanntes Format.');
  try { s = JSON.parse(JSON.stringify(s)); } catch { throw new SchemaError('Die Daten lassen sich nicht lesen.'); }
  let version = s.schema === undefined ? 0 : s.schema;
  if (!Number.isInteger(version) || version < 0) throw new SchemaError('Unbekannte Datenversion.');
  if (version > SCHEMA) throw new SchemaError('Die Daten stammen aus einer neueren App-Version. Bitte App aktualisieren.');
  while (version < SCHEMA) {
    const step = MIGRATIONS[version];
    if (!step) throw new SchemaError(`Keine Migration von Version ${version} vorhanden.`);
    s = step(s);
    version++;
  }
  s = normalize(s);
  const repaired = repair(s);
  fixOrder(s);
  const errors = validateState(s);
  if (errors.length) {
    const more = errors.length > 3 ? ` (und ${errors.length - 3} weitere)` : '';
    throw new SchemaError('Die Daten sind fehlerhaft: ' + errors.slice(0, 3).join('; ') + more);
  }
  return { state: /** @type {AppState} */ (s), repaired };
}

/**
 * Kette v0→v1…, repariert einzelne ungültige Einträge; wirft SchemaError nur bei Unbrauchbarem.
 * Gibt immer ein frisches Objekt zurück.
 * @param {any} raw geparstes JSON (oder JSON-String)
 * @returns {AppState}
 */
export function migrate(raw) {
  return migrateWithReport(raw).state;
}

/** @param {any} n */ const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
/** @param {any} n */ const isCount = (n) => Number.isInteger(n) && n >= 0;
/** @param {any} v */ const isStr = (v) => typeof v === 'string';

/**
 * @param {any} s @returns {string[]} Fehlerliste, leer = gültig
 */
export function validateState(s) {
  /** @type {string[]} */ const e = [];
  if (!isObj(s)) return ['State ist kein Objekt'];
  if (s.schema !== SCHEMA) e.push(`schema muss ${SCHEMA} sein`);
  if (!isObj(s.device) || !isStr(s.device.id) || !s.device.id || !isStr(s.device.name)) e.push('device ungültig');
  if (!isObj(s.settings)) e.push('settings ungültig');
  if (!isObj(s.lists)) { e.push('lists ungültig'); return e; }
  if (!Array.isArray(s.order)) e.push('order ungültig');
  else {
    const seen = new Set();
    for (const id of s.order) {
      if (!isStr(id) || !own(s.lists, id)) e.push(`order: unbekannte Liste ${String(id)}`);
      else if (seen.has(id)) e.push(`order: doppelte Liste ${id}`);
      seen.add(id);
    }
    for (const id of Object.keys(s.lists)) if (!seen.has(id)) e.push(`order: Liste ${id} fehlt`);
  }
  for (const [key, l] of Object.entries(s.lists)) {
    const p = `Liste ${key}`;
    if (!isObj(l)) { e.push(`${p}: kein Objekt`); continue; }
    if (l.id !== key) e.push(`${p}: id passt nicht`);
    if (!isStr(l.name)) e.push(`${p}: name fehlt`);
    if (!isNum(l.createdAt) || !isNum(l.updatedAt)) e.push(`${p}: Zeitstempel ungültig`);
    if (typeof l.stableShown !== 'boolean') e.push(`${p}: stableShown ungültig`);
    if (!Array.isArray(l.aliases) || !l.aliases.every(isStr)) e.push(`${p}: aliases ungültig`);
    if (!Array.isArray(l.options)) { e.push(`${p}: options fehlen`); continue; }
    const optIds = new Set();
    for (const o of l.options) {
      if (!isObj(o) || !isStr(o.id) || !o.id || !isStr(o.name)) { e.push(`${p}: Option ungültig`); continue; }
      if (optIds.has(o.id)) e.push(`${p}: Option ${o.id} doppelt`);
      optIds.add(o.id);
      if (!isNum(o.rating)) e.push(`${p}: Wertung von ${o.id} ungültig`);
      if (!isCount(o.duels) || !isCount(o.wins) || !isCount(o.draws) || !isCount(o.losses)) e.push(`${p}: Zähler von ${o.id} ungültig`);
    }
    if (!Array.isArray(l.history)) e.push(`${p}: history ungültig`);
    else {
      for (const d of l.history) {
        if (!isObj(d) || !optIds.has(d.a) || !optIds.has(d.b) || d.a === d.b || ![1, 0.5, 0].includes(d.s)
          || !isNum(d.da) || !isNum(d.db) || !isNum(d.t)) { e.push(`${p}: Duell ungültig`); break; }
      }
    }
    if (!Array.isArray(l.partners)) e.push(`${p}: partners ungültig`);
    else {
      for (const pr of l.partners) {
        if (!isObj(pr) || !isStr(pr.deviceId) || !isStr(pr.name) || !isNum(pr.sentAt) || !isNum(pr.receivedAt)
          || !Array.isArray(pr.options)
          || !pr.options.every((/** @type {any} */ o) => isObj(o) && isStr(o.name) && isNum(o.rating) && isNum(o.duels))) {
          e.push(`${p}: Partner ungültig`); break;
        }
      }
    }
  }
  return e;
}
