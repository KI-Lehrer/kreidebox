// The only module that touches storage. Screens and widgets go through these functions.
import { get, getAll, put, del } from './db.js';

export const SCHEMA_VERSION = 1;
const TRASH_DAYS = 30;
const LS = {
  settings: 'nachbau.settings',
  widgetDefaults: 'nachbau.widgetDefaults',
  lastOpen: 'nachbau.lastOpen',
  lastBackupAt: 'nachbau.lastBackupAt',
};

const now = () => new Date().toISOString();
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

// ---------- change notification across tabs ----------
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('nachbau') : null;
const listeners = new Set();
export const tabId = uid();
if (channel) channel.onmessage = (e) => { if (e.data && e.data.from !== tabId) listeners.forEach((fn) => fn(e.data)); };
export function onExternalChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const announce = (msg) => { if (channel) channel.postMessage({ ...msg, from: tabId }); };

// ---------- decks ----------
export const DEFAULT_BACKGROUND = { type: 'gradient', value: ['#CFE0F0', '#F3E3CF'] };

export function newScreen(background) {
  return { id: uid(), name: '', background: clone(background || DEFAULT_BACKGROUND), widgets: [] };
}

export async function createDeck({ name } = {}) {
  const t = now();
  const deck = {
    id: uid(), schemaVersion: SCHEMA_VERSION, name: name || 'Neues Deck', color: null, folderId: null,
    aspectRatio: '16:9', pinnedOnDashboard: false, archived: false, pinnedWidgets: [],
    screens: [newScreen()], createdAt: t, updatedAt: t, deletedAt: null,
  };
  await put('decks', deck);
  announce({ type: 'deck', id: deck.id });
  return deck;
}

export async function getDeck(id) {
  const deck = await get('decks', id);
  return deck && !deck.deletedAt ? deck : null;
}

export async function saveDeck(deck) {
  deck.updatedAt = now();
  await put('decks', deck);
  announce({ type: 'deck', id: deck.id, updatedAt: deck.updatedAt });
  return deck.updatedAt;
}

export async function listDecks({ includeArchived = true } = {}) {
  const all = await getAll('decks');
  return all
    .filter((d) => !d.deletedAt && (includeArchived || !d.archived))
    .sort((a, b) => (b.pinnedOnDashboard - a.pinnedOnDashboard) || b.updatedAt.localeCompare(a.updatedAt))
    .map((d) => ({
      id: d.id, name: d.name, updatedAt: d.updatedAt, archived: d.archived, pinned: d.pinnedOnDashboard, folderId: d.folderId || null,
      screenCount: d.screens.length, preview: d.screens[0],
    }));
}

export async function renameDeck(id, name) {
  const deck = await get('decks', id);
  if (!deck) return;
  deck.name = name.trim() || deck.name;
  return saveDeck(deck);
}

export async function duplicateDeck(id) {
  const src = await get('decks', id);
  if (!src) return null;
  const t = now();
  const copy = clone(src);
  copy.id = uid();
  copy.name = src.name + ' (Kopie)';
  copy.createdAt = t; copy.updatedAt = t; copy.deletedAt = null; copy.pinnedOnDashboard = false;
  copy.screens.forEach((s) => { s.id = uid(); s.widgets.forEach((w) => { w.id = uid(); }); });
  copy.pinnedWidgets.forEach((w) => { w.id = uid(); });
  await put('decks', copy);
  announce({ type: 'deck', id: copy.id });
  return copy;
}

export async function deleteDeck(id) {
  const deck = await get('decks', id);
  if (!deck) return;
  deck.deletedAt = now();
  await put('decks', deck);
  announce({ type: 'deck', id });
}

export async function restoreDeck(id) {
  const deck = await get('decks', id);
  if (!deck) return;
  deck.deletedAt = null;
  await saveDeck(deck);
}

export async function listTrash() {
  return (await getAll('decks')).filter((d) => d.deletedAt).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export async function purgeTrash() {
  const limit = Date.now() - TRASH_DAYS * 864e5;
  const old = (await listTrash()).filter((d) => Date.parse(d.deletedAt) < limit);
  for (const d of old) await del('decks', d.id);
  return old.length;
}

// ---------- small settings in localStorage (may be unavailable: private mode) ----------
function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked: keep working in memory */ }
}

const DEFAULT_SETTINGS = { language: 'de-CH', timeFormat: '24h', darkMode: false, shortcutsEnabled: true, welcomeHidden: false };
export const getSettings = () => ({ ...DEFAULT_SETTINGS, ...lsGet(LS.settings, {}) });
export const setSettings = (patch) => lsSet(LS.settings, { ...getSettings(), ...patch });
export const getWidgetDefaults = (type) => lsGet(LS.widgetDefaults, {})[type] || {};
export function setWidgetDefaults(type, patch) {
  const all = lsGet(LS.widgetDefaults, {});
  all[type] = { ...(all[type] || {}), ...patch };
  lsSet(LS.widgetDefaults, all);
}
export const getLastOpen = () => lsGet(LS.lastOpen, null);
export const setLastOpen = (v) => lsSet(LS.lastOpen, v);
export const getLastBackupAt = () => lsGet(LS.lastBackupAt, null);
export const setLastBackupAt = (iso) => lsSet(LS.lastBackupAt, iso);

// ---------- storage health ----------
export async function requestPersistence() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch { return false; }
}

export async function storageStatus() {
  let usage = null; let persisted = false;
  try { if (navigator.storage && navigator.storage.estimate) usage = (await navigator.storage.estimate()).usage; } catch { /* ignore */ }
  try { if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); } catch { /* ignore */ }
  return { usage, persisted, lastBackupAt: getLastBackupAt() };
}

export async function init() {
  await requestPersistence();
  try { await purgeTrash(); } catch { /* not critical */ }
}
