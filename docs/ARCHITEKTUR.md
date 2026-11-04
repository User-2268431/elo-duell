# Elo-Duell – Architektur (v1)

Stand 04.11.2026. Verbindlich für die 5 parallelen Entwickler-Agenten A–E. Was hier steht, gilt als Vertrag. Wer davon abweichen muss, meldet das dem Koordinator und legt die Abweichung nicht selbst fest.

## 1. Grundsätze
- Reines HTML/CSS/Vanilla-JS, ES-Module, **kein Build-Schritt**, keine CDN-Abhängigkeiten. Fremdcode wird mit Lizenz unter `vendor/` abgelegt.
- **Alle Pfade relativ** (`./…`), damit die App unter `/elo-duell/` (GitHub Pages) und lokal unter `/` läuft.
- Logik (A) ist DOM-frei und in Node testbar. Die Datenhaltung (B) ist als Factory gebaut und bekommt den Storage injiziert.
- Texte stehen auf Deutsch direkt in den Views, ohne i18n-Schicht. Zahlen werden mit `toLocaleString('de-DE')` formatiert, Wertungen auf ganze Zahlen gerundet angezeigt. Intern werden Floats gespeichert.
- Persistenz über **localStorage** (ein Schlüssel). Begründung: Die Datenmenge ist klein, der Zugriff synchron, es gibt weniger Fehlerquellen als bei IndexedDB. Fehler werden sauber behandelt, mit In-Memory-Fallback.

## 2. Verzeichnisbaum (Eigentümer)
```
index.html                 C  App-Shell, alle <link>/<script> bereits eingetragen
manifest.webmanifest       E
sw.js                      E  klassischer SW, VERSION + PRECACHE
.nojekyll                  E
icons/icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png   E
css/base.css               C  Variablen, Hell/Dunkel, Buttons, Layout, Dialog, Toast
css/lists.css  css/duel.css  css/ranking.css      C
css/settings.css           B
css/share.css  css/compare.css                    D  (share.css auch für scan/import)
css/pwa.css                E  Update-Banner
js/types.js                B  nur JSDoc-Typedefs aus Abschnitt 3 (wörtlich übernehmen)
js/app.js                  C  Einstieg: store.init, initPwa, Router-Start, View-Registry
js/router.js  js/ui.js     C
js/logic/elo.js  pairing.js  stability.js  compare.js  text.js     A
js/data/store.js  schema.js  backup.js                             B
js/share/codec.js  qr.js  scanner.js                               D
js/views/home.js  list-edit.js  list.js  duel.js  ranking.js       C
js/views/settings.js                                               B
js/views/share.js  scan.js  import.js  compare.js                  D
js/pwa.js  js/version.js                                           E
vendor/qrcode-generator.mjs (+LICENSE-qrcode-generator, MIT)        D
vendor/jsQR.js (+LICENSE-jsQR, Apache-2.0)                          D
tests/unit/<modul>.test.mjs        Eigentümer des Moduls
tests/e2e/<bereich>.spec.mjs       C: lists, duel · D: share, compare · B: backup · E: offline, install
tests/e2e/helpers.mjs              E  (resetApp, createList, playDuels)
tools/serve.mjs  playwright.config.mjs  package.json                E
```

## 3. Datenmodell (localStorage-Schlüssel `elo-duell:v1`)
```js
/** @typedef {{schema:1, device:Device, lists:Record<string,List>, order:string[], settings:{}}} AppState */
/** @typedef {{id:string, name:string}} Device   // id "d_"+10 Zeichen; name Standard "" (wird beim ersten Teilen erfragt) */
/** @typedef {{
 *   id:string,            // "l_"+10 Zeichen [a-z0-9], crypto.getRandomValues; Beispielliste fest "l_beispiel01"
 *   aliases:string[],     // fremde Listen-IDs, die mit dieser Liste verknüpft wurden
 *   name:string, createdAt:number, updatedAt:number,   // ms seit Epoch
 *   options:Option[], history:Duel[], partners:PartnerRanking[] }} List */
/** @typedef {{id:string, name:string, rating:number, duels:number, wins:number, draws:number, losses:number}} Option
 *   // id "o_"+6 Zeichen, eindeutig je Liste; Start rating 1000 */
/** @typedef {{a:string, b:string, s:1|0.5|0, da:number, db:number, t:number}} Duel
 *   // s = Ergebnis aus Sicht von a; da/db = Wertungsänderung (für Rückgängig) */
/** @typedef {{deviceId:string, name:string, receivedAt:number, sentAt:number,
 *   options:{name:string, rating:number, duels:number}[]}} PartnerRanking   // je deviceId nur der neueste Eintrag */
```
- **Rückgängig** zieht `da`/`db` ab, verringert `duels` und den passenden Zähler (wins/draws/losses) und entfernt das Duell aus der History. Das geht beliebig oft hintereinander. Deltas statt alter Absolutwerte halten das auch nach dem Löschen von Optionen konsistent.
- **Option löschen** entfernt auch alle History-Einträge, an denen sie beteiligt war. **Umbenennen** behält Wertung und History.
- **Gleiche Liste auf zwei Handys erkennen:** (1) `share.l === list.id` oder `list.aliases.includes(share.l)`, dann eindeutig. (2) Sonst Namensabgleich: Jaccard-Überlappung der normalisierten Optionsnamen ≥ 0,6 ergibt einen Vorschlag. Bestätigt der Nutzer, wird `share.l` in `aliases` aufgenommen. (3) Sonst wird „Als neue Liste übernehmen“ angeboten. Die neue Liste erhält **dieselbe ID** `share.l` und Wertungen von 1000.
- **Beispielliste** wird nur angelegt, wenn der State leer ist. Sie heißt „Urlaubsziele“ und enthält Lissabon, Kopenhagen, Rom, Bergen, Dolomiten, Kreta, Edinburgh, Ostsee. Durch die feste ID passt sie auf beiden Handys automatisch zusammen.

## 4. Öffentliche APIs
### A) Logik (rein, DOM-frei, deterministisch bei injiziertem `rng`)
```js
// elo.js
export const START_RATING = 1000, K = 32;
/** @returns {number} */ export function expected(own, opp)           // 1/(1+10^((opp-own)/400))
/** @param {1|0.5|0} sA @returns {{ra:number, rb:number, da:number, db:number}} */
export function applyResult(ra, rb, sA, k = K)
/** @param {Option[]} options @returns {(Option & {rank:number})[]} */
export function rankOptions(options)  // rating absteigend, dann duels absteigend, dann name (localeCompare 'de'); rank 1..n
// text.js
/** @returns {string} */ export function normalizeName(s)  // NFC, trim, Leerraum zusammenfassen, toLocaleLowerCase('de')
/** @returns {string[]} */ export function parseOptionLines(text)
  // pro Zeile; entfernt Aufzählungszeichen (-, *, •, "1.", "1)"), trimmt, leere Zeilen weg,
  // dedupliziert über normalizeName, kürzt auf 120 Zeichen
// pairing.js
/** @param {Option[]} options @param {Duel[]} history
 *  @param {{avoid?:[string,string][], rng?:()=>number}} [opts]  // avoid: letzte Paarung + übersprungene Paare
 *  @returns {[Option, Option] | null} */  // null, wenn weniger als 2 Optionen
export function pickPair(options, history, opts)
  // a = zufällig unter den Optionen mit minimaler Duellzahl.
  // b = minimiert cost = |ra-rb|/100 + 0.5*duels_b + 3*anzahlBisherigerDuelle(a,b) + (avoid ? 1000 : 0) + rng()*0.5;
  //     zufällig unter den besten 3. Seiten (links/rechts) zufällig vertauscht.
  //     Bei genau 2 Optionen ist Wiederholung erlaubt.
// stability.js
export const TARGET_FACTOR = 3, STABLE_FACTOR = 2.5;   // Duelle gesamt pro Option (Richtwert)
/** @returns {{duels:number, target:number, ratio:number, minDuels:number,
 *   level:'start'|'vorlaeufig'|'stabil', hint:string}} */
export function progress(list)
  // target = ceil(3*n); stabil bei duels ≥ 2.5*n UND minDuels ≥ 2; vorläufig ab 1*n.
  // hint auf Deutsch, z. B. „Noch etwa 9 Duelle bis zu einer stabilen Rangliste“
// compare.js
/** @param {{name:string,rating:number,duels:number}[]} mine @param {…} theirs
 *  @returns {CompareResult} */ export function compareRankings(mine, theirs)
/** @typedef {{name:string, rankA:number, rankB:number, ratingA:number, ratingB:number}} CmpItem
 *  @typedef {{common:number, favorites:CmpItem[], excluded:CmpItem[], talk:CmpItem[],
 *    onlyMine:string[], onlyTheirs:string[]}} CompareResult */
```
**Vergleichsregeln.** Abgeglichen wird über `normalizeName`. Die Ränge werden **innerhalb der gemeinsamen Menge** (Größe m) neu berechnet.
- `excluded`: Optionen, die bei mindestens einer Person in den unteren `max(1, ceil(m/4))` Rängen liegen. Sortiert nach min(rating) aufsteigend.
- `favorites`: alle übrigen Optionen, sortiert nach `min(ratingA, ratingB)` absteigend, Tiebreak max-Wertung, dann Name. Angezeigt werden die ersten `min(5, ceil(m/3))`.
- `talk`: `|rankA-rankB| ≥ 2`, sortiert nach Differenz absteigend, höchstens 5.

### B) Daten
```js
// store.js
/** @param {{storage?:Storage|null, now?:()=>number}} [deps] */ export function createStore(deps)
export const store;   // = createStore() mit window.localStorage
// Methoden (mutieren intern, speichern synchron, benachrichtigen Abonnenten; geben frische Objekte zurück):
init(): {mode:'local'|'memory', warning:string|null}   // fordert navigator.storage.persist() an, wartet aber nicht darauf
getState(): AppState      // nur lesen, nicht mutieren
getList(id): List|undefined;   listLists(): List[]   // in der Reihenfolge von order
createList(name, names:string[], id?:string): List
renameList(id, name); deleteList(id); moveList(id, toIndex)
addOptions(id, names:string[]): number   // Duplikate (normalizeName) werden ignoriert; gibt Anzahl neu hinzugefügter zurück
renameOption(listId, optId, name); removeOption(listId, optId); resetRatings(listId)
recordDuel(listId, aId, bId, s:1|0.5|0): Duel      // nutzt elo.applyResult
undoLastDuel(listId): Duel|null                    // gibt das rückgängig gemachte Duell zurück; die View zeigt das Paar erneut
setDeviceName(name); getDevice(): Device
savePartner(listId, PartnerRanking); removePartner(listId, deviceId)
findMatch(shareData): {list:List|null, kind:'id'|'name'|'none', overlap:number}
addAlias(listId, foreignId)
replaceAll(state:AppState)                         // für Backup-Import, validiert vorher
subscribe(fn:(state:AppState)=>void): ()=>void
status(): {mode:'local'|'memory', lastError:string|null}
onWarning(fn:(msg:string)=>void)                   // z. B. „Speicher voll – Änderungen gehen beim Schließen verloren“
// schema.js
export const SCHEMA = 1;  export function defaultState(): AppState  // mit Beispielliste
export function migrate(raw:any): AppState   // Kette v0→v1…; wirft SchemaError bei Unbrauchbarem
export function validateState(s:any): string[]   // Fehlerliste, leer = gültig
// backup.js
export function exportBackup(state): Blob   // {app:'elo-duell', kind:'backup', schema:1, exportedAt, state}
export function backupFileName(date=new Date()): string  // elo-duell-sicherung-JJJJ-MM-TT.json
export function downloadBackup(state): void  // Blob + <a download>
/** @returns {Promise<AppState>} */ export async function readBackupFile(file)  // parsen, migrieren, validieren; Fehlermeldungen auf Deutsch
```
**Fehlerbehandlung im Store:**
- localStorage nicht zugreifbar (SecurityError): `mode:'memory'` und Warnbanner.
- QuotaExceededError: Der Speicherstand im RAM bleibt erhalten, außerdem gibt es eine Warnung und den Hinweis auf eine Sicherung.
- Kaputtes JSON: Der Rohinhalt wird unter `elo-duell:defekt:<ts>` aufbewahrt, danach startet `defaultState()` mit Warnung.
- Das `storage`-Event (zweiter Tab) lädt neu, es gilt „letzter Schreiber gewinnt“.

### C) Oberfläche
```js
// router.js
export function startRouter(routes:Route[], ctxBase): void
export function navigate(hash:string, opts?:{replace?:boolean}): void
export function openImport(payload:string): void     // setzt das Pending-Payload, navigiert nach #/import
export function getPendingImport(): string|null;  export function clearPendingImport(): void
/** @typedef {{pattern:string, view:View, parent?:(p)=>string}} Route */
/** @typedef {{title:string|((ctx)=>string), render(root:HTMLElement, ctx:ViewCtx): void|(()=>void)}} View
 *  // Jede View-Datei: export default {title, render}. Der Rückgabewert ist ein Cleanup (Kamera stoppen, unsubscribe). */
/** @typedef {{store, navigate, openImport, getPendingImport, clearPendingImport, params:Record<string,string>, ui}} ViewCtx */
// ui.js
export function h(tag, attrs?, ...children): HTMLElement   // attrs: class, data-testid, on:{click}, Text wird escaped
export function toast(text, opts?:{actionLabel?:string, onAction?:()=>void, ms?:number}): void
export function confirmDialog({title, text, okLabel='OK', cancelLabel='Abbrechen', danger=false}): Promise<boolean>
export function promptDialog({title, label, value='', okLabel='Speichern'}): Promise<string|null>
export function fmtRating(n): string;  export function fmtDate(ms): string
export function setBanner(id:string, text:string|null, action?:{label, onClick}): void  // oben in #banners
```

### D) Austausch
```js
// codec.js
/** @returns {Promise<string>} */ export async function encodeShare(data:ShareData)   // "1.z.<b64url>" bzw. "1.j.<b64url>"
/** @returns {Promise<ShareData>} */ export async function decodeShare(payload:string) // wirft ShareError{code}
export function buildShareUrl(payload, loc=location): string   // origin+pathname+"#i="+payload
export function extractPayload(textOrUrl:string): string|null  // akzeptiert URL, "#i=…" oder das nackte Payload
export function toShareData(list:List, device:Device, now): ShareData
export function toPartnerRanking(d:ShareData, now): PartnerRanking
export class ShareError extends Error { code:'format'|'version'|'zu-gross'|'beschaedigt' }
// qr.js
export function renderQr(text, container:HTMLElement, opts?:{ecc?:'L'|'M'}): {modules:number}
  // Canvas, immer schwarz auf weiß, Ruhezone 4 Module
// scanner.js
export function canScan(): boolean   // getUserMedia vorhanden
/** @returns {Promise<string>} Rohtext */ export async function scanQr(video:HTMLVideoElement, {signal}:{signal:AbortSignal})
  // Kamera mit facingMode 'environment'. BarcodeDetector(['qr_code']), falls vorhanden und unterstützt,
  // sonst wird vendor/jsQR.js per <script> nachgeladen (window.jsQR). Stoppt alle Tracks bei signal.abort.
```

### E) PWA
```js
// pwa.js
export function initPwa(opts:{onUpdateReady:(apply:()=>void)=>void}): void
  // registriert ./sw.js mit Scope ./ ; wartender SW → onUpdateReady;
  // apply = postMessage({type:'SKIP_WAITING'}), bei controllerchange einmalig neu laden
// version.js
export const VERSION = '1.0.0';   // muss gleich der VERSION in sw.js sein (wird per Unit-Test geprüft)
```

## 5. Austauschformat v1
Fragment: `#i=1.z.<base64url ohne Padding>`. Aufbau: `<Version>.<Kodierung>.<Daten>`.
- `z` = UTF-8-JSON → `CompressionStream('deflate-raw')`.
- `j` = unkomprimiertes JSON. Das ist der Fallback, wenn CompressionStream fehlt. Der Decoder muss beide können.

```json
{ "v":1, "l":"l_ab12cd34ef", "n":"Urlaubsziele", "p":"Anna", "d":"d_x9y8z7w6v5", "t":1762290000,
  "o":[["Lissabon",1048,6],["Rom",1016,5]] }
```
- `t` in Sekunden.
- `o` ist nach Wertung absteigend sortiert. Jeder Eintrag ist `[Name, Wertung gerundet, Duelle]`.
- Grenzen beim Dekodieren:
  - entpackt höchstens 256 KB (Schutz gegen Zip-Bomben),
  - höchstens 500 Optionen,
  - Namen höchstens 120 Zeichen,
  - Zahlen müssen endlich sein.
  - Unbekannte Felder werden ignoriert. `v > 1` ergibt `ShareError('version')` mit der Meldung „Bitte App aktualisieren“.
- Das Format wird auch zum **Teilen einer Liste vor dem Duellieren** genutzt. Haben alle Duelle den Wert 0, legt der Import nur die Liste an und speichert keinen Partner.
- QR-Code: Er enthält die komplette URL im Byte-Modus. Bei einer URL über 1200 Zeichen wird ECC L verwendet, sonst M. Ab 2000 Zeichen erscheint die Meldung „Liste zu groß für QR – bitte Link senden“.
- Link: `navigator.share({url})`, falls vorhanden, sonst Kopieren in die Zwischenablage.

## 6. Routing
Hash-basiert. **Routen beginnen immer mit `#/`, Importdaten immer mit `#i=`.** Dadurch gibt es keinen Konflikt.

| Hash | View (Datei) | Zurück zu |
|---|---|---|
| `#/` | home.js – Listenübersicht | – |
| `#/neu` · `#/liste/:id/bearbeiten` | list-edit.js | `#/` · `#/liste/:id` |
| `#/liste/:id` | list.js – Zentrale: Fortschritt, Buttons | `#/` |
| `#/duell/:id` · `#/rangliste/:id` | duel.js · ranking.js | `#/liste/:id` |
| `#/teilen/:id` | share.js (D) | `#/liste/:id` |
| `#/vergleich/:id/:partner` | compare.js (D) | `#/liste/:id` |
| `#/scan` · `#/import` | scan.js · import.js (D) | `#/` |
| `#/einstellungen` | settings.js (B) | `#/` |

- Beginnt der Hash beim Start oder bei einem `hashchange` mit `#i=`, schreibt der Router das Payload in sessionStorage (`elo-duell:import`), damit es einen Reload übersteht. Danach folgen `history.replaceState(null,'','#/import')` und das Rendern. Die Daten bleiben so nicht in der History.
- Unbekannte Route oder unbekannte Listen-ID: Toast „Liste nicht gefunden“, dann `#/`.
- Die Zurück-Taste im Header nutzt `parent` und nicht `history.back()`.
- In `app.js` (C) ist die Registry aller Views von Anfang an fest eingetragen, auch die Dateien von B und D.

## 7. UI-Ablauf
- **Start** (`#/`):
  - Karten der Listen mit Name, Optionsanzahl und Fortschrittsbalken.
  - Unten ein großer Button „Neue Liste“ und ein Button „QR scannen“.
  - Zahnrad zu den Einstellungen.
- **Liste anlegen/bearbeiten:**
  - Feld für den Namen und ein Textfeld „Eine Option pro Zeile (Einfügen möglich)“.
  - Die Vorschau zeigt die erkannte Anzahl.
  - Beim Bearbeiten: Optionen mit Umbenennen/Löschen (Bestätigung bei vorhandenen Duellen), außerdem „Wertungen zurücksetzen“ und „Liste löschen“ (rot, mit Bestätigung).
- **Liste (Zentrale):**
  - Fortschritt plus Hinweistext (`progress().hint`).
  - Buttons: „Duellieren“ (primär), „Rangliste“, „Teilen“ und „Vergleichen mit …“ (je ein Eintrag pro Partner, oder der Hinweis „Noch keine Rangliste empfangen – lass dir den QR-Code zeigen“).
- **Duell:**
  - Frage „Was gefällt dir besser?“. Zwei große Karten untereinander (je mindestens 30 % der Höhe, untere Bildschirmhälfte, Daumenzone).
  - Darunter in einer Reihe „Gleich gut“, „Überspringen“, „Rückgängig“ (deaktiviert ohne History). Oben ein Fortschrittsbalken.
  - Antippen speichert das Ergebnis sofort, dann folgt das nächste Paar. Ein kurzer visueller Effekt von höchstens 150 ms ist erlaubt.
  - Beim Erreichen von „stabil“ erscheint einmalig der Hinweis „Rangliste ist jetzt aussagekräftig“ mit den Aktionen „Rangliste ansehen“ und „Weiter duellieren“.
  - Die Duell-Sitzung (letztes Paar, übersprungene Paare) liegt nur im Speicher der View.
- **Rangliste:** Platz, Name, Punkte, Duellanzahl. Darüber der Stabilitätshinweis, darunter der Button „Teilen“.
- **Teilen:**
  - Beim ersten Mal fragt die App „Wie heißt du?“ (promptDialog) und speichert die Antwort per `setDeviceName`.
  - Angezeigt werden der QR-Code (bildschirmfüllend), „Link senden“ und „Link kopieren“ sowie der Hinweis „Auf dem anderen Handy: Elo-Duell → QR scannen, oder Link öffnen“.
- **Scannen:** Kamerabild und „Abbrechen“. Fallback-Feld „Link einfügen“ mit Button „Übernehmen“, wenn keine Kamera vorhanden ist und immer zusätzlich darunter. Bei einem Treffer folgt `openImport()`.
- **Import:**
  - Zeigt „Rangliste von Anna: Urlaubsziele (8 Optionen)“ und das Ergebnis von `findMatch`. Je nach Fall:
    - `id`: „Übernehmen“
    - `name`: „Mit Liste X verknüpfen“ oder „Als neue Liste“
    - `none`: „Als neue Liste übernehmen“
  - Danach geht es weiter zum Vergleich, oder zur Liste, wenn es keine Partner-Duelle gibt.
- **Vergleich:**
  - Drei Abschnitte: „Gemeinsame Favoriten“, „Klare Ausschlüsse“, „Gesprächsstoff“ (zeigt „Platz 2 bei dir · Platz 7 bei Anna“).
  - Dazu einklappbar „Nur bei dir / nur bei Anna“.
  - Liegt zu wenig Überlappung vor (m < 2), wird ein Hinweis gezeigt.
- **Einstellungen:** Name, „Sicherung exportieren“, „Sicherung importieren“ (ersetzt alles, mit Bestätigung), Speicherstatus, App-Version.

## 8. Gemeinsame Dateien und Konfliktvermeidung
- **index.html gehört allein C.** Es enthält von Anfang an:
  - die Shell `<header id="bar">` (Zurück, Titel), `<div id="banners">`, `<main id="app">`, `<div id="toast" aria-live="polite">`,
  - `<link>` auf **alle** CSS-Dateien aus Abschnitt 2 sowie Manifest, Icons, `<meta name="theme-color">` für hell und dunkel (per `media`) und `<script type="module" src="./js/app.js">`.
  - Niemand sonst ändert index.html. Fehlende CSS-Dateien von anderen schaden bis dahin nicht.
- **CSS:**
  - `base.css` (C) definiert die Variablen `--bg --fg --muted --card --accent --accent-fg --danger --radius --tap:56px --gap` für hell und dunkel per `@media (prefers-color-scheme: dark)` sowie `color-scheme: light dark`.
  - Außerdem die Klassen `.btn .btn-primary .btn-danger .btn-ghost .card .stack .row .bar .badge` und Safe-Area-Abstände (`env(safe-area-inset-*)`).
  - View-CSS nutzt **nur Variablen und Klassen mit View-Präfix** (`.duel-*`, `.rank-*`, `.lists-*`, `.share-*`, `.scan-*`, `.import-*`, `.cmp-*`, `.set-*`, `.pwa-*`). Es gibt keine globalen Selektoren außerhalb von base.css.
  - Tippflächen sind mindestens `var(--tap)` groß, Schrift mindestens 16 px.
- **sw.js gehört allein E.** Die PRECACHE-Liste wird aus Abschnitt 2 übernommen. Der Unit-Test `tests/unit/precache.test.mjs` vergleicht die Liste mit den tatsächlichen Dateien (ohne tests/, tools/, node_modules/, docs/). Bei Abweichungen schlägt er fehl, und E zieht die Liste nach.
- **package.json gehört E.** Andere melden Skripte, statt sie selbst einzutragen.
- **Neue Dateien sind nur nach Absprache mit dem Koordinator erlaubt**, weil sonst Precache und Registry auseinanderlaufen.

## 9. PWA und Offline
- **Manifest:** `id`, `start_url` und `scope` = `"./"`, `display:"standalone"`, `lang:"de"`, `name:"Elo-Duell"`, Icons 192/512 und maskable 512.
- **PNG-Icons** werden einmalig über `tools/` erzeugt (zum Beispiel per Playwright-Screenshot der SVG) und eingecheckt.
- **sw.js:**
  - `install` legt alle PRECACHE-Dateien im Cache `elo-duell-<VERSION>` ab.
  - `activate` löscht alte Caches.
  - `fetch`: Bei Navigation kommt `index.html` aus dem Cache. Andere Same-Origin-Anfragen laufen cache-first mit Netz-Fallback.
  - `skipWaiting` erfolgt nur auf Nachricht.
- **Update-Banner (E, über `ui.setBanner('update', …)`):** „Neue Version verfügbar“ mit Button „Neu laden“.
- **Kamera und SW** brauchen HTTPS oder localhost. GitHub Pages erfüllt das.
- **Speicher:** Ein Link aus einem Messenger öffnet sich in Chrome und nicht in der installierten App. Beide teilen auf Android denselben Origin-Speicher, das funktioniert also.

## 10. Tests
- **Unit-Tests** mit `node --test tests/unit/` (Node 22: CompressionStream und deflate-raw sind global verfügbar).
  - **A:** Elo-Formel (1000 gegen 1000, Sieg → 1016/984; Remis → keine Änderung), rankOptions, parseOptionLines, pickPair (keine direkte Wiederholung, bevorzugt wenig Duelle, mit festem rng), progress, compareRankings mit Beispieldaten.
  - **B:** Store mit Fake-Storage: Quota-Fehler, Storage null, defektes JSON, Undo-Kette, Option löschen bei vorhandener History, Migration, Backup-Roundtrip.
  - **D:** Codec-Roundtrip mit Umlauten und Emoji, `z` und `j`, Grenzen, ShareError-Codes, extractPayload.
  - **E:** Precache-Test und Versionsgleichheit.
- **E2E:** Playwright mit `devices['Pixel 7']`, Chromium aus `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH`).
  - `tools/serve.mjs` ist ein statischer Node-Server ohne Abhängigkeiten auf Port 4173. Er liefert das Repo **unter `/elo-duell/`** aus, damit der Unterpfad realistisch ist.
  - Szenarien:
    - Liste anlegen per Einfügen
    - 20 Duelle mit Undo
    - Rangliste
    - Reload behält die Daten
    - zwei Browser-Kontexte: A teilt den Link, B öffnet ihn, importiert und vergleicht
    - Sicherung exportieren und wieder importieren
    - Offline: SW bereit → `context.setOffline(true)` → Reload → App funktioniert
    - Dunkelmodus per `colorScheme:'dark'` (Screenshot)
  - Der Kamera-Scan wird nicht per E2E getestet. Stattdessen wird das Feld „Link einfügen“ getestet.
- **data-testid** nach dem Schema `<bereich>-<element>[-<zusatz>]`, in kebab-case. Verbindlich sind:
  - `app-back`, `app-title`, `toast`, `banner-<id>`, `dialog-ok`, `dialog-cancel`, `dialog-input`
  - `home-new`, `home-scan`, `home-settings`, `home-list-<listId>`
  - `edit-name`, `edit-options`, `edit-count`, `edit-save`, `edit-delete-list`, `edit-reset`, `edit-opt-<optId>`, `edit-opt-rename-<optId>`, `edit-opt-remove-<optId>`
  - `list-duel`, `list-ranking`, `list-share`, `list-progress`, `list-compare-<deviceId>`
  - `duel-a`, `duel-b`, `duel-draw`, `duel-skip`, `duel-undo`, `duel-progress`, `duel-stable`
  - `rank-row-<rang>` mit Kindern `rank-name`, `rank-rating`, `rank-duels`; außerdem `rank-hint`
  - `share-qr`, `share-send`, `share-copy`, `share-url` (readonly-Feld mit der URL)
  - `scan-video`, `scan-paste`, `scan-paste-ok`, `scan-error`
  - `import-summary`, `import-accept`, `import-link-<listId>`, `import-new`, `import-error`
  - `cmp-favorites`, `cmp-excluded`, `cmp-talk`, `cmp-only-mine`, `cmp-only-theirs`, `cmp-item-<index>`
  - `set-name`, `set-export`, `set-import`, `set-storage`, `set-version`

## 11. Reihenfolge und Parallelität
- Alle fünf beginnen sofort.
- Bis die echten Module fertig sind, nutzen C und D die Signaturen aus Abschnitt 4 und testen mit eigenen kleinen Stubs. Stubs werden nicht eingecheckt.
- B legt `js/types.js` als Erstes an.
- C stellt `ui.js` und `router.js` vor den Views fertig, weil D und B sie nutzen.
- Die Integration übernimmt der Koordinator: zuerst `node --test`, dann E2E.

## 12. Risiken und Gegenmaßnahmen
- **Dichter QR-Code bei großen Listen:** Größengrenze mit Hinweis, Link als Alternative, ECC L. Bis etwa 60 Optionen ist der Code gut scannbar.
- **BarcodeDetector fehlt oder ist auf manchen Geräten kaputt** (etwa ohne Play Services): Erkennung per try/catch, Fallback jsQR, Einfügefeld.
- **Vendoring:** Ohne npm-Zugang zum Kopieren von `qrcode-generator`/`jsqr` muss D frühzeitig melden. Ein eigener QR-Encoder ist ein hohes Risiko.
- **CompressionStream deflate-raw** gibt es erst ab Chrome 103. Fallback ist `j`.
- **localStorage-Eviction oder privater Modus:** `storage.persist()`, Speicherstatus in den Einstellungen, Erinnerung an die Sicherung.
- **Precache-Drift durch paralleles Arbeiten:** automatischer Test (Abschnitt 8).
- **Veralteter SW nach Deploy:** VERSION erhöhen (Checkliste vor jeder Veröffentlichung) und Update-Banner.
- **Messenger kürzen lange Links:** QR-Code als Hauptweg, Link als Ergänzung.
- **Gleiche Optionen mit unterschiedlicher Schreibweise:** `normalizeName`. Was danach nicht zusammenpasst, erscheint unter „nur bei …“.

### Kritische Dateien für die Umsetzung
- /home/user/elo-duell/js/types.js (Datenmodell, B, muss zuerst stehen)
- /home/user/elo-duell/js/data/store.js (B, zentrale API für C und D)
- /home/user/elo-duell/js/router.js und /home/user/elo-duell/js/ui.js (C, Grundlage aller Views)
- /home/user/elo-duell/js/share/codec.js (D, Austauschformat v1)
- /home/user/elo-duell/sw.js (E, Precache-Liste und Offline-Pflicht)

---
Hinweis für den Koordinator: `docs/research/` war beim Entwurf noch leer. TARGET_FACTOR=3 und STABLE_FACTOR=2,5 in stability.js beziehen sich auf **Duelle gesamt pro Option**: 3·n Duelle bei n Optionen, also etwa 6 Teilnahmen je Option. Das deckt sich nicht unbedingt mit dem Ergebnis der Recherche „elo-abbruch“. Wenn die Recherche den Richtwert anders auslegt, nämlich 3 Teilnahmen je Option (das wären nur 1,5·n Duelle), reicht es, die beiden Konstanten zu ändern.
