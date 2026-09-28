# Schnellstart: Testen & Starten

Kurzanleitung für den ersten Testlauf auf dem iPad, ca. 10 Minuten. Für alle Details siehe [README.md](README.md), für Architektur/Hintergrund [PLAN.md](PLAN.md).

## 1. Voraussetzungen

- iPad mit Safari
- Ein OpenRouter-API-Key mit Guthaben ([openrouter.ai](https://openrouter.ai)) — für die Preview reicht ein Key mit kleinem Kreditlimit (z. B. 20 USD)
- WLAN

## 2. App öffnen (und optional installieren)

1. Auf dem iPad in Safari öffnen: **https://crunchyboss.github.io/testhelper/**
2. *Optional:* Teilen-Icon (□ mit Pfeil nach oben) → **„Zum Home-Bildschirm“**. Ab dann die App vom Home-Bildschirm starten — Safari-Tab und Home-Bildschirm-App haben getrennten Speicher (Key, Protokolle, Audio-Cache).

**Zum Testen neuer Versionen** einfach direkt in Safari bleiben und nicht installieren: ein Tab lässt sich normal neu laden, eine Home-Bildschirm-App dagegen hält die JS-Version teils fest, bis man sie komplett schließt (nach oben wischen) und neu öffnet. Die Installation erst für die eigentliche(n) Sitzung(en) machen.

## 3. API-Key einrichten

Beim ersten Start ohne Key öffnet sich der Admin-Bereich automatisch. Key eintragen, **„Verbindung testen“** tippen — zeigt Guthaben/Limit.

*Später wieder rein: linke obere Ecke 3 Sek. gedrückt halten → PIN `2468` → Tab „Schlüssel“.*

## 4. Ton & Mikro testen

1. Zurück zum Start-Screen
2. Pseudonym eingeben (leer = automatisch vergeben), Test auswählen
3. **„Ton & Mikro testen“** tippen → Mikrofon-Freigabe erlauben
4. Optional: **„Audios vorbereiten“** (lädt Begrüßungen etc. vorab, spart Wartezeit später)

## 5. Testlauf durchspielen

1. **„Weitergeben“** tippen — ab hier läuft es wie bei einer echten Sitzung
2. **Sprachwahl**: eine Sprache antippen (spielt Begrüßung ab), zweites Tippen bestätigt
3. **Aufgabe**: 🔊 erklären · 🎤 Frage stellen · 🔁 wiederholen · ✅ Antwort prüfen (Ansage → Aufnahme → Bewertung) · ◀ ▶ blättern

## 6. Zurück ins Hauptmenü

Es gibt **absichtlich keinen sichtbaren Button** dafür, damit die lernende Person die Sitzung nicht selbst beenden kann:

1. Linke obere Ecke **3 Sekunden gedrückt halten**
2. PIN eingeben (Standard `2468`, änderbar in `public/config/app.yaml`)
3. Tab **„Gerät“** → **„Sitzung beenden und zum Start“**

## 7. Nach dem Testlauf

Admin → **Protokolle** → Export (JSON/CSV) über das iOS-Teilen-Menü sichern. Safari kann Website-Daten löschen — nach jeder echten Sitzung exportieren, nicht erst am Ende des Tages.

## Für Entwickler: lokal starten

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Pipeline, Audio-Warteschlange, Konfigdateien, Protokoll/Export
```

Mikrofonzugriff braucht HTTPS — auf dem iPad daher immer über die GitHub-Pages-URL testen, **nicht** über die LAN-IP des Dev-Servers. Jeder Push auf `main` baut und deployt automatisch neu ([.github/workflows/pages.yml](.github/workflows/pages.yml)).

## Mehr Details

- Vollständige Bedienung, Admin-Tabs, Config-Dateien, Fehlerverhalten: [README.md](README.md)
- Architektur, Datenschema, Roadmap: [PLAN.md](PLAN.md)
