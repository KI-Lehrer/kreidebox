// Calendar (W17): today's date (narrow) or the month (wide). Week starts on Monday.
import { h } from '../ui/dom.js';
import { section } from '../ui/overlays.js';
import { themePicker } from './themes.js';

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export default {
  type: 'calendar', label: 'Kalender', icon: 'calendar',
  size: { w: 360, h: 360 }, minSize: { w: 180, h: 160 },
  create: () => ({ settings: { style: 'auto', weekStart: 1 }, state: {} }),

  mount(root, w, api) {
    const box = h('div', { class: 'cal' });
    root.append(box);
    let key = '';
    function update(now = Date.now()) {
      const d = new Date(now);
      const month = w.settings.style === 'month' || (w.settings.style === 'auto' && w.w / w.h > 1.25);
      const k = d.toDateString() + month + w.settings.weekStart;
      if (k === key) return; key = k;
      api.setLabel('Kalender, ' + d.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
      if (!month) {
        box.className = 'cal cal--day';
        box.replaceChildren(h('div', { class: 'cal__wd' }, d.toLocaleDateString('de-CH', { weekday: 'long' })), h('div', { class: 'cal__dd' }, d.getDate()),
          h('div', { class: 'cal__mm' }, d.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' })));
        return;
      }
      box.className = 'cal cal--month';
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const ws = w.settings.weekStart; const offset = (first.getDay() - ws + 7) % 7;
      const heads = ws === 1 ? WD : ['So', ...WD.slice(0, 6)];
      const cells = [];
      for (let i = 0; i < offset; i++) cells.push(h('span', { class: 'cal__c is-empty', 'aria-hidden': 'true' }));
      for (let i = 1; i <= days; i++) {
        const dow = new Date(d.getFullYear(), d.getMonth(), i).getDay();
        cells.push(h('span', { class: 'cal__c' + (i === d.getDate() ? ' is-today' : '') + (dow === 0 || dow === 6 ? ' is-we' : ''), 'aria-current': i === d.getDate() ? 'date' : null }, i));
      }
      box.replaceChildren(h('div', { class: 'cal__head' }, d.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' })),
        h('div', { class: 'cal__grid' }, heads.map((x) => h('span', { class: 'cal__h' }, x)), cells));
    }
    update();
    return { update: () => { key = ''; update(); }, tick: (n) => update(n) };
  },

  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    body.append(section('Darstellung', h('fieldset', { class: 'plain' }, h('legend', { class: 'sr-only' }, 'Darstellung'),
      ...[['auto', 'Automatisch (breit: Monat, schmal: Tag)'], ['day', 'Nur heute'], ['month', 'Ganzer Monat']].map(([k, l]) => h('label', { class: 'check' }, h('input', { type: 'radio', name: 'cal-st', checked: w.settings.style === k, onChange: () => { w.settings.style = k; change(); } }), l)))),
    section('Woche beginnt am', h('fieldset', { class: 'plain' }, h('legend', { class: 'sr-only' }, 'Wochenbeginn'),
      ...[[1, 'Montag'], [0, 'Sonntag']].map(([k, l]) => h('label', { class: 'check' }, h('input', { type: 'radio', name: 'cal-ws', checked: w.settings.weekStart === k, onChange: () => { w.settings.weekStart = k; change(); } }), l)))),
    section('Farbthema', themePicker(w.themeId, (k) => { w.themeId = k; change(); })));
  },
};
