# Launch Curtain SteamOS

![Launch Curtain SteamOS](Logo.png)

**Launch Curtain SteamOS** ist eine native SteamOS-/Decky-Portierung des Launch-Curtain-Konzepts.  
Das Plugin blendet beim Start eines Spiels einen eigenen Ladebildschirm in der Steam Gamepad UI ein und ersetzt damit den ansonsten eher nüchternen Übergang vom Steam-Menü zum gestarteten Spiel.

> **Hinweis:** Diese Version wurde speziell für SteamOS entwickelt und enthält keine Windows-Abhängigkeiten wie PowerShell, `user32`, `kernel32` oder `.exe`-Prozessüberwachung.

---

## Features

- Native Unterstützung für **SteamOS**
- Integration als **Decky Loader Plugin**
- Automatischer Curtain beim Start eines Steam-Spiels
- Manueller **„Curtain testen“**-Button
- Anzeige des echten Spielnamens bei regulären Steam-Spielen
- Automatische Suche nach vorhandenem Steam-Artwork
- Unterstützung für Steams lokalen `appcache/librarycache`
- Unterstützung für eigenes Steam-Artwork aus dem Benutzerprofil
- Fallback auf Steam-CDN-Artwork, wenn lokal nichts vorhanden ist
- Anzeige eines Logos, sofern verfügbar
- Hero-/Hintergrundbild-Unterstützung
- Optionales eigenes Hintergrundbild
- Einstellbare Hintergrund-Deckkraft
- Einstellbare Logo-Größe
- Einstellbarer Timeout
- Einstellbare Ausblend-Verzögerung
- Dezente Hintergrundanimation
- Curtain kann mit **B / Zurück** bzw. **Escape** geschlossen werden
- SteamOS-native Umsetzung ohne Windows-Komponenten

---

## Installation

### Voraussetzung

- SteamOS
- Installierter **Decky Loader**
- Aktivierter Entwicklermodus in Decky

### Installation über ZIP

1. Lade die aktuelle Release-ZIP von GitHub herunter.
2. Öffne in Steam den **Decky Loader**.
3. Gehe zu **Decky Einstellungen**.
4. Aktiviere bei Bedarf den **Entwicklermodus**.
5. Wähle **„Plugin aus ZIP-Datei installieren“**.
6. Wähle die heruntergeladene Launch-Curtain-SteamOS-ZIP aus.
7. Warte, bis Decky die Installation abgeschlossen hat.
8. Beende Steam anschließend vollständig über **Steam → Beenden**.
9. Starte Steam neu.

> Ein vollständiger Steam-Neustart wird empfohlen, da Steam bzw. Decky Frontend-Dateien zwischenspeichern kann.

---

## Verwendung

Nach der Installation findest du **Launch Curtain SteamOS** im Decky-Menü.

Über die Plugin-Einstellungen kannst du das Verhalten und die Optik des Curtains anpassen.

Mit **„Curtain testen“** kannst du jederzeit prüfen, ob die Anzeige korrekt funktioniert.

Beim normalen Start eines Steam-Spiels wird der Curtain automatisch eingeblendet.

---

## Artwork-Erkennung

Bei regulären Steam-Spielen versucht Launch Curtain SteamOS das passende Artwork in mehreren Schritten zu finden:

1. Eigenes Steam-Artwork des Benutzers
2. Lokaler Steam-`librarycache`
3. Steam-CDN-Fallback
4. Falls kein Logo vorhanden ist: Anzeige des echten Spielnamens

Dadurch funktioniert die Anzeige auch bei Spielen, bei denen Steam nicht mehr die klassische feste `logo.png`-Struktur verwendet.

---

## Steam-fremde Spiele / Non-Steam Games

Steam-fremde Spiele werden aktuell **noch nicht vollständig unterstützt**.

Steam vergibt für Non-Steam-Shortcuts intern zufällige bzw. shortcut-spezifische App-IDs.  
Die Zuordnung dieser IDs zum tatsächlichen Verknüpfungsnamen funktioniert in der aktuellen Version noch nicht zuverlässig auf allen Systemen.

Daher kann bei Steam-fremden Spielen aktuell beispielsweise Folgendes angezeigt werden:

```text
Steam App 3827xxxxxx
```

statt des eigentlichen Spielnamens.

Auch die automatische Logo-/Artwork-Suche für Steam-fremde Spiele ist deshalb derzeit nur eingeschränkt nutzbar.

**Reguläre Steam-Spiele sind von dieser Einschränkung nicht betroffen.**

Eine verbesserte Erkennung für Steam-fremde Spiele ist für eine spätere Version geplant.

---

## Bekannte Einschränkungen

- Non-Steam-Games werden noch nicht zuverlässig anhand ihres Shortcut-Namens erkannt.
- Artwork für Steam-fremde Spiele kann daher fehlen.
- Ein eigenes Hintergrundbild ist vorhanden, sollte aber je nach SteamOS-/Decky-Version zusätzlich getestet werden.
- Nach Plugin-Updates kann ein vollständiger Steam-Neustart notwendig sein.

---

## Ursprung

Launch Curtain SteamOS basiert auf der Idee des ursprünglichen **Launch Curtain** Projekts von **LoZazaMastro**, wurde jedoch für SteamOS neu umgesetzt.

Die SteamOS-Version verwendet keine Windows-spezifischen Komponenten und setzt stattdessen auf die Steam-/Decky-Frontend-Schnittstellen sowie den lokalen Steam-Artwork-Cache.

Originalprojekt:

https://github.com/LoZazaMastro/Launch-Curtain

---

## Status

Das Plugin befindet sich aktuell in aktiver Entwicklung.

Feedback, Fehlerberichte und Verbesserungsvorschläge sind ausdrücklich willkommen.

---

## Lizenz

Bitte beachte die Lizenz des ursprünglichen Launch-Curtain-Projekts sowie die Lizenz dieses Repositories.
