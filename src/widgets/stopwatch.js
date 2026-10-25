// Stopwatch (W19) with laps. Timestamp based like the timer.
import { h, iconEl } from '../ui/dom.js';
import { section, switchRow } from '../ui/overlays.js';
import { unlockAudio } from '../audio.js';
import { themePicker } from './themes.js';

const pad = (n, l = 2) => String(n).padStart(l, '0');
export function fmt(ms, tenths = true) {
  const t = Math.floor(ms / 100); const d = t % 10; const s = Math.floor(t / 10) % 60; const m = Math.floor(t / 600) % 60; const hr = Math.floor(t / 36000);
  return (hr ? `${hr}:${pad(m)}` : pad(m)) + `:${pad(s)}` + (tenths ? `.${d}` : '');
}
const elapsed = (st, now = Date.now()) => st.elapsedBefore + (st.startedAt ? now - st.startedAt : 0);

export default {
  type: 'stopwatch', label: 'Stoppuhr', icon: 'timer',
  size: { w: 620, h: 340 }, minSize: { w: 240, h: 140 },
  create: () => ({ settings: { tenths: true, showLaps: true }, state: { startedAt: null, elapsedBefore: 0, laps: [] } }),

  mount(root, w, api) {
    const time = h('div', { class: 'sw__time' });
    const play = h('button', { class: 'tw__btn', type: 'button', 'data-nodrag': '', onClick: () => { unlockAudio(); const st = w.state; if (st.startedAt) { st.elapsedBefore = elapsed(st); st.startedAt = null; } else st.startedAt = Date.now(); api.changed(); update(); } });
    const lap = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', 'data-nodrag': '', onClick: () => { w.state.laps.unshift(elapsed(w.state)); api.changed(); update(); } }, 'Runde');
    const reset = h('button', { class: 'tw__btn tw__btn--ghost', type: 'button', 'data-nodrag': '', 'aria-label': 'Zurücksetzen', title: 'Zurücksetzen', onClick: () => { Object.assign(w.state, { startedAt: null, elapsedBefore: 0, laps: [] }); api.changed(); update(); } }, iconEl('rotate-ccw'));
    const laps = h('ol', { class: 'sw__laps', 'aria-label': 'Runden' });
    root.append(h('div', { class: 'sw' }, h('div', { class: 'sw__main' }, time, h('div', { class: 'sw__ctrl' }, play, lap, reset)), laps));
    let last = '';
    function update(now = Date.now()) {
      const t = fmt(elapsed(w.state, now), w.settings.tenths);
      if (t !== last) { time.textContent = t; last = t; }
      const running = !!w.state.startedAt;
      play.replaceChildren(iconEl(running ? 'pause' : 'play', { size: 26 })); play.setAttribute('aria-label', running ? 'Anhalten' : 'Start');
      lap.hidden = !running; reset.hidden = running || !elapsed(w.state);
      laps.hidden = !w.settings.showLaps || !w.state.laps.length;
      if (laps.childElementCount !== w.state.laps.length) {
        laps.replaceChildren(...w.state.laps.map((ms, i, arr) => h('li', null, h('span', null, `Runde ${arr.length - i}`), h('span', { class: 'tnum' }, fmt(ms - (arr[i + 1] || 0), w.settings.tenths)), h('span', { class: 'tnum sw__total' }, fmt(ms, w.settings.tenths)))));
      }
      api.setLabel(`Stoppuhr, ${fmt(elapsed(w.state, now), false)}${running ? ', läuft' : ''}`);
    }
    update();
    return { update: () => { last = ''; laps.replaceChildren(); update(); }, tick: update };
  },

  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    body.append(section('Anzeige', switchRow('Zehntelsekunden zeigen', w.settings.tenths, (v) => { w.settings.tenths = v; change(); }),
      switchRow('Runden zeigen', w.settings.showLaps, (v) => { w.settings.showLaps = v; change(); })),
    section('Farbthema', themePicker(w.themeId, (k) => { w.themeId = k; change(); })));
  },
};
