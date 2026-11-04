// Eigentümer: C – Einstieg: store.init, initPwa, Router-Start, feste View-Registry (docs/ARCHITEKTUR.md §4C, §6).
import { store } from './data/store.js';
import { initPwa } from './pwa.js';
import { startRouter, navigate, openImport, getPendingImport, clearPendingImport } from './router.js';
import * as ui from './ui.js';

import home from './views/home.js';
import listEdit from './views/list-edit.js';
import list from './views/list.js';
import duel from './views/duel.js';
import ranking from './views/ranking.js';
import settings from './views/settings.js';
import share from './views/share.js';
import scan from './views/scan.js';
import importView from './views/import.js';
import compare from './views/compare.js';

/** @type {import('./router.js').Route[]} Reihenfolge = Priorität beim Abgleich */
const routes = [
  { pattern: '#/', view: home },
  { pattern: '#/neu', view: listEdit, parent: () => '#/' },
  { pattern: '#/liste/:id/bearbeiten', view: listEdit, parent: (p) => `#/liste/${p.id}` },
  { pattern: '#/liste/:id', view: list, parent: () => '#/' },
  { pattern: '#/duell/:id', view: duel, parent: (p) => `#/liste/${p.id}` },
  { pattern: '#/rangliste/:id', view: ranking, parent: (p) => `#/liste/${p.id}` },
  { pattern: '#/teilen/:id', view: share, parent: (p) => `#/liste/${p.id}` },
  { pattern: '#/vergleich/:id/:partner', view: compare, parent: (p) => `#/liste/${p.id}` },
  { pattern: '#/scan', view: scan, parent: () => '#/' },
  { pattern: '#/import', view: importView, parent: () => '#/' },
  { pattern: '#/einstellungen', view: settings, parent: () => '#/' },
];

const { warning } = store.init();
if (warning) ui.setBanner('storage', warning);
store.onWarning((msg) => ui.setBanner('storage', msg));
// In-App-WebViews (Telegram, Instagram, Facebook, Android-WebView) haben eigenen Speicher (§12).
if (/; wv\)|Instagram|FBAN|FBAV|Telegram/i.test(navigator.userAgent || '')) {
  ui.setBanner('webview', 'Bitte in Chrome öffnen – in diesem eingebauten Browser bleiben deine Listen nicht erhalten.');
}

initPwa({
  onUpdateReady(apply) {
    ui.setBanner('update', 'Neue Version verfügbar', { label: 'Neu laden', onClick: apply });
  },
});

startRouter(routes, { store, navigate, openImport, getPendingImport, clearPendingImport, ui });
