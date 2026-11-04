// Eigentümer: B – Sicherung exportieren/importieren (docs/ARCHITEKTUR.md §4B).
// In Node importierbar; nur downloadBackup braucht das DOM.
import { migrateWithReport, SCHEMA, SchemaError } from './schema.js';

/** @typedef {import('../types.js').AppState} AppState */

/** Obergrenze für Sicherungsdateien (localStorage fasst ohnehin nur ca. 5 MB). */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

/** @param {AppState} state @returns {Blob} {app:'elo-duell', kind:'backup', schema:1, exportedAt, state} */
export function exportBackup(state) {
  const doc = { app: 'elo-duell', kind: 'backup', schema: SCHEMA, exportedAt: new Date().toISOString(), state };
  return new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
}

/** @param {Date} [date] @returns {string} elo-duell-sicherung-JJJJ-MM-TT.json (lokales Datum) */
export function backupFileName(date = new Date()) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `elo-duell-sicherung-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.json`;
}

/** Blob + <a download>. @param {AppState} state @returns {void} */
export function downloadBackup(state) {
  downloadBlob(exportBackup(state), backupFileName());
}

/** @param {number} [at] ms; 0/fehlend = heute @returns {string} elo-duell-beschaedigt-JJJJ-MM-TT[-hhmmss].json */
export function brokenFileName(at) {
  const date = at ? new Date(at) : new Date();
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  return at ? `elo-duell-beschaedigt-${day}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.json`
    : `elo-duell-beschaedigt-${day}.json`;
}

/** Beiseitegelegten Rohinhalt unverändert als Datei speichern (H1). @param {string} raw @param {number} [at] @returns {void} */
export function downloadBroken(raw, at) {
  downloadBlob(new Blob([raw], { type: 'application/json' }), brokenFileName(at));
}

/** @param {Blob} blob @param {string} fileName @returns {void} */
function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  // Erst später freigeben, sonst bricht der Download in manchen Browsern ab.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Parsen, migrieren, validieren; Fehlermeldungen auf Deutsch (als SchemaError).
 * Akzeptiert die Sicherungshülle {app:'elo-duell', kind:'backup', state} und zur Not einen nackten AppState.
 * @param {File|Blob} file @returns {Promise<AppState>}
 */
export async function readBackupFile(file) {
  return (await readBackupFileDetailed(file)).state;
}

/**
 * Wie readBackupFile, meldet zusätzlich die Zahl reparierter/entfernter Einträge (H1).
 * @param {File|Blob} file @returns {Promise<{state:AppState, repaired:number}>}
 */
export async function readBackupFileDetailed(file) {
  if (!file || typeof file.text !== 'function') throw new SchemaError('Keine Datei ausgewählt.');
  if (file.size > MAX_BACKUP_BYTES) throw new SchemaError('Die Datei ist zu groß für eine Elo-Duell-Sicherung.');
  let text;
  try { text = await file.text(); } catch { throw new SchemaError('Die Datei konnte nicht gelesen werden.'); }
  let doc;
  try { doc = JSON.parse(text.replace(/^﻿/, '')); } catch {
    throw new SchemaError('Die Datei ist keine gültige Sicherung (kein JSON).');
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new SchemaError('Die Datei ist keine Elo-Duell-Sicherung.');
  }
  /** @type {any} */ let raw;
  if (doc.app === 'elo-duell' && doc.kind === 'backup') {
    if (Number.isInteger(doc.schema) && doc.schema > SCHEMA) {
      throw new SchemaError('Die Sicherung stammt aus einer neueren App-Version. Bitte App aktualisieren.');
    }
    raw = doc.state;
  } else if (doc.app === undefined && 'lists' in doc && 'device' in doc) {
    raw = doc;   // nackter State (z. B. aus elo-duell:defekt kopiert)
  } else {
    throw new SchemaError('Die Datei ist keine Elo-Duell-Sicherung.');
  }
  try {
    return migrateWithReport(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SchemaError(`Die Sicherung ist beschädigt und wurde nicht übernommen. ${msg}`);
  }
}
