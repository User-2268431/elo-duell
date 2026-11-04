// Eigentümer: B – Sicherung exportieren/importieren (docs/ARCHITEKTUR.md §4B).
/** @typedef {import('../types.js').AppState} AppState */

/** @param {AppState} state @returns {Blob} {app:'elo-duell', kind:'backup', schema:1, exportedAt, state} */
export function exportBackup(state) {
  throw new Error('TODO');
}

/** @param {Date} [date] @returns {string} elo-duell-sicherung-JJJJ-MM-TT.json */
export function backupFileName(date = new Date()) {
  throw new Error('TODO');
}

/** Blob + <a download>. @param {AppState} state @returns {void} */
export function downloadBackup(state) {
  throw new Error('TODO');
}

/** Parsen, migrieren, validieren; Fehlermeldungen auf Deutsch. @param {File|Blob} file @returns {Promise<AppState>} */
export async function readBackupFile(file) {
  throw new Error('TODO');
}
