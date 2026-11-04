// Eigentümer: C – DOM-Helfer, Toast, Dialoge, Banner, Formatierung (docs/ARCHITEKTUR.md §4C).

/**
 * @param {string} tag
 * @param {Record<string, any>} [attrs] class, data-testid, on:{click}, …
 * @param {...(Node|string|number|null|undefined|false)} children Text wird escaped
 * @returns {HTMLElement}
 */
export function h(tag, attrs, ...children) {
  throw new Error('TODO');
}

/** @param {string} text @param {{actionLabel?:string, onAction?:()=>void, ms?:number}} [opts] @returns {void} */
export function toast(text, opts) {
  throw new Error('TODO');
}

/**
 * @param {{title:string, text?:string, okLabel?:string, cancelLabel?:string, danger?:boolean}} o
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, text, okLabel = 'OK', cancelLabel = 'Abbrechen', danger = false }) {
  throw new Error('TODO');
}

/**
 * @param {{title:string, label?:string, value?:string, okLabel?:string}} o
 * @returns {Promise<string|null>}
 */
export function promptDialog({ title, label, value = '', okLabel = 'Speichern' }) {
  throw new Error('TODO');
}

/** @param {number} n @returns {string} ganzzahlig, de-DE */
export function fmtRating(n) {
  throw new Error('TODO');
}

/** @param {number} ms @returns {string} */
export function fmtDate(ms) {
  throw new Error('TODO');
}

/**
 * Banner oben in #banners; text null entfernt ihn. data-testid "banner-<id>".
 * @param {string} id @param {string|null} text @param {{label:string, onClick:()=>void}} [action]
 * @returns {void}
 */
export function setBanner(id, text, action) {
  throw new Error('TODO');
}
