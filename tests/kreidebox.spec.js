import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const FILE_URL = 'file://' + resolve(dirname(fileURLToPath(import.meta.url)), '../dist/kreidebox.html');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

test('Dashboard lädt ohne Fehler, Name und Icons sind Kreidebox', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page).toHaveTitle(/Kreidebox/);
  await expect(page.getByRole('heading', { name: 'Meine Bildschirme' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/nachbau|classroom/i);
  for (const p of ['icons/favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/og.png', 'manifest.webmanifest']) {
    expect((await page.request.get(p)).status(), p).toBe(200);
  }
  expect(errors).toEqual([]);
});

test('Deck anlegen, Timer hinzufügen, Neuladen: alles noch da', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Neues Deck' }).click();
  await expect(page).toHaveURL(/#\/deck\//);
  await page.getByRole('button', { name: /^Timer/ }).first().click();
  const frames = page.locator('.stage [aria-label*="Timer"]');
  await expect(frames.first()).toBeVisible();
  await page.waitForTimeout(800); // Autosave nach 400 ms
  await page.reload();
  await expect(page.locator('.stage [aria-label*="Timer"]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Datenschutzseite ist erreichbar und hat keine Kontrastfehler', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Datenschutz' }).click();
  await expect(page).toHaveURL(/datenschutz\.html/);
  await expect(page.getByRole('heading', { name: 'Datenschutz', level: 1 })).toBeVisible();
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(res.violations.map((v) => v.id)).toEqual([]);
});

test('Dashboard: axe WCAG 2.2 AA, hell und dunkel', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Meine Bildschirme' })).toBeVisible();
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(500); // Farbübergänge der Knöpfe abwarten
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    expect(res.violations.map((v) => v.id + ' ' + v.nodes.length), scheme).toEqual([]);
  }
});

test('Service Worker: installiert, füllt den Cache, App startet offline', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).length)).toBeGreaterThan(0);
  expect(await page.evaluate(async () => { const k = await caches.keys(); return (await (await caches.open(k[0])).keys()).length; })).toBeGreaterThan(5);
  await page.reload(); // jetzt kontrolliert der Service Worker die Seite
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Meine Bildschirme' })).toBeVisible();
  await context.setOffline(false);
});

test('Manifest ist installierbar (Name, Symbole, Farben)', async ({ page }) => {
  await page.goto('/');
  const m = await (await page.request.get('manifest.webmanifest')).json();
  expect(m.name).toBe('Kreidebox');
  expect(m.display).toBe('standalone');
  expect(m.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(m.theme_color).toBe('#1F6B5E');
});

test('Einzeldatei (file://) läuft ohne Fehler und speichert', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(FILE_URL);
  await expect(page.getByRole('heading', { name: 'Meine Bildschirme' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Datenschutz' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Neues Deck' }).click();
  await expect(page).toHaveURL(/#\/deck\//);
  expect(errors).toEqual([]);
});

// ---------- KI-Format (Claude / ChatGPT) ----------
import { readFileSync } from 'node:fs';
const DOC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../ki-format.md'), 'utf8');

async function pasteAndCreate(page, text) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Von KI einfügen' }).click();
  await page.getByLabel(/Text oder Link/).fill(text);
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByRole('dialog').getByText('Aus KI übernehmen')).toBeVisible();
  return page.getByRole('dialog').getByRole('button', { name: 'Anlegen' });
}

test('KI: Beispiel aus der Anleitung wird eingefügt, geprüft und angelegt', async ({ page }) => {
  const errors = watchErrors(page);
  const example = DOC.match(/```json\n([\s\S]*?)```/)[1];
  const create = await pasteAndCreate(page, '```json\n' + example + '\n```');
  await expect(page.getByRole('dialog')).toContainText('Stillarbeit Mathe');
  await expect(page.getByRole('dialog')).toContainText('Text, Arbeitsform, Timer, Ampel');
  await create.click();
  await expect(page).toHaveURL(/#\/deck\//);
  await expect(page.locator('.stage')).toContainText('Aufgabe 3 bis 6 im Mathebuch');
  expect(errors).toEqual([]);
});

test('KI: Abbrechen legt nichts an', async ({ page }) => {
  await pasteAndCreate(page, JSON.stringify({ kreidebox: 1, name: 'Nur Test', screens: [{ widgets: [{ type: 'clock' }] }] }));
  await page.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(page.getByRole('heading', { name: 'Hier liegt noch nichts' }).or(page.getByText('Nur Test'))).toBeVisible();
  await expect(page.getByText('Nur Test')).toHaveCount(0);
});

test('KI: Link (#/ki?d=…) zeigt Vorschau und legt erst nach Klick an', async ({ page }) => {
  const spec = { kreidebox: 1, name: 'Per Link', screens: [{ name: 'A', widgets: [{ type: 'timer', minutes: 3 }, { type: 'randomizer', names: ['Anna', 'Ben'] }] }] };
  await page.goto('/#/ki?d=' + Buffer.from(JSON.stringify(spec)).toString('base64url'));
  await expect(page.getByRole('dialog')).toContainText('Per Link');
  await page.getByRole('dialog').getByRole('button', { name: 'Anlegen' }).click();
  await expect(page).toHaveURL(/#\/deck\//);
  await expect(page.locator('.stage')).toContainText('0 von 2 gezogen');
});

test('KI: kaputter Link zeigt eine Meldung, keinen Absturz', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/#/ki?d=AAAA');
  await expect(page.getByText('Der Link konnte nicht gelesen werden')).toBeVisible();
  expect(errors).toEqual([]);
});

test('KI: Sicherheit – Skript-Text bleibt Text, javascript:-Adresse und Bild/Einbetten werden entfernt', async ({ page }) => {
  let alerted = false;
  page.on('dialog', (d) => { if (d.type() === 'alert') alerted = true; d.dismiss(); });
  const spec = { kreidebox: 1, name: 'Böse', screens: [{ widgets: [
    { type: 'text', text: '<img src=x onerror=alert(1)>', state: { html: '<img src=x onerror=alert(2)>' } },
    { type: 'hyperlink', url: 'javascript:alert(3)', label: 'Klick' },
    { type: 'image' }, { type: 'embed', settings: { code: '<iframe src="https://example.com"></iframe>' } },
    { type: 'trafficlight', settings: { __proto__: { polluted: 1 }, constructor: 1 } },
  ] }] };
  const create = await pasteAndCreate(page, JSON.stringify(spec));
  await expect(page.getByRole('dialog')).toContainText('Text, Link, Ampel');
  await create.click();
  await expect(page).toHaveURL(/#\/deck\//);
  await expect(page.locator('.stage img[src="x"]')).toHaveCount(0);
  await expect(page.locator('.stage')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.stage iframe')).toHaveCount(0);
  const href = await page.locator('.stage a').first().getAttribute('href').catch(() => null);
  expect(href || '').not.toMatch(/javascript:/i);
  expect(await page.evaluate(() => ({}).polluted)).toBeUndefined();
  expect(alerted).toBe(false);
});

test('KI: .kreidebox.json-Datei im KI-Format lässt sich importieren', async ({ page }) => {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importieren', exact: true }).click()]);
  await chooser.setFiles({ name: 'ki.kreidebox.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ kreidebox: 1, name: 'Aus Datei', screens: [{ widgets: [{ type: 'dice' }] }] })) });
  await expect(page.getByText('Aus Datei')).toBeVisible();
});

