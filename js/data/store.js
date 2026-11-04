// Eigentümer: B – zentrale Datenhaltung (docs/ARCHITEKTUR.md §3, §4B).
// Wichtig: Der Import dieses Moduls darf in Node nicht werfen (kein direkter Zugriff auf window/localStorage).
/** @typedef {import('../types.js').AppState} AppState */
/** @typedef {import('../types.js').List} List */
/** @typedef {import('../types.js').Duel} Duel */
/** @typedef {import('../types.js').Device} Device */
/** @typedef {import('../types.js').PartnerRanking} PartnerRanking */
/** @typedef {import('../types.js').ShareData} ShareData */

export const STORAGE_KEY = 'elo-duell:state';

function todo() { throw new Error('TODO'); }

/**
 * @param {{storage?:Storage|null, now?:()=>number}} [deps]
 */
export function createStore(deps = {}) {
  /** @type {AppState} Platzhalter-State für Commit 0 */
  const placeholder = { schema: 1, device: { id: '', name: '' }, lists: {}, order: [], settings: {} };
  return {
    /** @returns {{mode:'local'|'memory', warning:string|null}} */
    init() { return { mode: 'memory', warning: null }; },
    /** @returns {AppState} nur lesen */
    getState() { return placeholder; },
    /** @param {string} id @returns {List|undefined} */
    getList(id) { return undefined; },
    /** @returns {List[]} in der Reihenfolge von order */
    listLists() { return []; },
    /** @param {string} name @param {string[]} names @param {string} [id] @returns {List} */
    createList(name, names, id) { return todo(); },
    /** @param {string} id @param {string} name */
    renameList(id, name) { todo(); },
    /** @param {string} id */
    deleteList(id) { todo(); },
    /** @param {string} id @param {number} toIndex */
    moveList(id, toIndex) { todo(); },
    /** @param {string} id @param {string[]} names @returns {number} Anzahl neu hinzugefügter */
    addOptions(id, names) { return todo(); },
    /** @param {string} listId @param {string} optId @param {string} name @returns {boolean} false bei leer/Duplikat */
    renameOption(listId, optId, name) { return todo(); },
    /** @param {string} listId @param {string} optId */
    removeOption(listId, optId) { todo(); },
    /** @param {string} listId setzt Wertungen/Zähler zurück, leert history, stableShown=false */
    resetRatings(listId) { todo(); },
    /** @param {string} listId @param {string} aId @param {string} bId @param {1|0.5|0} s @returns {Duel} */
    recordDuel(listId, aId, bId, s) { return todo(); },
    /** @param {string} listId @returns {Duel|null} */
    undoLastDuel(listId) { return todo(); },
    /** @param {string} listId @param {boolean} value */
    setStableShown(listId, value) { todo(); },
    /** @param {string} name */
    setDeviceName(name) { todo(); },
    /** @returns {Device} */
    getDevice() { return placeholder.device; },
    /** @param {string} listId @param {PartnerRanking} partner @returns {boolean} false, wenn neuerer sentAt gespeichert */
    savePartner(listId, partner) { return todo(); },
    /** @param {string} listId @param {string} deviceId */
    removePartner(listId, deviceId) { todo(); },
    /** @param {ShareData} shareData @returns {{list:List|null, kind:'id'|'name'|'none', overlap:number}} */
    findMatch(shareData) { return todo(); },
    /** @param {string} listId @param {string} foreignId */
    addAlias(listId, foreignId) { todo(); },
    /** @param {AppState} state Backup-Import; behält aktuelle device.id */
    replaceAll(state) { todo(); },
    /** @param {(state:AppState)=>void} fn @returns {()=>void} */
    subscribe(fn) { return () => {}; },
    /** @returns {{mode:'local'|'memory', lastError:string|null}} */
    status() { return { mode: 'memory', lastError: null }; },
    /** @param {(msg:string)=>void} fn */
    onWarning(fn) {},
  };
}

/** Default-Instanz; Storage wird erst in init() angefasst (globalThis.localStorage in try/catch, sonst null). */
export const store = createStore();
