# Kreidebox

Bildschirme für den Unterricht: Timer, Zufallsname, Gruppen, Ampel und rund 20 weitere Werkzeuge für den Beamer. Gratis, ohne Konto und ohne Server. Alles bleibt im Browser.

**Ausprobieren: https://ki-lehrer.github.io/kreidebox/**

## Gut zu wissen

- Gespeichert wird im Browser **dieses Computers**. Ein anderer Computer oder Browser sieht die Decks nicht. Mit **«Alles sichern»** im Dashboard entsteht eine Datei (z. B. in Google Drive ablegen); auf dem anderen Computer mit **«Importieren»** einlesen.
- Browser dürfen Website-Daten bei Platzmangel löschen. Darum regelmässig sichern. Chrome und Edge können die App installieren («App installieren»); das schützt die Daten besser.
- Die gehostete Version funktioniert nach dem ersten Besuch auch ohne Internet.
- **Ohne Internet von Anfang an:** `dist/kreidebox.html` herunterladen und öffnen. Diese Einzeldatei hat keinen Offline-Cache und keine Installation, und manche Browser (v. a. Safari) behandeln per Doppelklick geöffnete Dateien als wechselnden Ort, dann können gespeicherte Daten «verschwinden». Für den Schulalltag die gehostete Version nehmen.
- Datenschutz: siehe [Datenschutzseite](https://ki-lehrer.github.io/kreidebox/dist/datenschutz.html).

## Mit Claude und ChatGPT

Beide schreiben dir Bildschirme als Text (Format: [ki-format.md](ki-format.md)); du fügst ihn im Dashboard über «Von KI einfügen» ein, siehst eine Vorschau und legst ihn mit einem Klick als neues Deck an. Einrichten und Anleitung zum Kopieren: [ki.html](https://ki-lehrer.github.io/kreidebox/ki.html). Es gibt keine Live-Verbindung zu deinen Decks, denn diese liegen nur in deinem Browser.

## Konto, Server und KI-Anschluss (Vercel + Neon)

Kreidebox funktioniert ohne Server. Zusätzlich gibt es einen freiwilligen Server-Teil in `api/`: Konto mit E-Mail und Passwort ([Better Auth](https://www.better-auth.com/)), Abgleich der Decks zwischen Geräten und ein MCP-Server (`/api/mcp`), mit dem Claude und ChatGPT Decks lesen und erstellen. Namen von Kindern werden nie gespeichert (`api/_lib/privacy.js`).

Einrichten (einmalig, in dieser Reihenfolge):
1. Auf [vercel.com](https://vercel.com) → **Add New → Project** → das GitHub-Repo `kreidebox` importieren. Framework «Other»; die Einstellungen aus `vercel.json` gelten automatisch.
2. Im Projekt → **Storage → Create Database → Neon** (Marketplace), mit dem Projekt verbinden. Das setzt `DATABASE_URL` selbst.
3. Im Projekt → **Settings → Environment Variables**: `BETTER_AUTH_SECRET` setzen (Wert mit `openssl rand -base64 32` erzeugen). Für «Passwort vergessen» zusätzlich `RESEND_API_KEY` und `MAIL_FROM` (siehe `.env.example`).
4. **Deployments → Redeploy**. Der Build legt die Tabellen an (`scripts/migrate.mjs`).
5. `https://<deine-adresse>/ki.html` zeigt die Adresse des Konnektors für Claude und ChatGPT.

Lokal testen (braucht eine Postgres-Datenbank): `TEST_DATABASE_URL=postgres://… npx playwright test`. Der Test-Server startet selbst auf Port 3111.

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
| `api/` | Server (Vercel Functions): `auth`, `decks`, `mcp`, `_lib` |
| `konto.html`, `db/`, `scripts/` | Anmeldeseite, Datenbankschema, Migration und lokaler Entwicklungs-Server |
| `ki-format.md`, `ki.html` | Anleitung und Format für Claude und ChatGPT; Prüfer in `src/data/aispec.js` |
| `src/design.html` | Prüfseite des Design-Systems |
| `dist/` | gebaute App: `index.html` (gehostet, installierbar), `kreidebox.html` (Einzeldatei) |
| `tests/` | Playwright-Tests |

## Lizenzen

Schriften Atkinson Hyperlegible Next, Inter, Andika, Edu SA Beginner und Playpen Sans (SIL OFL, `src/fonts/`), Icons Lucide (ISC), Töne selbst erzeugt. Für den Code selbst ist noch keine Lizenz festgelegt.
