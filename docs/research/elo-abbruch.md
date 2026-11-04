# Elo-Duell: Wann ist die Rangliste stabil?

Stand 2026-11-04. Skript: `/tmp/claude-0/-home-user/e8b7b540-9411-57c5-8db6-1e088b3bf01a/scratchpad/elo/sim.mjs` (`node sim.mjs [reps] [sigma] [C]`, fester Seed).
**Definition:** M = Gesamtduelle, g_i = Duelle von Option i, **d = Duelle pro Option = 2·M/N** (jedes Duell zählt für beide Optionen). d = 3 bei N = 20 heißt also 30 Duelle.

## 1. Recherche (kurz)
- Fehlerfreies Sortieren braucht mindestens log2(N!) ≈ N·log2 N − 1,44·N Vergleiche, also d = 2·log2(N!)/N: **N=10: 4,4 · N=20: 6,1 · N=50: 8,6**. Das gilt für eine fehlerfreie, transitive Person. Elo nutzt Transitivität nicht aus und rauscht bei K = 32 stark.
- Comparative Judgement (viele Bewerter, schwer unterscheidbare Texte): 10–14 Vergleiche pro Objekt für Reliabilität 0,7 und 26–37 für 0,9 ([Verhavert u. a., zitiert bei Frontiers 2021](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2021.788202/epub)). Übliche Faustregel: etwa 10 pro Objekt ([No More Marking](https://blog.nomoremarking.com/judging-gcse-english-efficiency-and-reliability-9a8df9b80096), [RM Compare](https://compare.rm.com/blog/fewer-comparisons-higher-bar-what-the-latest-acj-research-means-for-rm-compare-users/)). Für **eine** Person mit eigener Vorliebe ist das zu hoch angesetzt. Sie ist konsistenter, und gebraucht wird eine nützliche, keine prüfungsfeste Rangliste.

## 2. Simulation
Modell: wahre Nutzen u_i ~ N(0,1). Pro Urteil bekommt jede Option ein Rauschen N(0; 0,5²) dazu. Ist die wahrgenommene Differenz kleiner als 0,12, lautet das Urteil „Gleich gut“. Ergebnis: Bei Zufallspaaren liegt die Person in **12 % der Fälle falsch**, in den gespielten (knappen) Duellen sagt sie in **7 % „Gleich gut“**. Elo startet bei 1000 mit K = 32, Gleichstände in der Anzeige werden zufällig sortiert. Es gab 1000 Wiederholungen je N, also etwa ±1,5 Prozentpunkte. Paarung: Top-Fokus (Abschnitt 4).

**Spearman ρ (Rangliste gegenüber wahrer Rangfolge)**, praktisch unabhängig von N:

| N \ d | 1 | 1,5 | 2 | 2,5 | 3 | 4 | 5 | 6 | 8 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| 5 | .58 | .66 | .69 | .74 | .78 | .81 | .85 | .86 | .88 | .89 |
| 10 | .55 | .64 | .70 | .73 | .77 | .81 | .85 | .87 | .90 | .91 |
| 20 | .53 | .61 | .68 | .71 | .75 | .80 | .84 | .86 | .89 | .91 |
| 50 | .53 | .61 | .67 | .71 | .75 | .80 | .83 | .86 | .89 | .91 |

(N = 8, 15 und 30 liegen um höchstens ±0,02 daneben.)

**Spitze der Liste: Top-3-Treffer / wahrer Sieger auf Platz 1 / wahrer Sieger unter den Top 3 (%)**. Diese Werte werden mit wachsendem N klar schlechter:

| N \ d | 1 | 2 | 2,5 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| 5 | 78/43/94 | 82/62/95 | 83/72/97 | 84/75/98 | 86/78/98 | 89/78/99 | 90/79/99 |
| 8 | 61/25/75 | 68/46/90 | 72/71/93 | 76/70/94 | 79/70/97 | 83/71/98 | 84/71/98 |
| 10 | 51/19/56 | 66/38/86 | 68/66/88 | 71/66/92 | 76/69/95 | 79/70/97 | 81/70/98 |
| 15 | 38/14/42 | 57/26/74 | 61/57/82 | 64/62/85 | 71/65/92 | 73/68/93 | 77/67/94 |
| 20 | 28/12/29 | 47/19/58 | 58/45/80 | 61/54/81 | 66/62/88 | 70/66/91 | 73/67/93 |
| 30 | 20/7/20 | 34/14/42 | 54/42/74 | 55/44/79 | 58/59/79 | 66/59/88 | 67/60/89 |
| 50 | 11/4/11 | 22/7/25 | 47/28/65 | 53/31/75 | 51/45/72 | 58/53/76 | 62/55/85 |

Die Quote „Sieger auf Platz 1“ steigt nicht über etwa 70–80 %, auch nicht bei d = 10. Das liegt an zwei Dingen: Die wahren Top 2 liegen oft so dicht beieinander, dass die Person selbst schwankt, und K = 32 lässt die Werte ständig zappeln. Ab d ≈ 6 bringt jedes weitere Duell nur noch wenig.

**Paarungs-Heuristiken, ρ / Sieger auf 1 (%)**

| N | Zufall | nur Elo-Nähe | nur Duellzahl ausgleichen | Ausgleich+Elo | **Top-Fokus** |
|---|---|---|---|---|---|
| 10, d=3 | .71/41 | .73/53 | .75/48 | .77/54 | **.77/66** |
| 20, d=3 | .71/25 | .72/39 | .74/26 | .76/33 | **.75/54** |
| 50, d=5 | .79/19 | .81/38 | .82/20 | .83/43 | **.83/53** |

**Empfindlichkeit:** Bei einer sehr konsistenten Person (σ = 0,3, 7 % falsche Urteile) liegt ρ bei d=3 bei 0,81 und bei d=5 bei 0,88. Bei einer unschlüssigen Person (σ = 0,8, 20 % falsch) sind es 0,67 und 0,76. Der Top-Fokus mit C = 1,5 oder C = 5 statt 3 ändert ρ und die Sieger-Quote nur um wenige Prozentpunkte.

**Abbruchregeln (Top-Fokus): Ø Duelle · ρ · Top-3 · Sieger auf 1**

| Regel | N=5 | N=10 | N=20 | N=50 |
|---|---|---|---|---|
| d≥2,5 und min≥2 | 7 · .78 · 84% · 75% | 13 · .73 · 69% · 65% | 25 · .72 · 58% · 44% | 63 · .71 · 48% · 29% |
| d≥3 und min≥2 | 8 · .79 · 83% · 72% | 15 · .76 · 72% · 65% | 30 · .75 · 61% · 54% | 75 · .75 · 53% · 27% |
| d≥4 und min≥3 | 10 · .82 · 87% · 78% | 20 · .80 · 75% · 68% | 40 · .81 · 65% · 62% | 100 · .80 · 53% · 46% |
| d≥5 und min≥3 | 13 · .85 · 89% · 78% | 25 · .84 · 80% · 70% | 50 · .84 · 70% · 62% | 125 · .83 · 57% · 54% |
| d≥3 + Top 3 seit ⌈N/2⌉ Duellen unverändert (max. d=5) | 9 · .81 · 86% · 78% | 21 · .81 · 77% · 65% | 44 · .82 · 69% · 60% | 114 · .82 · 57% · 55% |

Ein adaptives Stabilitätsmaß lohnt sich nicht. Die Regel „Top 3 ruhig“ ist bei gleich vielen Duellen nicht besser als eine feste Schwelle für d. Die mittlere Rangänderung je Option über die letzten ⌈N/2⌉ Duelle sinkt nie auf null, weil K = 32 die Werte ständig bewegt (N=20: 3,0 Plätze bei d=3, 1,2 bei d=10). Als Abbruchkriterium taugt sie deshalb nicht, höchstens als Zusatzinfo („Top 3 seit 9 Duellen unverändert“).

## 3. Abbruchregel (deterministisch)
**Passt der Richtwert 2,5–3?** Nur zum Teil. Bei d = 3 ist die Gesamtreihenfolge grob richtig (ρ ≈ 0,76), für N ≤ 10 ist der wahre Sieger dann zu über 90 % unter den Top 3. Das genügt für **„vorläufig“**. Als **„stabil“** taugt es nicht: Für N ≥ 20 ist der Sieger nur in etwa der Hälfte der Fälle richtig. Für „stabil“ sind **4–6** nötig, abhängig von N.

```
d      = 2*M/N;   gmin = min(g_i)
dStab  = N <= 10 ? 4 : (N <= 30 ? 5 : 6)
M1     = ceil(3*N/2)          // vorläufig ab hier
M2     = ceil(dStab*N/2)      // stabil ab hier  (N=5:10, 8:16, 10:20, 15:38, 20:50, 30:75, 50:150)
fehlt(m) = ceil( Σ_i max(0, m - g_i) / 2 )
status = (M >= M2 && gmin >= 3) ? "stabil" : (M >= M1 && gmin >= 2) ? "vorläufig" : "sammeln"
rest1  = max(M1 - M, fehlt(2));  rest2 = max(M2 - M, fehlt(3))
fortschritt = min(1, M / M2)  (Markierung bei M1/M2)
```
Werte bei „stabil“: ρ ≈ 0,81–0,86, wahrer Sieger unter den Top 3 zu 85–95 %. Weiter duellieren ist erlaubt und macht die Liste noch genauer.

Texte für die Fortschrittsanzeige:
- sammeln: „Noch ca. {rest1} Duelle bis zur ersten Rangliste“
- vorläufig: „Rangliste vorläufig – noch ca. {rest2} Duelle bis zur stabilen Rangliste“
- stabil: „Rangliste stabil ✓ Weitere Duelle machen sie noch genauer.“
- Nach dem Hinzufügen einer Option fällt der Status automatisch zurück, weil gmin = 0 ist: „Neue Option – noch ca. {rest2} Duelle“

## 4. Empfohlene Paarbildung (Top-Fokus, C = 3)
```
function nächstesPaar(R, g, paarAnzahl, letztesPaar):
  gmin = min(g)
  rang = Rang nach Elo (1 = bester)
  if gmin < 2:                                  // Phase 1: alle gleichmäßig
    bedarf(i) = g[i]
    A = zufällig unter {i : g[i] == gmin}
  else:                                         // Phase 2: obere Ränge öfter
    bedarf(i) = g[i] + 3 * (rang[i]-1)/(N-1)
    A = argmin_i bedarf(i) + 0.3*random()
  for j != A, {A,j} != letztesPaar:
    kosten(j) = |R[A]-R[j]|/100
              + max(0, bedarf(j) - bedarf(A))   // Phase 1: g[j]-gmin
              + 3 * paarAnzahl[{A,j}]           // Wiederholungen meiden
              + 0.5*random()
  B = argmin kosten
  Seiten (links/rechts) zufällig vertauschen; bei N = 2 Wiederholung erlauben
```
