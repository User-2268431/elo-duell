# Abstimmung Runde 1 (offene Fragen nach Architekturprüfung)

Kontext: docs/ARCHITEKTUR.md, docs/research/elo-abbruch.md, docs/reviews/*.md.
„Duelle pro Option“ = durchschnittliche Teilnahmen je Option = 2·Gesamtduelle/N.
Nutzervorgabe: „Hinweis, wann die Rangliste stabil ist (Richtwert etwa 2,5 bis 3 Duelle pro Option; prüft die Recherche)“.

## F1 Stabilitätsregel
- A) Regel der Recherche: „vorläufig“ ab ⌈1,5·N⌉ Duellen und jede Option ≥ 2; „stabil“ ab ⌈dStab·N/2⌉ Duellen und jede Option ≥ 3, dStab = 4 (N ≤ 10), 5 (N ≤ 30), sonst 6.
- B) Nutzer-Richtwert wörtlich: „stabil“ ab Ø 2,5 Teilnahmen (⌈1,25·N⌉ Duelle) und jede Option ≥ 2; Ziel Ø 3; „vorläufig“ ab Ø 1.
- C) Einheitlich: „vorläufig“ ab Ø 3 Teilnahmen und jede Option ≥ 2, „stabil“ ab Ø 5 Teilnahmen und jede Option ≥ 3, unabhängig von N.

## F2 Paarbildung
- A) Kostenfunktion der Architektur (a = Option mit wenigsten Duellen, b nach Punktnähe/Duellzahl/Wiederholungen, Zufall unter den besten 3), mit harter Sperre gegen direkte Wiederholung (Prüfung M2).
- B) „Top-Fokus“ der Recherche (erst jede Option 2 Duelle, danach mehr Duelle für die oberen Ränge; Partner nach Elo-Nähe und Duellzahl, gespielte Paare meiden, etwas Zufall), ebenfalls mit harter Sperre gegen direkte Wiederholung.

## F3 Schwelle „Klare Ausschlüsse“ (bei m gemeinsamen Optionen, Ränge in der gemeinsamen Menge)
- A) Bei mindestens einer Person in den unteren max(1, ⌈m/4⌉) Rängen (Architektur).
- B) Bei mindestens einer Person in den unteren max(1, ⌊m/5⌋) Rängen (Prüfung S1).
- C) Bei mindestens einer Person auf dem letzten Platz bzw. den letzten zwei bei m ≥ 10 („ganz unten“ wörtlich).
