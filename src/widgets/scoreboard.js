// Scoreboard (W26): points per team, or a race to a target.
import { h, iconEl, iconButton } from '../ui/dom.js';
import { section, switchRow } from '../ui/overlays.js';
import { playSound, unlockAudio } from '../audio.js';
import { uid } from '../data/store.js';
import { themePicker } from './themes.js';

const TEAM_COLORS = ['#D7372F', '#2F6FDB', '#2C9A4B', '#E0A100', '#8A4FD6', '#F07F2B', '#1AA3A3', '#C2417B'];
const RACERS = ['🚀', '🐢', '🐎', '🚲', '🦊', '🐝', '🚂', '⛵'];

export default {
  type: 'scoreboard', label: 'Punkte', icon: 'chart-column',
  size: { w: 900, h: 420 }, minSize: { w: 300, h: 180 },
  create: () => ({ settings: { layout: 'points', target: 10, step: 1, sound: true,
    teams: [{ id: uid(), name: 'Team A', color: TEAM_COLORS[0] }, { id: uid(), name: 'Team B', color: TEAM_COLORS[1] }] }, state: { scores: {} } }),

  mount(root, w, api) {
    const box = h('div', { class: 'sb' });
    root.append(box);
    const score = (t) => w.state.scores[t.id] || 0;
    function add(t, d) {
      unlockAudio();
      w.state.scores[t.id] = Math.max(0, score(t) + d);
      if (w.settings.sound && d > 0) playSound(w.settings.layout === 'race' && score(t) >= w.settings.target ? 'glocke' : 'pling', 0.2);
      api.changed(); update();
    }
    function update() {
      const race = w.settings.layout === 'race';
      box.className = 'sb' + (race ? ' sb--race' : '');
      box.replaceChildren(...w.settings.teams.map((t, i) => {
        const minus = h('button', { class: 'sb__btn', type: 'button', 'data-nodrag': '', 'aria-label': `${t.name}: ${w.settings.step} Punkt${w.settings.step === 1 ? '' : 'e'} weniger`, onClick: () => add(t, -w.settings.step) }, iconEl('minus'));
        const plus = h('button', { class: 'sb__btn sb__btn--plus', type: 'button', 'data-nodrag': '', 'aria-label': `${t.name}: ${w.settings.step} Punkt${w.settings.step === 1 ? '' : 'e'} mehr`, onClick: () => add(t, w.settings.step) }, iconEl('plus'));
        if (race) {
          const p = Math.min(1, score(t) / Math.max(1, w.settings.target));
          return h('div', { class: 'sb__lane', style: { '--c': t.color } }, h('span', { class: 'sb__name' }, t.name),
            h('div', { class: 'sb__track', role: 'meter', 'aria-valuenow': score(t), 'aria-valuemin': 0, 'aria-valuemax': w.settings.target, 'aria-label': `${t.name}: ${score(t)} von ${w.settings.target}` },
              h('span', { class: 'sb__goal', 'aria-hidden': 'true' }, '🏁'), h('span', { class: 'sb__racer', style: { left: `calc(${p * 100}% - ${p * 1.2}em)` }, 'aria-hidden': 'true' }, RACERS[i % RACERS.length])),
            h('span', { class: 'sb__mini tnum' }, `${score(t)}/${w.settings.target}`), minus, plus);
        }
        return h('div', { class: 'sb__team', style: { '--c': t.color } }, h('span', { class: 'sb__name' }, t.name),
          h('span', { class: 'sb__score tnum', 'aria-live': 'polite' }, score(t)), h('span', { class: 'sb__btns' }, minus, plus));
      }));
      api.setLabel('Punkte: ' + w.settings.teams.map((t) => `${t.name} ${score(t)}`).join(', '));
    }
    update();
    return { update };
  },

  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    const teams = h('div', { class: 'sb-edit' });
    function draw() {
      teams.replaceChildren(...w.settings.teams.map((t, i) => h('div', { class: 'sb-edit__row' },
        h('input', { class: 'sb-edit__color', type: 'color', value: t.color, 'aria-label': `Farbe von ${t.name}`, onInput: (e) => { t.color = e.target.value; change(); } }),
        h('input', { class: 'input', value: t.name, 'aria-label': `Name von Team ${i + 1}`, maxlength: 24, onInput: (e) => { t.name = e.target.value || `Team ${i + 1}`; change(); } }),
        w.settings.teams.length > 1 ? iconButton('trash-2', `${t.name} entfernen`, { cls: 'iconbtn--sm iconbtn--danger', onClick: () => { w.settings.teams.splice(i, 1); change(); draw(); } }) : h('span'))));
    }
    draw();
    const target = h('input', { class: 'input', type: 'number', min: 1, max: 999, value: w.settings.target, id: 'sb-target', style: { width: '96px' }, onChange: (e) => { w.settings.target = Math.max(1, Math.min(999, Math.round(+e.target.value || 10))); change(); } });
    const step = h('input', { class: 'input', type: 'number', min: 1, max: 100, value: w.settings.step, id: 'sb-step', style: { width: '96px' }, onChange: (e) => { w.settings.step = Math.max(1, Math.min(100, Math.round(+e.target.value || 1))); change(); } });
    body.append(
      section('Darstellung', h('fieldset', { class: 'plain' }, h('legend', { class: 'sr-only' }, 'Darstellung'),
        ...[['points', 'Punkte'], ['race', 'Wettrennen bis zum Ziel']].map(([k, l]) => h('label', { class: 'check' }, h('input', { type: 'radio', name: 'sb-lay', checked: w.settings.layout === k, onChange: () => { w.settings.layout = k; change(); } }), l))),
      h('div', { class: 'row', style: { flexWrap: 'wrap' } }, h('label', { class: 'check', for: 'sb-target' }, 'Ziel', target), h('label', { class: 'check', for: 'sb-step' }, 'Schritt', step))),
      section('Teams', teams, h('button', { class: 'btn btn--secondary btn--sm', type: 'button', disabled: w.settings.teams.length >= 8, onClick: () => {
        const i = w.settings.teams.length; w.settings.teams.push({ id: uid(), name: `Team ${'ABCDEFGH'[i]}`, color: TEAM_COLORS[i % 8] }); change(); draw();
      } }, '+ Team')),
      section('Weiteres', switchRow('Ton', w.settings.sound, (v) => { w.settings.sound = v; change(); }),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => { w.state.scores = {}; change(); } }, iconEl('rotate-ccw', { size: 16 }), 'Alle Punkte auf 0')),
      section('Farbthema', themePicker(w.themeId, (k) => { w.themeId = k; change(); })));
  },
};
