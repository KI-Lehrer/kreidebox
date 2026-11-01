// Abgleich mit dem Konto (optional). Ohne Konto oder ohne Server (z. B. file://) passiert nichts.
// Regeln: Der Server speichert nie Namen von Kindern; beim Abgleich bleiben die lokalen Namen erhalten (gleiche Widget-ID).
// Bei Konflikt gewinnt die neuere Fassung; die unterlegene bleibt als «Kopie» erhalten, nichts geht verloren.
import { getAll, get, put } from './db.js';
import { uid } from './store.js';
import { looksLikeAiSpec, deckFromAiSpec } from './aispec.js';

const KEY = 'kreidebox.sync';
const NAME_TYPES = new Set(['randomizer', 'groupmaker']);
const lsGet = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const lsSet = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* blockiert: dann gleicht diese Sitzung ohne Gedächtnis ab */ } };

let status = { available: false, email: null, state: 'idle', at: null, error: null };
const emit = () => dispatchEvent(new CustomEvent('kreidebox:sync', { detail: { ...status } }));
export const getSyncStatus = () => ({ ...status });
const set = (patch) => { status = { ...status, ...patch }; emit(); };

async function api(path, init = {}) {
  const r = await fetch('/api' + path, { credentials: 'same-origin', ...init, headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) } });
  let data = null; try { data = await r.json(); } catch { /* leer */ }
  return { ok: r.ok, status: r.status, data };
}

async function detect() {
  if (!/^https?:$/.test(location.protocol)) return false;
  try { const h = await api('/health'); if (!h.ok) return false; } catch { return false; }
  return true;
}
async function currentUser() {
  const r = await fetch('/api/auth/get-session', { credentials: 'same-origin' }).catch(() => null);
  if (!r || !r.ok) return null;
  const s = await r.json().catch(() => null);
  return s && s.user ? { email: s.user.email, id: s.user.id } : null;
}

// Lokale Namen und Zustand der Namens-Widgets zurück in die vom Server geholte Fassung kopieren.
function mergeLocalNames(remoteDeck, localDeck) {
  if (!localDeck) return;
  const byId = new Map();
  for (const s of localDeck.screens || []) for (const w of s.widgets || []) byId.set(w.id, w);
  for (const w of localDeck.pinnedWidgets || []) byId.set(w.id, w);
  const apply = (w) => {
    const l = byId.get(w.id);
    if (!l || !NAME_TYPES.has(w.type) || l.type !== w.type) return;
    w.settings = { ...w.settings, localNames: l.settings.localNames || [], absent: l.settings.absent || [], listId: l.settings.listId };
    w.state = l.state;
  };
  for (const s of remoteDeck.screens || []) for (const w of s.widgets || []) apply(w);
  for (const w of remoteDeck.pinnedWidgets || []) apply(w);
}

async function pull(id, remoteMeta, local, st) {
  const r = await api('/decks/' + encodeURIComponent(id));
  if (!r.ok) throw new Error('Deck konnte nicht geladen werden');
  let deck = r.data.data;
  const fromAi = looksLikeAiSpec(deck);
  if (fromAi) deck = deckFromAiSpec(deck).deck;
  deck.id = id;
  deck.name = r.data.name || deck.name;
  deck.schemaVersion = deck.schemaVersion || 1;
  deck.pinnedWidgets = deck.pinnedWidgets || [];
  deck.folderId = local ? local.folderId || null : null;
  deck.pinnedOnDashboard = local ? !!local.pinnedOnDashboard : false;
  deck.archived = local ? !!local.archived : false;
  deck.deletedAt = null;
  deck.createdAt = local ? local.createdAt : (r.data.updated_at || new Date().toISOString());
  deck.updatedAt = new Date(r.data.updated_at).toISOString();
  mergeLocalNames(deck, local);
  await put('decks', deck);
  st.revs[id] = r.data.rev; st.pushed[id] = deck.updatedAt;
  return { fromAi, deck };
}

async function push(deck, st) {
  const baseRev = st.revs[deck.id] ?? null;
  const r = await api('/decks/' + encodeURIComponent(deck.id), { method: 'PUT', body: JSON.stringify({ data: deck, baseRev }) });
  if (r.status === 409) return { conflict: true };
  if (!r.ok) throw Object.assign(new Error((r.data && r.data.error) || 'Speichern fehlgeschlagen'), { status: r.status });
  st.revs[deck.id] = r.data.rev; st.pushed[deck.id] = deck.updatedAt;
  return { ok: true };
}

let running = false, again = false;
export async function syncNow() {
  if (!status.available) return;
  if (running) { again = true; return; }
  running = true;
  try {
    const user = await currentUser();
    if (!user) { set({ email: null, state: 'signedout' }); return; }
    let st = lsGet();
    if (st.userId !== user.id) st = { userId: user.id, revs: {}, pushed: {} };
    st.revs = st.revs || {}; st.pushed = st.pushed || {};
    set({ email: user.email, state: 'syncing', error: null });

    const list = await api('/decks');
    if (!list.ok) throw new Error('Abgleich nicht möglich');
    const remote = new Map(list.data.decks.map((d) => [d.id, d]));
    const locals = new Map((await getAll('decks')).map((d) => [d.id, d]));
    let pulledAi = 0, changed = false;

    for (const [id, r] of remote) {
      const l = locals.get(id);
      const known = st.revs[id];
      const localChanged = l && !l.deletedAt && (st.pushed[id] == null || l.updatedAt > st.pushed[id]);
      const remoteChanged = known == null || r.rev !== known;
      if (r.deleted_at) {
        if (l && !l.deletedAt && remoteChanged && !localChanged) { l.deletedAt = r.deleted_at; await put('decks', l); changed = true; }
        st.revs[id] = r.rev; st.pushed[id] = l ? l.updatedAt : null;
        if (l && !l.deletedAt && localChanged) { st.revs[id] = r.rev; const p = await push(l, st); if (p.ok) changed = true; }
        continue;
      }
      if (!l) { const p = await pull(id, r, null, st); pulledAi += p.fromAi ? 1 : 0; changed = true; if (p.fromAi) { await push(p.deck, st); } continue; }
      if (l.deletedAt) {
        if (remoteChanged && st.revs[id] != null) { /* anderswo geändert: lokaler Papierkorb bleibt, nichts tun */ }
        else if (!r.deleted_at) { const d = await api('/decks/' + encodeURIComponent(id), { method: 'DELETE' }); if (d.ok) { st.revs[id] = d.data.rev; st.pushed[id] = l.updatedAt; } }
        continue;
      }
      if (remoteChanged && localChanged) {
        const remoteNewer = Date.parse(r.updated_at) > Date.parse(l.updatedAt);
        if (remoteNewer) { // lokale Fassung als Kopie behalten, Server-Fassung übernehmen
          const copy = JSON.parse(JSON.stringify(l)); copy.id = uid(); copy.name = `${l.name} (Kopie von diesem Gerät)`;
          copy.screens.forEach((s) => { s.id = uid(); s.widgets.forEach((w) => { w.id = uid(); }); }); copy.pinnedWidgets.forEach((w) => { w.id = uid(); });
          await put('decks', copy);
          await pull(id, r, l, st); changed = true;
        } else { st.revs[id] = r.rev; const p = await push(l, st); if (p.ok) changed = true; }
      } else if (remoteChanged) {
        const p = await pull(id, r, l, st); pulledAi += p.fromAi ? 1 : 0; changed = true;
        if (p.fromAi) await push(p.deck, st);
      } else if (localChanged) {
        const p = await push(l, st);
        if (p.conflict) { st.revs[id] = undefined; } else changed = true;
      }
    }
    for (const [id, l] of locals) {
      if (remote.has(id) || l.deletedAt) continue;
      try { await push(l, st); } catch (e) { if (e.status !== 413) throw e; /* zu gross: bleibt nur lokal */ }
    }
    lsSet(st);
    set({ state: 'ok', at: new Date().toISOString() });
    if (changed) dispatchEvent(new CustomEvent('kreidebox:synced', { detail: { pulledAi } }));
  } catch (e) {
    set({ state: 'error', error: e.message || 'Abgleich fehlgeschlagen' });
  } finally {
    running = false;
    if (again) { again = false; setTimeout(syncNow, 500); }
  }
}

let timer;
const later = () => { clearTimeout(timer); timer = setTimeout(syncNow, 4000); };

export async function initSync() {
  if (!(await detect())) return;
  set({ available: true });
  addEventListener('kreidebox:saved', later);
  addEventListener('online', syncNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  await syncNow();
}
