// Eigentümer: E – erzeugt icons/icon.svg und die PNG-Icons per Playwright-Screenshot.
// Start: node tools/make-icons.mjs   (Chromium aus /opt/pw-browsers, kein `playwright install`)
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'icons');

/** Eine Karte, um ihren Mittelpunkt gedreht. */
function card(cx, cy, angle, fill, dot, line) {
  return `<g transform="translate(${cx} ${cy}) rotate(${angle})" filter="url(#sh)">
    <rect x="-84" y="-116" width="168" height="232" rx="22" fill="${fill}"/>
    <circle cx="0" cy="-48" r="30" fill="${dot}"/>
    <rect x="-52" y="8" width="104" height="16" rx="8" fill="${line}"/>
    <rect x="-38" y="40" width="76" height="16" rx="8" fill="${line}"/>
  </g>`;
}

/** @param {{maskable?:boolean}} [o] */
export function iconSvg({ maskable = false } = {}) {
  const motifScale = maskable ? 0.84 : 1;
  const bg = maskable
    ? '<rect width="512" height="512" fill="url(#bg)"/>'
    : '<rect width="512" height="512" rx="112" fill="url(#bg)"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#3730a3"/>
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#1e1b4b" flood-opacity="0.35"/>
    </filter>
  </defs>
  ${bg}
  <g transform="translate(256 256) scale(${motifScale}) translate(-256 -256)">
    ${card(184, 262, -14, '#ffffff', '#6366f1', '#c7d2fe')}
    ${card(328, 262, 14, '#fde68a', '#d97706', '#fbbf24')}
    <circle cx="256" cy="262" r="60" fill="#111827" stroke="#ffffff" stroke-width="8"/>
    <g fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">
      <path d="M220 242 L236 284 L252 242"/>
      <path d="M292 247 C287 238 265 238 264 250 C263 262 293 260 291 273 C289 286 265 287 259 277"/>
    </g>
  </g>
</svg>
`;
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, 'icon.svg'), iconSvg());
  const exe = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(exe) ? { executablePath: exe } : {});
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const t of TARGETS) {
      await page.setViewportSize({ width: t.size, height: t.size });
      const svg = iconSvg({ maskable: t.maskable }).replace('width="512" height="512"', `width="${t.size}" height="${t.size}"`);
      await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
      await page.screenshot({
        path: path.join(OUT, t.file),
        omitBackground: true,
        clip: { x: 0, y: 0, width: t.size, height: t.size },
      });
      console.log('geschrieben:', path.join('icons', t.file));
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
