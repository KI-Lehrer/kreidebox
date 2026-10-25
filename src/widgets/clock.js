// Clock (W11): digital or analog (automatic by shape), optional seconds and date. 24-h, de-CH.
import { h } from '../ui/dom.js';
import { section, switchRow } from '../ui/overlays.js';
import { themePicker } from './themes.js';

const pad = (n) => String(n).padStart(2, '0');
const NS = 'http://www.w3.org/2000/svg';

export default {
  type: 'clock', label: 'Uhr', icon: 'clock',
  size: { w: 560, h: 240 }, minSize: { w: 160, h: 120 },
  create: () => ({ settings: { style: 'auto', seconds: false, date: false }, state: {} }),

  mount(root, w, api) {
    const digital = h('div', { class: 'ck__digital' });
    const time = h('div', { class: 'ck__time' }); const date = h('div', { class: 'ck__date' });
    digital.append(time, date);
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '-100 -100 200 200'); svg.setAttribute('class', 'ck__analog'); svg.setAttribute('aria-hidden', 'true');
    const face = document.createElementNS(NS, 'circle'); face.setAttribute('r', '96'); face.setAttribute('class', 'ck__face'); svg.append(face);
    for (let i = 0; i < 60; i++) {
      const l = document.createElementNS(NS, 'line'); const big = i % 5 === 0;
      l.setAttribute('x1', 0); l.setAttribute('x2', 0); l.setAttribute('y1', -88); l.setAttribute('y2', big ? -76 : -83);
      l.setAttribute('transform', `rotate(${i * 6})`); l.setAttribute('class', big ? 'ck__tick ck__tick--big' : 'ck__tick'); svg.append(l);
    }
    for (let i = 1; i <= 12; i++) {
      const t = document.createElementNS(NS, 'text'); const a = (i * 30 - 90) * Math.PI / 180;
      t.setAttribute('x', 63 * Math.cos(a)); t.setAttribute('y', 63 * Math.sin(a)); t.setAttribute('class', 'ck__num'); t.textContent = i; svg.append(t);
    }
    const hand = (cls, len, wdt) => { const l = document.createElementNS(NS, 'line'); l.setAttribute('x1', 0); l.setAttribute('y1', 10); l.setAttribute('x2', 0); l.setAttribute('y2', -len); l.setAttribute('stroke-width', wdt); l.setAttribute('class', cls); svg.append(l); return l; };
    const hh = hand('ck__hand', 48, 7); const mh = hand('ck__hand', 70, 5); const sh = hand('ck__hand ck__hand--sec', 78, 2);
    const hub = document.createElementNS(NS, 'circle'); hub.setAttribute('r', 5); hub.setAttribute('class', 'ck__hub'); svg.append(hub);
    const box = h('div', { class: 'ck' }, digital, svg);
    root.append(box);
    let last = '';
    function update(now = Date.now()) {
      const d = new Date(now);
      const analog = w.settings.style === 'analog' || (w.settings.style === 'auto' && w.w / w.h < 1.35);
      box.classList.toggle('is-analog', analog);
      const text = pad(d.getHours()) + ':' + pad(d.getMinutes()) + (w.settings.seconds ? ':' + pad(d.getSeconds()) : '');
      if (text !== last) { time.textContent = text; last = text; api.setLabel(`Uhr, ${pad(d.getHours())}:${pad(d.getMinutes())} Uhr`); }
      date.textContent = w.settings.date ? d.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
      date.hidden = !w.settings.date;
      const s = d.getSeconds() + d.getMilliseconds() / 1000; const m = d.getMinutes() + s / 60; const hr = (d.getHours() % 12) + m / 60;
      hh.setAttribute('transform', `rotate(${hr * 30})`); mh.setAttribute('transform', `rotate(${m * 6})`); sh.setAttribute('transform', `rotate(${Math.floor(s) * 6})`);
      sh.style.display = w.settings.seconds ? '' : 'none';
    }
    update();
    return { update: () => update(), tick: update };
  },

  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    const styles = h('fieldset', { class: 'plain' }, h('legend', { class: 'sr-only' }, 'Darstellung'),
      ...[['auto', 'Automatisch (quer: digital, quadratisch: Zeiger)'], ['digital', 'Digital'], ['analog', 'Mit Zeigern']].map(([k, l]) => h('label', { class: 'check' },
        h('input', { type: 'radio', name: 'ck-style', checked: w.settings.style === k, onChange: () => { w.settings.style = k; change(); } }), l)));
    body.append(section('Darstellung', styles),
      section('Anzeige', switchRow('Sekunden zeigen', w.settings.seconds, (v) => { w.settings.seconds = v; change(); }),
        switchRow('Datum zeigen', w.settings.date, (v) => { w.settings.date = v; change(); })),
      section('Farbthema', themePicker(w.themeId, (k) => { w.themeId = k; change(); })));
  },
};
