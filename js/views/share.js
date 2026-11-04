// Eigentümer: D – View share (docs/ARCHITEKTUR.md §5, §6, §7).
import { h, toast, promptDialog } from '../ui.js';
import { encodeShare, buildShareUrl, toShareData, MAX_NAME, MAX_OPTIONS, MAX_PAYLOAD } from '../share/codec.js';
import { renderQr, QR_MAX_URL, LINK_WARN_URL } from '../share/qr.js';

/** replaceChildren ohne null/false (natives replaceChildren würde „null“ schreiben). @param {Element} el @param {...any} kids */
const fill = (el, ...kids) => el.replaceChildren(...kids.filter((k) => k !== null && k !== undefined && k !== false));

/** Link per Zwischenablage kopieren; Fallback: Feld markieren. @param {string} url @param {HTMLInputElement} field */
async function copyLink(url, field) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('keine Zwischenablage');
    await navigator.clipboard.writeText(url);
    toast('Link kopiert');
  } catch {
    field.focus();
    field.select();
    toast('Bitte den markierten Link manuell kopieren');
  }
}

export default {
  title: 'Teilen',
  /** @param {HTMLElement} root @param {any} ctx @returns {void|(()=>void)} */
  render(root, ctx) {
    const { store, navigate } = ctx;
    const id = ctx.params.id;
    let alive = true;
    const box = h('div', { class: 'stack share-view' }, h('p', { class: 'muted' }, 'Wird vorbereitet …'));
    root.append(box);

    (async () => {
      let device = store.getDevice();
      if (!device.name) {
        const name = await promptDialog({ title: 'Wie heißt du?', label: 'Dein Name (sieht die andere Person)', okLabel: 'Weiter' });
        if (!alive) return;
        const clean = Array.from((name || '').trim()).slice(0, MAX_NAME).join('').trim();
        if (!clean) {
          toast('Ohne Namen kann die andere Person deine Rangliste nicht zuordnen');
          navigate(`#/liste/${encodeURIComponent(id)}`, { replace: true });
          return;
        }
        store.setDeviceName(clean);
        device = store.getDevice();
      }
      const list = store.getList(id);
      if (!list) { navigate('#/', { replace: true }); return; }
      const payload = await encodeShare(toShareData(list, device, Date.now()));
      if (!alive) return;
      const url = buildShareUrl(payload, location);
      const duels = list.options.reduce((s, o) => s + o.duels, 0) / 2;
      const n = list.options.length;

      // N3: mehr als MAX_OPTIONS Optionen → nur die bestplatzierten gehen mit; zu langer Link → klare Meldung statt Link.
      const truncated = n > MAX_OPTIONS
        ? h('p', { class: 'card share-warn', 'data-testid': 'share-truncated', role: 'status' },
          `Die Liste hat ${n.toLocaleString('de-DE')} Optionen. Geteilt werden nur die ${MAX_OPTIONS.toLocaleString('de-DE')} bestplatzierten – die übrigen fehlen bei der anderen Person.`)
        : null;
      const head = h('div', { class: 'share-head' },
        h('h2', { class: 'share-title' }, list.name),
        h('p', { class: 'muted' }, duels > 0
          ? `Deine Rangliste · ${n.toLocaleString('de-DE')} Optionen · ${duels.toLocaleString('de-DE')} Duelle · als ${device.name}`
          : `Liste ohne Duelle · ${n.toLocaleString('de-DE')} Optionen · als ${device.name}`),
      );
      if (payload.length > MAX_PAYLOAD) {
        fill(box, head, truncated,
          h('p', { class: 'card share-too-big', 'data-testid': 'share-too-long', role: 'alert' },
            'Die Liste ist zu groß zum Teilen: Der Link wäre zu lang und ließe sich auf dem anderen Handy nicht öffnen. ' +
            'Kürze lange Namen oder entferne Optionen und versuche es dann noch einmal.'),
          h('button', { type: 'button', class: 'btn btn-block', 'data-testid': 'share-edit',
            on: { click: () => navigate(`#/liste/${encodeURIComponent(id)}/bearbeiten`) } }, 'Liste bearbeiten'),
        );
        return;
      }

      const field = /** @type {HTMLInputElement} */ (h('input', {
        type: 'text', class: 'input share-url', 'data-testid': 'share-url', readonly: true, value: url,
        'aria-label': 'Link zur Rangliste', on: { focus: (/** @type {Event} */ e) => /** @type {HTMLInputElement} */ (e.target).select() },
      }));

      /** @type {HTMLElement} */
      let qrPart;
      if (url.length <= QR_MAX_URL) {
        qrPart = h('div', { class: 'share-qr', 'data-testid': 'share-qr' });
        try {
          renderQr(url, qrPart, { ecc: 'L' });
        } catch {
          qrPart = h('p', { class: 'card share-too-big', 'data-testid': 'share-too-big' }, 'Liste zu groß für QR – bitte Link senden');
        }
      } else {
        qrPart = h('p', { class: 'card share-too-big', 'data-testid': 'share-too-big' }, 'Liste zu groß für QR – bitte Link senden');
      }

      const send = async () => {
        if (typeof navigator.share === 'function') {
          try {
            await navigator.share({ url });
            return;
          } catch (err) {
            if (/** @type {any} */ (err)?.name === 'AbortError') return; // Nutzer hat abgebrochen
          }
        }
        await copyLink(url, field);
      };

      fill(box,
        head,
        truncated,
        qrPart,
        h('p', { class: 'share-how' }, 'Auf dem anderen Handy: Elo-Duell → QR scannen, oder Link öffnen'),
        url.length >= LINK_WARN_URL
          ? h('p', { class: 'card share-warn', 'data-testid': 'share-long' }, 'Sehr langer Link – manche Messenger kürzen ihn')
          : null,
        h('div', { class: 'stack share-actions' },
          h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-testid': 'share-send', on: { click: send } }, 'Link senden'),
          h('button', { type: 'button', class: 'btn btn-block', 'data-testid': 'share-copy', on: { click: () => copyLink(url, field) } }, 'Link kopieren'),
          field,
        ),
        h('p', { class: 'share-steps muted' }, 'Empfohlener Ablauf: 1. Liste vorab teilen · 2. Beide duellieren · 3. Beide teilen ihre Rangliste'),
      );
    })().catch((err) => {
      console.error(err);
      if (alive) fill(box, h('p', { class: 'card' }, 'Der Link konnte nicht erstellt werden.'));
    });

    return () => { alive = false; };
  },
};
