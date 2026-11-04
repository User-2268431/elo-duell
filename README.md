# Elo-Duell

Elo-Duell hilft dir, aus einer Liste von Möglichkeiten (Urlaubsziele, Restaurants, Filme …) herauszufinden, was dir wirklich am besten gefällt. Du vergleichst immer nur zwei Optionen miteinander, daraus entsteht nach und nach eine Rangliste. Zu zweit könnt ihr eure Ranglisten austauschen und seht sofort, wo ihr euch einig seid.

**Zur App:** https://user-2268431.github.io/elo-duell/

**Ausführliche Anleitung:** [ANLEITUNG.md](ANLEITUNG.md)

## Installation auf Android in drei Schritten

1. Öffne https://user-2268431.github.io/elo-duell/ in **Chrome**.
2. Tippe oben rechts auf das Menü **⋮** und wähle **„App installieren“** (bei manchen Geräten heißt es **„Zum Startbildschirm hinzufügen“**).
3. Bestätige mit **„Installieren“** bzw. **„Hinzufügen“**. Elo-Duell liegt jetzt als Symbol auf deinem Startbildschirm.

Nach dem ersten Öffnen funktioniert die App auch **ohne Internet**.

## Bedienung

### Liste anlegen
Tippe auf **„Neue Liste“**, gib einen Namen ein und schreib **eine Option pro Zeile** ins Textfeld. Du kannst auch eine fertige Liste einfügen, zum Beispiel aus einer Notiz; Aufzählungszeichen und Nummern werden entfernt, doppelte Einträge zusammengefasst. Eine Liste braucht **mindestens 2 Optionen**. Mit **„Liste anlegen“** speicherst du sie. Später kannst du über den Stift oben rechts Optionen hinzufügen, umbenennen oder löschen.

### Duellieren
Tippe in der Liste auf **„Duellieren“**. Du siehst die Frage „Was gefällt dir besser?“ und zwei Karten:

- **Antippen** einer Karte wählt deinen Favoriten, sofort folgt das nächste Paar.
- **„Gleich gut“**: Beide gefallen dir gleich.
- **„Überspringen“**: Du willst dich gerade nicht entscheiden. Das Paar wird nicht gewertet.
- **„Rückgängig“**: Nimmt das letzte Duell zurück und zeigt das Paar noch einmal. Das geht beliebig oft hintereinander.

### Fortschritt: vorläufig und stabil
Der Balken zeigt, wie weit du bist, darunter steht, wie viele Duelle ungefähr noch fehlen.

- **Vorläufig** ist die Rangliste, sobald du etwa 1,5 Duelle pro Option gespielt hast und jede Option mindestens 2-mal dran war.
- **Stabil** ist sie, sobald du etwa 2 Duelle pro Option gespielt hast und jede Option mindestens 3-mal dran war. Bei 11 bis 30 Optionen braucht es etwa 2,5 Duelle pro Option, bei mehr als 30 etwa 3.

**Beispiel mit 10 Optionen:** vorläufig nach 15 Duellen, stabil nach 20 Duellen (jeweils mit der Mindestzahl pro Option). Weitere Duelle machen die Rangliste noch genauer.

### Rangliste
Unter **„Rangliste“** siehst du Platz, Name, Punkte und die Zahl der Duelle. Alle Optionen starten bei 1.000 Punkten. Optionen ohne Duell stehen am Ende mit dem Hinweis „neu“.

## Zu zweit entscheiden

Empfohlener Ablauf:

1. **Liste vorab teilen:** Eine Person legt die Liste an und tippt auf **„Teilen“**. Die andere Person tippt auf der Startseite auf **„QR scannen“** oder öffnet den Link. So habt ihr beide genau dieselben Optionen.
2. **Getrennt duellieren:** Jede Person duelliert auf dem eigenen Handy, ohne sich abzusprechen.
3. **Ranglisten teilen:** Beide tippen auf **„Teilen“** und zeigen den QR-Code oder schicken den Link mit **„Link senden“** bzw. **„Link kopieren“**.
4. **Vergleichen:** Nach dem Empfang öffnet sich der Vergleich. Später findest du ihn in der Liste unter **„Vergleichen mit …“**.

Der Vergleich hat drei Abschnitte:

- **Gemeinsame Favoriten:** Optionen, die bei euch beiden weit vorn liegen. Hier liegt eure Lösung.
- **Klare Ausschlüsse:** Optionen, die bei mindestens einer Person ganz unten liegen. Die könnt ihr streichen.
- **Gesprächsstoff:** Optionen, die ihr sehr unterschiedlich seht, etwa Platz 2 bei dir und Platz 7 bei der anderen Person. Darüber lohnt es sich zu reden.

**Wichtig:** Öffne einen Link aus WhatsApp, Telegram, Instagram und Co. möglichst **in Chrome** (Menü ⋮ → „In Chrome öffnen“). Der eingebaute Browser des Messengers hat einen eigenen Speicher, dort übernommene Ranglisten landen sonst nicht in deiner App.

**Große Listen:** Ab etwa 70 Optionen passt die Liste nicht mehr in einen QR-Code. Dann bitte den Link senden.

## Daten sichern

Alles bleibt **auf deinem Handy**. Es gibt keinen Server und kein Konto; Daten verlassen das Gerät nur, wenn du selbst etwas teilst.

Unter **Einstellungen** (Zahnrad auf der Startseite):

- **„Sicherung exportieren“** speichert alle Listen, Wertungen und empfangenen Ranglisten in eine Datei namens `elo-duell-sicherung-JJJJ-MM-TT.json`.
- **„Sicherung importieren“** lädt eine solche Datei wieder. Achtung: Das **ersetzt alle** Listen auf diesem Gerät.

**Achtung:** Wenn du die Chrome-Daten löschst oder die App deinstallierst, sind deine Listen weg. Exportiere deshalb regelmäßig eine Sicherung, besonders vor einem Handywechsel.

## Für Entwickler

Reines HTML, CSS und Vanilla-JS mit ES-Modulen, ohne Build-Schritt und ohne CDN.

```
index.html, manifest.webmanifest, sw.js   App-Shell, PWA-Manifest, Service Worker
css/                                      Styles je Bereich
js/logic/   js/data/   js/share/          Elo und Stabilität · Speicher und Sicherung · QR/Link-Austausch
js/views/   js/app.js  js/router.js       Oberfläche (Hash-Routing)
vendor/                                   Fremdbibliotheken (QR erzeugen und lesen)
tests/unit/  tests/e2e/  tools/           Node-Tests, Playwright-Tests, Server und Hilfsskripte
```

```sh
npm install          # einzige Abhängigkeit: Playwright (nur für Tests)
npm run serve        # lokaler Server: http://localhost:4173/elo-duell/
npm run test:unit    # Unit-Tests mit node --test
npm run test:e2e     # Playwright-Tests (startet den Server bei Bedarf selbst)
npm test             # beides nacheinander
npm run test:lh      # Lighthouse-PWA-Prüfung (installiert lighthouse@11 in ein Temp-Verzeichnis)
npm run icons        # App-Icons neu erzeugen
```

**Bei jeder Veröffentlichung** die `VERSION` in `js/version.js` **und** in `sw.js` gleich erhöhen. Sonst bekommen installierte Apps das Update nicht (ein Unit-Test prüft, dass beide übereinstimmen).

Mehr dazu: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md) (Aufbau, Datenformat, Tests), [DECISIONS.md](DECISIONS.md) (getroffene Entscheidungen), [STATUS.md](STATUS.md) (Projektstand).

## Lizenz

Fremdbibliotheken unter `vendor/` mit ihren eigenen Lizenzen:

- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT), siehe `vendor/LICENSE-qrcode-generator`
- [jsQR](https://github.com/cozmo/jsQR) (Apache-2.0), siehe `vendor/LICENSE-jsQR`
