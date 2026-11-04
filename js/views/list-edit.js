// Eigentümer: C – View list-edit (docs/ARCHITEKTUR.md §6, §7). #/neu und #/liste/:id/bearbeiten
import { h, icon, toast, confirmDialog, promptDialog } from '../ui.js';
import { parseOptionLines, normalizeName } from '../logic/text.js';

/** @param {number} n @param {string} one @param {string} many */
function plural(n, one, many) {
  return `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;
}

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
const MSG_MIN = 'Mindestens 2 Optionen nötig';

export default {
  /** @param {any} ctx */
  title: (ctx) => (ctx.params.id ? 'Liste bearbeiten' : 'Neue Liste'),
  /** @param {HTMLElement} root @param {any} ctx @returns {void|(()=>void)} */
  render(root, ctx) {
    const { store, navigate } = ctx;
    const listId = ctx.params.id;
    const isEdit = !!listId;
    const initial = isEdit ? store.getList(listId) : null;

    const nameInput = /** @type {HTMLInputElement} */ (h('input', {
      type: 'text', class: 'input', id: 'edit-name', 'data-testid': 'edit-name', maxlength: 120,
      autocomplete: 'off', enterkeyhint: 'next', placeholder: 'z. B. Urlaubsziele',
      value: initial ? initial.name : '',
    }));
    const optsInput = /** @type {HTMLTextAreaElement} */ (h('textarea', {
      class: 'textarea', id: 'edit-options', 'data-testid': 'edit-options', rows: isEdit ? 4 : 8,
      autocapitalize: 'sentences',
      placeholder: isEdit ? 'Neue Option\nNoch eine' : 'Lissabon\nRom\nKreta\n…',
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
        count.textContent = n ? `${plural(n, 'neue Option', 'neue Optionen')} erkannt` : 'Keine neuen Optionen';
      } else {
        count.textContent = `${plural(n, 'Option', 'Optionen')} erkannt`;
      }
      if (tooFew) count.textContent += ` – ${MSG_MIN}`;
      count.classList.toggle('lists-count-warn', tooFew && (isEdit || optsInput.value.trim() !== ''));
      saveBtn.disabled = tooFew;
      saveBtn.title = tooFew ? MSG_MIN : '';
    }

    function save() {
      const name = nameInput.value.trim();
      if (!name) {
        toast('Bitte gib der Liste einen Namen');
        nameInput.focus();
        return;
      }
      const names = newNames();
      if (totalAfterSave() < MIN_OPTIONS) {
        toast(MSG_MIN);
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
      toast(added ? `Gespeichert – ${plural(added, 'neue Option', 'neue Optionen')}` : 'Gespeichert');
      navigate(`#/liste/${encodeURIComponent(listId)}`);
    }

    const form = h('form', {
      class: 'stack lists-edit', novalidate: true,
      on: { submit: (/** @type {Event} */ e) => { e.preventDefault(); save(); } },
    },
      h('label', { class: 'field', for: 'edit-name' },
        h('span', { class: 'field-label' }, 'Name der Liste'), nameInput),
      h('div', { class: 'field' },
        h('label', { class: 'field-label', for: 'edit-options' },
          isEdit ? 'Optionen hinzufügen (eine pro Zeile)' : 'Eine Option pro Zeile (Einfügen möglich)'),
        optsInput, count),
    );

    /* ---------- Bestehende Optionen (nur Bearbeiten) ---------- */
    const optBox = h('ul', { class: 'lists-opts', 'aria-label': 'Optionen' });
    const optHead = h('h2', { class: 'lists-section-title' });
    const optMin = h('p', { class: 'field-hint', 'data-testid': 'edit-opt-min', hidden: true },
      `${MSG_MIN} – füge erst eine weitere hinzu, bevor du eine löschst. Die ganze Liste entfernst du mit „Liste löschen“.`);

    function drawOptions() {
      const list = store.getList(listId);
      if (!list) return;
      optHead.textContent = `Optionen (${list.options.length.toLocaleString('de-DE')})`;
      const locked = list.options.length <= MIN_OPTIONS;
      optMin.hidden = !locked;
      if (!list.options.length) {
        optBox.replaceChildren(h('li', { class: 'lists-opt-empty muted' }, 'Noch keine Optionen.'));
        return;
      }
      optBox.replaceChildren(...list.options.map((/** @type {any} */ o) => h('li', { class: 'lists-opt', 'data-testid': `edit-opt-${o.id}` },
        h('span', { class: 'lists-opt-name' }, o.name),
        h('span', { class: 'lists-opt-duels muted' }, plural(o.duels, 'Duell', 'Duelle')),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'data-testid': `edit-opt-rename-${o.id}`,
          'aria-label': `${o.name} umbenennen`, on: { click: () => renameOpt(o.id) } }, icon('pencil', 20)),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon lists-opt-remove', 'data-testid': `edit-opt-remove-${o.id}`,
          'aria-label': `${o.name} löschen`, disabled: locked, title: locked ? MSG_MIN : null,
          on: { click: () => removeOpt(o.id) } }, icon('trash', 20)),
      )));
    }

    /** @param {string} optId */
    async function renameOpt(optId) {
      const opt = store.getList(listId)?.options.find((/** @type {any} */ o) => o.id === optId);
      if (!opt) return;
      const value = await promptDialog({ title: 'Option umbenennen', label: 'Neuer Name', value: opt.name });
      if (value === null) return;
      const name = value.trim();
      if (name === opt.name) return;
      if (!name) { toast('Der Name darf nicht leer sein'); return; }
      if (!store.renameOption(listId, optId, name)) { toast('Gibt es schon'); return; }
      drawOptions();
      updateCount();
    }

    /** @param {string} optId */
    async function removeOpt(optId) {
      const list = store.getList(listId);
      const opt = list?.options.find((/** @type {any} */ o) => o.id === optId);
      if (!list || !opt) return;
      if (list.options.length <= MIN_OPTIONS) { toast(MSG_MIN); return; }
      if (opt.duels > 0) {
        const ok = await confirmDialog({
          title: `„${opt.name}“ löschen?`,
          text: `Die Option war schon in ${plural(opt.duels, 'Duell', 'Duellen')}. Diese Duelle werden ebenfalls entfernt.`,
          okLabel: 'Löschen', danger: true,
        });
        if (!ok) return;
      }
      if ((store.getList(listId)?.options.length ?? 0) <= MIN_OPTIONS) { toast(MSG_MIN); drawOptions(); return; }
      store.removeOption(listId, optId);
      toast(`„${opt.name}“ gelöscht`);
      drawOptions();
      updateCount();
    }

    async function resetAll() {
      const ok = await confirmDialog({
        title: 'Wertungen zurücksetzen?',
        text: 'Alle Optionen starten wieder bei 1.000 Punkten, alle Duelle dieser Liste werden gelöscht. Die Optionen bleiben erhalten.',
        okLabel: 'Zurücksetzen', danger: true,
      });
      if (!ok) return;
      store.resetRatings(listId);
      toast('Wertungen zurückgesetzt');
      drawOptions();
    }

    async function deleteAll() {
      const list = store.getList(listId);
      if (!list) return;
      const ok = await confirmDialog({
        title: `„${list.name}“ löschen?`,
        text: 'Die Liste mit allen Optionen, Duellen und empfangenen Ranglisten wird von diesem Gerät gelöscht.',
        okLabel: 'Liste löschen', danger: true,
      });
      if (!ok) return;
      store.deleteList(listId);
      toast('Liste gelöscht');
      navigate('#/', { replace: true });
    }

    const saveBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'edit-save',
      on: { click: save } }, isEdit ? 'Speichern' : 'Liste anlegen');
    optsInput.addEventListener('input', updateCount);
    updateCount();

    const parts = [form];
    if (isEdit) {
      parts.push(
        h('section', { class: 'stack lists-section' }, optHead, optMin, optBox),
        h('section', { class: 'stack lists-section lists-danger-zone' },
          h('button', { type: 'button', class: 'btn btn-block', 'data-testid': 'edit-reset', on: { click: resetAll } },
            'Wertungen zurücksetzen'),
          h('button', { type: 'button', class: 'btn btn-outline-danger btn-block', 'data-testid': 'edit-delete-list',
            on: { click: deleteAll } }, icon('trash', 20), 'Liste löschen'),
        ),
      );
      drawOptions();
    }
    parts.push(h('div', { class: 'bottom-bar' }, saveBtn));
    root.append(h('div', { class: 'stack' }, ...parts));
    if (!isEdit) nameInput.focus();
  },
};
