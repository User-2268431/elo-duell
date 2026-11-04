# PWA & Offline – Recherchenotiz (Stand 11/2026)

Ziel: installierbar auf Android Chrome, nach erstem Laden komplett offline, gehostet unter `https://user-2268431.github.io/elo-duell/`.
Lokal geprüft mit Chromium 153 (`/opt/pw-browsers/chromium`), Lighthouse 11.7.1, Playwright 1.63. web.dev/developer.chrome.com waren aus der Sandbox nicht abrufbar; Angaben dazu stammen aus Suchtreffern und sind lokal gegengeprüft.

## 1. Installierbarkeit (Chrome Android)
- HTTPS (GitHub Pages: ja; „Enforce HTTPS“ aktivieren). `localhost` gilt als sicher.
- `<link rel="manifest" href="manifest.webmanifest">` mit: `name` oder `short_name`, `icons` mit **192×192 und 512×512 PNG**, `start_url`, `display: "standalone"` (oder `fullscreen`/`minimal-ui`), kein `prefer_related_applications: true`.
- Zusätzlich empfohlen: eigenes 512er-Icon mit `"purpose": "maskable"` (Motiv in den inneren 80 %), `id`, `scope`, `background_color`, `theme_color`, `lang`.
- Unterpfad: Relative URLs werden **gegen die Manifest-URL** aufgelöst → `"id": "./", "start_url": "./", "scope": "./"` ergibt `/elo-duell/`. Abschließender Slash zählt: `/elo-duell` (ohne Slash) liegt außerhalb des Scopes `/elo-duell/`.
- Service Worker: Seit Chrome 108 (Android) **nicht mehr Pflicht** für die Installation über das Menü. Lokal bestätigt: Seite ohne SW → `Page.getInstallabilityErrors` liefert `[]`. Für das automatische Prompt bzw. `beforeinstallprompt` nennen die Quellen weiterhin einen fetch-Handler (leere Handler werden ignoriert). Für uns egal: Offline braucht ohnehin einen echten fetch-Handler.
- Auf Android wird mit Google Play Services eine WebAPK erzeugt. Wenn das scheitert, entsteht nur eine Verknüpfung. Ändert sich das Manifest (Name, Icons), baut Chrome die WebAPK verzögert neu.

## 2. Service-Worker-Muster ohne Build-Tool
Datei `sw.js` direkt in `/elo-duell/` (Scope = Verzeichnis des Skripts). Registrierung: `navigator.serviceWorker.register('./sw.js')`.
```js
const VERSION = 'v1';                       // bei JEDEM Deploy erhöhen
const CACHE = `elo-duell-${VERSION}`;       // Präfix! Origin wird mit anderen Repos geteilt
const ASSETS = ['./', './index.html', './manifest.webmanifest', './css/app.css',
  './js/main.js', /* alle ES-Module einzeln! */ './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c =>
  c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))));   // HTTP-Cache umgehen
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys())
    if (k.startsWith('elo-duell-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {            // jede Navigation → App-Shell
    e.respondWith(caches.match('./index.html').then(r => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
});
```
- **Fragment-Links (`#…`)**: Der Fragment-Teil wird nie an den Server gesendet, und `caches.match` ignoriert ihn. Wichtig ist nur, dass Navigationen auf `index.html` zurückfallen; das Fragment bleibt in `location.hash` erhalten. Lokal getestet (offline, neuer Tab): `/elo-duell/#d=eyJhIjoxfQ` und `/elo-duell/index.html?x=1#abc` liefern 200 und den korrekten Hash. Gleiche URL mit anderem Hash ist keine Navigation (kein `load`) → in der App auf `hashchange` hören.
- `addAll` ist atomar: Eine fehlende Datei (404) lässt die Installation scheitern. Die Precache-Liste muss vollständig sein, also jedes per `import` geladene Modul enthalten.
- Update: `clients.claim()` **ja** (dann ist schon der erste Besuch kontrolliert). `skipWaiting()` **nicht automatisch**, sondern auf Nutzerklick („Update verfügbar – neu laden“). Dafür `reg.waiting.postMessage('SKIP_WAITING')` und bei `controllerchange` einmal `location.reload()`. So mischen sich keine alten und neuen Module. Bei einer reinen Single-File-Shell wäre automatisches `skipWaiting()` vertretbar.
- Erkennen: `reg.addEventListener('updatefound', …)` und `reg.waiting`. Optional `reg.update()` beim Start.

## 3. Automatisiert prüfen (Lighthouse 12+ hat keine PWA-Kategorie)
**a) Lighthouse 11 lokal (getestet, läuft):**
```sh
cd $SCRATCH/lh && npm init -y && npm i lighthouse@11      # nicht global
python3 -m http.server 8765 --directory <dir-über-elo-duell> &   # damit Unterpfad /elo-duell/ simuliert wird
CHROME_PATH=/opt/pw-browsers/chromium npx --no-install lighthouse http://localhost:8765/elo-duell/ \
  --only-categories=pwa --chrome-flags="--headless=new --no-sandbox" --output=json --output-path=lh.json --quiet
node -e 'const r=require("./lh.json");console.log(r.categories.pwa.score)'
```
Ergebnis Testseite: Score 1. Lighthouse 11 prüft nur noch Manifest, Icons, maskable, theme-color, viewport. **Offline- und SW-Audits sind schon entfernt**, Offline braucht also einen eigenen Test.

**b) Playwright (empfohlen, getestet):** `/opt/node22/lib/node_modules/playwright`, Chromium per `executablePath`.
- **`launchPersistentContext(dir, …)` verwenden.** `browser.newContext()` ist inkognito, dann liefert der Check `[{"errorId":"in-incognito"}]`.
- Ablauf: `goto(url)` → `evaluate(() => navigator.serviceWorker.ready)` → `reload()` → CDP `Page.getInstallabilityErrors` (erwartet `[]`) und `Page.getAppManifest` (`errors: []`). Danach prüfen, dass `navigator.serviceWorker.controller` gesetzt ist.
- Offline: `ctx.setOffline(true)`, dann **neuen Tab** `newPage().goto(url + '#d=…')` → Status 200, Titel und `location.hash` prüfen. Zusätzlich ein Smoke-Test der App-Funktion.
- Zusätzlich Manifest per `fetch` laden und Felder sowie Icon-Größen validieren (Bildmaße z. B. über `naturalWidth`).

## 4. localStorage vs. IndexedDB (einige hundert KB)
- **localStorage reicht**: Grenze etwa 5 MB pro Origin, synchron, einfache API, `JSON.stringify`. Bei ein paar hundert KB ist das Blockieren nicht spürbar. IndexedDB lohnt sich erst bei MB-Mengen, Blobs oder Abfragen.
- **Origin wird geteilt**: Alle Pages-Repos von `user-2268431.github.io` teilen sich localStorage, IndexedDB, Caches und Quota. Deshalb Schlüssel mit Präfix (`elo-duell:v1:…`) versehen und ein Schema-Versionsfeld für Migrationen führen.
- Jeden Zugriff in `try/catch` kapseln. `setItem` kann `QuotaExceededError` werfen. Im privaten Modus ist der Speicher flüchtig (beim Schließen weg). Bei kaputtem JSON auf Defaults zurückfallen.
- `navigator.storage.persist()` nach dem ersten Speichern wichtiger Daten aufrufen, nicht beim Laden. Chrome entscheidet ohne Prompt per Heuristik (installiert, Lesezeichen, Engagement). Bei installierter PWA wird die Anfrage meist gewährt. `navigator.storage.persisted()` prüfen, `estimate()` liefert Nutzung/Quota.
- Nutzer löschen Daten häufiger selbst, als der Browser sie verdrängt → **JSON-Export/Import anbieten** (Datei bzw. Fragment-Link).

## 5. GitHub Pages – Fallstricke
- Alle Pfade relativ (`./…`), keine `/…`-Root-Pfade: `/` wäre `user-2268431.github.io/`, nicht die App.
- Die SW-Reichweite ist auf `/elo-duell/` begrenzt. Ein `Service-Worker-Allowed`-Header ist nicht setzbar, eigene Header generell nicht (auch kein CSP-Header, nur `<meta http-equiv>`).
- Pages liefert alles mit `Cache-Control: max-age=600` (per CDN, laut Quellen; hier nicht abrufbar). Folgen:
  - Ein Deploy kommt bis zu ca. 10 Minuten verzögert an.
  - Chrome prüft `sw.js` beim Update-Check standardmäßig am HTTP-Cache vorbei (`updateViaCache: 'imports'`).
  - Für die Precache-Requests `cache: 'reload'` nutzen (siehe oben), sonst landen alte Dateien im neuen Cache.
- `/elo-duell` ohne Slash wird per 301 auf `/elo-duell/` umgeleitet. In Manifest und Links immer die Variante mit Slash verwenden.
- `404.html` ist bei Hash-Routing **nicht nötig**: Daten im Fragment erreichen den Server nie. Sinnvoll höchstens als freundliche Seite mit Link auf `./`.
- `.nojekyll` ins Root legen, sonst ignoriert Jekyll Dateien und Ordner, die mit `_` beginnen. Repo- und Pfadnamen sind case-sensitiv.

## Empfehlung
- Manifest mit `id`/`start_url`/`scope` = `"./"`, `display: standalone`, Icons 192 + 512 + 512-maskable. Alles relativ, `.nojekyll` anlegen.
- Handgeschriebener `sw.js`: versionierte Precache-Liste mit Präfix `elo-duell-`, cache-first, Navigation → `index.html`, `cache: 'reload'`, alte Caches mit eigenem Präfix löschen, `clients.claim()`, `skipWaiting` per Update-Button.
- Daten in localStorage mit Namespace-Präfix und Schemaversion, `try/catch`, `persist()` nach dem ersten Speichern, Export/Import als Backup.
- CI/Agent-Check: Playwright-Skript (persistenter Kontext, `getInstallabilityErrors`, Offline-Reload mit `#…`-Link). Lighthouse 11 nur ergänzend für Manifest/Icons.
