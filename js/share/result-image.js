// Eigentümer: D – „Ergebnis teilen“: gemeinsamer Endstand (Top 3 der gemeinsamen Favoriten) als PNG (Canvas, offline).
// Auswahl, Texte, Dateiname und Zeilenumbruch sind rein und in Node testbar; nur renderResultImage braucht das DOM.
import { t as tDefault } from '../i18n.js';

/** @typedef {import('../logic/compare.js').CmpItem} CmpItem */
/** @typedef {(key:string, params?:Record<string,any>)=>string} Tr */

export const RESULT_W = 1080;
export const RESULT_H = 1350;
export const RESULT_MAX = 3;

/**
 * Plätze 1–3 der gemeinsamen Favoriten in der Reihenfolge der Ansicht (compareRankings: nach niedrigerer Wertung).
 * @param {CmpItem[]} favorites @param {number} [max] @returns {{place:number, name:string, rankA:number, rankB:number}[]}
 */
export function pickTop(favorites, max = RESULT_MAX) {
  return (Array.isArray(favorites) ? favorites : []).slice(0, max)
    .map((f, i) => ({ place: i + 1, name: String(f.name), rankA: f.rankA, rankB: f.rankB }));
}

/**
 * Alle Texte des Bilds in der UI-Sprache.
 * @param {{listName:string, me:string, partner:string, favorites:CmpItem[], photos?:boolean}} o @param {Tr} [tr]
 */
export function resultTexts(o, tr = tDefault) {
  const me = (o.me || '').trim() || tr('result.me');
  const partner = (o.partner || '').trim() || tr('common.partner');
  const rows = pickTop(o.favorites).map((r) => ({
    ...r, detail: tr('cmp.places', { a: r.rankA, b: r.rankB, who: partner }),
  }));
  return {
    title: o.listName,
    subtitle: tr('result.subtitle', { n: rows.length, me, partner }),
    rows,
    footer: 'user-2268431.github.io/elo-duell',
    credit: o.photos ? tr('result.credit') : '',
    shareText: tr('result.shareText', { list: o.listName, names: rows.map((r) => `${r.place}. ${r.name}`).join(', ') }),
  };
}

/** @param {Date} d @param {'de'|'en'} lang @returns {string} elo-duell-ergebnis-JJJJ-MM-TT.png / elo-duel-result-YYYY-MM-DD.png */
export function resultFileName(d, lang) {
  const p = (n) => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return lang === 'en' ? `elo-duel-result-${day}.png` : `elo-duell-ergebnis-${day}.png`;
}

/**
 * Bricht Text in höchstens maxLines Zeilen der Breite maxWidth um; zu lange Wörter werden getrennt,
 * überzählige Reste mit „…“ gekürzt. @param {string} text @param {number} maxWidth
 * @param {(s:string)=>number} measure @param {number} maxLines @returns {string[]}
 */
export function wrapText(text, maxWidth, measure, maxLines) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  /** @type {string[]} */ const lines = [];
  let cur = '';
  const pushWord = (/** @type {string} */ w) => {
    const cand = cur ? `${cur} ${w}` : w;
    if (measure(cand) <= maxWidth) { cur = cand; return; }
    if (cur) { lines.push(cur); cur = ''; }
    // Einzelnes Wort zu breit: zeichenweise teilen.
    let part = '';
    for (const ch of Array.from(w)) {
      if (part && measure(part + ch) > maxWidth) { lines.push(part); part = ''; }
      part += ch;
    }
    cur = part;
  };
  for (const w of words) pushWord(w);
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = `${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`;
  while (Array.from(last).length > 1 && measure(`${last}…`) > maxWidth) last = Array.from(last).slice(0, -1).join('').trimEnd();
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

/* ---------------- Zeichnen (DOM) ---------------- */

const C = {
  bg1: '#f5f4ff', bg2: '#ffffff', card: '#ffffff', fg: '#1c1c28', muted: '#5b5b6e',
  accent: '#4f46e5', accentText: '#4338ca', accentSoft: '#e8e7fd', line: '#dcdce8',
  places: ['#4f46e5', '#7c3aed', '#0e7490'],
};
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Lädt eine Blob-/Object-URL (eigener Bildspeicher, kein Tainting) als Bild. @param {string} url */
function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Zeichnet das Ergebnisbild. photoUrls: je Name eine blob:-URL aus dem Bildspeicher (oder null).
 * @param {ReturnType<typeof resultTexts>} tx @param {Record<string, string|null>} photoUrls
 * @returns {Promise<{canvas:HTMLCanvasElement, photos:number}>}
 */
export async function renderResultImage(tx, photoUrls = {}) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.createElement('canvas'));
  canvas.width = RESULT_W;
  canvas.height = RESULT_H;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const font = (/** @type {number} */ px, /** @type {number} */ w = 400) => `${w} ${px}px ${FONT}`;

  // Hintergrund: sanfter Verlauf + Akzentbogen oben.
  const g = ctx.createLinearGradient(0, 0, 0, RESULT_H);
  g.addColorStop(0, C.bg1);
  g.addColorStop(1, C.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, RESULT_W, RESULT_H);
  ctx.fillStyle = C.accentSoft;
  ctx.beginPath();
  ctx.arc(RESULT_W - 90, 40, 260, 0, Math.PI * 2);
  ctx.fill();

  const X = 84, W = RESULT_W - 2 * X;
  ctx.textBaseline = 'alphabetic';

  // Kopf
  ctx.fillStyle = C.accentText;
  ctx.font = font(30, 700);
  ctx.fillText('ELO-DUELL', X, 120);
  ctx.fillStyle = C.fg;
  ctx.font = font(68, 800);
  let y = 205;
  for (const line of wrapText(tx.title, W, (s) => ctx.measureText(s).width, 2)) { ctx.fillText(line, X, y); y += 80; }
  ctx.fillStyle = C.muted;
  ctx.font = font(36, 500);
  const sub = wrapText(tx.subtitle, W, (s) => ctx.measureText(s).width, 1)[0] || '';
  ctx.fillText(sub, X, y - 16);
  const headBottom = y + 24;

  // Zeilen (Plätze)
  const footTop = RESULT_H - 150;
  const rowH = 270, gap = 28;
  const rows = tx.rows;
  const total = rows.length * rowH + Math.max(0, rows.length - 1) * gap;
  let ry = headBottom + Math.max(0, (footTop - headBottom - total) / 2);
  let photos = 0;
  for (const r of rows) {
    const color = C.places[(r.place - 1) % C.places.length];
    ctx.save();
    ctx.shadowColor = 'rgba(20,20,40,0.10)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = C.card;
    roundRect(ctx, X, ry, W, rowH, 32);
    ctx.fill();
    ctx.restore();

    const ph = rowH - 48, px = X + 24, py = ry + 24;
    const url = photoUrls[r.name];
    const img = url ? /** @type {HTMLImageElement|null} */ (await loadImage(url)) : null;
    ctx.save();
    roundRect(ctx, px, py, ph, ph, 24);
    ctx.clip();
    if (img && img.naturalWidth && img.naturalHeight) {
      photos++;
      const s = Math.max(ph / img.naturalWidth, ph / img.naturalHeight);
      const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
      ctx.drawImage(img, px + (ph - iw) / 2, py + (ph - ih) / 2, iw, ih);
    } else {
      const pg = ctx.createLinearGradient(px, py, px + ph, py + ph);
      pg.addColorStop(0, color);
      pg.addColorStop(1, '#a5b4fc');
      ctx.fillStyle = pg;
      ctx.fillRect(px, py, ph, ph);
      ctx.fillStyle = '#ffffff';
      ctx.font = font(120, 800);
      ctx.textAlign = 'center';
      ctx.fillText(String(r.place), px + ph / 2, py + ph / 2 + 42);
      ctx.textAlign = 'left';
    }
    ctx.restore();
    if (img) {
      // Platzziffer als Plakette auf dem Foto
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px + 40, py + 40, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = font(34, 800);
      ctx.textAlign = 'center';
      ctx.fillText(String(r.place), px + 40, py + 52);
      ctx.textAlign = 'left';
    }

    const tx0 = px + ph + 36, tw = X + W - 32 - tx0;
    ctx.fillStyle = C.fg;
    ctx.font = font(54, 800);
    const nameLines = wrapText(r.name, tw, (s) => ctx.measureText(s).width, 2);
    let ny = ry + (nameLines.length > 1 ? 100 : 128);
    for (const line of nameLines) { ctx.fillText(line, tx0, ny); ny += 62; }
    ctx.fillStyle = C.muted;
    ctx.font = font(28, 500);
    for (const line of wrapText(r.detail, tw, (s) => ctx.measureText(s).width, 2)) { ctx.fillText(line, tx0, ny + 2); ny += 36; }
    ry += rowH + gap;
  }

  // Fußzeile
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(X, footTop + 30);
  ctx.lineTo(X + W, footTop + 30);
  ctx.stroke();
  ctx.fillStyle = C.accent;
  ctx.font = font(30, 700);
  ctx.fillText(tx.footer, X, footTop + 100);
  if (photos && tx.credit) {
    ctx.fillStyle = C.muted;
    ctx.font = font(26, 500);
    ctx.textAlign = 'right';
    ctx.fillText(tx.credit, X + W, footTop + 98);
    ctx.textAlign = 'left';
  }
  return { canvas, photos };
}

/** @param {HTMLCanvasElement} canvas @returns {Promise<Blob>} */
export function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
}
