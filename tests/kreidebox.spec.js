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
