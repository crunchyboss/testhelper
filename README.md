# Lernhilfe DaZ (Technology Preview)

Web-App fürs iPad: begleitet gering literalisierte DaZ-Lernende per Sprache in ihrer Muttersprache
bei Papier-Diagnostiktests. KI über OpenRouter (STT → LLM → TTS). Details: [PLAN.md](PLAN.md).

**Neu hier?** → [SCHNELLSTART.md](SCHNELLSTART.md): in ca. 10 Minuten von Null zum ersten Testlauf auf dem iPad.

## Entwicklung

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # Typecheck + Build nach dist/
npm test         # Tests: Pipeline gegen simuliertes OpenRouter, Audio-Warteschlange, Konfigdateien, Protokoll/Export
```

Mikrofonzugriff braucht HTTPS. Auf dem iPad daher über GitHub Pages testen, nicht über die LAN-IP des Dev-Servers.

## Ablauf

1. **Start** (Lernbegleitung): Pseudonym eingeben (leer = automatisch), Test wählen, „Ton & Mikro testen“
   (entsperrt Audio und holt die Mikrofonfreigabe), optional „Audios vorbereiten“, dann **Weitergeben**.
2. **Sprachwahl** (lernende Person): Ein Tippen spielt die Begrüßung in der Sprache, ein zweites Tippen bestätigt.
3. **Aufgabe**: Die große Nummer entspricht der Nummer auf dem Papier. 🔊 erklären · 🎤 Frage · 🔁 nochmal ·
   ✅ Antwort prüfen · ◀ ▶ blättern.
   Bei ✅ sagt die App zuerst in der Muttersprache „Sag deine Antwort. Du kannst auch buchstabieren.“ Danach nimmt sie auf
   (Stille-Autostopp nach 3 s). Ein Bewertungsmodell stuft die Antwort als korrekt, teilweise, falsch oder unklar ein.
   Gesprochen wird die Rückmeldung nur, wenn `rueckmeldung_an_person: true` (app.yaml oder Test-YAML); sonst kommt ein neutrales „Danke“.
   Bei RTL-Sprachen ist das Layout gespiegelt. Tippen auf den Orb bricht ab.
4. **Admin-Bereich**: die **linke obere Ecke 3 Sekunden gedrückt halten** → PIN (Standard `2468`, in `app.yaml`).
   Dort kann man die Sitzung beenden (Tab „Gerät“) oder mit „Zurück zur Sitzung“ weitermachen.

## Admin-Bereich

Erreichbar über ⚙ auf dem Start-Screen oder die versteckte Ecke, jeweils mit PIN. Beim ersten Start ohne API-Key öffnet er sich direkt.

| Tab | Inhalt |
|---|---|
| Schlüssel | OpenRouter-API-Key speichern, testen (Guthaben/Limit), löschen |
| Modelle | STT/LLM/TTS/Stimme/Bewertung und Pipeline (`cascade` / `audio-llm`), global und pro Sprache. Vorschläge kommen live von OpenRouter |
| Tests & Prompts | Alle YAML/MD-Dateien ansehen, bearbeiten, importieren, teilen; neue Tests anlegen. Wird vor dem Speichern komplett validiert |
| Protokolle | Übersicht, Export JSON/CSV, Löschen |
| Gerät | Sitzung beenden, Gerätename, Audios vorbereiten, Audio-Cache leeren, Status |
| Sprachlabor | Satz per TTS anhören (Modell/Stimme wählbar); einmal aufnehmen und dieselbe Aufnahme mit mehreren STT-Modellen und im Audio-LLM-Modus transkribieren (Zeit, Kosten) |

Änderungen im Admin-Bereich gelten **nur auf diesem Gerät** (Overrides in IndexedDB, Anzahl oben im Admin-Kopf).
Sie lassen sich als JSON exportieren und auf einem anderen iPad importieren. Dauerhaft für alle: Datei unter `public/` ändern und pushen.

**Pipeline `audio-llm`**: Die Aufnahme geht direkt an ein audiofähiges Chat-Modell (z. B. `google/gemini-3.8-flash`). Das Modell schreibt
zuerst eine `TRANSKRIPT:`-Zeile, die nicht vorgelesen wird, dann die Antwort. Auch „Antwort prüfen“ hört dann selbst zu.
Das ist ein Kandidat für Sprachen mit schwacher STT (Kurmandschi, Tigrinya) und für gemischte Antworten. Im Sprachlabor vergleichen.

## Protokolle

Jede Sitzung wird lokal in IndexedDB gespeichert: Pseudonym, Gerät, Test, Sprache, jede Aktion mit Transkript,
LLM-Antwort, Bewertung, Modellen, Latenzen und Kosten (Schema: PLAN.md §3.3).
TTS-Kosten werden im Hintergrund über `/generation` nachgeladen. Klappt das nicht, werden sie aus Zeichen × Preis geschätzt
(Spalte `tts_kosten_quelle`).

**Admin → Protokolle**: Übersicht, **Export JSON / CSV** über das iOS-Teilen-Menü
(Dateien, AirDrop, Mail) und Löschen. Die CSV ist für deutsches Excel formatiert (Semikolon, Dezimalkomma).
Nach jedem Termin exportieren, denn Safari kann Website-Daten löschen.

## Inhalte ändern (ohne Code)

| Datei | Inhalt |
|---|---|
| `public/config/app.yaml` | Modelle pro Stufe, Flags (Erklärungs-Cache, Autostopp, Debug-Anzeige …) |
| `public/config/languages.yaml` | Sprachen, Reihenfolge, RTL, Sprachhinweis, feste Sätze, Modell-Overrides pro Sprache |
| `public/prompts/system.md` | Systemprompt-Template mit `{{platzhaltern}}` |
| `public/prompts/judge.md` | Prompt für „Antwort prüfen“ (Musterlösung, Bewertungshinweis aus dem Test) |
| `public/tests/index.yaml` + `*.yaml` | Tests und Aufgaben. Alles, was auf dem Papier steht, muss hier als Text stehen |

`npm test` prüft die Dateien (YAML gültig, Pflichtfelder, keine offenen Platzhalter). Der Deploy läuft nur, wenn die Tests grün sind.
Erklärungen werden gecacht. Eine Änderung am Prompt oder an einem Test erzeugt automatisch neue Erklärungen.

**Checkliste auf dem iPad (Home-Screen-App):**
- [ ] Mikrofon-Abfrage erscheint beim Start-Screen, die Aufnahme funktioniert, der Orb reagiert auf die Lautstärke
- [ ] Die Begrüßung kommt beim ersten Tippen auf eine Sprache (Autoplay-Entsperrung)
- [ ] Lautstärke nach einer Aufnahme normal (sonst `mikro_offen_halten` in `app.yaml` umschalten und vergleichen)
- [ ] „Erster Ton“ im Debug-Bereich notieren; ein zweites „Erklären“ derselben Aufgabe kommt aus dem Cache (sofort)
- [ ] Bildschirm bleibt während der Sitzung an; nach App-Wechsel geht der Ton weiterhin
- [ ] RTL: Arabisch/Dari/Farsi/Paschto/Sorani gespiegelt, Ziffern bleiben westlich
- [ ] ✅ Antwort prüfen: Ansage → Aufnahme → „Danke“; im Debug-Bereich Urteil und erkannte Antwort prüfen (auch buchstabiert)
- [ ] Export CSV über das Teilen-Menü in „Dateien“ sichern und in Excel/Numbers öffnen
- [ ] Sprachlabor: für Kurmandschi/Somali/Tigrinya dieselbe Aufnahme mit STT und Audio-LLM vergleichen, dann pro Sprache die Pipeline wählen

## Sprachenmatrix (TTS-Qualität pro Sprache)

```bash
OPENROUTER_API_KEY=sk-or-… npm run voice-matrix
```

Erzeugt `tools/out/voice-matrix/matrix.html`: 15 Sprachen × 3 TTS-Modelle, jeweils mit Rück-Transkription und Kosten.
Optionen: `-- --langs ar,ti --models google/gemini-3.8-flash-tts --stt none --stt-hint off`. Neue Läufe werden mit `results.json` zusammengeführt,
daher lassen sich einzelne Modelle nachholen. Die Testsätze sind nicht muttersprachlich geprüft.

## Deployment (GitHub Pages)

1. Repo auf GitHub anlegen und `main` pushen.
2. Unter *Settings → Pages → Build and deployment → Source* **GitHub Actions** wählen.
3. Jeder Push auf `main` baut und deployt (`.github/workflows/pages.yml`).
   Die App liegt dann unter `https://<user>.github.io/<repo>/`.

## Vor jeder Sitzung (auch im Admin → Gerät)

1. iPad geladen, WLAN verbunden, Key getestet
2. Lautstärke hoch, Stummschaltung aus, *Nicht stören* an
3. *Automatische Sperre: Nie* (Einstellungen → Anzeige & Helligkeit)
4. *Audios vorbereiten* (Admin → Gerät), dann auf dem Start-Screen *Ton & Mikro testen*
5. **Geführter Zugriff** (einmalig: Bedienungshilfen → Geführter Zugriff an, Code festlegen).
   In der App dreimal die Seitentaste drücken → *Starten*. Die Person kann die App dann nicht verlassen.
   Beenden: dreimal Seitentaste + Code.
6. Nach der Sitzung: Admin → Protokolle → Export

## Verhalten bei Problemen

- **Lange Wartezeit**: Nach 2,5 s ohne Ton sagt die App „Einen Moment, bitte“ in der Muttersprache (`denk_laut_nach_s`).
- **Netz weg**: Unten in der Mitte erscheint 📶✕. Anfragen haben Zeitlimits (STT 30 s, LLM 60 s, TTS 25 s) und werden bei 429/5xx
  oder Netzwerkfehlern einmal wiederholt. Danach kommt der Fehlerhinweis in der Muttersprache, und der Fehler wird protokolliert.
- **Aufnahme**: Ein steigender Ton heißt „jetzt sprechen“, ein fallender „fertig“ (`signaltoene`). Die Sprachschwelle passt sich
  an Raumgeräusche an; Stille vor und nach dem Sprechen wird abgeschnitten.
- **Aufnahmen speichern** (`audio_aufnahmen_speichern: true`, nur mit Einwilligung): Admin → Protokolle → *Export ZIP*
  enthält protokolle.json, protokolle.csv und aufnahmen/*.wav (Spalte `audio_datei`).

## iPad einrichten

1. Die Pages-URL in Safari öffnen, **Teilen → Zum Home-Bildschirm**.
2. Die App **vom Home-Bildschirm** starten. Safari-Tab und Home-Screen-App haben getrennte Speicher.
3. OpenRouter-API-Key eingeben und auf **Verbindung testen** tippen.
   Empfehlung: einen eigenen Key mit Kreditlimit (z. B. 20 USD) anlegen und nach der Preview widerrufen.
4. Für Sitzungen: *Einstellungen → Anzeige & Helligkeit → Automatische Sperre: Nie* und
   *Bedienungshilfen → Geführter Zugriff* aktivieren (dreimal Seitentaste: App sperren).
