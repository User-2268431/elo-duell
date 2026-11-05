// Eigentümer: E – Playwright-Konfiguration (docs/ARCHITEKTUR.md §10). Start: npm run test:e2e
import { existsSync } from 'node:fs';
import { defineConfig, devices } from 'playwright/test';

// Browser liegt unter /opt/pw-browsers (kein `playwright install`). Ist PLAYWRIGHT_BROWSERS_PATH
// nicht gesetzt, wird die Chromium-Binärdatei direkt angegeben.
const FALLBACK_CHROMIUM = '/opt/pw-browsers/chromium';
// Kein echtes Netz zu Wikipedia/Wikimedia in Tests (Bilder, js/images.js): Hosts lösen nicht auf.
// tests/e2e/images.spec.mjs mockt sie per page.route (greift vor der Namensauflösung).
const BLOCK_WIKI_ARGS = [
  '--host-resolver-rules=MAP de.wikipedia.org ~NOTFOUND, MAP en.wikipedia.org ~NOTFOUND, ' +
  'MAP thumb.wikimedia.org ~NOTFOUND, MAP upload.wikimedia.org ~NOTFOUND',
];
const launchOptions = {
  ...(!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(FALLBACK_CHROMIUM) ? { executablePath: FALLBACK_CHROMIUM } : {}),
  args: BLOCK_WIKI_ARGS,
};

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.mjs',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/elo-duell/',
    trace: 'retain-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'pixel7', use: { ...devices['Pixel 7'], launchOptions } },
  ],
  webServer: {
    command: 'node tools/serve.mjs',
    url: 'http://localhost:4173/elo-duell/',
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
