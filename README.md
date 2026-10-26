# Kreidebox

Bildschirme für den Unterricht: Timer, Zufallsname, Gruppen, Ampel und rund 20 weitere Werkzeuge für den Beamer. Gratis, ohne Konto und ohne Server. Alles bleibt im Browser.

**Ausprobieren: https://ki-lehrer.github.io/kreidebox/**

## Gut zu wissen

- Gespeichert wird im Browser **dieses Computers**. Ein anderer Computer oder Browser sieht die Decks nicht. Mit **«Alles sichern»** im Dashboard entsteht eine Datei (z. B. in Google Drive ablegen); auf dem anderen Computer mit **«Importieren»** einlesen.
- Browser dürfen Website-Daten bei Platzmangel löschen. Darum regelmässig sichern. Chrome und Edge können die App installieren («App installieren»); das schützt die Daten besser.
- Die gehostete Version funktioniert nach dem ersten Besuch auch ohne Internet.
- **Ohne Internet von Anfang an:** `dist/kreidebox.html` herunterladen und öffnen. Diese Einzeldatei hat keinen Offline-Cache und keine Installation, und manche Browser (v. a. Safari) behandeln per Doppelklick geöffnete Dateien als wechselnden Ort, dann können gespeicherte Daten «verschwinden». Für den Schulalltag die gehostete Version nehmen.
- Datenschutz: siehe [Datenschutzseite](https://ki-lehrer.github.io/kreidebox/dist/datenschutz.html).

## Entwickeln

```bash
npm i
node build.mjs                      # baut dist/ (index.html, kreidebox.html, sw.js, Manifest, Icons)
python3 -m http.server -d src 8765  # Entwicklungsversion: http://localhost:8765
npx playwright test                 # Tests gegen dist/ (Server startet selbst auf Port 8777)
```

Veröffentlicht wird über GitHub Pages aus dem Branch `main` (Hauptordner). `dist/` ist eingecheckt: Nach jeder Änderung `node build.mjs` ausführen und `dist/` mit committen.

| Ordner | Inhalt |
| --- | --- |
| `index.html` | Startseite (Landing), verlinkt auf `dist/index.html` |
| `src/` | Quellcode: `app.js` (Router), `views/`, `widgets/`, `data/` (Speicher), `ui/`, `styles/`, `icons/` |
| `src/design.html` | Prüfseite des Design-Systems |
| `dist/` | gebaute App: `index.html` (gehostet, installierbar), `kreidebox.html` (Einzeldatei) |
| `tests/` | Playwright-Tests |

## Lizenzen

Schriften Atkinson Hyperlegible Next, Inter, Andika, Edu SA Beginner und Playpen Sans (SIL OFL, `src/fonts/`), Icons Lucide (ISC), Töne selbst erzeugt. Für den Code selbst ist noch keine Lizenz festgelegt.
