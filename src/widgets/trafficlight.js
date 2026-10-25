// Traffic light (W08). Housing is always dark: yellow has too little contrast on white.
import { h } from '../ui/dom.js';
import { section, switchRow } from '../ui/overlays.js';
import { playSound, unlockAudio } from '../audio.js';

const LIGHTS = [['red', 'Rot'], ['yellow', 'Gelb'], ['green', 'Grün']];
export const PRESETS = {
  'Ohne Beschriftung': ['', '', ''],
  'Lautstärke': ['Still', 'Flüstern', 'Sprechen'],
  'Lehrperson fragen': ['Nicht stören', 'Zuerst Nachbar fragen', 'Du darfst kommen'],
  'Arbeitsstand': ['Ich brauche Hilfe', 'Ich arbeite', 'Fertig'],
  'Geräte': ['Geräte weg', 'Nur auf Anweisung', 'Geräte erlaubt'],
};

export default {
  type: 'trafficlight', label: 'Ampel', icon: 'traffic-cone',
  size: { w: 420, h: 560 }, minSize: { w: 140, h: 200 },
  create: () => ({ settings: { labels: ['Still', 'Flüstern', 'Sprechen'], showLabels: true, sound: true }, state: { light: 'red' }, themeId: 'transparent' }),

  mount(root, w, api) {
    const lamps = LIGHTS.map(([k, label]) => h('button', { class: `tl__lamp tl__lamp--${k}`, type: 'button', 'data-nodrag': '', 'aria-pressed': 'false',
      onClick: () => { unlockAudio(); w.state.light = w.state.light === k ? null : k; if (w.settings.sound && w.state.light) playSound('pling', 0.2); api.changed(); update(); } }));
    const labels = LIGHTS.map(() => h('span', { class: 'tl__label' }));
    const rows = LIGHTS.map((_, i) => h('div', { class: 'tl__row' }, lamps[i], labels[i]));
    const box = h('div', { class: 'tl' }, h('div', { class: 'tl__housing' }, rows));
    root.append(box);
    function update() {
      const showL = w.settings.showLabels && w.settings.labels.some(Boolean);
      box.classList.toggle('has-labels', showL);
      LIGHTS.forEach(([k, name], i) => {
        const on = w.state.light === k;
        lamps[i].setAttribute('aria-pressed', String(on));
        const text = w.settings.labels[i] || '';
        lamps[i].setAttribute('aria-label', `${name}${text ? ': ' + text : ''}`);
        labels[i].textContent = showL ? text : '';
        labels[i].classList.toggle('is-on', on);
      });
      const cur = LIGHTS.findIndex(([k]) => k === w.state.light);
      api.setLabel('Ampel: ' + (cur < 0 ? 'aus' : LIGHTS[cur][1].toLowerCase() + (w.settings.labels[cur] ? ` (${w.settings.labels[cur]})` : '')));
    }
    update();
    return { update };
  },

  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    const inputs = LIGHTS.map(([k, name], i) => h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'tl-' + k }, name),
      h('input', { class: 'input', id: 'tl-' + k, value: w.settings.labels[i], maxlength: 40, onInput: (e) => { w.settings.labels[i] = e.target.value; change(); } })));
    const presets = h('div', { class: 'row', style: { flexWrap: 'wrap' } }, Object.entries(PRESETS).map(([k, v]) => h('button', { class: 'btn btn--secondary btn--sm', type: 'button',
      onClick: () => { w.settings.labels = v.slice(); inputs.forEach((f, i) => { f.querySelector('input').value = v[i]; }); change(); } }, k)));
    body.append(section('Bedeutung', presets, ...inputs),
      section('Anzeige', switchRow('Beschriftung zeigen', w.settings.showLabels, (v) => { w.settings.showLabels = v; change(); }),
        switchRow('Ton beim Umschalten', w.settings.sound, (v) => { w.settings.sound = v; change(); })));
  },
};
