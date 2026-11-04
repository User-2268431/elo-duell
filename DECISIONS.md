# DECISIONS

Entscheidungen nach der Anfangsrunde: Frage, Optionen, drei unabhängige Stimmen, Ergebnis.

## 0. Anfangsrunde (Nutzer)
- Hosting: GitHub Pages, öffentliches Repo „elo-duell“
- Austausch: QR-Code und Link
- Optik: automatisch nach Systemeinstellung
- Startlisten: nur kleine Beispielliste

## 1. Architekturprüfung: unstrittige Punkte
Alle MUSS-Punkte beider Prüfungen (docs/reviews/) werden ohne Abstimmung übernommen, da es Fehlerkorrekturen mit offensichtlicher Lösung sind (z. B. QR immer ECC L und nur bis ca. 1000 Zeichen URL, harte Sperre gegen direkte Paarwiederholung, Schlüssel- und Cache-Präfix `elo-duell`, Wettkampf-Ränge im Vergleich, Backup-Import behält eigene Geräte-ID). Ergebnis: docs/ARCHITEKTUR.md v1.1.

## 2. Abstimmung Runde 1 (Fragen: docs/votes/runde1-fragen.md)

### F1 Stabilitätsregel
Optionen: A Regel der Recherche (vorläufig ab ⌈1,5·N⌉ Duellen und je Option ≥ 2; stabil ab ⌈dStab·N/2⌉ und je Option ≥ 3, dStab 4/5/6 für N ≤ 10 / ≤ 30 / größer) · B Nutzer-Richtwert wörtlich (stabil ab Ø 2,5) · C einheitlich Ø 3 / Ø 5.
Stimmen: A, A, A.
Ergebnis: **A**. Der Richtwert 2,5 bis 3 entspricht der Stufe „vorläufig“; laut Simulation reicht er für „stabil“ nicht (bei N ≥ 20 ist der Sieger dann nur in etwa der Hälfte der Fälle richtig).

### F2 Paarbildung
Optionen: A Kostenfunktion der Architektur · B „Top-Fokus“ der Recherche; beide mit harter Sperre gegen direkte Wiederholung.
Stimmen: B, B, B.
Ergebnis: **B**. Gleiche Gesamtkorrelation, aber der wahre Sieger landet deutlich öfter auf Platz 1 (N = 20: 54 % statt 33 %).

### F3 Schwelle „Klare Ausschlüsse“
Optionen: A untere max(1, ⌈m/4⌉) · B untere max(1, ⌊m/5⌋) · C letzter Platz, ab m ≥ 10 die letzten zwei.
Stimmen: B, B, C.
Ergebnis: **B** (2:1). Bei m < 10 genau der letzte Platz je Person, wächst bei langen Listen maßvoll mit.
