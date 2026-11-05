// Eigentümer: B – View settings (docs/ARCHITEKTUR.md §6, §7).
import { backupFileName, downloadBackup, downloadBroken, readBackupFileDetailed } from '../data/backup.js';
import { VERSION } from '../version.js';
import { images } from '../images.js';
import { t, fmtNumber, setLang } from '../i18n.js';

/** @param {number} bytes @returns {string} */
function fmtBytes(bytes) {
  if (bytes < 1024) return `${fmtNumber(bytes)} Byte`;
  if (bytes < 1024 * 1024) return `${fmtNumber(Math.round(bytes / 1024))} KB`;
  return `${fmtNumber(bytes / 1024 / 1024, { maximumFractionDigits: 1 })} MB`;
}

export default {
  title: () => t('settings.title'),
  /** @param {HTMLElement} root @param {any} ctx @returns {void|(()=>void)} */
  render(root, ctx) {
    const { store, ui } = ctx;
    const { h } = ui;
    let alive = true;

    /* ---------- Name ---------- */
    const nameInput = /** @type {HTMLInputElement} */ (h('input', {
      type: 'text', class: 'input', id: 'set-name', 'data-testid': 'set-name', maxlength: '120',
      autocomplete: 'nickname', enterkeyhint: 'done', placeholder: t('settings.namePh'),
      value: store.getDevice().name,
      on: {
        input: () => store.setDeviceName(nameInput.value),
        change: () => { store.setDeviceName(nameInput.value); ui.toast(t('settings.nameSaved')); },
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
        const msg = err instanceof Error ? err.message : t('backup.unreadable');
        showError(msg);
        ui.toast(msg);
        return;
      }
      const n = next.order.length;
      const ok = await ui.confirmDialog({
        title: t('settings.importTitle'),
        text: t('settings.importContains', { lists: t('common.lists', { n }) }) + ' ' +
          (repaired > 0 ? t('settings.importRepaired', { n: repaired }) + ' ' : '') +
          t('settings.importReplace'),
        okLabel: t('settings.importOk'),
        danger: true,
      });
      if (!ok || !alive) return;
      try {
        store.replaceAll(next);
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('settings.importFailed');
        showError(msg);
        ui.toast(msg);
        return;
      }
      ui.toast(t('settings.imported'));
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
          ? t('settings.storageLocal')
          : t('settings.storageMemory')),
        h('p', { class: 'muted' },
          `${t('common.lists', { n: lists.length })}, ${t('common.duels', { n: Math.round(duels) })}`),
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
        if (persisted === true) parts.push(t('settings.persisted'));
        else if (persisted === false) parts.push(t('settings.notPersisted'));
        if (est && Number.isFinite(est.usage)) parts.push(t('settings.used', { size: fmtBytes(est.usage) }));
        persistLine.textContent = parts.join(' ');
      }).catch(() => {});
    }
    renderStorage();

    /* ---------- Bilder aus Wikipedia ---------- */
    const imgToggle = /** @type {HTMLInputElement} */ (h('input', {
      type: 'checkbox', class: 'set-check', id: 'set-images', 'data-testid': 'set-images',
      checked: store.getSettings().images !== false,
      on: { change: () => { store.setSetting('images', imgToggle.checked); renderImages(); } },
    }));
    const imgUsage = h('p', { class: 'muted', 'data-testid': 'set-images-usage' });
    function renderImages() {
      const { count, bytes } = images.usage();
      const mb = fmtNumber(bytes / 1024 / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      const maxMb = Math.round(images.LIMITS.maxBytes / 1024 / 1024);
      imgUsage.textContent = t('settings.imgUsage', { n: count, mb, max: images.LIMITS.maxImages, maxMb });
    }
    renderImages();
    const unsubImages = images.subscribe(() => { if (alive) renderImages(); });
    const imagesSection = h('section', { class: 'card stack set-section', 'data-testid': 'set-images-section' },
      h('h2', { class: 'set-heading' }, t('settings.images')),
      h('label', { class: 'set-switch', for: 'set-images' }, imgToggle, h('span', null, t('settings.imagesShow'))),
      h('p', { class: 'muted small' }, t('settings.imagesPrivacy')),
      imgUsage,
      h('button', {
        type: 'button', class: 'btn btn-block', 'data-testid': 'set-images-clear',
        on: { click: async () => { await images.clear(); renderImages(); ui.toast(t('settings.imagesCleared')); } },
      }, t('settings.imagesClear')),
    );

    /* ---------- Beschädigte Daten (nur sichtbar, wenn vorhanden) ---------- */
    const brokenSection = h('section', { class: 'card stack set-section', 'data-testid': 'set-broken', hidden: true });

    function renderBroken() {
      const entries = typeof store.listBroken === 'function' ? store.listBroken() : [];
      brokenSection.hidden = !entries.length;
      if (!entries.length) { brokenSection.replaceChildren(); return; }
      const many = entries.length > 1;
      brokenSection.replaceChildren(
        h('h2', { class: 'set-heading' }, t('settings.broken')),
        h('p', { class: 'muted' }, t('settings.brokenText')),
        ...entries.map((/** @type {{key:string, at:number, size:number}} */ e, i) => h('button', {
          type: 'button', class: 'btn btn-block', 'data-testid': 'set-broken-download', 'data-key': e.key,
          on: {
            click: () => {
              const raw = store.getBroken(e.key);
              if (raw === null) { ui.toast(t('settings.brokenGone')); renderBroken(); return; }
              try {
                downloadBroken(raw, e.at);
                ui.toast(t('settings.brokenDownloaded'));
              } catch {
                ui.toast(t('settings.downloadFailed'));
              }
            },
          },
        }, many
          ? `${t('settings.brokenDownload')} (${e.at ? ui.fmtDate(e.at) : (i === 0 ? t('settings.oldest') : t('settings.numberN', { n: i + 1 }))})`
          : t('settings.brokenDownload'))),
      );
    }
    renderBroken();

    /* ---------- Sprache ---------- */
    const langSetting = ['de', 'en'].includes(store.getSettings().lang) ? store.getSettings().lang : 'auto';
    const langSelect = /** @type {HTMLSelectElement} */ (h('select', {
      class: 'input set-lang', id: 'set-lang', 'data-testid': 'set-lang',
      on: {
        change: () => {
          store.setSetting('lang', langSelect.value);
          setLang(langSelect.value);
          ctx.navigate(location.hash || '#/einstellungen', { replace: true }); // Ansicht in neuer Sprache
        },
      },
    },
      h('option', { value: 'auto', selected: langSetting === 'auto' }, t('settings.langAuto')),
      h('option', { value: 'de', selected: langSetting === 'de', lang: 'de' }, 'Deutsch'),
      h('option', { value: 'en', selected: langSetting === 'en', lang: 'en' }, 'English'),
    ));

    /* ---------- Aufbau ---------- */
    root.replaceChildren(h('div', { class: 'set-view stack' },
      h('section', { class: 'card stack set-section' },
        h('h2', { class: 'set-heading' }, t('settings.name')),
        h('label', { class: 'field', for: 'set-name' },
          h('span', { class: 'field-label' }, t('settings.nameHint'))),
        nameInput,
      ),
      h('section', { class: 'card stack set-section', 'data-testid': 'set-lang-section' },
        h('h2', { class: 'set-heading' }, h('label', { for: 'set-lang' }, t('settings.lang'))),
        langSelect,
      ),
      h('section', { class: 'card stack set-section' },
        h('h2', { class: 'set-heading' }, t('settings.backup')),
        h('p', { class: 'muted' }, t('settings.backupText')),
        h('button', {
          type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'set-export',
          on: {
            click: () => {
              try {
                downloadBackup(store.getState());
                ui.toast(t('settings.exported', { file: backupFileName() }));
              } catch {
                ui.toast(t('settings.exportFailed'));
              }
            },
          },
        }, t('settings.export')),
        h('button', {
          type: 'button', class: 'btn btn-block', 'data-testid': 'set-import',
          on: { click: () => { showError(null); fileInput.click(); } },
        }, t('settings.import')),
        h('p', { class: 'muted small' }, t('settings.importHint')),
        importError,
        fileInput,
      ),
      imagesSection,
      h('section', { class: 'card stack set-section' },
        h('h2', { class: 'set-heading' }, t('settings.storage')),
        storageBox,
      ),
      brokenSection,
      h('p', { class: 'muted small set-version', 'data-testid': 'set-version' }, t('settings.version', { v: VERSION })),
    ));

    const unsubscribe = store.subscribe(() => {
      if (!alive) return;
      if (document.activeElement !== nameInput) nameInput.value = store.getDevice().name;
      renderStorage();
    });

    return () => { alive = false; unsubscribe(); unsubImages(); };
  },
};
