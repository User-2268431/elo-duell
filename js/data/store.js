// Eigentümer: B – zentrale Datenhaltung (docs/ARCHITEKTUR.md §3, §4B).
// Wichtig: Der Import dieses Moduls darf in Node nicht werfen (kein direkter Zugriff auf window/localStorage).
import { applyResult, START_RATING } from '../logic/elo.js';
import { normalizeName } from '../logic/text.js';
import { defaultState, migrateWithReport, newId, SchemaError } from './schema.js';

/** @typedef {import('../types.js').AppState} AppState */
/** @typedef {import('../types.js').List} List */
/** @typedef {import('../types.js').Option} Option */
/** @typedef {import('../types.js').Duel} Duel */
/** @typedef {import('../types.js').Device} Device */
/** @typedef {import('../types.js').PartnerRanking} PartnerRanking */
/** @typedef {import('../types.js').ShareData} ShareData */

export const STORAGE_KEY = 'elo-duell:state';
/** Ablage für einen beschädigten Rohinhalt (ältester Eintrag; wird nie überschrieben). */
export const BROKEN_KEY = 'elo-duell:defekt';
/** Weitere beschädigte Rohinhalte: `elo-duell:defekt:<ms>`; insgesamt höchstens MAX_BROKEN. */
export const BROKEN_PREFIX = 'elo-duell:defekt:';
export const MAX_BROKEN = 3;
/** Partner-Stände dürfen höchstens so weit in der Zukunft liegen (N2). */
const FUTURE_SLACK = 24 * 60 * 60 * 1000;

const MAX_NAME = 120;
const MAX_ALIASES = 20;
const MATCH_MIN = 0.6;

const MSG_MEMORY = 'Speichern ist in diesem Browser nicht möglich – Änderungen gehen beim Schließen verloren. Bitte Sicherung exportieren.';
const MSG_QUOTA = 'Speicher voll – Änderungen gehen beim Schließen verloren. Bitte Sicherung exportieren (Einstellungen).';
const MSG_WRITE = 'Speichern fehlgeschlagen – Änderungen gehen beim Schließen verloren. Bitte Sicherung exportieren.';
const MSG_BROKEN = 'Gespeicherte Daten waren beschädigt und wurden beiseitegelegt. Die App startet mit der Beispielliste.';
const MSG_BROKEN_KEPT = ' Die Originaldaten kannst du in den Einstellungen herunterladen.';
/** @param {number} n */
const msgRepaired = (n) => `Gespeicherte Daten waren teilweise beschädigt: ${n.toLocaleString('de-DE')} ${n === 1 ? 'beschädigter Eintrag' : 'beschädigte Einträge'} entfernt oder repariert.`;

/** @template T @param {T} v @returns {T} */
const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

/** Kürzt auf MAX_NAME Codepoints (keine halben Surrogatpaare, wie parseOptionLines). @param {string} s @returns {string} */
function clipName(s) {
  if (s.length <= MAX_NAME) return s;
  const cps = Array.from(s);
  return cps.length <= MAX_NAME ? s : cps.slice(0, MAX_NAME).join('').trimEnd();
}

/** @param {any} name @returns {string} */
const cleanName = (name) => clipName(String(name ?? '').normalize('NFC').replace(/\s+/g, ' ').trim());

/** @param {any} v @returns {boolean} */
const own = (v, /** @type {string} */ k) => Object.prototype.hasOwnProperty.call(v, k);

/** @param {any} err @returns {boolean} */
function isQuotaError(err) {
  if (!err) return false;
  return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014;
}

/** @param {any} err @returns {boolean} */
const isSecurityError = (err) => !!err && err.name === 'SecurityError';

/** @returns {Storage|null} */
function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/**
 * @param {{storage?:Storage|null, now?:()=>number}} [deps]
 */
export function createStore(deps = {}) {
  const now = deps.now ?? (() => Date.now());
  /** @type {Storage|null} */ let storage = null;
  /** @type {'local'|'memory'} */ let mode = 'memory';
  /** @type {string|null} */ let lastError = null;
  /** @type {AppState} */ let state = defaultState(now());
  let initialized = false;
  let persistRequested = false;
  /** @type {Set<(s:AppState)=>void>} */ const subscribers = new Set();
  /** @type {Set<(msg:string)=>void>} */ const warners = new Set();

  /** @param {string} msg */
  function warn(msg) {
    for (const fn of warners) { try { fn(msg); } catch (e) { console.error(e); } }
  }

  function notify() {
    if (!subscribers.size) return;
    const snap = clone(state);
    for (const fn of [...subscribers]) { try { fn(snap); } catch (e) { console.error(e); } }
  }

  function requestPersist() {
    if (persistRequested) return;
    persistRequested = true;
    try {
      const p = globalThis.navigator?.storage?.persist?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* egal */ }
  }

  /**
   * Schreibt den State synchron. Gibt eine Fehlermeldung zurück (oder null).
   * @param {{userChange?:boolean}} [opts] userChange: persist() nach dem ersten erfolgreichen Schreiben anfordern
   * @returns {string|null}
   */
  function write(opts = {}) {
    if (mode !== 'local' || !storage) return null;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      lastError = null;
      if (opts.userChange) requestPersist();
      return null;
    } catch (err) {
      const before = lastError;
      if (isSecurityError(err)) {
        mode = 'memory';
        lastError = MSG_MEMORY;
      } else {
        lastError = isQuotaError(err) ? MSG_QUOTA : MSG_WRITE;
      }
      return before === lastError ? null : lastError;
    }
  }

  /** Nach jeder Änderung: speichern, ggf. warnen, Abonnenten benachrichtigen. */
  function commit() {
    const msg = write({ userChange: true });
    if (msg) warn(msg);
    notify();
  }

  /** @param {string} id @returns {List} */
  function mustList(id) {
    const l = typeof id === 'string' && own(state.lists, id) ? state.lists[id] : undefined;
    if (!l) throw new Error(`Liste ${id} nicht gefunden`);
    return l;
  }

  /** @param {List} l */
  function touch(l) { l.updatedAt = now(); }

  /** @param {List} l @returns {string} */
  function freeOptionId(l) {
    const used = new Set(l.options.map((o) => o.id));
    let id;
    do { id = newId('o_', 6); } while (used.has(id));
    return id;
  }

  /** @param {List} l @param {string[]} names @returns {number} */
  function addNames(l, names) {
    const seen = new Set(l.options.map((o) => normalizeName(o.name)));
    let added = 0;
    for (const raw of names || []) {
      const name = cleanName(raw);
      if (!name) continue;
      const key = normalizeName(name);
      if (seen.has(key)) continue;
      seen.add(key);
      l.options.push({ id: freeOptionId(l), name, rating: START_RATING, duels: 0, wins: 0, draws: 0, losses: 0 });
      added++;
    }
    return added;
  }

  /** @param {any} raw @returns {{state:AppState, repaired:number}} */
  function parseStored(raw) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new SchemaError('kein JSON'); }
    return migrateWithReport(parsed);
  }

  /** Vorhandene Ablagen für beschädigte Rohinhalte, älteste zuerst. @returns {{key:string, at:number}[]} */
  function brokenEntries() {
    if (!storage) return [];
    /** @type {{key:string, at:number}[]} */ const out = [];
    try { if (storage.getItem(BROKEN_KEY) !== null) out.push({ key: BROKEN_KEY, at: 0 }); } catch { /* egal */ }
    try {
      const n = Number(storage.length) || 0;
      for (let i = 0; i < n; i++) {
        const k = storage.key(i);
        if (typeof k === 'string' && k.startsWith(BROKEN_PREFIX)) out.push({ key: k, at: Number(k.slice(BROKEN_PREFIX.length)) || 0 });
      }
    } catch { /* Storage ohne key()/length */ }
    return out.sort((a, b) => (a.key === BROKEN_KEY ? -1 : b.key === BROKEN_KEY ? 1 : a.at - b.at));
  }

  /**
   * Legt einen beschädigten Rohinhalt beiseite, ohne einen vorhandenen zu überschreiben (H1).
   * Höchstens MAX_BROKEN Ablagen; ist alles voll, wird die jüngste ersetzt (die älteste bleibt immer).
   * @param {string} raw @returns {boolean} true, wenn der Inhalt jetzt gesichert ist
   */
  function keepBroken(raw) {
    if (!storage) return false;
    try {
      const entries = brokenEntries();
      for (const e of entries) if (storage.getItem(e.key) === raw) return true;
      if (!entries.some((e) => e.key === BROKEN_KEY)) {
        storage.setItem(BROKEN_KEY, raw);
        return true;
      }
      let t = now();
      while (entries.some((e) => e.key === BROKEN_PREFIX + t)) t++;
      if (entries.length >= MAX_BROKEN) {
        const newest = entries[entries.length - 1];
        if (newest.key !== BROKEN_KEY) storage.removeItem(newest.key);
      }
      storage.setItem(BROKEN_PREFIX + t, raw);
      return true;
    } catch {
      return false;   // z. B. Quota
    }
  }

  /** Geräte-ID (und Name) aus einem unbrauchbaren Rohinhalt retten. @param {string} raw @param {AppState} target */
  function rescueDevice(raw, target) {
    try {
      const d = JSON.parse(raw)?.device;
      if (d && typeof d.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(d.id)) target.device.id = d.id;
      if (d && typeof d.name === 'string') target.device.name = cleanName(d.name);
    } catch { /* nicht zu retten */ }
  }

  /** @param {StorageEvent|any} e */
  function onStorage(e) {
    if (mode !== 'local' || !storage) return;
    if (e && e.storageArea && e.storageArea !== storage) return;
    if (e.key === STORAGE_KEY) {
      if (e.newValue === null || e.newValue === undefined) {
        // Ein anderer Tab hat nur unseren Schlüssel entfernt: RAM-Stand behalten und neu schreiben.
        write();
        return;
      }
      try {
        state = parseStored(e.newValue).state;   // letzter Schreiber gewinnt
        notify();
      } catch { /* kaputter Fremdstand: eigenen RAM-Stand behalten */ }
    } else if (e.key === null) {
      // Fremdes clear() auf dem geteilten Origin: RAM-Stand behalten und neu schreiben.
      const msg = write();
      if (msg) warn(msg);
    }
  }

  /** @param {List} l @returns {Set<string>} */
  const nameSet = (l) => new Set(l.options.map((o) => normalizeName(o.name)));

  /** @param {Set<string>} a @param {Set<string>} b */
  function jaccard(a, b) {
    if (!a.size && !b.size) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    return inter / (a.size + b.size - inter);
  }

  return {
    /** @returns {{mode:'local'|'memory', warning:string|null}} */
    init() {
      if (initialized) return { mode, warning: lastError };
      initialized = true;
      /** @type {string[]} */ const warnings = [];
      storage = deps.storage !== undefined ? deps.storage : defaultStorage();
      /** @type {string|null} */ let raw = null;
      if (storage) {
        try {
          raw = storage.getItem(STORAGE_KEY);
          mode = 'local';
        } catch {
          storage = null;
        }
      }
      if (!storage) {
        mode = 'memory';
        lastError = MSG_MEMORY;
        state = defaultState(now());
        return { mode, warning: MSG_MEMORY };
      }
      let skipInitialWrite = false;
      if (raw === null) {
        state = defaultState(now());   // leerer State → Beispielliste
      } else {
        try {
          const res = parseStored(raw);
          state = res.state;
          if (res.repaired > 0) {
            // Einzelne Einträge repariert/entfernt: Original beiseitelegen, reparierten Stand schreiben.
            const saved = keepBroken(raw);
            warnings.push(msgRepaired(res.repaired) + (saved ? MSG_BROKEN_KEPT : ''));
            if (!saved) skipInitialWrite = true;
          } else {
            skipInitialWrite = true;     // unverändert, nichts zu schreiben
          }
        } catch {
          const saved = keepBroken(raw);
          state = defaultState(now());
          rescueDevice(raw, state);
          warnings.push(MSG_BROKEN + (saved ? MSG_BROKEN_KEPT : ''));
          // Konnte der Rohinhalt nicht gesichert werden, nicht sofort überschreiben.
          if (!saved) skipInitialWrite = true;
        }
      }
      if (!skipInitialWrite) {
        // Erstes Schreiben sichert die Geräte-ID; persist() erst bei echten Änderungen.
        const msg = write();
        if (msg) warnings.push(msg);
      }
      try {
        if (typeof globalThis.addEventListener === 'function') globalThis.addEventListener('storage', onStorage);
      } catch { /* kein window */ }
      return { mode, warning: warnings.length ? warnings.join(' ') : null };
    },

    /** @returns {AppState} nur lesen (Kopie) */
    getState() { return clone(state); },

    /** @param {string} id @returns {List|undefined} */
    getList(id) {
      if (typeof id !== 'string' || !own(state.lists, id)) return undefined;
      const l = state.lists[id];
      return l ? clone(l) : undefined;
    },

    /**
     * Übersicht (DECISIONS F5 = C): nach letzter Änderung absteigend (updatedAt),
     * Gleichstand: createdAt absteigend, dann Name. `order` bleibt gespeichert, bestimmt die Übersicht aber nicht mehr.
     * @returns {List[]}
     */
    listLists() {
      return state.order.filter((id) => own(state.lists, id)).map((id) => state.lists[id]).filter(Boolean)
        .sort((a, b) => ((b.updatedAt || 0) - (a.updatedAt || 0))
          || ((b.createdAt || 0) - (a.createdAt || 0))
          || String(a.name).localeCompare(String(b.name), 'de'))
        .map(clone);
    },

    /** @param {string} name @param {string[]} names @param {string} [id] @returns {List} */
    createList(name, names, id) {
      const t = now();
      /** @type {string[]} */ const aliases = [];
      const foreign = typeof id === 'string' && id ? id.slice(0, 64) : '';
      // Fremde ID übernehmen, wenn sie frei und unverdächtig ist; sonst nur als Alias merken.
      let listId = /^[A-Za-z0-9_-]{1,64}$/.test(foreign) && foreign !== '__proto__' ? foreign : '';
      if (foreign && (!listId || own(state.lists, listId))) { aliases.push(foreign); listId = ''; }
      while (!listId || own(state.lists, listId)) listId = newId('l_', 10);
      /** @type {List} */
      const l = {
        id: listId, aliases, name: cleanName(name) || 'Neue Liste', createdAt: t, updatedAt: t,
        stableShown: false, options: [], history: [], partners: [],
      };
      addNames(l, names);
      state.lists[listId] = l;
      state.order.unshift(listId);
      commit();
      return clone(l);
    },

    /** @param {string} id @param {string} name @returns {boolean} */
    renameList(id, name) {
      const l = mustList(id);
      const n = cleanName(name);
      if (!n) return false;
      l.name = n;
      touch(l);
      commit();
      return true;
    },

    /** @param {string} id */
    deleteList(id) {
      if (typeof id !== 'string' || !own(state.lists, id)) return;
      delete state.lists[id];
      state.order = state.order.filter((x) => x !== id);
      commit();
    },

    /** @param {string} id @param {number} toIndex */
    moveList(id, toIndex) {
      const from = state.order.indexOf(id);
      if (from < 0) return;
      const to = Math.max(0, Math.min(state.order.length - 1, Math.trunc(Number(toIndex) || 0)));
      if (to === from) return;
      state.order.splice(from, 1);
      state.order.splice(to, 0, id);
      commit();
    },

    /** @param {string} id @param {string[]} names @returns {number} Anzahl neu hinzugefügter */
    addOptions(id, names) {
      const l = mustList(id);
      const added = addNames(l, names);
      if (added) { touch(l); commit(); }
      return added;
    },

    /** @param {string} listId @param {string} optId @param {string} name @returns {boolean} false bei leer/Duplikat */
    renameOption(listId, optId, name) {
      const l = mustList(listId);
      const o = l.options.find((x) => x.id === optId);
      const n = cleanName(name);
      if (!o || !n) return false;
      const key = normalizeName(n);
      if (l.options.some((x) => x.id !== optId && normalizeName(x.name) === key)) return false;
      if (o.name !== n) { o.name = n; touch(l); commit(); }
      return true;
    },

    /** @param {string} listId @param {string} optId */
    removeOption(listId, optId) {
      const l = mustList(listId);
      if (!l.options.some((o) => o.id === optId)) return;
      l.options = l.options.filter((o) => o.id !== optId);
      l.history = l.history.filter((d) => d.a !== optId && d.b !== optId);
      touch(l);
      commit();
    },

    /** @param {string} listId setzt Wertungen/Zähler zurück, leert history, stableShown=false */
    resetRatings(listId) {
      const l = mustList(listId);
      for (const o of l.options) Object.assign(o, { rating: START_RATING, duels: 0, wins: 0, draws: 0, losses: 0 });
      l.history = [];
      l.stableShown = false;
      touch(l);
      commit();
    },

    /** @param {string} listId @param {string} aId @param {string} bId @param {1|0.5|0} s @returns {Duel} */
    recordDuel(listId, aId, bId, s) {
      const l = mustList(listId);
      const a = l.options.find((o) => o.id === aId);
      const b = l.options.find((o) => o.id === bId);
      if (!a || !b || aId === bId) throw new Error('Ungültiges Duell');
      if (s !== 1 && s !== 0.5 && s !== 0) throw new Error('Ungültiges Ergebnis');
      const r = applyResult(a.rating, b.rating, s);
      a.rating = r.ra;
      b.rating = r.rb;
      a.duels++; b.duels++;
      if (s === 1) { a.wins++; b.losses++; } else if (s === 0) { a.losses++; b.wins++; } else { a.draws++; b.draws++; }
      /** @type {Duel} */ const d = { a: aId, b: bId, s, da: r.da, db: r.db, t: now() };
      l.history.push(d);
      touch(l);
      commit();
      return { ...d };
    },

    /** @param {string} listId @returns {Duel|null} */
    undoLastDuel(listId) {
      const l = mustList(listId);
      const d = l.history.pop();
      if (!d) return null;
      const a = l.options.find((o) => o.id === d.a);
      const b = l.options.find((o) => o.id === d.b);
      const dec = (/** @type {Option} */ o, /** @type {'wins'|'draws'|'losses'} */ f) => {
        o.duels = Math.max(0, o.duels - 1);
        o[f] = Math.max(0, o[f] - 1);
      };
      if (a) { a.rating -= d.da; dec(a, d.s === 1 ? 'wins' : d.s === 0 ? 'losses' : 'draws'); }
      if (b) { b.rating -= d.db; dec(b, d.s === 1 ? 'losses' : d.s === 0 ? 'wins' : 'draws'); }
      // Rundungsreste vermeiden: ohne Duelle exakt zurück auf den Startwert.
      if (a && a.duels === 0) a.rating = START_RATING;
      if (b && b.duels === 0) b.rating = START_RATING;
      touch(l);
      commit();
      return { ...d };
    },

    /** @param {string} listId @param {boolean} value */
    setStableShown(listId, value) {
      const l = mustList(listId);
      if (l.stableShown === !!value) return;
      l.stableShown = !!value;
      commit();
    },

    /** @param {string} name */
    setDeviceName(name) {
      const n = cleanName(name);
      if (state.device.name === n) return;
      state.device.name = n;
      commit();
    },

    /** @returns {Device} */
    getDevice() { return { ...state.device }; },

    /**
     * Nur endliche Zahlen (K1). sentAt mehr als einen Tag in der Zukunft wird auf jetzt begrenzt (N2).
     * @param {string} listId @param {PartnerRanking} partner @returns {boolean} false, wenn neuerer sentAt gespeichert
     */
    savePartner(listId, partner) {
      const l = mustList(listId);
      if (!partner || typeof partner.deviceId !== 'string' || !partner.deviceId) throw new Error('Ungültiger Partner');
      const t = now();
      const fin = (/** @type {any} */ v) => typeof v === 'number' && Number.isFinite(v);
      if (!fin(partner.sentAt) || partner.sentAt < 0) throw new Error('Ungültiger Partner: Zeitstempel');
      const opts = partner.options || [];
      if (!Array.isArray(opts) || !opts.every((o) => o && fin(o.rating) && fin(o.duels))) throw new Error('Ungültiger Partner: Zahlen');
      /** @type {PartnerRanking} */
      const p = {
        deviceId: partner.deviceId,
        name: String(partner.name ?? ''),
        receivedAt: fin(partner.receivedAt) ? partner.receivedAt : t,
        sentAt: partner.sentAt > t + FUTURE_SLACK ? t : partner.sentAt,
        options: opts.map((o) => ({ name: String(o.name), rating: o.rating, duels: Math.max(0, Math.round(o.duels)) })),
      };
      const i = l.partners.findIndex((x) => x.deviceId === p.deviceId);
      // Ein früher gespeicherter Stand aus der Zukunft blockiert echte Updates nicht.
      if (i >= 0 && Math.min(l.partners[i].sentAt, t) > p.sentAt) return false;
      if (i >= 0) l.partners[i] = p; else l.partners.push(p);
      touch(l);
      commit();
      return true;
    },

    /** @param {string} listId @param {string} deviceId */
    removePartner(listId, deviceId) {
      const l = mustList(listId);
      const before = l.partners.length;
      l.partners = l.partners.filter((p) => p.deviceId !== deviceId);
      if (l.partners.length !== before) { touch(l); commit(); }
    },

    /** @param {ShareData} shareData @returns {{list:List|null, kind:'id'|'name'|'none', overlap:number}} */
    findMatch(shareData) {
      const theirs = new Set((shareData?.o || []).map((e) => normalizeName(String(e[0]))));
      const foreignAliases = Array.isArray(shareData?.a) ? shareData.a : [];
      const lists = state.order.filter((id) => own(state.lists, id)).map((id) => state.lists[id]).filter(Boolean);
      for (const l of lists) {
        if (shareData.l === l.id || l.aliases.includes(shareData.l) || foreignAliases.includes(l.id)) {
          return { list: clone(l), kind: 'id', overlap: jaccard(nameSet(l), theirs) };
        }
      }
      /** @type {List|null} */ let best = null;
      let bestOverlap = 0;
      for (const l of lists) {
        const j = jaccard(nameSet(l), theirs);
        if (j > bestOverlap) { best = l; bestOverlap = j; }
      }
      if (best && bestOverlap >= MATCH_MIN) return { list: clone(best), kind: 'name', overlap: bestOverlap };
      return { list: null, kind: 'none', overlap: bestOverlap };
    },

    /** @param {string} listId @param {string} foreignId */
    addAlias(listId, foreignId) {
      const l = mustList(listId);
      if (typeof foreignId !== 'string' || !foreignId || foreignId === l.id || l.aliases.includes(foreignId)) return;
      l.aliases.push(foreignId);
      if (l.aliases.length > MAX_ALIASES) l.aliases = l.aliases.slice(-MAX_ALIASES);
      touch(l);
      commit();
    },

    /** @param {AppState} newState Backup-Import; behält aktuelle device.id */
    replaceAll(newState) {
      const s = migrateWithReport(newState).state;   // wirft SchemaError bei Unbrauchbarem
      const cur = state.device;
      s.device = { id: cur.id, name: cur.name || s.device.name || '' };
      state = s;
      commit();
    },

    /** @param {(state:AppState)=>void} fn @returns {()=>void} */
    subscribe(fn) {
      subscribers.add(fn);
      return () => { subscribers.delete(fn); };
    },

    /** @returns {{mode:'local'|'memory', lastError:string|null}} */
    status() { return { mode, lastError }; },

    /** Beiseitegelegte beschädigte Rohinhalte (H1), älteste zuerst. @returns {{key:string, at:number, size:number}[]} */
    listBroken() {
      return brokenEntries().map((e) => {
        let size = 0;
        try { size = (storage?.getItem(e.key) || '').length; } catch { /* egal */ }
        return { ...e, size };
      });
    },

    /** @param {string} key @returns {string|null} Rohinhalt einer Ablage */
    getBroken(key) {
      if (typeof key !== 'string' || (key !== BROKEN_KEY && !key.startsWith(BROKEN_PREFIX)) || !storage) return null;
      try { return storage.getItem(key); } catch { return null; }
    },

    /** @param {(msg:string)=>void} fn @returns {()=>void} */
    onWarning(fn) {
      warners.add(fn);
      return () => { warners.delete(fn); };
    },
  };
}

/** Default-Instanz; Storage wird erst in init() angefasst (globalThis.localStorage in try/catch, sonst null). */
export const store = createStore();
