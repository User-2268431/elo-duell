# QR-/Link-Austausch – Recherche (Stand 2026-11-04)

## 1. QR-Erzeugung (offline, vendorbar)
| Bibliothek | Lizenz | Größe (roh / min / min+gz) | Ausgabe | Bemerkung |
|---|---|---|---|---|
| **qrcode-generator 2.0.4** (Kazuhiko Arase) | MIT | 57 KB / 20 KB / 7 KB | `createSvgTag()`, `createDataURL()` (GIF), `renderTo2dContext()`, `isDark(r,c)` | eine Datei, UMD (`qrcode.js`) + ESM (`qrcode.mjs`); Version 0 = automatisch |
| nayuki-qr-code-generator 1.8.0 | MIT | 45 KB / 12 KB / 4 KB | nur Modulmatrix (`getModule`), SVG/Canvas selbst zeichnen | sehr sauber, ESM; etwas mehr Eigenarbeit |
| qrcodejs 1.0.0 (davidshimjs) | MIT | 34 KB / 20 KB | DOM (Canvas/Table) | seit 2015 unverändert, kein reines SVG-API – nicht empfohlen |

Alle drei laufen ohne CDN. Wahl: **qrcode-generator** (SVG direkt, ausgereift). Hinweis: Default-`stringToBytes` schneidet auf 8 Bit ab – unkritisch, weil wir nur ASCII (URL + base64url) einspeisen.

## 2. QR-Scan
- **BarcodeDetector** (`new BarcodeDetector({formats:['qr_code']})`): Chrome/Edge Android (seit Chrome 83, nutzt Google-Play-Dienste), ChromeOS, macOS. **Nicht** in Firefox, Safari/iOS, Chrome Desktop Windows/Linux. Vor Nutzung `BarcodeDetector.getSupportedFormats()` prüfen (kann auf Geräten ohne Play-Dienste leer sein). `detect(video)` direkt auf `<video>` aufrufen.
- **Fallback jsQR 1.4.0**: Apache-2.0, 257 KB roh, **130 KB min (45 KB gz)**, reines JS, UMD → `window.jsQR(rgba, w, h)`. Frames per Canvas `getImageData` holen, ca. 5–10×/s, Bild auf ~640 px Breite skalieren. Seit 2020 kein Release, aber stabil.
- zxing-wasm 3.1.6 (MIT): stärker (auch verzerrte/kleine Codes), aber Reader-WASM **947 KB** + JS-Loader; Offline nur mit selbst gehosteter .wasm und `locateFile`-Konfiguration. Nur falls jsQR in der Praxis zu schwach.
- **getUserMedia**: nur Secure Context (HTTPS oder localhost, nicht `file://`), Berechtigungsdialog (in installierter PWA dauerhaft), `{video:{facingMode:{ideal:'environment'}}}` (ideal statt exact, sonst Fehler auf Geräten ohne Rückkamera), `<video playsinline muted autoplay>`, Stream beim Schließen per `track.stop()` beenden. Lazy-load: jsQR erst laden, wenn kein BarcodeDetector da ist.
- **Wichtig**: Wenn der QR die **komplette URL** (`https://…/#r=…`) enthält, kann B auch mit der normalen Kamera-App scannen → öffnet die PWA/den Link. Der In-App-Scanner ist dann Komfort, kein Muss.

## 3. Kapazität & Datenformat
QR-Byte-Kapazität (Bytes): v10 L271/M213 · v15 L520/M412 · v20 L858/M666 · v25 L1273/M997 · v30 L1732/M1370.
Display→Kamera ist bis **ca. v20–25 (97–117 Module)** zuverlässig, wenn QR bildschirmfüllend, weiß auf schwarz, Helligkeit hoch, Ruhezone ≥ 4 Module. Darüber wird’s fummelig.

Format-Vorschlag (Zeilen, tab-getrennt, dann `CompressionStream('deflate-raw')` → base64url):
```
1                      ← Formatversion
Urlaubsziele 2027      ← Listenname
Anna                   ← Person
Lissabon\t1534\t12      ← Name \t Elo (gerundet, ganzzahlig) \t Duelle
…
```
Tab/Zeilenumbruch in Namen beim Export durch Leerzeichen ersetzen. Zeilenformat ist ~20 % kleiner als JSON-Arrays, nach deflate ~10 % kleiner. Optional später: Listen-ID/Hash, damit B erkennt „gleiche Liste“.

Gemessen (echte, verschiedene Reiseziele; URL-Präfix 39 Zeichen):
| Optionen | roh | deflate | base64url | ganze URL | QR M | QR L |
|---|---|---|---|---|---|---|
| 10 | 184 | 149 | 199 | 238 | v11 | v10 |
| 20 | 337 | 252 | 336 | 375 | v15 | v13 |
| **30** | 491 | 349 | 466 | **505** | **v18** | v15 |
| 50 | 800 | 525 | 700 | 739 | v22 | v19 |
| 75 | 1203 | 762 | 1016 | 1055 | v26 | v23 |
| 100 | 1621 | 1017 | 1356 | 1395 | v31 | v27 |
Faustregel: ~10 Bytes deflate bzw. ~14 Zeichen base64url pro Option. Ohne Namen (nur Elo+Duelle per Index, 100 Optionen): 427 Zeichen (deflate) bzw. 400 (3 Byte binär/Option).

**Empfehlung Grenze**: Fehlerkorrektur **L** (Display ist sauber, M kostet ~3 Versionen), automatisch kleinste Version; **QR nur bis ~1000 Zeichen URL (≈ v23 L, ≈ 70 Optionen)**. Darüber: QR ausblenden, Hinweis „Liste zu groß für QR – Link teilen“, nur Link/Teilen anbieten. Index-Modus (ohne Namen) nicht im MVP: setzt voraus, dass B exakt dieselbe Liste in derselben Reihenfolge hat – fehleranfällig; höchstens später mit Listen-Hash als Absicherung. (Mehrteilige QR-Folgen: zu aufwendig.)

## 4. URL-Fragment, Teilen, Zwischenablage
- Fragment wird nie an einen Server geschickt (gut: Datenschutz, kein Server nötig). Chrome akzeptiert URLs bis 2 MB; praktisch ist die Grenze der Messenger.
- WhatsApp: Nachrichten bis ~65 000 Zeichen, lange Links bleiben klickbar (Vorschau evtl. nicht). Signal: Text > 2048 Bytes wird als „Langtext“-Anhang verschickt/gekürzt angezeigt → **Link ≤ ~2000 Zeichen halten** (≈ 140 Optionen), sonst Warnung.
- `navigator.share({title, text, url})`: Chrome Android ja, Secure Context + Nutzergeste nötig; `AbortError` (Nutzer bricht ab) still ignorieren. Fallback: `navigator.clipboard.writeText(url)` (auch Secure Context + Geste), letzter Fallback: Textfeld zum manuellen Kopieren.
- Beim Öffnen: `location.hash` lesen, Import bestätigen lassen, danach `history.replaceState(null,'',location.pathname)` – Fragment entfernen, damit Reload nicht erneut importiert. Base64url im Browser: `btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')`.

## 5. Vendor-Kandidaten & Rundlauf-Test
Abgelegt in `/home/user/elo-duell/vendor-candidates/`:
- `qrcode-generator/` qrcode.js, qrcode.mjs (npm 2.0.4) + LICENSE (MIT, aus GitHub-Repo, da nicht im npm-Paket)
- `jsqr/` jsQR.js (npm 1.4.0), jsQR.min.js (lokal mit terser minifiziert) + LICENSE (Apache-2.0)
- `roundtrip-test.js` – Node-22-Test: Liste → deflate-raw → base64url → URL → qrcode-generator → selbst gerendertes RGBA-Pixelbild → jsQR → Vergleich.

Ergebnis: **alle Größen (10–100 Optionen, v10–v31) erfolgreich zurückgelesen**, sowohl sauber (4 px/Modul) als auch mit 3 px/Modul, reduziertem Kontrast und Pixelrauschen (je 10/10). `createSvgTag()` liefert gültiges SVG. Echter Kamera-Test auf Geräten steht noch aus.

## Empfehlung
1. Erzeugung: **qrcode-generator** (MIT, 20 KB min) vendoren, SVG ausgeben, EC-Level L, QR-Inhalt = vollständiger Link.
2. Scan: **BarcodeDetector zuerst**, sonst **jsQR (min, lazy geladen)**; zxing-wasm nur bei Praxisproblemen.
3. Format: Zeilenformat v1 mit Namen, deflate-raw + base64url im Fragment `#r=`.
4. Grenzen: QR bis ~1000 Zeichen URL (~70 Optionen), Link bis ~2000 Zeichen; darüber nur Link mit Hinweis.
5. Teilen: `navigator.share` → Clipboard → manuelles Kopieren.
