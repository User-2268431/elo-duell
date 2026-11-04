// Eigentümer: B – View settings (docs/ARCHITEKTUR.md §6, §7).
import { backupFileName, downloadBackup, downloadBroken, readBackupFileDetailed } from '../data/backup.js';
import { VERSION } from '../version.js';

/** @param {number} bytes @returns {string} */
function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes.toLocaleString('de-DE')} Byte`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024).toLocaleString('de-DE')} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
}

export default {
  title: 'Einstellungen',
  /** @param {HTMLElement} root @param {any} ctx @returns {void|(()=>void)} */
  render(root, ctx) {
    const { store, ui } = ctx;
    const { h } = ui;
    let alive = true;

    /* ---------- Name ---------- */
    const nameInput = /** @type {HTMLInputElement} */ (h('input', {
      type: 'text', class: 'input', id: 'set-name', 'data-testid': 'set-name', maxlength: '120',
      autocomplete: 'nickname', enterkeyhint: 'done', placeholder: 'z. B. Anna',
      value: store.getDevice().name,
      on: {
        input: () => store.setDeviceName(nameInput.value),
        change: () => { store.setDeviceName(nameInput.value); ui.toast('Name gespeichert'); },
        keydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') nameInput.blur(); },
      },
    }));

    /* ---------- Sicherung ---------- */
    const importError = h('p', { class: 'set-error', 'data-testid': 'set-import-error', role: 'alert', hidden: true });
    const fileInput = /** @type {HTMLInputElement} */ (h('input', {
      type: 'file', accept: 'application/json,.json', class: 'set-file', 'data-testid': 'set-import-file',
      tabindex: '-1', 'aria-hidden': 'true',
      on: { change: () => onFile() },
    }));

    /** @param {string|null} msg */
    function showError(msg) {
      importError.textContent = msg || '';
      importError.hidden = !msg;
    }

    async function onFile() {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      showError(null);
      let next;
      let repaired = 0;
      try {
        ({ state: next, repaired } = await readBackupFileDetailed(file));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Die Sicherung konnte nicht gelesen werden.';
        showError(msg);
        ui.toast(msg);
        return;
      }
      const n = next.order.length;
      const ok = await ui.confirmDialog({
        title: 'Sicherung importieren?',
        text: `Die Sicherung enthält ${n.toLocaleString('de-DE')} ${n === 1 ? 'Liste' : 'Listen'}. ` +
          (repaired > 0
            ? `${repaired.toLocaleString('de-DE')} ${repaired === 1 ? 'beschädigter Eintrag wird' : 'beschädigte Einträge werden'} dabei entfernt oder repariert. `
            : '') +
          'Alle Listen auf diesem Gerät werden dadurch ersetzt. Das lässt sich nicht rückgängig machen.',
        okLabel: 'Ersetzen',
        danger: true,
      });
      if (!ok || !alive) return;
      try {
        store.replaceAll(next);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Import fehlgeschlagen.';
        showError(msg);
        ui.toast(msg);
        return;
      }
      ui.toast('Sicherung importiert');
      ctx.navigate('#/');
    }

    /* ---------- Speicherstatus ---------- */
    const storageBox = h('div', { class: 'set-storage stack', 'data-testid': 'set-storage' });

    function renderStorage() {
      const { mode, lastError } = store.status();
      const lists = store.listLists();
      const duels = lists.reduce((sum, /** @type {any} */ l) =>
        sum + l.options.reduce((s, /** @type {any} */ o) => s + o.duels, 0) / 2, 0);
      const lines = [
        h('p', { class: 'set-storage-mode' }, mode === 'local'
          ? 'Deine Daten werden nur in diesem Browser auf diesem Gerät gespeichert.'
          : 'Nur vorübergehend gespeichert: Dieser Browser erlaubt kein dauerhaftes Speichern. Beim Schließen gehen die Daten verloren.'),
        h('p', { class: 'muted' },
          `${lists.length.toLocaleString('de-DE')} ${lists.length === 1 ? 'Liste' : 'Listen'}, ` +
          `${Math.round(duels).toLocaleString('de-DE')} ${duels === 1 ? 'Duell' : 'Duelle'}`),
      ];
      if (lastError) lines.push(h('p', { class: 'set-error', role: 'alert' }, lastError));
      const persistLine = h('p', { class: 'muted set-storage-persist' });
      lines.push(persistLine);
      storageBox.replaceChildren(...lines);
      if (mode !== 'local') return;
      const sm = globalThis.navigator?.storage;
      Promise.all([
        sm?.persisted ? sm.persisted().catch(() => null) : null,
        sm?.estimate ? sm.estimate().catch(() => null) : null,
      ]).then(([persisted, est]) => {
        if (!alive) return;
        const parts = [];
        if (persisted === true) parts.push('Vom Browser dauerhaft geschützt.');
        else if (persisted === false) parts.push('Der Browser kann die Daten bei Platzmangel löschen – exportiere ab und zu eine Sicherung.');
        if (est && Number.isFinite(est.usage)) parts.push(`Belegt: ${fmtBytes(est.usage)}.`);
        persistLine.textContent = parts.join(' ');
      }).catch(() => {});
    }
    renderStorage();

    /* ---------- Beschädigte Daten (nur sichtbar, wenn vorhanden) ---------- */
    const brokenSection = h('section', { class: 'card stack set-section', 'data-testid': 'set-broken', hidden: true });

    function renderBroken() {
      const entries = typeof store.listBroken === 'function' ? store.listBroken() : [];
      brokenSection.hidden = !entries.length;
      if (!entries.length) { brokenSection.replaceChildren(); return; }
      const many = entries.length > 1;
      brokenSection.replaceChildren(
        h('h2', { class: 'set-heading' }, 'Beschädigte Daten'),
        h('p', { class: 'muted' },
          'Beim Laden waren gespeicherte Daten beschädigt. Das Original wurde unverändert beiseitegelegt. ' +
          'Du kannst es als Datei herunterladen und z. B. über „Sicherung importieren“ wiederherstellen.'),
        ...entries.map((/** @type {{key:string, at:number, size:number}} */ e, i) => h('button', {
          type: 'button', class: 'btn btn-block', 'data-testid': 'set-broken-download', 'data-key': e.key,
          on: {
            click: () => {
              const raw = store.getBroken(e.key);
              if (raw === null) { ui.toast('Die beschädigten Daten sind nicht mehr vorhanden'); renderBroken(); return; }
              try {
                downloadBroken(raw, e.at);
                ui.toast('Beschädigte Daten heruntergeladen');
              } catch {
                ui.toast('Download nicht möglich');
              }
            },
          },
        }, many
          ? `Beschädigte Daten herunterladen (${e.at ? ui.fmtDate(e.at) : (i === 0 ? 'älteste' : `Nr. ${i + 1}`)})`
          : 'Beschädigte Daten herunterladen')),
      );
    }
    renderBroken();

    /* ---------- Aufbau ---------- */
    root.replaceChildren(h('div', { class: 'set-view stack' },
      h('section', { class: 'card stack set-section' },
        h('h2', { class: 'set-heading' }, 'Dein Name'),
        h('label', { class: 'field', for: 'set-name' },
          h('span', { class: 'field-label' }, 'Wird beim Teilen deiner Rangliste angezeigt')),
        nameInput,
      ),
      h('section', { class: 'card stack set-section' },
        h('h2', { class: 'set-heading' }, 'Sicherung'),
        h('p', { class: 'muted' },
          'Speichere alle Listen, Wertungen und Partner-Ranglisten als Datei, z. B. vor einem Handywechsel.'),
        h('button', {
          type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'set-export',
          on: {
            click: () => {
              try {
                downloadBackup(store.getState());
                ui.toast(`Sicherung gespeichert: ${backupFileName()}`);
              } catch {
                ui.toast('Sicherung konnte nicht erstellt werden');
              }
            },
          },
        }, 'Sicherung exportieren'),
        h('button', {
          type: 'button', class: 'btn btn-block', 'data-testid': 'set-import',
          on: { click: () => { showError(null); fileInput.click(); } },
        }, 'Sicherung importieren'),
        h('p', { class: 'muted small' },
          'Der Import ersetzt alle Listen auf diesem Gerät. Deine Geräte-Kennung bleibt erhalten.'),
        importError,
        fileInput,
      ),
      h('section', { class: 'card stack set-section' },
        h('h2', { class: 'set-heading' }, 'Speicher'),
        storageBox,
      ),
      brokenSection,
      h('p', { class: 'muted small set-version', 'data-testid': 'set-version' }, `Elo-Duell Version ${VERSION}`),
    ));

    const unsubscribe = store.subscribe(() => {
      if (!alive) return;
      if (document.activeElement !== nameInput) nameInput.value = store.getDevice().name;
      renderStorage();
    });

    return () => { alive = false; unsubscribe(); };
  },
};
