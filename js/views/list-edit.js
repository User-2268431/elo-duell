// Eigentümer: C – View list-edit (docs/ARCHITEKTUR.md §6, §7). #/neu und #/liste/:id/bearbeiten
import { h, icon, toast, confirmDialog, promptDialog } from '../ui.js';
import { parseOptionLines, normalizeName } from '../logic/text.js';
import { t } from '../i18n.js';

/** @param {string} text */
function safeParse(text) {
  try { return parseOptionLines(text); } catch { return text.split('\n').map((s) => s.trim()).filter(Boolean); }
}

/** @param {string} s */
function norm(s) {
  try { return normalizeName(s); } catch { return s.trim().toLowerCase(); }
}

/** Untergrenze für Optionen je Liste (DECISIONS F10 = B). */
const MIN_OPTIONS = 2;
const msgMin = () => t('edit.min', { n: MIN_OPTIONS });

export default {
  /** @param {any} ctx */
  title: (ctx) => (ctx.params.id ? t('common.editList') : t('common.newList')),
  /** @param {HTMLElement} root @param {any} ctx @returns {void|(()=>void)} */
  render(root, ctx) {
    const { store, navigate } = ctx;
    const listId = ctx.params.id;
    const isEdit = !!listId;
    const initial = isEdit ? store.getList(listId) : null;

    const nameInput = /** @type {HTMLInputElement} */ (h('input', {
      type: 'text', class: 'input', id: 'edit-name', 'data-testid': 'edit-name', maxlength: 120,
      autocomplete: 'off', enterkeyhint: 'next', placeholder: t('edit.namePh'),
      value: initial ? initial.name : '',
    }));
    const optsInput = /** @type {HTMLTextAreaElement} */ (h('textarea', {
      class: 'textarea', id: 'edit-options', 'data-testid': 'edit-options', rows: isEdit ? 4 : 8,
      autocapitalize: 'sentences',
      placeholder: isEdit ? t('edit.optsPhEdit') : t('edit.optsPh'),
    }));
    const count = h('p', { class: 'field-hint lists-count', 'data-testid': 'edit-count', 'aria-live': 'polite' });

    /** Neue (noch nicht vorhandene) Namen aus dem Textfeld. */
    function newNames() {
      const parsed = safeParse(optsInput.value);
      if (!isEdit) return parsed;
      const list = store.getList(listId);
      const have = new Set((list?.options || []).map((/** @type {any} */ o) => norm(o.name)));
      return parsed.filter((n) => !have.has(norm(n)));
    }

    /** Anzahl Optionen nach dem Speichern (vorhandene + neue). */
    function totalAfterSave() {
      const have = isEdit ? (store.getList(listId)?.options.length ?? 0) : 0;
      return have + newNames().length;
    }

    function updateCount() {
      const n = newNames().length;
      const tooFew = totalAfterSave() < MIN_OPTIONS;
      if (isEdit) {
        count.textContent = n ? t('edit.countNew', { n }) : t('edit.noNew');
      } else {
        count.textContent = t('edit.count', { n });
      }
      if (tooFew) count.textContent += ` – ${msgMin()}`;
      count.classList.toggle('lists-count-warn', tooFew && (isEdit || optsInput.value.trim() !== ''));
      saveBtn.disabled = tooFew;
      saveBtn.title = tooFew ? msgMin() : '';
    }

    function save() {
      const name = nameInput.value.trim();
      if (!name) {
        toast(t('edit.needName'));
        nameInput.focus();
        return;
      }
      const names = newNames();
      if (totalAfterSave() < MIN_OPTIONS) {
        toast(msgMin());
        optsInput.focus();
        return;
      }
      if (!isEdit) {
        const list = store.createList(name, names);
        navigate(`#/liste/${encodeURIComponent(list.id)}`, { replace: true });
        return;
      }
      const list = store.getList(listId);
      if (!list) { navigate('#/', { replace: true }); return; }
      if (name !== list.name) store.renameList(listId, name);
      const added = names.length ? store.addOptions(listId, names) : 0;
      toast(added ? t('edit.savedNew', { n: added }) : t('common.saved'));
      navigate(`#/liste/${encodeURIComponent(listId)}`);
    }

    const form = h('form', {
      class: 'stack lists-edit', novalidate: true,
      on: { submit: (/** @type {Event} */ e) => { e.preventDefault(); save(); } },
    },
      h('label', { class: 'field', for: 'edit-name' },
        h('span', { class: 'field-label' }, t('edit.name')), nameInput),
      h('div', { class: 'field' },
        h('label', { class: 'field-label', for: 'edit-options' },
          isEdit ? t('edit.optsLabelEdit') : t('edit.optsLabel')),
        optsInput, count),
    );

    /* ---------- Bestehende Optionen (nur Bearbeiten) ---------- */
    const optBox = h('ul', { class: 'lists-opts', 'aria-label': t('edit.options') });
    const optHead = h('h2', { class: 'lists-section-title' });
    const optMin = h('p', { class: 'field-hint', 'data-testid': 'edit-opt-min', hidden: true },
      t('edit.minLocked', { min: msgMin() }));

    function drawOptions() {
      const list = store.getList(listId);
      if (!list) return;
      optHead.textContent = t('edit.optionsN', { n: list.options.length });
      const locked = list.options.length <= MIN_OPTIONS;
      optMin.hidden = !locked;
      if (!list.options.length) {
        optBox.replaceChildren(h('li', { class: 'lists-opt-empty muted' }, t('edit.noOptions')));
        return;
      }
      optBox.replaceChildren(...list.options.map((/** @type {any} */ o) => h('li', { class: 'lists-opt', 'data-testid': `edit-opt-${o.id}` },
        h('span', { class: 'lists-opt-name' }, o.name),
        h('span', { class: 'lists-opt-duels muted' }, t('common.duels', { n: o.duels })),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'data-testid': `edit-opt-rename-${o.id}`,
          'aria-label': t('edit.renameAria', { name: o.name }), on: { click: () => renameOpt(o.id) } }, icon('pencil', 20)),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon lists-opt-remove', 'data-testid': `edit-opt-remove-${o.id}`,
          'aria-label': t('edit.deleteAria', { name: o.name }), disabled: locked, title: locked ? msgMin() : null,
          on: { click: () => removeOpt(o.id) } }, icon('trash', 20)),
      )));
    }

    /** @param {string} optId */
    async function renameOpt(optId) {
      const opt = store.getList(listId)?.options.find((/** @type {any} */ o) => o.id === optId);
      if (!opt) return;
      const value = await promptDialog({ title: t('edit.renameTitle'), label: t('edit.newName'), value: opt.name });
      if (value === null) return;
      const name = value.trim();
      if (name === opt.name) return;
      if (!name) { toast(t('edit.nameEmpty')); return; }
      if (!store.renameOption(listId, optId, name)) { toast(t('edit.exists')); return; }
      drawOptions();
      updateCount();
    }

    /** @param {string} optId */
    async function removeOpt(optId) {
      const list = store.getList(listId);
      const opt = list?.options.find((/** @type {any} */ o) => o.id === optId);
      if (!list || !opt) return;
      if (list.options.length <= MIN_OPTIONS) { toast(msgMin()); return; }
      if (opt.duels > 0) {
        const ok = await confirmDialog({
          title: t('edit.deleteTitle', { name: opt.name }),
          text: t('edit.deleteOptText', { n: opt.duels }),
          okLabel: t('common.delete'), danger: true,
        });
        if (!ok) return;
      }
      if ((store.getList(listId)?.options.length ?? 0) <= MIN_OPTIONS) { toast(msgMin()); drawOptions(); return; }
      store.removeOption(listId, optId);
      toast(t('edit.deleted', { name: opt.name }));
      drawOptions();
      updateCount();
    }

    async function resetAll() {
      const ok = await confirmDialog({
        title: t('edit.resetTitle'),
        text: t('edit.resetText', { r: 1000 }),
        okLabel: t('edit.resetOk'), danger: true,
      });
      if (!ok) return;
      store.resetRatings(listId);
      toast(t('edit.resetDone'));
      drawOptions();
    }

    async function deleteAll() {
      const list = store.getList(listId);
      if (!list) return;
      const ok = await confirmDialog({
        title: t('edit.deleteTitle', { name: list.name }),
        text: t('edit.deleteListText'),
        okLabel: t('edit.deleteList'), danger: true,
      });
      if (!ok) return;
      store.deleteList(listId);
      toast(t('edit.listDeleted'));
      navigate('#/', { replace: true });
    }

    const saveBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'edit-save',
      on: { click: save } }, isEdit ? t('common.save') : t('edit.create'));
    optsInput.addEventListener('input', updateCount);
    updateCount();

    const parts = [form];
    if (isEdit) {
      parts.push(
        h('section', { class: 'stack lists-section' }, optHead, optMin, optBox),
        h('section', { class: 'stack lists-section lists-danger-zone' },
          h('button', { type: 'button', class: 'btn btn-block', 'data-testid': 'edit-reset', on: { click: resetAll } },
            t('edit.reset')),
          h('button', { type: 'button', class: 'btn btn-outline-danger btn-block', 'data-testid': 'edit-delete-list',
            on: { click: deleteAll } }, icon('trash', 20), t('edit.deleteList')),
        ),
      );
      drawOptions();
    }
    parts.push(h('div', { class: 'bottom-bar' }, saveBtn));
    root.append(h('div', { class: 'stack' }, ...parts));
    if (!isEdit) nameInput.focus();
  },
};
