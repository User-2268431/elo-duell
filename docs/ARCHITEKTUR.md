# Elo-Duell – Architektur (v1.1)

Stand 04.11.2026. Verbindlich für die 5 parallelen Entwickler-Agenten A–E. Was hier steht, ist der Vertrag. Wer abweichen muss, meldet das dem Koordinator und entscheidet nicht selbst.

**Änderungen gegenüber v1** (Quellen: Prüfungen Technik/Produkt, Recherche)
- Commit 0 mit Skeletten aller Dateien (§11). „Stubs werden nicht eingecheckt“ ist gestrichen.
- storage-Schlüssel `elo-duell:state`. `store` ist in Node importierbar. Das storage-Event wird gefiltert, `persist()` erst nach dem ersten Schreiben aufgerufen (§3, §4B).
- Typedef `ShareData` und Payload-Feld `a` (Aliase), `sentAt = t*1000` (§3, §5).
- Stabilität: Rahmen und Schnittstelle stehen fest, M = Σduels/2. Die Schwellen sind **OFFEN F1** (§4A).
- Paarbildung: harte Sperre gegen direkte Wiederholung. Die Heuristik ist **OFFEN F2** (§4A).
- Vergleich: Wettkampf-Ränge auf gerundeten Wertungen, Regeln für Disjunktheit und Überschneidung, Leertexte. Die Schwelle ist **OFFEN F3** (§4A).
- resetRatings leert die History, renameOption prüft auf Duplikate, Backup-Import behält die device.id, eigenes Payload wird abgewiesen (§3, §4B, §7).
- Ablauf nach dem Import (Partner speichern → selber duellieren), Rückweg-Button, Hinweise im Vergleich (§7).
- QR immer mit ECC L, nur bis 1000 Zeichen URL, ab 2000 Zeichen eine Warnung (§5).
- SW: Präfix `elo-duell-`, `cache:'reload'`, `clients.claim()`, `{type:'SKIP_WAITING'}`, `controllerchange` erst in `apply()` (§4E, §9).
- Precache-Test per Whitelist (§8). Tests: Glob, playwright@1.63.0, Installierbarkeit, Lighthouse 11, Offline-Test mit neuem Tab, Abnahme-E2E (M9) (§10).
- data-testid `cmp-<abschnitt>-item-<i>` sowie neue IDs (§10). Git-Regel (§11). Risiko In-App-WebView (§12).

## 1. Grundsätze
- Reines HTML/CSS/Vanilla-JS mit ES-Modulen, **kein Build-Schritt**, kein CDN. Fremdcode liegt mit Lizenz unter `vendor/`.
- **Alle Pfade relativ** (`./…`). Die App läuft unter `/elo-duell/` (GitHub Pages) und lokal unter `/elo-duell/` (tools/serve.mjs).
- Logik (A) ist DOM-frei und läuft in Node. Daten (B) sind als Factory gebaut, der Storage wird injiziert. **Jedes Modul in js/logic, js/data und js/share/codec.js muss in Node importierbar sein, ohne zu werfen** (Rauchtest).
- Texte stehen auf Deutsch direkt in den Views. Zahlen werden mit `toLocaleString('de-DE')` formatiert, Wertungen ganzzahlig angezeigt und intern als Floats gespeichert.
- Persistenz über **localStorage**, ein Schlüssel, mit In-Memory-Fallback.

## 2. Verzeichnisbaum (Eigentümer)
```
index.html                 C  App-Shell; in Commit 0 komplett (alle <link>/<script>)
manifest.webmanifest  sw.js  .nojekyll                               E
icons/icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png    E  (erzeugt mit tools/make-icons.mjs)
css/base.css  css/lists.css  css/duel.css  css/ranking.css           C
css/settings.css                                                     B
css/share.css  css/compare.css                                       D  (share.css auch für scan/import)
css/pwa.css                                                          E  Update-Banner
js/types.js                B  JSDoc-Typedefs aus §3 (in Commit 0 bereits eingetragen)
js/app.js                  C  Einstieg: store.init, initPwa, Router-Start, feste View-Registry
js/router.js  js/ui.js     C
js/logic/elo.js  pairing.js  stability.js  compare.js  text.js     A
js/data/store.js  schema.js  backup.js                             B
js/share/codec.js  qr.js  scanner.js                               D
js/views/home.js  list-edit.js  list.js  duel.js  ranking.js       C
js/views/settings.js                                               B
js/views/share.js  scan.js  import.js  compare.js                  D
js/pwa.js  js/version.js                                           E
vendor/qrcode-generator.mjs + LICENSE-qrcode-generator (MIT)        D
vendor/jsQR.js (min) + LICENSE-jsQR (Apache-2.0)                    D
vendor/package.json        E  {"type":"commonjs"}, damit Node-Tests jsQR per createRequire laden können
tests/unit/<modul>.test.mjs        Eigentümer des Moduls; tests/unit/smoke.test.mjs E
tests/e2e/<bereich>.spec.mjs       C: lists, duel, dark · D: share, compare · B: backup · E: offline, install, abnahme
tests/e2e/helpers.mjs              E
tools/serve.mjs  tools/make-icons.mjs  playwright.config.mjs  package.json  .gitignore   E
```

## 3. Datenmodell (localStorage-Schlüssel `elo-duell:state`)
```js
/** @typedef {{schema:1, device:Device, lists:Record<string,List>, order:string[], settings:{}}} AppState */
/** @typedef {{id:string, name:string}} Device   // id "d_"+10 Zeichen; name Standard "" (wird beim ersten Teilen erfragt) */
/** @typedef {{
 *   id:string,            // "l_"+10 Zeichen [a-z0-9], crypto.getRandomValues; Beispielliste fest "l_beispiel01"
 *   aliases:string[],     // fremde Listen-IDs, die mit dieser Liste verknüpft wurden
 *   name:string, createdAt:number, updatedAt:number,   // ms seit Epoch
 *   stableShown:boolean,  // Hinweis „Rangliste ist jetzt aussagekräftig“ schon gezeigt
 *   options:Option[], history:Duel[], partners:PartnerRanking[] }} List */
/** @typedef {{id:string, name:string, rating:number, duels:number, wins:number, draws:number, losses:number}} Option
 *   // id "o_"+6 Zeichen, eindeutig je Liste; Start rating 1000 */
/** @typedef {{a:string, b:string, s:1|0.5|0, da:number, db:number, t:number}} Duel
 *   // s = Ergebnis aus Sicht von a; da/db = Wertungsänderung (für Rückgängig); history: ältestes zuerst */
/** @typedef {{deviceId:string, name:string, receivedAt:number, sentAt:number,
 *   options:{name:string, rating:number, duels:number}[]}} PartnerRanking   // je deviceId nur der neueste Eintrag */
/** @typedef {{v:1, l:string, n:string, p:string, d:string, t:number,
 *   o:[string, number, number][], a?:string[]}} ShareData
 *   // Kurzschlüssel wie in §5: v Formatversion, l Listen-ID, n Listenname, p Name der Person, d Geräte-ID,
 *   // t Sekunden seit Epoch, o [Name, Wertung gerundet, Duelle] nach Wertung absteigend, a Aliase der Liste */
```
- **Schema** steht im Feld `schema`, der Schlüssel bleibt versionsneutral. sessionStorage `elo-duell:import` enthält das ausstehende Import-Payload. Ein defekter Rohinhalt wird unter **einem** Schlüssel `elo-duell:defekt` abgelegt (überschreibt einen älteren).
- **Rückgängig** zieht `da`/`db` ab, verringert `duels` und den passenden Zähler und entfernt das letzte History-Element, beliebig oft. Dokumentiert: **Überspringen** ist nicht rückgängig zu machen; nach „Option löschen“ nimmt Rückgängig das jüngste verbliebene Duell zurück.
- **Option löschen** entfernt alle History-Einträge mit ihr. **Umbenennen** behält Wertung und History und wird abgelehnt, wenn der Name leer ist oder (per `normalizeName`) schon existiert.
- **Wertungen zurücksetzen** setzt alle Optionen auf 1000 mit allen Zählern auf 0, leert `history` und setzt `stableShown=false`.
- **M** (Duelle einer Liste) = Σ `options[i].duels` / 2. Nicht `history.length` verwenden.
- **Gleiche Liste auf zwei Handys erkennen** (`findMatch`):
  1. `share.l === list.id`, `list.aliases.includes(share.l)` oder `share.a?.includes(list.id)` → `kind:'id'`.
  2. Sonst Jaccard-Überlappung der normalisierten Optionsnamen ≥ 0,6 → `kind:'name'` (Vorschlag). Bestätigt der Nutzer, wird `share.l` in `aliases` aufgenommen.
  3. Sonst `kind:'none'` → „Als neue Liste übernehmen“. Die neue Liste bekommt **dieselbe ID** `share.l` und Wertungen von 1000.
- **Beispielliste** nur bei leerem State: „Urlaubsziele“ mit Lissabon, Kopenhagen, Rom, Bergen, Dolomiten, Kreta, Edinburgh, Ostsee (ID fest `l_beispiel01`).

## 4. Öffentliche APIs
Die Signaturen sind fest, auch dort, wo der Inhalt noch OFFEN ist. Commit 0 enthält sie als Skelett.
### A) Logik (rein, DOM-frei, deterministisch bei injiziertem `rng`)
```js
// elo.js
export const START_RATING = 1000, K = 32;
/** @returns {number} */ export function expected(own, opp)           // 1/(1+10^((opp-own)/400))
/** @param {1|0.5|0} sA @returns {{ra:number, rb:number, da:number, db:number}} */
export function applyResult(ra, rb, sA, k = K)
/** @param {Option[]} options @returns {(Option & {rank:number, isNew:boolean})[]} */
export function rankOptions(options)
  // zuerst Optionen mit duels>0: rating absteigend, dann duels absteigend, dann name (localeCompare 'de');
  // danach Optionen mit duels==0 (isNew:true, Anzeige „neu“) nach name; rank = Position 1..n
// text.js
/** @returns {string} */ export function normalizeName(s)  // NFC, trim, Leerraum zusammenfassen, toLocaleLowerCase('de')
/** @returns {string[]} */ export function parseOptionLines(text)
  // pro Zeile; entfernt Aufzählungszeichen (-, *, •) immer; Nummern ("1.", "1)") nur, wenn mindestens
  // 2 nichtleere Zeilen so beginnen („1. FC Köln“ allein bleibt); trimmt, leere Zeilen weg,
  // dedupliziert über normalizeName, kürzt auf 120 Zeichen
// pairing.js
/** @param {Option[]} options @param {Duel[]} history
 *  @param {{last?:[string,string]|null, avoid?:[string,string][], rng?:()=>number}} [opts]
 *  @returns {[Option, Option] | null} */  // null bei weniger als 2 Optionen
export function pickPair(options, history, opts)
```
**pickPair – harte Regeln (Pflicht, unabhängig von F2):**
- `last` ist das zuletzt **gezeigte** Paar, ob entschieden oder übersprungen. Default ist das Paar des letzten History-Eintrags. Ab n ≥ 3 wird `last` (ungeordnet) **nie** zurückgegeben.
- Paare aus `avoid` (in dieser Sitzung übersprungen) gibt es nur, wenn kein anderes zulässiges Paar existiert.
- Bei n = 2 ist Wiederholung erlaubt. Seiten (links/rechts) werden zufällig vertauscht.
- Test: n = 3..6, je 1000 Ziehungen mit fortgeschriebener History, `last` kommt nie direkt wieder.

**Heuristik (Wahl von a und b innerhalb der zulässigen Paare): OFFEN F2, Entscheidung folgt in DECISIONS.md.** Gemeint ist die Kostenfunktion aus v1 oder der Top-Fokus aus elo-abbruch.md §4. Die Zusatzregel „dieselbe Option höchstens zweimal in Folge“ (Prüfung S6) wird mit F2 entschieden.
```js
// stability.js
/** @param {number} n Anzahl Optionen
 *  @returns {{prelimDuels:number, prelimMin:number, stableDuels:number, stableMin:number, targetDuels:number}} */
export function thresholds(n)
/** @param {{options:{duels:number}[]}} listLike   // List oder {options: partner.options}
 *  @returns {{duels:number, n:number, avg:number, minDuels:number, level:'start'|'vorlaeufig'|'stabil',
 *    ratio:number, remaining:number, hint:string}} */
export function progress(listLike)
```
**Fester Rahmen:** M = Σduels/2, avg = 2·M/n, minDuels = min(duels), `fehlt(m) = ceil(Σ max(0, m − duels_i) / 2)`.
- `level`: 'stabil', wenn M ≥ stableDuels und minDuels ≥ stableMin; sonst 'vorlaeufig', wenn M ≥ prelimDuels und minDuels ≥ prelimMin; sonst 'start'.
- `remaining`: bei 'start' `max(prelimDuels − M, fehlt(prelimMin))`, bei 'vorlaeufig' `max(stableDuels − M, fehlt(stableMin))`, bei 'stabil' 0. `ratio = min(1, M / targetDuels)`.

Hinweistexte: start „Noch ca. {remaining} Duelle bis zur ersten Rangliste“ · vorlaeufig „Rangliste vorläufig – noch ca. {remaining} Duelle bis zur stabilen Rangliste“ · stabil „Rangliste stabil ✓ Weitere Duelle machen sie noch genauer.“ · n < 2 „Füge mindestens zwei Optionen hinzu“.

**Inhalt von `thresholds(n)` (Konstanten, Formel für dStab usw.): OFFEN F1, Entscheidung folgt in DECISIONS.md.**
```js
// compare.js
/** @param {{name:string,rating:number,duels:number}[]} mine @param {{name:string,rating:number,duels:number}[]} theirs
 *  @returns {CompareResult} */ export function compareRankings(mine, theirs)
/** @param {number} m Größe der gemeinsamen Menge @returns {number} t = Anzahl „unterer“ Ränge */
export function excludedThreshold(m)
/** @typedef {{name:string, rankA:number, rankB:number, ratingA:number, ratingB:number, veto:boolean}} CmpItem
 *  @typedef {{common:number, favorites:CmpItem[], excluded:CmpItem[], talk:CmpItem[],
 *    onlyMine:string[], onlyTheirs:string[]}} CompareResult */
```
**Vergleichsregeln.**
- Abgleich über `normalizeName`. `name` ist der eigene Name, `common` = m.
- Die eigenen Wertungen werden vorher gerundet, weil der Partner ganze Zahlen liefert.
- Ränge werden **innerhalb der gemeinsamen Menge** als **Wettkampf-Ränge** auf gerundeten Wertungen berechnet (1, 2, 2, 4).
- `excluded`: Optionen mit `rankA > m − t` oder `rankB > m − t`, t = `excludedThreshold(m)`. Bei geteiltem Rang an der Grenze gilt die Regel wörtlich: Eine Gruppe, deren gemeinsamer Rang ≤ m − t ist, bleibt draußen, also gibt es keine Schein-Ausschlüsse bei Gleichstand. Sortierung nach min(rating) aufsteigend, dann Name.
- `favorites`: alle Optionen, die **nicht** in excluded sind (disjunkt), nach min(ratingA, ratingB) absteigend, dann max-Wertung, dann Name. Das Array enthält nur die ersten `min(5, ceil(m/3))`.
- `talk`: `|rankA − rankB| ≥ 2`, nach Differenz absteigend, dann min(rankA, rankB), dann Name, höchstens 5. talk und excluded **dürfen sich überschneiden**, solche Einträge haben `veto:true`. Die UI markiert sie („bei einer Person ganz unten“). Sonst gilt `veto:false`.
- `onlyMine`/`onlyTheirs`: Namen, nach Wertung absteigend.
- Folgen: Bei m = 2 ist talk immer leer. Sind sich die beiden bei m = 2 uneinig, sind beide Optionen ausgeschlossen und favorites ist leer.
- **Schwelle t = `excludedThreshold(m)` (≥ 1 für m ≥ 2): OFFEN F3, Entscheidung folgt in DECISIONS.md.**

### B) Daten
```js
// store.js
export const STORAGE_KEY = 'elo-duell:state';
/** @param {{storage?:Storage|null, now?:()=>number}} [deps] */ export function createStore(deps)
export const store;   // = createStore() mit Default-Storage, s. u.; der Import wirft in Node NICHT
// Methoden (mutieren intern, speichern synchron, benachrichtigen Abonnenten; geben frische Objekte zurück):
init(): {mode:'local'|'memory', warning:string|null}
getState(): AppState      // nur lesen, nicht mutieren
getList(id): List|undefined;   listLists(): List[]   // in der Reihenfolge von order
createList(name, names:string[], id?:string): List
renameList(id, name); deleteList(id); moveList(id, toIndex)
addOptions(id, names:string[]): number   // Duplikate (normalizeName) ignoriert; gibt Anzahl neu hinzugefügter zurück
renameOption(listId, optId, name): boolean   // false bei leerem Namen oder Duplikat
removeOption(listId, optId); resetRatings(listId)   // reset: s. §3
recordDuel(listId, aId, bId, s:1|0.5|0): Duel      // nutzt elo.applyResult
undoLastDuel(listId): Duel|null                    // die View zeigt das Paar erneut, Toast nennt das Paar
setStableShown(listId, value:boolean)
setDeviceName(name); getDevice(): Device
savePartner(listId, PartnerRanking): boolean       // false (nichts geändert), wenn ein neuerer sentAt gespeichert ist
removePartner(listId, deviceId)
findMatch(shareData:ShareData): {list:List|null, kind:'id'|'name'|'none', overlap:number}
addAlias(listId, foreignId)
replaceAll(state:AppState)   // Backup-Import: validiert; behält die aktuelle device.id (name aus Sicherung, wenn aktuell leer)
subscribe(fn:(state:AppState)=>void): ()=>void
status(): {mode:'local'|'memory', lastError:string|null}
onWarning(fn:(msg:string)=>void)                   // z. B. „Speicher voll – Änderungen gehen beim Schließen verloren“
// schema.js
export const SCHEMA = 1;  export function defaultState(): AppState  // mit Beispielliste
export function migrate(raw:any): AppState   // Kette v0→v1…; wirft SchemaError bei Unbrauchbarem
export function validateState(s:any): string[]   // Fehlerliste, leer = gültig
export class SchemaError extends Error {}
// backup.js
export function exportBackup(state): Blob   // {app:'elo-duell', kind:'backup', schema:1, exportedAt, state}
export function backupFileName(date=new Date()): string  // elo-duell-sicherung-JJJJ-MM-TT.json
export function downloadBackup(state): void  // Blob + <a download>
/** @returns {Promise<AppState>} */ export async function readBackupFile(file)  // parsen, migrieren, validieren; Fehler auf Deutsch
```
**Store-Regeln:**
- Default-Storage: `try { globalThis.localStorage ?? null } catch { null }`. Er wird erst in `init()` angefasst, nicht beim Import.
- SecurityError oder `null` → `mode:'memory'` mit Warnbanner.
- QuotaExceededError: Der RAM-Stand bleibt, dazu kommen eine Warnung und der Hinweis auf eine Sicherung.
- Kaputtes JSON → `elo-duell:defekt`, dann `defaultState()` mit Warnung.
- `navigator.storage.persist()` wird **nach dem ersten erfolgreichen Schreiben** angefordert, einmal pro Sitzung, ohne darauf zu warten.
- storage-Event: nur bei `e.key === STORAGE_KEY` neu laden („letzter Schreiber gewinnt“). Bei `e.key === null` (fremdes `clear()`) bleibt der RAM-Stand und wird neu geschrieben.

### C) Oberfläche
```js
// router.js
export function startRouter(routes:Route[], ctxBase): void
export function navigate(hash:string, opts?:{replace?:boolean}): void
export function openImport(payload:string): void     // setzt das Pending-Payload, navigiert nach #/import
export function getPendingImport(): string|null;  export function clearPendingImport(): void
/** @typedef {{pattern:string, view:View, parent?:(p:Record<string,string>)=>string}} Route   // pattern z. B. '#/liste/:id' */
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
export const MAX_PAYLOAD = 65536, MAX_INFLATED = 262144, MAX_OPTIONS = 500, MAX_NAME = 120;
/** @returns {Promise<string>} */ export async function encodeShare(data:ShareData)   // "1.z.<b64url>" bzw. "1.j.<b64url>"
/** @returns {Promise<ShareData>} */ export async function decodeShare(payload:string) // wirft ShareError{code}
export function buildShareUrl(payload, loc=location): string   // origin+pathname+"#i="+payload
export function extractPayload(textOrUrl:string): string|null  // akzeptiert URL, "#i=…" oder das nackte Payload
export function toShareData(list:List, device:Device, now:number): ShareData   // inkl. a = list.aliases
export function toPartnerRanking(d:ShareData, now:number): PartnerRanking      // sentAt = t*1000, receivedAt = now
export class ShareError extends Error { code:'format'|'version'|'zu-gross'|'beschaedigt' }
// qr.js
export const QR_MAX_URL = 1000, LINK_WARN_URL = 2000;
export function renderQr(text, container:HTMLElement, opts?:{ecc?:'L'}): {modules:number}
  // <canvas>, immer ECC L, schwarz auf weiß, Ruhezone 4 Module, kleinste Version automatisch
// scanner.js
export function canScan(): boolean   // getUserMedia vorhanden
/** @returns {Promise<string>} Rohtext */ export async function scanQr(video:HTMLVideoElement, {signal}:{signal:AbortSignal})
  // getUserMedia({video:{facingMode:{ideal:'environment'}}}); <video playsinline muted autoplay>.
  // BarcodeDetector(['qr_code']), falls vorhanden und getSupportedFormats() 'qr_code' enthält (try/catch),
  // sonst vendor/jsQR.js per <script> nachladen (window.jsQR), ~640 px breit, 5–10 Bilder/s. Bei signal.abort alle Tracks stoppen.
```

### E) PWA
```js
// pwa.js
export function initPwa(opts:{onUpdateReady:(apply:()=>void)=>void}): void
  // registriert ./sw.js (Scope ./); wartender SW (reg.waiting, updatefound) → onUpdateReady(apply).
  // apply(): erst JETZT 'controllerchange'-Listener registrieren (einmalig location.reload()),
  //          dann reg.waiting.postMessage({type:'SKIP_WAITING'}). Wegen clients.claim() nie vorher lauschen.
// version.js
export const VERSION = '1.0.0';   // muss gleich der VERSION in sw.js sein (Unit-Test)
```

## 5. Austauschformat v1
Fragment `#i=1.z.<base64url ohne Padding>`, Aufbau `<Version>.<Kodierung>.<Daten>`. **`#i=` ist verbindlich**, die Recherche-Beispiele `#r=`/`#d=` gelten nicht.
- `z`: UTF-8-JSON, komprimiert mit `CompressionStream('deflate-raw')`.
- `j`: unkomprimiertes JSON als Fallback ohne CompressionStream. Der Decoder kann beides.
```json
{ "v":1, "l":"l_ab12cd34ef", "n":"Urlaubsziele", "p":"Anna", "d":"d_x9y8z7w6v5", "t":1762290000,
  "o":[["Lissabon",1048,6],["Rom",1016,5]], "a":["l_qq11ww22ee"] }
```
- `t` steht in Sekunden. `o` ist nach Wertung absteigend sortiert, jeder Eintrag `[Name, Wertung gerundet, Duelle]`. `a` ist optional (höchstens 20 Einträge).
- Grenzen beim Dekodieren: Payload ≤ `MAX_PAYLOAD` Zeichen, **vor** dem Dekodieren geprüft. Beim Entpacken gestreamt zählen, über `MAX_INFLATED` → `reader.cancel()` und `ShareError('zu-gross')`. ≤ 500 Optionen, Namen ≤ 120 Zeichen, Zahlen endlich, unbekannte Felder ignorieren.
  - `v > 1` → `ShareError('version')` („Bitte App aktualisieren“). Ein `z`-Payload ohne DecompressionStream → `ShareError('version')` („Dieser Browser kann den Link nicht öffnen – bitte Chrome aktualisieren“).
- Base64url wird in Blöcken gebaut (`String.fromCharCode` je 32 KB), nicht per Spread über das ganze Array.
- Dasselbe Format dient zum **Teilen vor dem Duellieren**. Sind alle Duelle 0, legt der Import nur die Liste an, ohne Partner.
- **QR:** komplette URL im Byte-Modus, **immer ECC L**. QR nur bei URL ≤ `QR_MAX_URL` (1000 Zeichen ≈ v23 ≈ 70 Optionen). Darüber QR ausblenden: „Liste zu groß für QR – bitte Link senden“ (`share-too-big`). Ab `LINK_WARN_URL` (2000) zusätzlich „Sehr langer Link – manche Messenger kürzen ihn“.
- **Link:** `navigator.share({url})`, falls vorhanden (AbortError still ignorieren). Sonst `navigator.clipboard.writeText`, als letzter Fallback das readonly-Feld.

## 6. Routing
Hash-basiert. **Routen beginnen mit `#/`, Importdaten mit `#i=`.** Ein leerer Hash wird zu `#/` (replace).

| Hash | View (Datei) | Zurück zu |
|---|---|---|
| `#/` | home.js – Listenübersicht | – |
| `#/neu` · `#/liste/:id/bearbeiten` | list-edit.js | `#/` · `#/liste/:id` |
| `#/liste/:id` | list.js – Zentrale | `#/` |
| `#/duell/:id` · `#/rangliste/:id` | duel.js · ranking.js | `#/liste/:id` |
| `#/teilen/:id` | share.js (D) | `#/liste/:id` |
| `#/vergleich/:id/:partner` | compare.js (D) | `#/liste/:id` |
| `#/scan` · `#/import` | scan.js · import.js (D) | `#/` |
| `#/einstellungen` | settings.js (B) | `#/` |

- Beginnt der Hash beim Start oder bei `hashchange` mit `#i=`, schreibt der Router das Payload nach sessionStorage `elo-duell:import`. Danach `history.replaceState(null,'','#/import')` und Rendern. So bleiben die Daten nicht in der History.
- Unbekannte Route oder Listen-ID: Toast „Liste nicht gefunden“, dann `#/`. Die Zurück-Taste nutzt `parent`, nicht `history.back()`.
- Die View-Registry steht in Commit 0 fest in `app.js`, mit allen Views von B, C und D.

## 7. UI-Ablauf
- **Start** (`#/`): Listenkarten (Name, Optionsanzahl, Fortschrittsbalken). Unten große Buttons „Neue Liste“ und „QR scannen“. Zahnrad zu den Einstellungen.
- **Liste anlegen/bearbeiten:**
  - Name und Textfeld „Eine Option pro Zeile (Einfügen möglich)“. Im Bearbeiten-Modus heißt das Feld „Optionen hinzufügen (eine pro Zeile)“. Die Vorschau zeigt die erkannte Anzahl.
  - Beim Bearbeiten: Optionen umbenennen oder löschen (Bestätigung bei vorhandenen Duellen; Duplikat → Toast „Gibt es schon“), „Wertungen zurücksetzen“, „Liste löschen“ (rot, mit Bestätigung).
- **Liste (Zentrale):** Fortschritt mit `progress().hint`. Buttons „Duellieren“ (primär), „Rangliste“, „Teilen“ sowie „Vergleichen mit …“ je Partner, oder der Hinweis „Noch keine Rangliste empfangen – lass dir den QR-Code zeigen“.
- **Duell:**
  - Oben kompakt der Fortschrittsbalken und die Frage „Was gefällt dir besser?“.
  - Zwei große Karten untereinander, **je mindestens 35dvh**.
  - Am unteren Rand eine Reihe „Gleich gut“, „Überspringen“, „Rückgängig“ (ohne History deaktiviert), mit `padding-bottom: env(safe-area-inset-bottom)`.
  - Antippen speichert sofort und zeigt das nächste Paar (Effekt ≤ 150 ms). Rückgängig zeigt das Paar erneut, der Toast lautet „Rückgängig: Rom – Kreta“.
  - Bei weniger als 2 Optionen erscheint ein Leerzustand mit Link zum Bearbeiten (`duel-empty`).
  - Wird erstmals „stabil“ erreicht und ist `stableShown` false: Hinweis „Rangliste ist jetzt aussagekräftig“ mit „Rangliste ansehen“ / „Weiter duellieren“, dann `setStableShown(id,true)`.
  - Die Sitzung (letztes gezeigtes Paar, übersprungene Paare) lebt nur im Speicher der View.
- **Rangliste:** Platz, Name, Punkte, Duelle. Optionen mit 0 Duellen stehen am Ende mit Badge „neu“. Darüber der Stabilitätshinweis, darunter „Teilen“.
- **Teilen:**
  - Beim ersten Mal „Wie heißt du?“ (promptDialog → `setDeviceName`).
  - Angezeigt werden QR (bildschirmfüllend, sofern er passt), „Link senden“ und „Link kopieren“, außerdem „Auf dem anderen Handy: Elo-Duell → QR scannen, oder Link öffnen“.
  - Empfohlener Ablauf als Text: „1. Liste vorab teilen · 2. Beide duellieren · 3. Beide teilen ihre Rangliste“.
- **Scannen:** Kamerabild und „Abbrechen“. Darunter immer das Feld „Link einfügen“ mit „Übernehmen“. Bei einem Treffer `openImport()`.
- **Import:**
  - Fehler, wenn `share.d === getDevice().id`: „Das ist deine eigene Rangliste“ (`import-error`), kein Import.
  - Anzeige „Rangliste von Anna: Urlaubsziele (8 Optionen)“ und `findMatch`: `id` → „Übernehmen“; `name` → „Mit Liste X verknüpfen“ oder „Als neue Liste“; `none` → „Als neue Liste übernehmen“.
  - Bei `id`/`name` mit Optionen, die lokal fehlen: zusätzlich „3 neue Optionen von Anna übernehmen“ (`import-add-options`, `addOptions`).
  - **Danach:** Partner-Duelle Σ > 0 → `savePartner`; ist das eigene Level dann 'start': Toast „Rangliste von Anna gespeichert – duelliere jetzt selbst“ → `#/duell/:id`, sonst → `#/vergleich/:id/:deviceId`. Ohne Partner-Duelle: Toast „Liste übernommen“ → `#/liste/:id`.
- **Vergleich:**
  - Kopf: „Stand von Anna: <fmtDate(sentAt)>“ und „Partner entfernen“ (Bestätigung).
  - Drei Abschnitte „Gemeinsame Favoriten“, „Klare Ausschlüsse“, „Gesprächsstoff“. Gesprächsstoff zeigt „Platz 2 bei dir · Platz 7 bei Anna“. Gibt es onlyMine/onlyTheirs, lautet die Beschriftung „Platz 2 von 7 gemeinsamen“. veto-Einträge werden markiert.
  - Leertexte (`cmp-empty-<abschnitt>`): „Keine gemeinsamen Favoriten – jede Option liegt bei einem von euch weit unten.“ · „Keine klaren Ausschlüsse.“ · „Ihr seid euch weitgehend einig.“
  - Einklappbar „Nur bei dir / nur bei Anna“. Bei m < 2: Hinweis „Zu wenig gemeinsame Optionen für einen Vergleich“.
  - Ist das eigene Level oder das Partner-Level (`progress({options: partner.options})`) 'start': Hinweis mit CTA (`cmp-hint`). Eigenes Level: „Duelliere erst selbst“ → Duell. Partner-Level: „Anna hat noch kaum duelliert“.
  - Immer vorhanden: Button „Meine Rangliste an Anna zurückschicken“ → `#/teilen/:id`.
- **Einstellungen:** Name, „Sicherung exportieren“, „Sicherung importieren“ (ersetzt alles, mit Bestätigung, device.id bleibt), Speicherstatus, App-Version.

## 8. Gemeinsame Dateien und Konfliktvermeidung
- **index.html** ist ab Commit 0 komplett und gehört C: Shell `<header id="bar">` (Zurück, Titel), `<div id="banners">`, `<main id="app">`, `<div id="toast" aria-live="polite">`; `<link>` auf alle CSS-Dateien, Manifest und Icons; Viewport-Meta, `theme-color` hell/dunkel per `media`, `<script type="module" src="./js/app.js">`.
- **CSS:**
  - `base.css` (C) definiert `--bg --fg --muted --card --accent --accent-fg --danger --radius --tap:56px --gap` für hell und dunkel (`@media (prefers-color-scheme: dark)`) und `color-scheme: light dark`.
  - Hintergrund hell `#f7f7fb`, dunkel `#121218` (passend zu theme-color und Manifest), Akzent `#4f46e5`.
  - Klassen `.btn .btn-primary .btn-danger .btn-ghost .card .stack .row .bar .badge` und Safe-Area-Abstände.
  - View-CSS nutzt nur Variablen und Klassen mit View-Präfix (`.duel-* .rank-* .lists-* .share-* .scan-* .import-* .cmp-* .set-* .pwa-*`).
  - Tippflächen ≥ `var(--tap)`, Schrift ≥ 16 px.
- **sw.js gehört E.** `const PRECACHE = [` mit **genau einem String pro Zeile** (`'./js/app.js',`), abgeschlossen mit `];`.
- **Precache-Test** `tests/unit/precache.test.mjs` (E) arbeitet mit einer **Whitelist**: `./`, `index.html`, `manifest.webmanifest`, `css/**`, `js/**`, `icons/**`, `vendor/*.{mjs,js}` (damit auch das lazy geladene jsQR).
  - Die Menge der tatsächlichen Dateien muss gleich PRECACHE sein, sonst wird der Test rot und E zieht nach.
  - LICENSE-Dateien, vendor/package.json, sw.js, docs, tests, tools gehören nicht in PRECACHE.
- **package.json gehört E.** Andere melden ihre Skripte, statt sie selbst einzutragen.
- **Neue Dateien** gibt es nur nach Absprache mit dem Koordinator, sonst laufen Precache und Registry auseinander.

## 9. PWA und Offline
- **Manifest:** `id`/`start_url`/`scope` = `"./"`, `name` und `short_name` „Elo-Duell“, `display:"standalone"`, `lang:"de"`, `theme_color` und `background_color` `#f7f7fb`. Icons: PNG 192 und 512 (`any`), 512 `maskable` (Motiv in den inneren 80 %), dazu das SVG. Erzeugt mit `node tools/make-icons.mjs` (Playwright-Screenshot), eingecheckt.
- **sw.js:**
  - `install`: `caches.open('elo-duell-'+VERSION)`, `addAll(PRECACHE.map(u => new Request(u,{cache:'reload'})))`.
  - `activate`: löscht nur Caches mit Präfix `elo-duell-` außer dem aktuellen, dann `clients.claim()`.
  - `fetch`: nur GET und Same-Origin. Navigation → `index.html` aus dem Cache (Fragment bleibt erhalten). Sonst cache-first (`ignoreSearch`) mit Netz-Fallback.
  - `message`: `e.data?.type === 'SKIP_WAITING'` → `skipWaiting()`. Nie automatisch.
- **Update-Banner** (E, `ui.setBanner('update', …)`): „Neue Version verfügbar“ mit „Neu laden“ → `apply()`.
- Kamera und SW brauchen HTTPS oder localhost, Pages erfüllt das. Ein Link aus dem Messenger öffnet sich in Chrome. Chrome und die installierte App teilen den Origin-Speicher.

## 10. Tests
- **Unit:** `npm run test:unit` = `node --test "tests/unit/*.test.mjs"` (Glob in Anführungszeichen; Node 22 hat CompressionStream und deflate-raw global).
  - **smoke** (E): importiert alle Module aus js/logic, js/data, js/share, js/types.js, js/version.js. Darf nicht werfen.
  - **A:** Elo (1000 gegen 1000: Sieg → 1016/984, Remis → keine Änderung) · rankOptions inkl. isNew · parseOptionLines („1. FC Köln“) · pickPair-Regeln aus §4A mit festem rng · progress (Rahmen, Werte nach F1) · compareRankings (Gleichstände, Disjunktheit, veto, m = 2).
  - **B:** Store mit Fake-Storage: Quota, Storage null, defektes JSON, storage-Event (key-Filter, `null`), Undo-Kette, Option löschen mit History, resetRatings, renameOption-Duplikat, replaceAll behält device.id, Migration, Backup-Roundtrip.
  - **D:** Codec-Roundtrip mit Umlauten und Emoji, `z` und `j`, alle Grenzen, ShareError-Codes, extractPayload, `a`.
  - **E:** precache (Whitelist), VERSION-Gleichheit von js/version.js und sw.js.
- **E2E:** `npm run test:e2e` (= `playwright test`). devDependency `playwright@1.63.0`, Import aus `'playwright/test'`. Chromium liegt unter `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH`, sonst `executablePath` in der Config), **kein `playwright install`**.
  - `devices['Pixel 7']`, baseURL `http://localhost:4173/elo-duell/`. In Tests immer relativ navigieren (`page.goto('./#/neu')`), nie mit führendem `/`.
  - `tools/serve.mjs`: statischer Server ohne Abhängigkeiten, Port 4173 (`PORT`), Repo unter `/elo-duell/`; MIME `.js`/`.mjs` → `text/javascript`, `.webmanifest` → `application/manifest+json`; `301 /elo-duell → /elo-duell/`; `Cache-Control: no-cache`.
  - `helpers.mjs` (E), feste Signaturen: `resetApp(page)` · `createList(page, name, options:string[]) → Promise<listId>` · `playDuels(page, count, choose:(a,b)=>'a'|'b'|'draw')` · `decodeQr(page) → Promise<string|null>` (Canvas in `share-qr` → RGBA → jsQR in Node).
  - **Abnahme-Szenario (`abnahme.spec.mjs`, Prüfung M9):**
    - A legt die Liste per Einfügen an, spielt 30 Duelle (nicht 20) mit Undo und prüft die Rangliste (Punkte und Duelle).
    - A prüft den QR-Inhalt (Canvas mit jsQR in Node dekodieren, muss `share-url` ergeben) und teilt den Link.
    - B importiert, duelliert mit eigener, gegenläufiger Regel und vergleicht. Die erwarteten favorites/excluded/talk werden exakt geprüft.
    - Danach wird der Rückweg B→A getestet.
    - (Umsetzung: zwei Browser-Kontexte. Die Erwartungswerte berechnet der Test mit `compareRankings` aus den beiden angezeigten Ranglisten. Geprüft werden die Inhalte von `cmp-<abschnitt>-item-<i>`.)
  - **Weitere Szenarien:** Liste per Einfügen anlegen · Reload behält die Daten · Sicherung exportieren und importieren · eigenes Payload wird abgewiesen · Dunkelmodus (`colorScheme:'dark'`, Screenshot).
  - **Offline:** SW bereit → `context.setOffline(true)` → **neuer Tab** mit `./#i=<payload>` → Status 200, Import-View erscheint, App funktioniert.
  - Kamera-Scan wird nicht per E2E getestet, wohl aber das Feld „Link einfügen“.
  - **Installierbarkeit (install.spec, E):** `chromium.launchPersistentContext` (nicht `newContext`, sonst `in-incognito`). Über CDP `Page.getInstallabilityErrors` → `[]` und `Page.getAppManifest` → `errors: []`. Außerdem `navigator.serviceWorker.controller` gesetzt.
- **Lighthouse 11** (Koordinator/E, ergänzend), in einem Scratch-Verzeichnis: `npm i lighthouse@11`, dann
  `CHROME_PATH=/opt/pw-browsers/chromium npx --no-install lighthouse http://localhost:4173/elo-duell/ --only-categories=pwa --chrome-flags="--headless=new --no-sandbox" --output=json --output-path=lh.json --quiet`. Ziel: `categories.pwa.score === 1`.
- **data-testid** im Schema `<bereich>-<element>[-<zusatz>]`, kebab-case. Verbindlich:
  - `app-back`, `app-title`, `toast`, `banner-<id>`, `dialog-ok`, `dialog-cancel`, `dialog-input`
  - `home-new`, `home-scan`, `home-settings`, `home-list-<listId>`
  - `edit-name`, `edit-options`, `edit-count`, `edit-save`, `edit-delete-list`, `edit-reset`, `edit-opt-<optId>`, `edit-opt-rename-<optId>`, `edit-opt-remove-<optId>`
  - `list-duel`, `list-ranking`, `list-share`, `list-progress`, `list-compare-<deviceId>`
  - `duel-a`, `duel-b`, `duel-draw`, `duel-skip`, `duel-undo`, `duel-progress` (Attribut `data-duels` = aktuelles M), `duel-stable`, `duel-empty`
  - `rank-row-<rang>` mit Kindern `rank-name`, `rank-rating`, `rank-duels`, `rank-new`; außerdem `rank-hint`
  - `share-qr` (Container, darin `<canvas>`), `share-send`, `share-copy`, `share-url` (readonly-Feld), `share-too-big`
  - `scan-video`, `scan-paste`, `scan-paste-ok`, `scan-error`
  - `import-summary`, `import-accept`, `import-link-<listId>`, `import-new`, `import-add-options`, `import-error`
  - `cmp-favorites`, `cmp-excluded`, `cmp-talk`, `cmp-only-mine`, `cmp-only-theirs`
  - `cmp-<abschnitt>-item-<i>` mit Abschnitt ∈ favorites, excluded, talk und i ab 0
  - `cmp-hint`, `cmp-share-back`, `cmp-partner-date`, `cmp-remove-partner`, `cmp-empty-<abschnitt>`
  - `set-name`, `set-export`, `set-import`, `set-storage`, `set-version`

## 11. Reihenfolge, Commit 0 und Git
- **Commit 0** (Koordinator) enthält Skelette **aller** Dateien aus §2.
  - JS-Module mit den exakten Exporten aus §4. Rümpfe werfen `new Error('TODO')` oder liefern harmlose Platzhalter.
  - Views als `export default {title, render(root){ root.textContent = 'In Arbeit'; }}`.
  - index.html und app.js komplett, CSS leer mit Eigentümer-Kopf, Manifest, Icons, vendor, sw.js lauffähig, serve.mjs, Config, helpers, Rauchtest.
  - Wer ein Skelett ersetzt, behält alle Exporte. Die App lädt in jedem Zwischenstand ohne Modulfehler.
- **Git-Regel:** Entwickler-Agenten committen nicht und ändern nur eigene Dateien (§2). Der Koordinator committet und integriert.
- Alle fünf beginnen sofort gegen die Skelette. Eigene Test-Stubs bleiben in den eigenen Testdateien.
- **A** liefert `elo.js` und `text.js` zuerst (B braucht sie). **C** liefert `ui.js` und `router.js` vor den Views (B und D nutzen sie).
- Integration: erst `npm run test:unit`, dann `npm run test:e2e`.

## 12. Risiken und Gegenmaßnahmen
- **Dichter QR bei großen Listen:** ECC L, QR nur bis 1000 Zeichen URL, sonst Link.
- **BarcodeDetector fehlt oder ist kaputt** (ohne Play Services): try/catch, jsQR-Fallback, Einfügefeld.
- **CompressionStream deflate-raw** erst ab Chrome 103: Fallback `j`.
- **Eviction/privater Modus:** `persist()`, Speicherstatus, Erinnerung an die Sicherung.
- **Geteilter Origin** `user-2268431.github.io`: Präfix für Schlüssel und Caches, gefiltertes storage-Event.
- **Precache-Drift:** Whitelist-Test (§8). **Veralteter SW:** VERSION in sw.js und version.js erhöhen (Checkliste), Update-Banner.
- **Messenger kürzen lange Links:** QR als Hauptweg, Warnung ab 2000 Zeichen.
- **In-App-WebViews** (Telegram, Instagram u. a.) haben eigenen Speicher, ein Import landet dort nicht in Chrome. Erkennung über den UA (`; wv)`, `Instagram`, `FBAN`, `Telegram`): Banner „Bitte in Chrome öffnen“ (`banner-webview`, C in app.js).
- **Schreibvarianten:** `normalizeName`. Was danach nicht passt, erscheint unter „nur bei …“.
