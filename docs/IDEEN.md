# Ideen zur Verbesserung von Elo-Duell

Stand: 05.11.2026. Sortiert nach Nutzen im Verhältnis zum Aufwand. Aufwand: S = klein (unter 1 Std. Agentenarbeit), M = mittel, L = groß.

## Schnelle Gewinne
| Idee | Nutzen | Aufwand |
|---|---|---|
| **Bild ersetzen oder entfernen** pro Option (z. B. wenn „Bergen“ das falsche Bergen zeigt), optional nächstes Wikipedia-Bild | Weniger falsche Bilder | S–M |
| **Suchbegriff für Bilder** pro Option getrennt vom Namen („Bergen“ → „Bergen Norwegen“) | Höhere Trefferquote bei mehrdeutigen Namen | S |
| **Wischgesten im Duell**: nach oben/unten wischen statt tippen | Schneller, macht mehr Spaß | S |
| **Kurze Vibration** beim Antippen (navigator.vibrate) | Spürbare Rückmeldung | S |
| **„neu“-Etikett in der Rangliste** neben den Punkten statt in zweiter Zeile | Ruhigeres Layout | S |
| **Liste duplizieren** (z. B. „Urlaub 2027“ aus „Urlaub 2026“) | Wiederverwendung | S |
| **Tippfehler-tolerante Bildsuche** über Wikipedia-Suche (opensearch) | Mehr Bilder bei Kleinschreibung und Tippfehlern | S |

## Zu zweit noch besser
| Idee | Nutzen | Aufwand |
|---|---|---|
| **Gemeinsamer Endstand**: Aus beiden Ranglisten eine Kompromiss-Rangliste (z. B. nach niedrigerer Wertung) zum Teilen als Bild | Klares Ergebnis für beide | M |
| **Mehr als zwei Personen** (Familie, Freundesgruppe): Vergleich mit 3 bis 6 Ranglisten, „Favorit der Gruppe“ | Neue Einsatzzwecke | M–L |
| **Stichwahl-Modus**: Nur die gemeinsamen Top 3 noch einmal gegeneinander, beide am selben Handy abwechselnd | Entscheidung am Ende | M |
| **Vetorecht**: Jede Person darf eine Option von vornherein streichen | Spart Duelle | S |
| **Ergebnis als Bild teilen** (Screenshot-Karte mit Top 3 und Fotos) | Schön zum Verschicken | M |

## Auswertung und Fortschritt
| Idee | Nutzen | Aufwand |
|---|---|---|
| **Sicherheit der Rangliste** pro Platz anzeigen („Platz 1 fast sicher“, „Platz 3–5 noch offen“) | Ehrlichere Aussage als nur Punkte | M |
| **Verlauf**: Wie sich die Top 3 über die Duelle entwickelt haben (kleines Diagramm) | Nachvollziehbarkeit | M |
| **Kurz-Modus „Turnier“**: K.-o.-System für sehr schnelle Entscheidungen mit wenigen Duellen | Für Eilige | M |
| **Duelle nachträglich ansehen** (Liste der letzten Entscheidungen, einzelne löschen) | Fehler korrigieren | S–M |

## Listen und Inhalte
| Idee | Nutzen | Aufwand |
|---|---|---|
| **Vorlagen** zum Start: Urlaubsziele, Vornamen, Restaurants, Filme, Wochenendaktivitäten | Leichter Einstieg | S |
| **Kurzbeschreibung pro Option** aus Wikipedia (erster Satz) unter dem Bild | Mehr Entscheidungsgrundlage | S |
| **Eigene Notiz/Link pro Option** (z. B. Hotelpreis, Link zur Unterkunft) | Praktisch bei echten Entscheidungen | M |
| **Kategorien/Tags** und Filter vor dem Duell („nur Strand“) | Große Listen beherrschbar | M |

## Technik und Betrieb
| Idee | Nutzen | Aufwand |
|---|---|---|
| **Test auf echtem Android-Gerät** (Kamera-Scan, Installation, Ladezeit der Bilder) | Restrisiko aus der Emulation beseitigen | S, manuell |
| **Automatische Erinnerung an Sicherung** nach z. B. 100 Duellen ohne Export | Schutz vor Datenverlust | S |
| **Automatische Tests in GitHub Actions** bei jedem Push | Fehler früh erkennen, falls doch jemand ändert | S |
| **Teilen per Nearby/Bluetooth** statt QR | Ohne Kamera und Internet | L, Browser-Unterstützung unsicher |

## Empfehlung für die nächste Runde
1. Bild ersetzen/entfernen plus Suchbegriff pro Option (behebt die häufigste Schwäche der Bilder).
2. Vorlagen zum Start.
3. Gemeinsamer Endstand als teilbares Bild.
