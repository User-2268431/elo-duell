// Eigentümer: C – DOM-Helfer, Toast, Dialoge, Banner, Formatierung (docs/ARCHITEKTUR.md §4C).

/** Attribute, die als DOM-Eigenschaft gesetzt werden (nicht als HTML-Attribut). */
const PROPS = new Set(['value', 'checked', 'selected', 'indeterminate']);

/** @param {HTMLElement} el @param {any} c */
function append(el, c) {
  if (c === null || c === undefined || c === false || c === true) return;
  if (Array.isArray(c)) { for (const x of c) append(el, x); return; }
  el.append(c instanceof Node ? c : document.createTextNode(String(c)));
}

/**
 * @param {string} tag
 * @param {Record<string, any>} [attrs] class, data-testid, on:{click}, …
 * @param {...(Node|string|number|null|undefined|false)} children Text wird escaped
 * @returns {HTMLElement}
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'on') {
        for (const [ev, fn] of Object.entries(v)) if (typeof fn === 'function') el.addEventListener(ev, fn);
      } else if (k === 'class' || k === 'className') {
        el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v);
      } else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, String(sv));
          else /** @type {any} */ (el.style)[sk] = sv;
        }
      } else if (k === 'dataset' && typeof v === 'object') {
        for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = String(dv);
      } else if (PROPS.has(k)) {
        /** @type {any} */ (el)[k] = v;
      } else {
        el.setAttribute(k, v === true ? '' : String(v));
      }
    }
  }
  for (const c of children) append(el, c);
  return el;
}

/* ---------------- Toast ---------------- */

/** @type {ReturnType<typeof setTimeout>|null} */ let toastTimer = null;
/** @type {ReturnType<typeof setTimeout>|null} */ let toastClearTimer = null;

/** @param {string} text @param {{actionLabel?:string, onAction?:()=>void, ms?:number}} [opts] @returns {void} */
export function toast(text, opts = {}) {
  const box = document.getElementById('toast');
  if (!box) return;
  if (toastTimer) clearTimeout(toastTimer);
  if (toastClearTimer) clearTimeout(toastClearTimer);
  const msg = h('span', { class: 'toast-text' }, text);
  box.replaceChildren(msg);
  if (opts.actionLabel && opts.onAction) {
    const fn = opts.onAction;
    box.append(h('button', {
      type: 'button', class: 'btn btn-ghost toast-action', 'data-testid': 'toast-action',
      on: { click: () => { hide(); fn(); } },
    }, opts.actionLabel));
  }
  box.classList.add('show');
  const ms = opts.ms ?? (opts.actionLabel ? 6000 : 3500);
  toastTimer = setTimeout(hide, ms);

  function hide() {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    box?.classList.remove('show');
    // Inhalt nach dem Ausblenden leeren, damit Screenreader und Tests keinen alten Text sehen.
    toastClearTimer = setTimeout(() => { if (!box?.classList.contains('show')) box?.replaceChildren(); }, 300);
  }
}

/* ---------------- Dialoge ---------------- */

/**
 * Baut einen modalen <dialog>, zeigt ihn und löst mit dem Ergebnis von decide() auf.
 * @template T
 * @param {{title:string, body:Node[], okLabel:string, cancelLabel:string, danger?:boolean,
 *   onOk:()=>T, cancelValue:T, focus?:HTMLElement}} o
 * @returns {Promise<T>}
 */
function openDialog(o) {
  return new Promise((resolve) => {
    let done = false;
    /** @type {HTMLDialogElement} */
    const dlg = /** @type {any} */ (h('dialog', { class: 'dlg', 'aria-labelledby': 'dlg-title' }));
    const finish = (/** @type {T} */ val) => {
      if (done) return;
      done = true;
      try { dlg.close(); } catch { /* bereits zu */ }
      dlg.remove();
      resolve(val);
    };
    const form = h('form', {
      method: 'dialog', class: 'dlg-form stack',
      on: { submit: (/** @type {Event} */ e) => { e.preventDefault(); finish(o.onOk()); } },
    },
      h('h2', { id: 'dlg-title', class: 'dlg-title' }, o.title),
      ...o.body,
      h('div', { class: 'dlg-actions row' },
        h('button', { type: 'button', class: 'btn', 'data-testid': 'dialog-cancel',
          on: { click: () => finish(o.cancelValue) } }, o.cancelLabel),
        h('button', { type: 'submit', class: o.danger ? 'btn btn-danger' : 'btn btn-primary',
          'data-testid': 'dialog-ok' }, o.okLabel),
      ),
    );
    dlg.append(form);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(o.cancelValue); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) finish(o.cancelValue); });
    document.body.append(dlg);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    (o.focus || /** @type {HTMLElement} */ (form.querySelector('[data-testid="dialog-ok"]')))?.focus();
  });
}

/**
 * @param {{title:string, text?:string, okLabel?:string, cancelLabel?:string, danger?:boolean}} o
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, text, okLabel = 'OK', cancelLabel = 'Abbrechen', danger = false }) {
  return openDialog({
    title, okLabel, cancelLabel, danger,
    body: text ? [h('p', { class: 'dlg-text' }, text)] : [],
    onOk: () => true, cancelValue: false,
  });
}

/**
 * @param {{title:string, label?:string, value?:string, okLabel?:string}} o
 * @returns {Promise<string|null>}
 */
export function promptDialog({ title, label, value = '', okLabel = 'Speichern' }) {
  const input = /** @type {HTMLInputElement} */ (h('input', {
    type: 'text', class: 'input', 'data-testid': 'dialog-input', value, autocomplete: 'off',
    enterkeyhint: 'done', 'aria-label': label || title,
  }));
  const body = label
    ? [h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input)]
    : [input];
  const p = openDialog({
    title, okLabel, cancelLabel: 'Abbrechen', body,
    onOk: () => input.value, cancelValue: /** @type {string|null} */ (null), focus: input,
  });
  input.select();
  return p;
}

/* ---------------- Formatierung ---------------- */

/** @param {number} n @returns {string} ganzzahlig, de-DE */
export function fmtRating(n) {
  const v = Math.round(Number(n));
  return (Number.isFinite(v) ? v : 0).toLocaleString('de-DE');
}

/** @param {number} ms @returns {string} z. B. „04.11.2026, 22:35“ */
export function fmtDate(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ---------------- Banner ---------------- */

/**
 * Banner oben in #banners; text null entfernt ihn. data-testid "banner-<id>".
 * @param {string} id @param {string|null} text @param {{label:string, onClick:()=>void}} [action]
 * @returns {void}
 */
export function setBanner(id, text, action) {
  const box = document.getElementById('banners');
  if (!box) return;
  const old = box.querySelector(`[data-banner="${CSS.escape(id)}"]`);
  if (text === null || text === undefined) { old?.remove(); return; }
  const el = h('div', { class: 'banner', role: 'status', 'data-banner': id, 'data-testid': `banner-${id}` },
    h('span', { class: 'banner-text' }, text),
    action ? h('button', { type: 'button', class: 'btn btn-primary banner-action', on: { click: action.onClick } }, action.label) : null,
  );
  if (old) old.replaceWith(el); else box.append(el);
}

/* ---------------- Icons (Ergänzung von C, optional nutzbar) ---------------- */

const ICONS = {
  gear: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  pencil: 'M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
  trash: 'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  undo: 'M3 4v6h6 M3.51 15a9 9 0 1 0 2.13-9.36L3 10',
  skip: 'M5 4l10 8-10 8V4z M19 5v14',
  equal: 'M5 9h14 M5 15h14',
  plus: 'M12 5v14 M5 12h14',
  scan: 'M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M7 12h10',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8 M16 6l-4-4-4 4 M12 2v13',
  play: 'M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z',
  chevron: 'M9 18l6-6-6-6',
};

/**
 * Kleines Strich-Icon (SVG, currentColor). Dekorativ: aria-hidden.
 * @param {keyof typeof ICONS} name @param {number} [size] @returns {SVGSVGElement}
 */
export function icon(name, size = 22) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none',
    stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'aria-hidden': 'true', class: 'icon' })) svg.setAttribute(k, String(v));
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', ICONS[name] || '');
  svg.append(path);
  return svg;
}
