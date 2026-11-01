// KI-Format: ein schlanker Text (JSON), den Claude, ChatGPT oder ein Mensch schreiben kann. Wird hier streng geprüft
// und in ein normales Deck umgewandelt. Alles, was nicht in der Liste steht, wird verworfen (siehe docs/ki-format.md).
import { WIDGETS } from '../widgets/registry.js';
import { THEMES } from '../widgets/themes.js';
import { uid, newScreen, SCHEMA_VERSION } from './store.js';

export const AI_VERSION = 1;
const MAX_JSON = 200000, MAX_SCREENS = 30, MAX_WIDGETS = 30, MAX_STR = 2000, MAX_ARR = 200;
// Nicht per Text erstellbar: brauchen eine hochgeladene Datei oder laden fremden Code.
const BLOCKED = { image: 'braucht ein hochgeladenes Bild', pdf: 'braucht eine hochgeladene Datei', embed: 'Einbetten wird nicht aus Text erstellt' };
const HEX = /^#[0-9a-fA-F]{6}$/;
const THEME_KEYS = new Set(THEMES.map((t) => t.key).concat('transparent'));
const STAGE = { '16:9': [1920, 1080], '4:3': [1440, 1080] };
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);

export const looksLikeAiSpec = (d) => isObj(d) && d.kreidebox != null;

function cleanStr(s, key) {
  let v = String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, MAX_STR);
  if (/^(url|href|src|link)$/i.test(key || '') && v && !/^https:\/\//i.test(v)) v = '';
  return v;
}
// Kopiert Werte, deren Form zum Standardwert passt; sonst weglassen.
function mergeInto(base, given, notes, where, depth = 0) {
  if (!isObj(given) || depth > 4) return;
  for (const key of Object.keys(given)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (!(key in base)) { notes.push(`${where}: «${key}» ist keine bekannte Einstellung und wurde ignoriert`); continue; }
    const want = base[key], v = given[key];
    if (Array.isArray(want)) { if (Array.isArray(v)) base[key] = cleanArr(v, notes, where + '.' + key); }
    else if (isObj(want)) { if (isObj(v)) mergeInto(want, v, notes, where + '.' + key, depth + 1); }
    else if (want === null || typeof want === 'string') { if (typeof v === 'string') base[key] = cleanStr(v, key); else if (want === null && v === null) base[key] = null; }
    else if (typeof want === typeof v) base[key] = typeof v === 'number' ? (Number.isFinite(v) ? v : want) : v;
  }
}
function cleanArr(arr, notes, where) {
  return arr.slice(0, MAX_ARR).map((it) => {
    if (typeof it === 'string') return cleanStr(it);
    if (typeof it === 'number' || typeof it === 'boolean') return it;
    if (isObj(it)) {
      const o = {};
      for (const k of Object.keys(it)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        const v = it[k];
        o[k] = typeof v === 'string' ? cleanStr(v, k) : Array.isArray(v) ? cleanArr(v, notes, where) : (typeof v === 'number' || typeof v === 'boolean') ? v : undefined;
      }
      if (!o.id) o.id = uid();
      return o;
    }
    return null;
  }).filter((x) => x != null);
}
const paragraphs = (text) => String(text).split(/\n+/).map((l) => l.trim()).filter(Boolean)
  .map((l) => `<div>${l.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</div>`).join('');

function background(bg, notes, where) {
  if (typeof bg === 'string' && HEX.test(bg)) return { type: 'color', value: bg };
  if (isObj(bg) && bg.type === 'color' && HEX.test(bg.value)) return { type: 'color', value: bg.value };
  if (isObj(bg) && bg.type === 'gradient' && Array.isArray(bg.value) && bg.value.length === 2 && bg.value.every((c) => HEX.test(c))) return { type: 'gradient', value: [bg.value[0], bg.value[1]] };
  if (bg != null) notes.push(`${where}: Hintergrund nicht verstanden (erlaubt: "#RRGGBB" oder {type:"gradient", value:["#..","#.."]}); Standard verwendet`);
  return null;
}

function buildWidget(spec, ctx, notes, where) {
  const type = isObj(spec) && typeof spec.type === 'string' ? spec.type : null;
  if (!type || !WIDGETS[type]) { notes.push(`${where}: unbekannte Art «${type}» übersprungen`); return null; }
  if (BLOCKED[type]) { notes.push(`${where}: «${type}» übersprungen (${BLOCKED[type]})`); return null; }
  const def = WIDGETS[type], base = def.create();
  mergeInto(base.settings, spec.settings, notes, where);
  // Kurzformen
  const num = (v, a, b) => (Number.isFinite(v) ? clamp(v, a, b) : null);
  if (type === 'timer' || type === 'visualtimer') {
    const m = num(spec.minutes, 0, 600) ?? 0, s = num(spec.seconds, 0, 59) ?? 0;
    if (spec.minutes != null || spec.seconds != null) base.state.durationMs = Math.max(1, m * 60 + s) * 1000;
  }
  if (type === 'text' && typeof spec.text === 'string') base.state.html = paragraphs(spec.text);
  if (Array.isArray(spec.names) && 'localNames' in base.settings) {
    base.settings.localNames = spec.names.filter((n) => typeof n === 'string').map((n) => cleanStr(n).trim()).filter(Boolean).slice(0, 60);
    base.settings.listId = 'local';
  }
  if (typeof spec.url === 'string' && 'url' in base.settings) base.settings.url = cleanStr(spec.url, 'url');
  if (typeof spec.label === 'string' && 'label' in base.settings) base.settings.label = cleanStr(spec.label);
  if (typeof spec.title === 'string' && 'title' in base.settings) base.settings.title = cleanStr(spec.title);
  if (typeof spec.text === 'string' && type === 'qr') base.settings.text = cleanStr(spec.text, 'url');
  const [SW, SH] = ctx.stage;
  const w = Math.round(clamp(num(spec.w, 1, SW) ?? def.size.w, def.minSize.w, SW));
  const h = Math.round(clamp(num(spec.h, 1, SH) ?? def.size.h, def.minSize.h, SH));
  let x = num(spec.x, 0, SW), y = num(spec.y, 0, SH);
  if (x == null || y == null) { // einfache Auto-Anordnung: Zeilen von links nach rechts
    if (ctx.cx + w > SW - 40) { ctx.cx = 40; ctx.cy += ctx.rowH + 30; ctx.rowH = 0; }
    x = ctx.cx; y = ctx.cy; ctx.cx += w + 30; ctx.rowH = Math.max(ctx.rowH, h);
  }
  x = Math.round(clamp(x, 0, SW - w)); y = Math.round(clamp(y, 0, SH - h));
  const themeId = THEME_KEYS.has(spec.theme) ? spec.theme : (base.themeId || 'standard');
  return { id: uid(), type, x, y, w, h, rotation: 0, z: ++ctx.z, locked: false, groupId: null, ...base, themeId };
}

// Gibt { deck, notes } zurück. Wirft einen Error mit verständlichem Text bei Unbrauchbarem.
export function deckFromAiSpec(spec) {
  const notes = [];
  if (!isObj(spec)) throw new Error('Kein gültiger Inhalt.');
  if (JSON.stringify(spec).length > MAX_JSON) throw new Error('Der Inhalt ist zu gross.');
  if (spec.kreidebox !== AI_VERSION) throw new Error('Unbekannte Version des KI-Formats (erwartet: "kreidebox": 1).');
  if (!Array.isArray(spec.screens) || !spec.screens.length) throw new Error('Es fehlt «screens» mit mindestens einem Bildschirm.');
  const aspect = spec.aspect === '4:3' ? '4:3' : '16:9';
  const stage = STAGE[aspect];
  const t = new Date().toISOString();
  const screens = spec.screens.slice(0, MAX_SCREENS).map((s, i) => {
    const where = `Bildschirm ${i + 1}`;
    const scr = newScreen(background(isObj(s) ? s.background : null, notes, where) || undefined);
    if (isObj(s) && typeof s.name === 'string') scr.name = cleanStr(s.name).slice(0, 80);
    const ctx = { stage, cx: 40, cy: 40, rowH: 0, z: 0 };
    const list = isObj(s) && Array.isArray(s.widgets) ? s.widgets : [];
    if (list.length > MAX_WIDGETS) notes.push(`${where}: nur die ersten ${MAX_WIDGETS} Widgets übernommen`);
    for (let j = 0; j < Math.min(list.length, MAX_WIDGETS); j++) {
      const w = buildWidget(list[j], ctx, notes, `${where}, Widget ${j + 1}`);
      if (w) scr.widgets.push(w);
    }
    return scr;
  });
  if (spec.screens.length > MAX_SCREENS) notes.push(`nur die ersten ${MAX_SCREENS} Bildschirme übernommen`);
  const name = typeof spec.name === 'string' && spec.name.trim() ? cleanStr(spec.name).trim().slice(0, 80) : 'Neues Deck (KI)';
  const deck = { id: uid(), schemaVersion: SCHEMA_VERSION, name, color: null, folderId: null, aspectRatio: aspect, pinnedOnDashboard: false,
    archived: false, pinnedWidgets: [], screens, createdAt: t, updatedAt: t, deletedAt: null };
  return { deck, notes };
}

// Liest Text: JSON, ein Kreidebox-Link (#/ki?d=...) oder nur der Teil nach d=.
export function parseAiText(raw) {
  let s = String(raw || '').trim();
  const m = s.match(/[#?&]d=([A-Za-z0-9_-]+)/) || (/^[A-Za-z0-9_-]{20,}$/.test(s) ? [null, s] : null);
  if (m) s = new TextDecoder().decode(Uint8Array.from(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(s); } catch { throw new Error('Das ist kein gültiges JSON. Bitte den ganzen Text von Claude oder ChatGPT einfügen.'); }
}
