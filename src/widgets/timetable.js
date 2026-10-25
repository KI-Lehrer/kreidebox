// Timetable (W09): list, checklist or timed schedule with emoji pictograms and an end-of-lesson sound.
import { h, iconEl, iconButton } from '../ui/dom.js';
import { section, switchRow, showMenu } from '../ui/overlays.js';
import { playSound, unlockAudio, SOUNDS } from '../audio.js';
import { uid } from '../data/store.js';
import { themePicker } from './themes.js';

export const PICTOS = ['📖', '✏️', '🔢', '🌍', '🎨', '🎵', '⚽', '🧪', '💻', '🗣️', '🇫🇷', '🇬🇧', '🔨', '🧵', '🍎', '☕', '🧹', '📣', '🧘', '🎲', '📝', '🌳', '🚌', '🏠'];
const pad = (n) => String(n).padStart(2, '0');
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };

function defaults() {
  return [
    ['📖', 'Deutsch', '08:00', '08:45'], ['🔢', 'Mathematik', '08:45', '09:30'], ['🍎', 'Pause', '09:30', '09:50'],
    ['🌍', 'NMG', '09:50', '10:35'], ['🎨', 'Bildnerisches Gestalten', '10:35', '11:20'],
  ].map(([emoji, title, start, end]) => ({ id: uid(), emoji, title, start, end, done: false }));
}

export default {
  type: 'timetable', label: 'Tagesplan', icon: 'list-checks',
  size: { w: 620, h: 640 }, minSize: { w: 260, h: 200 },
  create: () => ({ settings: { mode: 'timed', title: 'Heute', showTitle: true, items: defaults(), sound: 'glocke' }, state: { alerted: null } }),

  mount(root, w, api) {
    const title = h('h3', { class: 'tt__title' });
    const list = h('ol', { class: 'tt__list' });
    root.append(h('div', { class: 'tt' }, title, list));
    let lastKey = '';
    function current(now) {
      const m = now.getHours() * 60 + now.getMinutes();
      return w.settings.items.find((it) => { const a = toMin(it.start); const b = toMin(it.end); return a != null && b != null && m >= a && m < b; });
    }
    function update(nowMs = Date.now()) {
      const now = new Date(nowMs);
      const timed = w.settings.mode === 'timed';
      const cur = timed ? current(now) : null;
      const key = JSON.stringify([w.settings, cur && cur.id, now.getMinutes()]);
      if (key === lastKey) return;
      lastKey = key;
      title.textContent = w.settings.title; title.hidden = !w.settings.showTitle;
      list.replaceChildren(...w.settings.items.map((it) => {
        const isCur = cur && it.id === cur.id;
        const past = timed && toMin(it.end) != null && now.getHours() * 60 + now.getMinutes() >= toMin(it.end);
        const left = isCur ? toMin(it.end) - (now.getHours() * 60 + now.getMinutes()) : null;
        const content = [h('span', { class: 'tt__emoji', 'aria-hidden': 'true' }, it.emoji || '•'),
          h('span', { class: 'tt__text' }, h('span', { class: 'tt__name' }, it.title),
            timed && it.start ? h('span', { class: 'tt__time' }, `${it.start}–${it.end}`) : null),
          isCur ? h('span', { class: 'tt__left' }, `noch ${left} Min.`) : null];
        if (w.settings.mode === 'checklist') {
          return h('li', { class: 'tt__item' + (it.done ? ' is-done' : '') }, h('button', { class: 'tt__check', type: 'button', 'data-nodrag': '', role: 'checkbox', 'aria-checked': String(!!it.done),
            onClick: () => { unlockAudio(); it.done = !it.done; api.changed(); lastKey = ''; update(); } }, h('span', { class: 'tt__box', 'aria-hidden': 'true' }, it.done ? '✓' : ''), ...content));
        }
        return h('li', { class: 'tt__item' + (isCur ? ' is-current' : '') + (past ? ' is-past' : ''), 'aria-current': isCur ? 'step' : null }, ...content);
      }));
      api.setLabel(`Tagesplan${cur ? ', jetzt: ' + cur.title : ''}`);
    }
    function tick(nowMs) {
      if (w.settings.mode === 'timed' && w.settings.sound !== 'none') {
        const now = new Date(nowMs); const m = now.getHours() * 60 + now.getMinutes();
        const ending = w.settings.items.find((it) => toMin(it.end) === m && now.getSeconds() < 3);
        const k = ending && `${ending.id}-${now.toDateString()}`;
        if (ending && w.state.alerted !== k) { w.state.alerted = k; playSound(w.settings.sound); api.changed(); }
      }
      update(nowMs);
    }
    update();
    return { update: () => { lastKey = ''; update(); }, tick };
  },

  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    const rows = h('ol', { class: 'tt-edit', role: 'list' });
    function draw() {
      const timed = w.settings.mode === 'timed';
      rows.replaceChildren(...w.settings.items.map((it, i) => {
        const emojiBtn = h('button', { class: 'tt-edit__emoji', type: 'button', 'aria-label': `Bild für ${it.title || 'Eintrag'} wählen`, 'aria-haspopup': 'menu',
          onClick: () => showMenu(emojiBtn, PICTOS.map((p) => ({ label: p, onClick: () => { it.emoji = p; change(); draw(); } })), { label: 'Bild wählen', align: 'left' }) }, it.emoji || '•');
        return h('li', { class: 'tt-edit__row' },
          emojiBtn,
          h('input', { class: 'input', value: it.title, 'aria-label': 'Titel', placeholder: 'Titel', onInput: (e) => { it.title = e.target.value; change(); } }),
          timed ? h('input', { class: 'input tt-edit__time', type: 'time', value: it.start, 'aria-label': 'Beginn', onChange: (e) => { it.start = e.target.value; change(); } }) : null,
          timed ? h('input', { class: 'input tt-edit__time', type: 'time', value: it.end, 'aria-label': 'Ende', onChange: (e) => { it.end = e.target.value; change(); } }) : null,
          h('span', { class: 'tt-edit__btns' },
            iconButton('arrow-up', 'Nach oben', { cls: 'iconbtn--sm', onClick: () => { if (i > 0) { [w.settings.items[i - 1], w.settings.items[i]] = [w.settings.items[i], w.settings.items[i - 1]]; change(); draw(); } } }),
            iconButton('arrow-down', 'Nach unten', { cls: 'iconbtn--sm', onClick: () => { if (i < w.settings.items.length - 1) { [w.settings.items[i + 1], w.settings.items[i]] = [w.settings.items[i], w.settings.items[i + 1]]; change(); draw(); } } }),
            iconButton('trash-2', 'Entfernen', { cls: 'iconbtn--sm iconbtn--danger', onClick: () => { w.settings.items.splice(i, 1); change(); draw(); } })));
      }));
    }
    const nextTimes = () => {
      const last = w.settings.items[w.settings.items.length - 1];
      const start = last && toMin(last.end) != null ? toMin(last.end) : 8 * 60;
      const fmt = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
      return [fmt(start), fmt(start + 45)];
    };
    const addRow = (emoji, title, len) => { const [s] = nextTimes(); const e = toMin(s) + len; w.settings.items.push({ id: uid(), emoji, title, start: s, end: `${pad(Math.floor(e / 60) % 24)}:${pad(e % 60)}`, done: false }); change(); draw(); };
    const modes = h('fieldset', { class: 'plain' }, h('legend', { class: 'sr-only' }, 'Art'),
      ...[['timed', 'Mit Uhrzeiten (aktuelle Lektion wird hervorgehoben)'], ['list', 'Einfache Liste'], ['checklist', 'Checkliste zum Abhaken']].map(([k, l]) => h('label', { class: 'check' },
        h('input', { type: 'radio', name: 'tt-mode', checked: w.settings.mode === k, onChange: () => { w.settings.mode = k; change(); draw(); } }), l)));
    const sound = h('select', { class: 'select', id: 'tt-sound', onChange: (e) => { w.settings.sound = e.target.value; change(); } },
      Object.entries(SOUNDS).map(([k, v]) => h('option', { value: k, selected: k === w.settings.sound }, v)));
    body.append(
      section('Art', modes),
      section(null, h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'tt-title' }, 'Titel'),
        h('input', { class: 'input', id: 'tt-title', value: w.settings.title, onInput: (e) => { w.settings.title = e.target.value; change(); } })),
      switchRow('Titel zeigen', w.settings.showTitle, (v) => { w.settings.showTitle = v; change(); })),
      section('Einträge', rows, h('div', { class: 'row', style: { flexWrap: 'wrap' } },
        h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => addRow('📝', '', 45) }, iconEl('plus', { size: 16 }), 'Eintrag'),
        h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => addRow('🍎', 'Pause', 15) }, iconEl('plus', { size: 16 }), 'Pause'),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => { w.settings.items.forEach((it) => { it.done = false; }); change(); } }, 'Häkchen zurücksetzen'))),
      section(null, h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'tt-sound' }, 'Ton am Ende einer Lektion'), sound)),
      section('Farbthema', themePicker(w.themeId, (k) => { w.themeId = k; change(); })));
    draw();
  },
};
