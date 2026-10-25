// Export / import as a file (.kreidebox.json): whole decks or single screens, with images and (optionally) name lists.
import { get, getAll, put } from './db.js';
import { uid, getDeck, saveDeck, SCHEMA_VERSION, setLastBackupAt } from './store.js';
import { getUpload, putUploadRecord } from './uploads.js';
import { getNameList } from './namelists.js';

export const FORMAT = 'kreidebox-export';
const LEGACY_FORMATS = ['nachbau-export'];
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- references inside widgets / backgrounds ----------
function uploadRefs(screen) {
  const ids = [];
  if (screen.background && (screen.background.type === 'upload')) ids.push(screen.background.value);
  if (screen.background && screen.background.type === 'slideshow') ids.push(...(screen.background.value.uploadIds || []));
  for (const w of screen.widgets || []) collectWidgetUploads(w, ids);
  return ids;
}
function collectWidgetUploads(w, ids) {
  if (w.settings && w.settings.uploadId) ids.push(w.settings.uploadId);
  if (w.settings && Array.isArray(w.settings.items)) for (const it of w.settings.items) if (it.uploadId) ids.push(it.uploadId);
}
function themeRefs(widgets) {
  return widgets.map((w) => w.themeId).filter((t) => t && t.startsWith('custom:')).map((t) => t.slice(7));
}
async function packThemes(ids) {
  const out = [];
  for (const id of [...new Set(ids)]) { const t = await get('themes', id); if (t) out.push(clone(t)); }
  return out;
}
function listRefs(widgets) {
  return widgets.map((w) => w.settings && w.settings.listId).filter(Boolean);
}

async function blobToDataUrl(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
}
async function dataUrlToBlob(dataUrl) { return (await fetch(dataUrl)).blob(); }

async function packUploads(ids) {
  const out = [];
  for (const id of [...new Set(ids)]) {
    const u = await getUpload(id);
    if (u) out.push({ id: u.id, kind: u.kind, name: u.name, mime: u.mime, data: await blobToDataUrl(u.blob) });
  }
  return out;
}

async function packLists(ids) {
  const out = [];
  for (const id of [...new Set(ids)]) { const l = await getNameList(id); if (l) out.push(clone(l)); }
  return out;
}

function download(obj, filename) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return blob.size;
}

// File names: ASCII only (some browsers drop names with umlauts or dashes and save as "download")
const UML = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss', '–': '-', '—': '-', '«': '', '»': '' };
const safe = (s) => String(s || 'export').replace(/[äöüÄÖÜß–—«»]/g, (c) => UML[c]).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7E]/g, '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60) || 'export';
const stamp = () => new Date().toISOString().slice(0, 10);

// ---------- export ----------
export async function exportDecks(ids, { includeNameLists = true, filename } = {}) {
  const decks = [];
  for (const id of ids) { const d = await getDeck(id); if (d) decks.push(clone(d)); }
  const screens = decks.flatMap((d) => d.screens);
  const widgets = decks.flatMap((d) => [...d.pinnedWidgets, ...d.screens.flatMap((s) => s.widgets)]);
  const up = screens.flatMap(uploadRefs);
  decks.forEach((d) => d.pinnedWidgets.forEach((w) => collectWidgetUploads(w, up)));
  const file = {
    format: FORMAT, version: SCHEMA_VERSION, kind: 'decks', exportedAt: new Date().toISOString(),
    decks, uploads: await packUploads(up), nameLists: includeNameLists ? await packLists(listRefs(widgets)) : [], themes: await packThemes(themeRefs(widgets)),
  };
  const name = filename || (decks.length === 1 ? `${safe(decks[0].name)} ${stamp()}.kreidebox.json` : `Sicherung ${stamp()}.kreidebox.json`);
  return { bytes: download(file, name), count: decks.length };
}

// Everything: all decks + all name lists + all referenced uploads. Marks the backup time.
export async function exportAll() {
  const decks = (await getAll('decks')).filter((d) => !d.deletedAt);
  const lists = (await getAll('nameLists')).filter((l) => !l.deletedAt);
  const up = decks.flatMap((d) => d.screens.flatMap(uploadRefs));
  decks.forEach((d) => d.pinnedWidgets.forEach((w) => collectWidgetUploads(w, up)));
  const bg = (await getAll('uploads')).filter((u) => u.kind === 'background').map((u) => u.id); // keep the background library too
  const templates = await getAll('templates');
  templates.forEach((t) => up.push(...uploadRefs(t.screen)));
  const file = { format: FORMAT, version: SCHEMA_VERSION, kind: 'decks', exportedAt: new Date().toISOString(),
    decks, uploads: await packUploads([...up, ...bg]), nameLists: lists, themes: await getAll('themes'), templates, folders: await getAll('folders') };
  const bytes = download(file, `Sicherung ${stamp()}.kreidebox.json`);
  setLastBackupAt(new Date().toISOString());
  return { bytes, count: decks.length, lists: lists.length };
}

// One or more screens of a deck. Pinned widgets are copied into each screen so nothing is missing.
export async function exportScreens(deckId, screenIds, { includeNameLists = true } = {}) {
  const d = await getDeck(deckId);
  if (!d) throw new Error('Deck nicht gefunden');
  const screens = d.screens.filter((s) => screenIds.includes(s.id)).map((s) => {
    const c = clone(s);
    c.widgets = [...clone(d.pinnedWidgets), ...c.widgets];
    return c;
  });
  const widgets = screens.flatMap((s) => s.widgets);
  const file = { format: FORMAT, version: SCHEMA_VERSION, kind: 'screens', exportedAt: new Date().toISOString(),
    deckName: d.name, aspectRatio: d.aspectRatio, screens,
    uploads: await packUploads(screens.flatMap(uploadRefs)), nameLists: includeNameLists ? await packLists(listRefs(widgets)) : [], themes: await packThemes(themeRefs(widgets)) };
  const label = screens.length === 1 ? `${safe(d.name)} - Bildschirm ${d.screens.findIndex((s) => s.id === screens[0].id) + 1}` : `${safe(d.name)} - ${screens.length} Bildschirme`;
  return { bytes: download(file, `${label} ${stamp()}.kreidebox.json`), count: screens.length };
}

// ---------- import ----------
export async function readFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('Die Datei ist keine gültige Sicherung.'); }
  if (!data || (data.format !== FORMAT && !LEGACY_FORMATS.includes(data.format))) throw new Error('Die Datei stammt nicht aus dieser App.');
  if (data.version > SCHEMA_VERSION) throw new Error('Die Datei stammt aus einer neueren Version. Bitte die App aktualisieren.');
  return data;
}

async function importSideData(data) {
  const uploadMap = new Map();
  for (const u of data.uploads || []) {
    const id = uid();
    const blob = await dataUrlToBlob(u.data);
    await putUploadRecord({ id, kind: u.kind, name: u.name, mime: u.mime, bytes: blob.size, blob, starred: false, createdAt: new Date().toISOString() });
    uploadMap.set(u.id, id);
  }
  const listMap = new Map();
  const existing = (await getAll('nameLists')).filter((l) => !l.deletedAt);
  for (const l of data.nameLists || []) {
    // same name and same students -> reuse the existing list instead of duplicating it
    const same = existing.find((e) => e.name === l.name && e.students.map((s) => s.name).join('\n') === l.students.map((s) => s.name).join('\n'));
    if (same) { listMap.set(l.id, same.id); continue; }
    const studentMap = new Map();
    const copy = { ...clone(l), id: uid(), isDefault: false, deletedAt: null,
      name: existing.some((e) => e.name === l.name) ? `${l.name} (importiert)` : l.name };
    copy.students = l.students.map((s) => { const nid = uid(); studentMap.set(s.id, nid); return { id: nid, name: s.name }; });
    copy.pairing = (l.pairing || []).map((p) => ({ ...p, a: studentMap.get(p.a), b: studentMap.get(p.b) })).filter((p) => p.a && p.b);
    await put('nameLists', copy);
    listMap.set(l.id, copy.id);
  }
  const themeMap = new Map();
  const haveThemes = await getAll('themes');
  for (const t of data.themes || []) {
    const same = haveThemes.find((e) => e.bg === t.bg && e.text === t.text && e.accent === t.accent);
    if (same) { themeMap.set(t.id, same.id); continue; }
    const nid = uid(); await put('themes', { ...t, id: nid }); themeMap.set(t.id, nid);
  }
  const folderMap = new Map();
  const haveFolders = await getAll('folders');
  for (const f of data.folders || []) {
    const same = haveFolders.find((e) => e.name === f.name);
    if (same) { folderMap.set(f.id, same.id); continue; }
    const nid = uid(); await put('folders', { ...f, id: nid }); folderMap.set(f.id, nid);
  }
  return { uploadMap, listMap, themeMap, folderMap };
}

function remapScreen(s, uploadMap, listMap) {
  s.id = uid();
  if (s.background && s.background.type === 'upload') s.background.value = uploadMap.get(s.background.value) || s.background.value;
  if (s.background && s.background.type === 'slideshow') s.background.value.uploadIds = (s.background.value.uploadIds || []).map((id) => uploadMap.get(id) || id);
  s.widgets.forEach((w) => remapWidget(w, uploadMap, listMap));
  return s;
}
let themeMapCur = new Map();
function remapWidget(w, uploadMap, listMap) {
  w.id = uid();
  if (w.themeId && w.themeId.startsWith('custom:')) { const n = themeMapCur.get(w.themeId.slice(7)); if (n) w.themeId = 'custom:' + n; }
  if (w.settings && w.settings.uploadId) w.settings.uploadId = uploadMap.get(w.settings.uploadId) || w.settings.uploadId;
  if (w.settings && Array.isArray(w.settings.items)) w.settings.items.forEach((it) => { if (it.uploadId) it.uploadId = uploadMap.get(it.uploadId) || it.uploadId; });
  if (w.settings && w.settings.listId) w.settings.listId = listMap.get(w.settings.listId) || w.settings.listId;
  if (w.state && 'drawn' in w.state) w.state.drawn = [];
  return w;
}

// Imports a file. Decks come in as new decks. Screens go into targetDeckId after position (or into a new deck).
export async function importFile(file, { targetDeckId, afterIndex } = {}) {
  const data = await readFile(file);
  const { uploadMap, listMap, themeMap, folderMap } = await importSideData(data);
  themeMapCur = themeMap;
  // own templates come along with a full backup
  const haveT = await getAll('templates');
  for (const t of data.templates || []) {
    if (haveT.some((e) => e.name === t.name && JSON.stringify(e.screen.widgets.map((w) => w.type)) === JSON.stringify(t.screen.widgets.map((w) => w.type)))) continue;
    const copy = clone(t); copy.id = uid(); remapScreen(copy.screen, uploadMap, listMap); await put('templates', copy);
  }
  const t = new Date().toISOString();
  if (data.kind === 'decks') {
    const created = [];
    for (const d of data.decks || []) {
      const copy = clone(d);
      Object.assign(copy, { id: uid(), createdAt: t, updatedAt: t, deletedAt: null, pinnedOnDashboard: false, folderId: copy.folderId ? (folderMap.get(copy.folderId) || null) : null });
      copy.screens.forEach((s) => remapScreen(s, uploadMap, listMap));
      copy.pinnedWidgets.forEach((w) => remapWidget(w, uploadMap, listMap));
      await put('decks', copy);
      created.push(copy);
    }
    return { kind: 'decks', decks: created, lists: listMap.size, images: uploadMap.size };
  }
  if (data.kind === 'screens') {
    const screens = (data.screens || []).map((s) => remapScreen(clone(s), uploadMap, listMap));
    if (targetDeckId) {
      const deck = await getDeck(targetDeckId);
      if (!deck) throw new Error('Ziel-Deck nicht gefunden');
      const at = afterIndex == null ? deck.screens.length : afterIndex + 1;
      deck.screens.splice(at, 0, ...screens);
      await saveDeck(deck);
      return { kind: 'screens', deck, at, count: screens.length, lists: listMap.size, images: uploadMap.size };
    }
    const deck = { id: uid(), schemaVersion: SCHEMA_VERSION, name: data.deckName ? `${data.deckName} (importiert)` : 'Importierte Bildschirme', color: null, folderId: null,
      aspectRatio: data.aspectRatio || '16:9', pinnedOnDashboard: false, archived: false, pinnedWidgets: [], screens, createdAt: t, updatedAt: t, deletedAt: null };
    await put('decks', deck);
    return { kind: 'screens', deck, at: 0, count: screens.length, lists: listMap.size, images: uploadMap.size, newDeck: true };
  }
  throw new Error('Unbekannter Dateiinhalt.');
}

export function pickImportFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.addEventListener('change', () => resolve(input.files && input.files[0] ? input.files[0] : null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
