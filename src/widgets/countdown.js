// Event countdown (W18): days until events, optionally school days only (no weekends).
import { h, iconButton } from '../ui/dom.js';
import { section, switchRow } from '../ui/overlays.js';
import { uid } from '../data/store.js';
import { themePicker } from './themes.js';

const DAY = 864e5;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export function daysUntil(dateStr, now = new Date(), excludeWeekends = false) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return null;
  const a = startOfDay(now); const b = new Date(y, m - 1, d);
  let n = Math.round((b - a) / DAY);
  if (!excludeWeekends || n <= 0) return n;
  let count = 0;
  for (let t = new Date(a.getTime() + DAY); t <= b; t = new Date(t.getTime() + DAY)) { const dow = t.getDay(); if (dow !== 0 && dow !== 6) count++; }
  return count;
}

function nextYearDate(month, day) {
  const now = new Date(); let y = now.getFullYear();
  if (new Date(y, month - 1, day) < startOfDay(now)) y++;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default {
  type: 'countdown', label: 'Countdown', icon: 'calendar-days',
  size: { w: 620, h: 300 }, minSize: { w: 240, h: 140 },
  create: () => ({ settings: { events: [{ id: uid(), title: 'Weihnachtsferien', date: nextYearDate(12, 20) }], excludeWeekends: false, showPast: false }, state: {} }),

  mount(root, w, api) {
    const list = h('ul', { class: 'cd__list' });
    root.append(h('div', { class: 'cd' }, list));
    let key = '';
    function update(nowMs = Date.now()) {
      const now = new Date(nowMs);
      const k = now.toDateString() + JSON.stringify(w.settings);
      if (k === key) return; key = k;
      const evs = w.settings.events.map((e) => ({ ...e, n: daysUntil(e.date, now, w.settings.excludeWeekends) }))
        .filter((e) => e.n != null && (w.settings.showPast || e.n >= 0)).sort((a, b) => a.n - b.n);
      list.replaceChildren(...(evs.length ? evs.map((e) => h('li', { class: 'cd__item' + (evs.length === 1 ? ' is-single' : '') },
        h('span', { class: 'cd__n tnum' }, e.n === 0 ? 'Heute!' : String(Math.abs(e.n))),
        h('span', { class: 'cd__t' }, e.n === 0 ? e.title : h('span', null, `${Math.abs(e.n) === 1 ? (w.settings.excludeWeekends ? 'Schultag' : 'Tag') : (w.settings.excludeWeekends ? 'Schultage' : 'Tage')} ${e.n < 0 ? 'seit' : 'bis'} `, h('strong', null, e.title)))))
        : [h('li', { class: 'cd__empty' }, 'Kein Ereignis. Im Zahnrad eines hinzufügen.')]));
      api.setLabel('Countdown' + (evs[0] ? `: noch ${evs[0].n} Tage bis ${evs[0].title}` : ''));
    }
    update();
    return { update: () => { key = ''; update(); }, tick: update };
  },

  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    const rows = h('div', { class: 'cd-edit' });
    function draw() {
      rows.replaceChildren(...w.settings.events.map((e, i) => h('div', { class: 'cd-edit__row' },
        h('input', { class: 'input', value: e.title, 'aria-label': 'Ereignis', placeholder: 'z. B. Skilager', onInput: (ev) => { e.title = ev.target.value; change(); } }),
        h('input', { class: 'input', type: 'date', value: e.date, 'aria-label': 'Datum', onChange: (ev) => { e.date = ev.target.value; change(); } }),
        iconButton('trash-2', 'Ereignis entfernen', { cls: 'iconbtn--sm iconbtn--danger', onClick: () => { w.settings.events.splice(i, 1); change(); draw(); } }))));
    }
    draw();
    body.append(section('Ereignisse', rows, h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => {
      const d = new Date(Date.now() + 14 * DAY);
      w.settings.events.push({ id: uid(), title: '', date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }); change(); draw();
      rows.querySelector('.cd-edit__row:last-child input').focus();
    } }, '+ Ereignis')),
    section('Zählen', switchRow('Nur Schultage (ohne Wochenenden)', w.settings.excludeWeekends, (v) => { w.settings.excludeWeekends = v; change(); }),
      switchRow('Vergangene Ereignisse zeigen', w.settings.showPast, (v) => { w.settings.showPast = v; change(); })),
    section('Farbthema', themePicker(w.themeId, (k) => { w.themeId = k; change(); })));
  },
};
