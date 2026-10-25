// Name lists (S12): used by the randomizer and the group maker. Stay on this computer only.
import { get, getAll, put } from './db.js';
import { uid } from './store.js';

const now = () => new Date().toISOString();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('nachbau-lists') : null;
const subs = new Set();
if (channel) channel.onmessage = () => subs.forEach((fn) => fn());
export function onListsChange(fn) { subs.add(fn); return () => subs.delete(fn); }
const notify = () => { subs.forEach((fn) => fn()); if (channel) channel.postMessage('x'); };

export function parseNames(text) {
  const seen = new Set();
  return String(text || '').split(/\r?\n|;|\t/).map((s) => s.trim()).filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
}

export async function listNameLists() {
  return (await getAll('nameLists')).filter((l) => !l.deletedAt).sort((a, b) => (b.isDefault - a.isDefault) || a.name.localeCompare(b.name, 'de'));
}

export async function getNameList(id) {
  const l = id && await get('nameLists', id);
  return l && !l.deletedAt ? l : null;
}

export async function getDefaultList() {
  return (await listNameLists()).find((l) => l.isDefault) || null;
}

export async function createNameList(name, names) {
  const t = now();
  const all = await listNameLists();
  const list = { id: uid(), name: name || 'Neue Liste', isDefault: all.length === 0,
    students: names.map((n) => ({ id: uid(), name: n })), pairing: [], createdAt: t, updatedAt: t, deletedAt: null };
  await put('nameLists', list); notify();
  return list;
}

export async function saveNameList(list) {
  list.updatedAt = now();
  const ids = new Set(list.students.map((s) => s.id));
  list.pairing = list.pairing.filter((p) => ids.has(p.a) && ids.has(p.b) && p.a !== p.b);
  await put('nameLists', list); notify();
  return list;
}

// Replaces the names but keeps ids (and pairing rules) of names that stay
export function applyNames(list, names) {
  const byName = new Map(list.students.map((s) => [s.name.toLowerCase(), s]));
  list.students = names.map((n) => byName.get(n.toLowerCase()) || { id: uid(), name: n });
  return list;
}

export async function deleteNameList(id) {
  const l = await get('nameLists', id);
  if (!l) return;
  l.deletedAt = now(); l.isDefault = false;
  await put('nameLists', l); notify();
}

export async function restoreNameList(id) {
  const l = await get('nameLists', id);
  if (!l) return;
  l.deletedAt = null;
  await put('nameLists', l); notify();
}

export async function setDefaultList(id) {
  const all = await listNameLists();
  for (const l of all) {
    const want = l.id === id && !l.isDefault;
    if (l.isDefault !== want) { l.isDefault = want; await put('nameLists', l); }
  }
  notify();
}

export const SUGGESTIONS = {
  'Zahlen 1–30': Array.from({ length: 30 }, (_, i) => String(i + 1)),
  'Alphabet': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  'Tiere': ['Bär', 'Biber', 'Dachs', 'Eichhörnchen', 'Eule', 'Fuchs', 'Gämse', 'Hase', 'Igel', 'Luchs', 'Murmeltier', 'Reh', 'Steinbock', 'Wolf'],
  'Früchte': ['Apfel', 'Aprikose', 'Birne', 'Brombeere', 'Erdbeere', 'Heidelbeere', 'Himbeere', 'Kirsche', 'Pflaume', 'Traube', 'Zwetschge'],
  'Wochentage': ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'],
};
