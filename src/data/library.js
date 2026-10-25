// Folders, own templates and own colour themes. All local (IndexedDB).
import { get, getAll, put, del } from './db.js';
import { uid, getDeck, saveDeck, SCHEMA_VERSION } from './store.js';

const now = () => new Date().toISOString();
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- folders ----------
export async function listFolders() {
  return (await getAll('folders')).sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name, 'de'));
}
export async function createFolder(name) {
  const all = await listFolders();
  const f = { id: uid(), name: name.trim() || 'Neuer Ordner', sort: all.length, createdAt: now() };
  await put('folders', f); return f;
}
export async function renameFolder(id, name) { const f = await get('folders', id); if (f) { f.name = name.trim() || f.name; await put('folders', f); } }
export async function deleteFolder(id) {
  // decks inside stay, they just leave the folder
  for (const d of await getAll('decks')) if (d.folderId === id) { d.folderId = null; await put('decks', d); }
  await del('folders', id);
}
export async function moveDeckToFolder(deckId, folderId) {
  const d = await getDeck(deckId); if (!d) return;
  d.folderId = folderId || null; await saveDeck(d);
}

// ---------- templates (a saved screen) ----------
export async function listTemplates() {
  return (await getAll('templates')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function saveTemplate(name, screen, pinnedWidgets = []) {
  const s = clone(screen);
  s.widgets = [...clone(pinnedWidgets), ...s.widgets];
  const t = { id: uid(), name: name.trim() || 'Vorlage', screen: s, createdAt: now() };
  await put('templates', t); return t;
}
export async function renameTemplate(id, name) { const t = await get('templates', id); if (t) { t.name = name.trim() || t.name; await put('templates', t); } }
export const deleteTemplate = (id) => del('templates', id);
export const getTemplate = (id) => get('templates', id);

// A fresh copy of the template screen with new ids (and reset running state)
export function screenFromTemplate(t) {
  const s = clone(t.screen);
  s.id = uid();
  s.widgets.forEach((w) => {
    w.id = uid(); w.groupId = null;
    if (w.state && 'endsAt' in w.state) Object.assign(w.state, { endsAt: null, pausedRemainingMs: null, done: false, repeatsLeft: null });
    if (w.state && 'drawn' in w.state) w.state.drawn = [];
  });
  return s;
}
export async function deckFromTemplate(id) {
  const t = await getTemplate(id); if (!t) return null;
  const tm = now();
  const deck = { id: uid(), schemaVersion: SCHEMA_VERSION, name: t.name, color: null, folderId: null, aspectRatio: '16:9', pinnedOnDashboard: false, archived: false,
    pinnedWidgets: [], screens: [screenFromTemplate(t)], createdAt: tm, updatedAt: tm, deletedAt: null };
  await put('decks', deck); return deck;
}

// ---------- own colour themes ----------
const themeCache = new Map();
export async function loadThemes() {
  themeCache.clear();
  for (const t of await getAll('themes')) themeCache.set(t.id, t);
  return [...themeCache.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export const cachedThemes = () => [...themeCache.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
export const cachedTheme = (id) => themeCache.get(id);
export async function saveTheme(theme) {
  const t = { id: theme.id || uid(), name: theme.name || 'Eigenes Thema', bg: theme.bg, text: theme.text, accent: theme.accent, createdAt: theme.createdAt || now() };
  await put('themes', t); themeCache.set(t.id, t); return t;
}
export async function deleteTheme(id) { await del('themes', id); themeCache.delete(id); }

// contrast helpers (WCAG 2)
function lum(hex) {
  const n = hex.replace('#', ''); const v = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
export function contrast(a, b) { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
