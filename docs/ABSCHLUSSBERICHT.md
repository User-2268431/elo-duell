# Abschlussbericht Elo-Duell (Version 1.0.1)

Stand: 04.11.2026, ca. 23:55 MEZ

## Links
- App: https://user-2268431.github.io/elo-duell/
- Repo: https://github.com/User-2268431/elo-duell
- Entscheidungen: DECISIONS.md (Anfangsrunde und zwei Abstimmungsrunden mit je drei unabhängigen Stimmen)

## Was funktioniert (alles getestet)
- Listen anlegen, bearbeiten, löschen; Optionen per Eingabe oder Einfügen (eine pro Zeile), mindestens 2 Optionen.
- Duell mit „Gleich gut“, „Überspringen“, „Rückgängig“ (beliebig oft), Schutz gegen Doppeltipp.
- Elo exakt nach Vorgabe (Start 1000, K = 32), Paarbildung „Top-Fokus“ ohne direkte Wiederholung.
- Fortschritt mit Stufen „vorläufig“ und „stabil“ (Regel aus Simulation, siehe unten).
- Rangliste mit Punkten und Duellanzahl.
- Austausch per QR-Code (Kamera-Scan in der App) und per Link (Daten im URL-Fragment), Import auf dem zweiten Handy, Rückweg.
- Vergleich: Gemeinsame Favoriten (nach niedrigerer Wertung), Klare Ausschlüsse, Gesprächsstoff.
- Sicherung aller Daten als Datei (Export/Import), tolerantes Laden bei beschädigten Daten.
- PWA: installierbar, vollständig offline nach erstem Aufruf, Update-Hinweis bei neuer Version, Hell/Dunkel automatisch.

## Prüfergebnisse
- 157 Unit-Tests grün; 28 Ende-zu-Ende-Tests (Pixel-7-Emulation) grün in drei Läufen hintereinander.
- Abnahme-Durchlauf als Test: Liste anlegen, 30 Duelle, Rangliste, QR/Link, Import im zweiten Profil, Vergleich nachgerechnet, Rückweg, offline neu laden.
- Lighthouse 11 PWA-Score 1, lokal und gegen die Live-Adresse.
- Live-Prüfung auf GitHub Pages: HTTPS 200, alle 44 Dateien des Offline-Speichers erreichbar, installierbar ohne Fehler, Flugmodus-Szenario bestanden.
- Unabhängiges Code-Review (docs/reviews/code-review.md): 1 kritischer, 1 hoher, 2 mittlere, 6 niedrige Befunde; alle behoben, einer (N5) teilweise.

## Bewusst anders als vorgegeben oder weggelassen
- Richtwert 2,5 bis 3 Duelle pro Option: Die Simulation zeigt, dass das nur für eine vorläufige Rangliste reicht. Umgesetzt (Abstimmung 3:0): „vorläufig“ ab Ø 3 Duellen je Option, „stabil“ ab Ø 4 (bis 10 Optionen), 5 (bis 30) bzw. 6 (darüber).
- Keine Sortierung von Listen per Hand; die Übersicht sortiert nach letzter Änderung (Abstimmung 3:0).
- Lighthouse ab Version 12 hat keine PWA-Kategorie mehr; geprüft wurde mit Lighthouse 11 plus eigenen Playwright-Prüfungen.

## Bekannte Einschränkungen
- Kein Test auf einem echten Android-Gerät; nur Chromium-Emulation. Kamera-Scan wurde mit simulierter Kamera getestet.
- Links, die in einem In-App-Browser (z. B. Instagram, Telegram) geöffnet werden, landen in dessen eigenem Speicher; die App zeigt dann einen Hinweis „In Chrome öffnen“.
- QR-Code nur bis ca. 70 Optionen (ca. 1000 Zeichen); darüber nur Link.
- Daten liegen nur im Browser: Chrome-Daten löschen oder App deinstallieren löscht die Listen. Regelmäßig sichern.
- N5 teilweise: ein Textlink in der Listenansicht ist kleiner als 56 px.
- Der Hilfszweig `wip` auf GitHub ließ sich aus der Session nicht löschen; er kann gefahrlos entfernt werden.
