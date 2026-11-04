# Code-Review Elo-Duell (unabhängig, 04.11.2026)

Grundlage: ARCHITEKTUR.md v1.1, DECISIONS.md. Stand der Tests: `npm run test:unit` 144/144 grün, `npx playwright test` 26/26 grün.
Ohne Befund geprüft: Elo-Formel (1000, K=32, E, Δ = −Δ), Undo-Kette, harte Sperre gegen direkte Wiederholung (2000 Ziehungen, 0 Verstöße),
Vergleichsregeln (Favoriten nach min(Wertung), Schwelle max(1,⌊m/5⌋), Wettkampf-Ränge, talk nach Platzdifferenz), XSS über Optionsnamen,
Listen- und Personennamen (alles über Textknoten; per Playwright mit `<img onerror>`/`<svg onload>` im #i=-Link geprüft, nichts ausgeführt),
Zip-Bombe (gestreamt, Abbruch bei 256 KB), Fragment statt Query-String, Präfixe `elo-duell:`/`elo-duell-`, Precache inkl. jsQR,
Offline-Navigation mit Fragment, keine externen Laufzeit-Abhängigkeiten, keine Ablaufdaten.

## KRITISCH

**K1 – Ein manipulierter Link löscht beim nächsten Start alle Listen** (bestätigt: ja, Node und Playwright)
- Stellen: js/share/codec.js:116 (`t` nur auf „endlich“ geprüft), codec.js:217 (`sentAt = d.t * 1000`), js/data/store.js:414 (`Number(sentAt) || 0` lässt Infinity durch), js/data/schema.js:193 (`isNum(pr.sentAt)`), store.js:212–222.
- Problem: `t = 1e306` ist endlich, `t*1000` ergibt Infinity. `JSON.stringify` schreibt daraus `null`. Beim nächsten Laden scheitert `validateState` („Partner ungültig“), und der ganze State wird verworfen.
- Szenario: Jemand schickt per Messenger einen `#i=`-Link mit `"t":1e306` (dasselbe gilt für `-1e306`). Das Opfer tippt „Als neue Liste übernehmen“ und schließt die App. Beim nächsten Start steht nur noch die Beispielliste da, mit dem Banner „Gespeicherte Daten waren beschädigt …“. Dabei geht auch eine neue Geräte-ID verloren, die Partner ordnen das Gerät danach nicht mehr zu. Im Test: Listen vorher `[l_beispiel01, l_xss0000001]`, nachher `[l_beispiel01]`.
- Behebung: Im Codec `t` auf einen plausiblen Bereich begrenzen (z. B. 0 ≤ t ≤ jetzt + 1 Tag, sonst `format`). Wertungen auf |r| ≤ 1e5 und Duelle auf ≤ 1e6 als Ganzzahl begrenzen. In `savePartner` nur `Number.isFinite` akzeptieren. Unit-Test für „riesige Zahlen“ ergänzen.

## HOCH

**H1 – Für beiseitegelegte Daten gibt es keinen Weg zurück, und ein einziger Fehler verwirft alles** (bestätigt: ja, Code und Lauf zu K1)
- Stellen: js/data/schema.js:133–138 (alles oder nichts), store.js:215–219, js/views/settings.js (keine Wiederherstellung).
- Problem: `migrate` lehnt den gesamten State ab, sobald irgendein Teil ungültig ist, etwa ein Partner-Eintrag oder ein Duell. Der Rohinhalt landet nur in `elo-duell:defekt`. Ohne Entwicklerwerkzeuge kommt die Nutzerin nicht an ihn heran, und ein zweiter Defekt überschreibt ihn.
- Szenario: wie K1, oder ein künftiger Bug schreibt einmal einen ungültigen Wert. Das ist bei Dauerbetrieb ohne Pflege besonders gefährlich.
- Behebung: In `normalize` reparieren statt verwerfen, also ungültige Partner, Duelle und Optionen einzeln entfernen und warnen. Die Geräte-ID nach Möglichkeit aus dem Rohinhalt retten. In den Einstellungen „Beschädigte Daten herunterladen“ anbieten; `readBackupFile` akzeptiert nackte States bereits.

## MITTEL

**M1 – Doppeltippen auf eine Duellkarte wertet zwei Duelle** (bestätigt: ja, Playwright-`dblclick` ergibt `data-duels = 2`)
- Stelle: js/views/duel.js:117–126 (keine Sperre); in css/duel.css verhindert `touch-action: manipulation` den Doppeltipp-Zoom, beide Taps kommen als Klick an.
- Szenario: Ein reflexartiger zweiter Tipp innerhalb von etwa 150 ms entscheidet das nächste Paar, das noch gar nicht zu sehen war (Animation mit Deckkraft 0,35). Das verfälscht die Rangliste unbemerkt.
- Behebung: Eingaben nach `decide`/`undo` etwa 250–300 ms lang ignorieren (Zeitstempel oder `pointer-events:none` während `duel-in`).

**M2 – Kontrast unter WCAG AA (4,5:1) bei Fließtextgröße** (bestätigt: ja, berechnet)
- Stellen: css/base.css:43 mit :152, dunkel: weiße Schrift auf `--danger #e5484d` hat 3,91:1. Das betrifft alle roten Dialog-Buttons „Löschen/Zurücksetzen/Entfernen/Ersetzen“ (17 px, 600).
- css/compare.css:22–27 `.cmp-veto`: dunkel 3,26:1, hell 4,12:1 (14 px). css/lists.css:19 `.lists-badge-ok`: hell 4,34:1 (13 px).
- Ebenfalls dunkel: `--danger` als Schrift auf `--card` hat 4,27:1 (`.set-error`, `.lists-count-warn`).
- Behebung: im Dunkelmodus `--danger` als Fläche ≈ `#c9353b` oder dunkle Schrift darauf. Für Schrift eine eigene `--danger-text`-Variable (dunkel ≈ `#ff8a8f`, hell ≈ `#a51f25`). `--ok` hell für Badges etwas dunkler.

## NIEDRIG

**N1 – Route mit Prototyp-Namen bringt den Router zum Absturz** (bestätigt: ja)
- Stellen: js/router.js:68, js/data/store.js:240/115 (`state.lists[id]` ohne `Object.hasOwn`).
- Szenario: `#/liste/toString` wirft einen DataCloneError außerhalb von try/catch, die alte Ansicht bleibt stehen. `#/liste/__proto__` zeigt „Diese Ansicht konnte nicht geladen werden“.
- Behebung: `Object.hasOwn(state.lists, id)` in `getList`/`mustList`/`createList`.

**N2 – Ein Stand aus der Zukunft blockiert echte Updates eines Partners, und der Toast stimmt dann nicht** (bestätigt: nein, aus dem Code)
- Stellen: store.js:418, js/views/import.js:100–101.
- Szenario: Ein Link mit fremder `d` (steht in jedem geteilten Link) und `t` im Jahr 2100 führt dazu, dass jede echte Rangliste dieses Partners mit „neuerer Stand“ abgewiesen wird. Im Zweig `own === 'start'` meldet der Toast trotzdem „gespeichert“, obwohl `saved === false`.
- Behebung: Grenze für `t` wie in K1; den Toast von `saved` abhängig machen.

**N3 – Lange Listen werden beim Teilen stillschweigend gekürzt oder ergeben einen Link, den niemand öffnen kann** (bestätigt: nein, aus dem Code)
- Stellen: js/share/codec.js:205 (`slice(0, 500)`), js/views/share.js:222 (keine Prüfung gegen `MAX_PAYLOAD`), js/views/list-edit.js (keine Obergrenze).
- Szenario: Bei mehr als 500 Optionen fehlen beim Partner die schwächsten, ohne Hinweis. Lange Emoji-Namen können über 64 KB Payload kommen, dann erscheint beim Empfänger „zu groß“.
- Behebung: Beim Teilen warnen, wenn gekürzt wurde oder `payload.length > MAX_PAYLOAD`. Optional beim Anlegen bei 500 begrenzen.

**N4 – Ein halbes Surrogatpaar im Optionsnamen** (bestätigt: ja)
- Stelle: js/data/store.js:32 (`slice(0, 120)` in UTF-16-Einheiten). `parseOptionLines` kürzt dagegen nach Codepoints.
- Szenario: 119 × „a“ + „😀“ ergibt einen Namen, der auf `\uD83D` endet. Beim Teilen wird daraus „�“, und der Name passt beim Partner nicht mehr (landet unter „nur bei …“).
- Behebung: in `cleanName` nach Codepoints kürzen (wie in `truncate` in text.js) oder ein hängendes High-Surrogate abschneiden.

**N5 – Tippflächen unter 56 px** (bestätigt: ja, CSS)
- Stellen: css/base.css:222 (`.banner-action` 48 px, betrifft „Neu laden“ im Update-Banner) und :242 (`.toast-action` 48 px). Der Inline-Link „Optionen hinzufügen“ in js/views/list.js:306 ist reine Textgröße.
- Behebung: `min-height: var(--tap)`; den Link als `.btn` ausführen.

**N6 – Testlücken gegenüber §10** (bestätigt: ja)
- Es fehlen `tests/e2e/abnahme.spec.mjs` (M9) und der Dunkelmodus-Test (`colorScheme:'dark'`).
- Es gibt keinen Codec-Test für riesige, aber endliche Zahlen (siehe K1).
