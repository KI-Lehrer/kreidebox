# Kreidebox

Bildschirme für den Unterricht, eigenständig gebaut. Speichert alles auf dem eigenen Computer, ohne Konto und ohne Server.

## Ausprobieren

**Einfachste Art:** `dist/kreidebox.html` in Chrome oder Edge öffnen (Doppelklick).

Gut zu wissen:
- Gespeichert wird im Browser **dieses Computers**. Ein anderer Computer oder ein anderer Browser sieht die Decks nicht. Mit **«Alles sichern»** im Dashboard entsteht eine Datei (z. B. in Google Drive ablegen); auf dem anderen Computer mit **«Importieren»** einlesen.
- Für den Schulalltag die App später unter einer festen https-Adresse betreiben (z. B. Vercel). Per Doppelklick geöffnete Dateien behandeln manche Browser (v. a. Safari) als wechselnden Ort; dann können gespeicherte Daten «verschwinden».

## Entwickeln

```
node build.mjs                      # baut dist/kreidebox.html (braucht: npm i)
python3 -m http.server -d src 8765  # Entwicklungsversion: http://localhost:8765
```

| Ordner | Inhalt |
| --- | --- |
| `src/` | Quellcode: `app.js` (Router), `views/`, `widgets/`, `data/` (Speicher), `ui/`, `styles/` |
| `src/design.html` | Prüfseite des Design-Systems |
| `replica/` | Planung: Recon, Architektur, Design, Feature-Liste, Build-Log (wird nie ausgeliefert) |
| `dist/` | gebaute Einzeldatei |

Lizenzen der Bestandteile: Schriften Atkinson Hyperlegible Next und Inter (SIL OFL, `src/fonts/`), Icons Lucide (ISC, `src/ui/LUCIDE-LICENSE.txt`). Töne sind selbst erzeugt. Nichts stammt vom Original.
