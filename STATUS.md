# STATUS

Stand: 2026-11-04 23:55 MEZ (abgeschlossen)

## Rahmen
- Deadline: Do 05.11.2026 08:30 MEZ (Feature-Freeze 07:00, Endprüfung 08:00, Minimalversion 03:00)
- Antworten Anfangsrunde: GitHub Pages, Repo „elo-duell“ (öffentlich), Austausch per QR und Link, Optik automatisch, nur kleine Beispielliste.

## Offene Hindernisse
- (erledigt 22:45) Repo angelegt, Pages aktiv (main, /), HTTPS erzwungen, Claude-App hat Zugriff. Hinweise: alle Pfade relativ, leere .nojekyll.

## Phasen
- [x] 1 Recherche (docs/research/)
- [x] 2 Architektur v1.1 (docs/ARCHITEKTUR.md), Prüfungen in docs/reviews/, Abstimmung Runde 1 in DECISIONS.md
- [x] Commit 0: Grundgerüst aller Dateien
- [x] 3 Umsetzung A–E fertig (ca. 23:30), Abstimmung Runde 2 + Änderungen F5/F10 umgesetzt
- [x] Minimalversion live auf https://user-2268431.github.io/elo-duell/ (ca. 23:30)
- [x] 4 Tests: 157 Unit, 28 E2E (3 Läufe) grün, Abnahme- und Dunkelmodus-Test, Lighthouse-PWA 1
- [x] 5 Review und Behebung (docs/reviews/code-review.md)
- [x] 6 Veröffentlichung 1.0.1, Live-Prüfung bestanden (ca. 23:50)

## Version 1.0.2 (05.11.2026)
- Bilder zu Optionen aus Wikipedia (de, dann en), SVG/Wappen werden aussortiert, Grenze 300 Bilder / 20 MB (LRU), Schalter und „Bildspeicher leeren“ in den Einstellungen.
- 168 Unit, 32 E2E, Lighthouse 1; live seit ca. 19:17 MEZ.
- Cloud-Umgebung „elo-duell“ erlaubt github.io und die Wikimedia-Hosts.

## Nächste Schritte
- Offen (Rückfrage an Nutzer): englische Oberfläche ja/nein.
- Bei künftigen Änderungen: VERSION in js/version.js, sw.js, package.json gleich erhöhen, `npm test` und `npm run test:lh` laufen lassen.
