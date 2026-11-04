// Eigentümer: B – Schema, Default-State, Migration, Validierung (docs/ARCHITEKTUR.md §3, §4B).
/** @typedef {import('../types.js').AppState} AppState */

export const SCHEMA = 1;

export class SchemaError extends Error {
  /** @param {string} message */
  constructor(message) { super(message); this.name = 'SchemaError'; }
}

/** @returns {AppState} mit Beispielliste „Urlaubsziele“ (ID l_beispiel01) */
export function defaultState() {
  throw new Error('TODO');
}

/** Kette v0→v1…; wirft SchemaError bei Unbrauchbarem. @param {any} raw @returns {AppState} */
export function migrate(raw) {
  throw new Error('TODO');
}

/** @param {any} s @returns {string[]} Fehlerliste, leer = gültig */
export function validateState(s) {
  throw new Error('TODO');
}
