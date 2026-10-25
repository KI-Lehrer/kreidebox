// Work symbols (W07): how to work right now. Own pictograms (Lucide icons) and own wording.
import { h, iconEl } from '../ui/dom.js';
import { section, switchRow } from '../ui/overlays.js';
import { playSound, unlockAudio } from '../audio.js';
import { themePicker } from './themes.js';

export const SYMBOLS = [
  { key: 'silent', label: 'Still arbeiten', icon: 'volume-x' },
  { key: 'whisper', label: 'Flüstern', icon: 'message-circle' },
  { key: 'pair', label: 'Zu zweit', icon: 'users' },
  { key: 'group', label: 'In der Gruppe', icon: 'users-round' },
  { key: 'alone', label: 'Allein', icon: 'user' },
  { key: 'hand', label: 'Hand hoch', icon: 'hand' },
  { key: 'listen', label: 'Zuhören', icon: 'ear' },
];

export default {
  type: 'worksymbols', label: 'Arbeitsform', icon: 'hand',
  size: { w: 460, h: 520 }, minSize: { w: 180, h: 200 },
  create: () => ({ settings: { enabled: ['silent', 'whisper', 'pair', 'group'], labels: {}, sound: true }, state: { current: 'silent' } }),

  mount(root, w, api) {
    const big = h('div', { class: 'ws__big' });
    const label = h('div', { class: 'ws__label' });
    const picks = h('div', { class: 'ws__picks', role: 'radiogroup', 'aria-label': 'Arbeitsform wählen' });
    root.append(h('div', { class: 'ws' }, big, label, picks));
    const name = (s) => (w.settings.labels[s.key] || s.label);
    function update() {
      const list = SYMBOLS.filter((s) => w.settings.enabled.includes(s.key));
      const cur = list.find((s) => s.key === w.state.current) || list[0];
      big.replaceChildren(cur ? iconEl(cur.icon) : '');
      label.textContent = cur ? name(cur) : '';
      picks.replaceChildren(...list.map((s) => h('button', { class: 'ws__pick', type: 'button', role: 'radio', 'data-nodrag': '', 'aria-checked': String(cur && s.key === cur.key), 'aria-label': name(s), title: name(s),
        onClick: () => { unlockAudio(); w.state.current = s.key; if (w.settings.sound) playSound('pling', 0.2); api.changed(); update(); } }, iconEl(s.icon))));
      api.setLabel('Arbeitsform: ' + (cur ? name(cur) : 'keine'));
    }
    update();
    return { update };
  },

  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    body.append(
      section('Symbole', ...SYMBOLS.map((s) => h('div', { class: 'ws-row' },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: w.settings.enabled.includes(s.key), onChange: (e) => {
          w.settings.enabled = e.target.checked ? [...new Set([...w.settings.enabled, s.key])] : w.settings.enabled.filter((k) => k !== s.key);
          if (!w.settings.enabled.length) { w.settings.enabled = [s.key]; e.target.checked = true; }
          change();
        } }), iconEl(s.icon, { size: 20 })),
        h('input', { class: 'input', 'aria-label': `Text für ${s.label}`, value: w.settings.labels[s.key] || s.label, maxlength: 30,
          onInput: (e) => { w.settings.labels[s.key] = e.target.value.trim(); change(); } })))),
      section('Weiteres', switchRow('Ton beim Wechseln', w.settings.sound, (v) => { w.settings.sound = v; change(); })),
      section('Farbthema', themePicker(w.themeId, (k) => { w.themeId = k; change(); })));
  },
};
