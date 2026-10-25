// Starter templates that ship with the app (own content, made for Swiss primary school).
// Built from the widget definitions so they always match the current widget version.
import { WIDGETS } from '../widgets/registry.js';
import { uid } from './store.js';

function wdg(type, x, y, w, h, patch = {}) {
  const base = WIDGETS[type].create();
  const out = { id: uid(), type, x, y, w, h, rotation: 0, z: 1, locked: false, groupId: null, themeId: 'standard', ...base };
  if (patch.settings) Object.assign(out.settings, patch.settings);
  if (patch.state) Object.assign(out.state, patch.state);
  if (patch.themeId) out.themeId = patch.themeId;
  return out;
}
const bg = (a, b) => ({ type: 'gradient', value: [a, b] });

export const BUILTIN = [
  { id: 'builtin:morgen', name: 'Guten Morgen', note: 'Uhr, Tagesplan und Begrüssung', build: () => ({ background: bg('#CFE0F0', '#F3E3CF'), widgets: [
    wdg('text', 80, 80, 1000, 200, { settings: { size: 'xl' }, state: { html: 'Guten Morgen, 6b!' }, themeId: 'transparent' }),
    wdg('clock', 80, 330, 560, 240, { settings: { date: true } }),
    wdg('timetable', 1180, 80, 640, 760),
    wdg('worksymbols', 700, 330, 400, 460, { state: { current: 'listen' }, settings: { enabled: ['listen', 'silent', 'whisper', 'pair'] } }),
  ] }) },
  { id: 'builtin:still', name: 'Stillarbeit', note: 'Arbeitsform, Timer und Ampel', build: () => ({ background: bg('#D5EFD9', '#F4F1C9'), widgets: [
    wdg('worksymbols', 120, 160, 460, 560, { state: { current: 'silent' } }),
    wdg('timer', 660, 220, 760, 300, { state: { durationMs: 20 * 60000 } }),
    wdg('trafficlight', 1500, 140, 300, 640, { settings: { labels: ['Ich brauche Hilfe', 'Ich arbeite', 'Fertig'], showLabels: false }, state: { light: 'yellow' } }),
    wdg('text', 660, 580, 760, 200, { settings: { size: 'm' }, state: { html: 'Arbeite still für dich.<br>Fertig? Lies in deinem Buch.' } }),
  ] }) },
  { id: 'builtin:gruppen', name: 'Gruppenarbeit', note: 'Gruppen, Timer und Lautstärke', build: () => ({ background: bg('#BFE3EC', '#7FA9D6'), widgets: [
    wdg('groupmaker', 80, 80, 1100, 560),
    wdg('timer', 1240, 80, 600, 250, { state: { durationMs: 15 * 60000 } }),
    wdg('worksymbols', 1240, 380, 600, 460, { state: { current: 'group' } }),
    wdg('soundlevel', 80, 700, 1100, 220),
  ] }) },
  { id: 'builtin:pause', name: 'Pause', note: 'Kreis-Timer und Hinweis', build: () => ({ background: bg('#F6C6B3', '#B9A6E0'), widgets: [
    wdg('visualtimer', 160, 140, 620, 760, { state: { durationMs: 15 * 60000 }, settings: { color: '#2C9A4B' } }),
    wdg('text', 880, 300, 900, 300, { settings: { size: 'xl', align: 'center' }, state: { html: 'Pause 🍎' }, themeId: 'transparent' }),
  ] }) },
  { id: 'builtin:abschluss', name: 'Lektionsabschluss', note: 'Umfrage mit Smileys und Zufallsname', build: () => ({ background: bg('#F2D3A0', '#D98E5E'), widgets: [
    wdg('poll', 100, 100, 1000, 600, { settings: { questions: [{ id: uid(), type: 'smiley', text: 'Wie gut hast du heute verstanden?', options: [] }], hideResults: true } }),
    wdg('randomizer', 1200, 100, 620, 380),
    wdg('text', 1200, 540, 620, 200, { settings: { size: 'm' }, state: { html: 'Erzähl: Was hast du heute gelernt?' } }),
  ] }) },
];

export function builtinScreen(id) {
  const t = BUILTIN.find((b) => b.id === id);
  if (!t) return null;
  const s = t.build();
  s.widgets.forEach((w, i) => { w.z = i + 1; });
  return { id: uid(), name: '', ...s };
}
