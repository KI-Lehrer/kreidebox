// Dice (W14): number dice with pips, wider ranges, maths signs, colours, letters, coin.
import { h, iconEl } from '../ui/dom.js';
import { section, switchRow } from '../ui/overlays.js';
import { playSound, unlockAudio } from '../audio.js';
import { themePicker } from './themes.js';

const COLORS = [['#D7372F', 'Rot'], ['#2F6FDB', 'Blau'], ['#2C9A4B', 'Grün'], ['#F2B500', 'Gelb'], ['#8A4FD6', 'Violett'], ['#F07F2B', 'Orange']];
export const KINDS = {
  dots: { label: 'Augen 1–6', roll: () => 1 + Math.floor(Math.random() * 6) },
  range: { label: 'Zahl von … bis …', roll: (s) => s.min + Math.floor(Math.random() * (s.max - s.min + 1)) },
  math: { label: 'Rechenzeichen', roll: () => ['+', '−', '·', ':'][Math.floor(Math.random() * 4)] },
  color: { label: 'Farben', roll: () => Math.floor(Math.random() * 6) },
  letter: { label: 'Buchstaben', roll: () => 'ABCDEFGHIJKLMNOPRSTUVWZ'[Math.floor(Math.random() * 23)] },
  coin: { label: 'Münze', roll: () => (Math.random() < 0.5 ? 'Kopf' : 'Zahl') },
};
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export default {
  type: 'dice', label: 'Würfel', icon: 'dice-5',
  size: { w: 620, h: 340 }, minSize: { w: 200, h: 160 },
  create: () => ({ settings: { kind: 'dots', count: 2, min: 1, max: 20, animation: true, sound: true, showSum: true }, state: { values: [] } }),

  mount(root, w, api) {
    const row = h('div', { class: 'dc__row' });
    const sum = h('div', { class: 'dc__sum' });
    const btn = h('button', { class: 'rz__btn', type: 'button', 'data-nodrag': '', onClick: roll }, iconEl('dice-5', { size: 24 }), h('span', null, 'Würfeln'));
    const live = h('span', { class: 'sr-only', 'aria-live': 'polite' });
    root.append(h('div', { class: 'dc' }, row, h('div', { class: 'dc__foot' }, sum, btn), live));
    let busy = false;
    const n = () => (w.settings.kind === 'coin' ? 1 : w.settings.count);
    function face(kind, v) {
      if (kind === 'dots') return h('span', { class: 'dc__die dc__die--dots' }, Array.from({ length: 9 }, (_, i) => h('i', { class: PIPS[v] && PIPS[v].includes(i) ? 'on' : '' })));
      if (kind === 'color') return h('span', { class: 'dc__die', style: { background: COLORS[v][0] }, title: COLORS[v][1] });
      if (kind === 'coin') return h('span', { class: 'dc__die dc__die--coin' }, v);
      return h('span', { class: 'dc__die' + (String(v).length > 2 ? ' is-long' : '') }, v);
    }
    function render(values) {
      row.replaceChildren(...values.map((v) => face(w.settings.kind, v)));
      const nums = values.filter((v) => typeof v === 'number');
      sum.textContent = w.settings.showSum && w.settings.kind !== 'color' && nums.length > 1 ? `Summe: ${nums.reduce((a, b) => a + b, 0)}` : '';
    }
    function describe(values) { return values.map((v) => (w.settings.kind === 'color' ? COLORS[v][1] : v)).join(', '); }
    async function roll() {
      if (busy) return; unlockAudio(); busy = true; row.classList.add('is-rolling');
      const k = KINDS[w.settings.kind];
      if (w.settings.animation) for (let i = 0; i < 8; i++) { render(Array.from({ length: n() }, () => k.roll(w.settings))); await new Promise((r) => setTimeout(r, 55 + i * 12)); }
      w.state.values = Array.from({ length: n() }, () => k.roll(w.settings));
      row.classList.remove('is-rolling'); busy = false;
      if (w.settings.sound) playSound('pling', 0.2);
      live.textContent = 'Gewürfelt: ' + describe(w.state.values);
      api.changed(); update();
    }
    function update() {
      const vals = w.state.values.length === n() ? w.state.values : Array.from({ length: n() }, () => (w.settings.kind === 'dots' ? 6 : w.settings.kind === 'color' ? 0 : w.settings.kind === 'coin' ? 'Kopf' : w.settings.kind === 'math' ? '+' : w.settings.kind === 'letter' ? 'A' : w.settings.max));
      render(vals);
      row.classList.toggle('is-fresh', !w.state.values.length);
      api.setLabel(`Würfel${w.state.values.length ? ': ' + describe(w.state.values) : ''}`);
    }
    update();
    return { update };
  },

  settingsPanel(body, w, api) {
    const change = () => { w.state.values = []; api.changed(); api.refresh(); };
    const range = h('div', { class: 'row', hidden: w.settings.kind !== 'range' },
      h('label', { class: 'check' }, 'von', h('input', { class: 'input', type: 'number', value: w.settings.min, style: { width: '90px' }, onChange: (e) => { w.settings.min = Math.round(+e.target.value || 0); if (w.settings.max < w.settings.min) w.settings.max = w.settings.min; change(); } })),
      h('label', { class: 'check' }, 'bis', h('input', { class: 'input', type: 'number', value: w.settings.max, style: { width: '90px' }, onChange: (e) => { w.settings.max = Math.max(w.settings.min, Math.round(+e.target.value || 0)); change(); } })));
    body.append(section('Würfel', h('fieldset', { class: 'plain' }, h('legend', { class: 'sr-only' }, 'Art'),
      ...Object.entries(KINDS).map(([k, d]) => h('label', { class: 'check' }, h('input', { type: 'radio', name: 'dc-kind', checked: w.settings.kind === k, onChange: () => { w.settings.kind = k; range.hidden = k !== 'range'; change(); } }), d.label))), range),
    section('Anzahl', h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Anzahl Würfel' }, [1, 2, 3].map((c) => {
      const b = h('button', { class: 'seg__btn', type: 'button', role: 'radio', 'aria-checked': String(w.settings.count === c), onClick: () => { w.settings.count = c; b.parentNode.querySelectorAll('[role=radio]').forEach((x) => x.setAttribute('aria-checked', String(x === b))); change(); } }, String(c));
      return b;
    }))),
    section('Weiteres', switchRow('Summe zeigen', w.settings.showSum, (v) => { w.settings.showSum = v; change(); }), switchRow('Animation', w.settings.animation, (v) => { w.settings.animation = v; change(); }),
      switchRow('Ton', w.settings.sound, (v) => { w.settings.sound = v; change(); })),
    section('Farbthema', themePicker(w.themeId, (k) => { w.themeId = k; change(); })));
  },
};
