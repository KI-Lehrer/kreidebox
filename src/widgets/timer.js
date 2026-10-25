// Timer widget (W10). Time is always computed from timestamps, never counted,
// so it stays correct in background tabs, across screen changes and after a reload.
import { h, iconEl } from '../ui/dom.js';
import { section, switchRow } from '../ui/overlays.js';
import { playSound, unlockAudio, SOUNDS } from '../audio.js';
import { getWidgetDefaults, setWidgetDefaults } from '../data/store.js';
import { themePicker } from './themes.js';

const MAX_MS = (99 * 60 + 59) * 1000;
const pad = (n) => String(n).padStart(2, '0');

export function remainingMs(state, now = Date.now()) {
  if (state.endsAt) return Math.max(0, state.endsAt - now);
  if (state.pausedRemainingMs != null) return state.pausedRemainingMs;
  return state.durationMs;
}

export function format(ms) {
  const total = Math.ceil(ms / 1000);
  return { m: Math.floor(total / 60), s: total % 60 };
}

// Advances a timer whose end time has passed. Used for the visible widget and for timers on other screens.
// Returns true when the state changed.
export function advance(w, now = Date.now(), { silent = false } = {}) {
  const st = w.state;
  if (!st.endsAt || now < st.endsAt) return false;
  const late = now - st.endsAt > 5000; // e.g. after a reload: finish without sound
  if (!late && !silent) playSound(w.settings.sound);
  if (st.repeatsLeft > 0) {
    st.repeatsLeft -= 1;
    st.endsAt = (late ? now : st.endsAt) + st.durationMs;
  } else {
    st.endsAt = null; st.pausedRemainingMs = 0; st.done = true; st.repeatsLeft = null;
    if (w.settings.resetWhenDone) { st.pausedRemainingMs = null; st.done = false; }
  }
  return true;
}

function isWarn(state, settings, rem) {
  if (!settings.redIndicator || rem <= 0 || (!state.endsAt && state.pausedRemainingMs == null)) return false;
  if (settings.redMode === 'seconds') return rem <= settings.redSeconds * 1000;
  return rem <= state.durationMs * (settings.redPercent / 100);
}

export default {
  type: 'timer',
  label: 'Timer',
  icon: 'hourglass',
  size: { w: 640, h: 260 },
  minSize: { w: 300, h: 120 },

  create() {
    const d = getWidgetDefaults('timer');
    const minutes = d.minutes != null ? d.minutes : 10;
    const seconds = d.seconds != null ? d.seconds : 0;
    return {
      settings: { sound: d.sound || 'gong', repeat: 0, redIndicator: true, redMode: 'percent', redPercent: 25, redSeconds: 10, showInTab: false, resetWhenDone: false },
      state: { durationMs: (minutes * 60 + seconds) * 1000, endsAt: null, pausedRemainingMs: null, done: false, repeatsLeft: null },
    };
  },

  describe(w) {
    const { m, s } = format(remainingMs(w.state));
    return `Timer, ${m} Minuten ${s} Sekunden` + (w.state.endsAt ? ', läuft' : '');
  },

  mount(root, w, api) {
    const R = 42; const C = 2 * Math.PI * R;
    const progress = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'tw__ring'); svg.setAttribute('aria-hidden', 'true');
    const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    for (const c of [track, progress]) { c.setAttribute('cx', 50); c.setAttribute('cy', 50); c.setAttribute('r', R); svg.append(c); }
    track.setAttribute('class', 'tw__track'); progress.setAttribute('class', 'tw__progress');
    progress.setAttribute('stroke-dasharray', C);

    // digit columns: [+ / digit / −] for tens of minutes, minutes, tens of seconds, seconds
    const steps = [600000, 60000, 10000, 1000];
    const digitEls = [];
    const cols = steps.map((step, i) => {
      const label = ['Zehner-Minuten', 'Minuten', 'Zehner-Sekunden', 'Sekunden'][i];
      const d = h('span', { class: 'tw__digit', 'aria-hidden': 'true' });
      digitEls.push(d);
      return h('span', { class: 'tw__col' },
        h('button', { class: 'tw__spin', type: 'button', 'aria-label': `${label} plus`, 'data-nodrag': '', onClick: () => adjust(step) }, '+'),
        d,
        h('button', { class: 'tw__spin', type: 'button', 'aria-label': `${label} minus`, 'data-nodrag': '', onClick: () => adjust(-step) }, '−'));
    });
    const digits = h('div', { class: 'tw__digits' }, cols[0], cols[1], h('span', { class: 'tw__colon', 'aria-hidden': 'true' }, ':'), cols[2], cols[3]);
    const live = h('span', { class: 'sr-only', 'aria-live': 'polite' });
    const playBtn = h('button', { class: 'tw__btn', type: 'button', 'data-nodrag': '', onClick: toggle });
    const resetBtn = h('button', { class: 'tw__btn tw__btn--ghost', type: 'button', 'data-nodrag': '', 'aria-label': 'Zurücksetzen', title: 'Zurücksetzen', onClick: reset }, iconEl('rotate-ccw'));
    const box = h('div', { class: 'tw' }, svg, digits, h('div', { class: 'tw__ctrl' }, playBtn, resetBtn), live);
    root.append(box);

    function adjust(delta) {
      const st = w.state;
      const base = remainingMs(st);
      const next = Math.min(MAX_MS, Math.max(0, Math.round(base / 1000) * 1000 + delta));
      st.durationMs = next; st.endsAt = null; st.pausedRemainingMs = null; st.done = false; st.repeatsLeft = null;
      api.changed(); update();
    }
    function toggle() {
      unlockAudio();
      const st = w.state;
      if (st.endsAt) { st.pausedRemainingMs = remainingMs(st); st.endsAt = null; }
      else {
        let rem = remainingMs(st);
        if (rem <= 0) { rem = st.durationMs; st.done = false; }
        if (rem <= 0) return;
        if (st.repeatsLeft == null) st.repeatsLeft = w.settings.repeat;
        st.endsAt = Date.now() + rem; st.pausedRemainingMs = null; st.done = false;
      }
      api.changed(); update();
    }
    function reset() {
      Object.assign(w.state, { endsAt: null, pausedRemainingMs: null, done: false, repeatsLeft: null });
      api.changed(); update();
    }

    let lastShown = '';
    function update(now = Date.now()) {
      const st = w.state;
      const rem = remainingMs(st, now);
      const { m, s } = format(rem);
      const text = pad(m) + pad(s);
      if (text !== lastShown) {
        lastShown = text;
        text.split('').forEach((c, i) => { digitEls[i].textContent = c; });
      }
      const frac = st.durationMs > 0 ? rem / st.durationMs : 0;
      progress.setAttribute('stroke-dashoffset', String(C * (1 - frac)));
      const running = !!st.endsAt;
      box.classList.toggle('is-running', running);
      box.classList.toggle('is-idle', !running && st.pausedRemainingMs == null);
      box.classList.toggle('is-warn', isWarn(st, w.settings, rem));
      box.classList.toggle('is-done', !!st.done);
      playBtn.replaceChildren(iconEl(running ? 'pause' : 'play', { size: 28 }));
      playBtn.setAttribute('aria-label', running ? 'Pause' : 'Start');
      resetBtn.hidden = !running && st.pausedRemainingMs == null && !st.done;
      api.setLabel(`Timer, ${m} Minuten ${s} Sekunden` + (running ? ', läuft' : st.done ? ', abgelaufen' : ''));
    }

    function tick(now) {
      if (advance(w, now)) {
        if (!w.state.endsAt) live.textContent = 'Die Zeit ist abgelaufen.';
        api.changed();
      }
      update(now);
    }

    function tabTitle() {
      if (!w.settings.showInTab || !w.state.endsAt) return null;
      const { m, s } = format(remainingMs(w.state));
      return `${pad(m)}:${pad(s)}`;
    }

    update();
    return { update, tick, tabTitle };
  },

  settingsPanel(body, w, api) {
    const s = w.settings;
    const change = (patch) => { Object.assign(s, patch); api.changed(); api.refresh(); };

    const soundSel = h('select', { class: 'select', id: 'tw-sound', onChange: (e) => { change({ sound: e.target.value }); setWidgetDefaults('timer', { sound: e.target.value }); } },
      Object.entries(SOUNDS).map(([k, v]) => h('option', { value: k, selected: k === s.sound }, v)));
    body.append(section(null,
      h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'tw-sound' }, 'Ton bei Ablauf'),
        h('div', { class: 'row' }, soundSel,
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Ton anhören', title: 'Ton anhören', onClick: () => playSound(soundSel.value) }, iconEl('volume-2'))))));

    const repOut = h('output', { role: 'spinbutton', tabindex: '0', 'aria-labelledby': 'tw-rep-l', 'aria-valuemin': '0', 'aria-valuemax': '20' });
    const minus = h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Weniger Wiederholungen', onClick: () => setRep(s.repeat - 1) }, iconEl('minus', { size: 16 }));
    const plus = h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Mehr Wiederholungen', onClick: () => setRep(s.repeat + 1) }, iconEl('plus', { size: 16 }));
    function setRep(n) {
      const v = Math.max(0, Math.min(20, n));
      repOut.textContent = v; repOut.setAttribute('aria-valuenow', v); minus.disabled = v === 0;
      if (v !== s.repeat) change({ repeat: v });
    }
    repOut.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp') { e.preventDefault(); setRep(s.repeat + 1); } if (e.key === 'ArrowDown') { e.preventDefault(); setRep(s.repeat - 1); } });
    setRep(s.repeat);
    body.append(section(null, h('div', { class: 'field' }, h('span', { class: 'field__label', id: 'tw-rep-l' }, 'Wiederholen'),
      h('span', { class: 'field__hint' }, 'So oft startet der Timer nach Ablauf von selbst neu.'),
      h('div', { class: 'stepper' }, minus, repOut, plus))));

    const pct = h('input', { class: 'input', inputmode: 'numeric', value: s.redPercent, 'aria-label': 'Prozent', onChange: (e) => change({ redPercent: clampInt(e.target.value, 1, 99, 25), redMode: 'percent' }) });
    const sec = h('input', { class: 'input', inputmode: 'numeric', value: s.redSeconds, 'aria-label': 'Sekunden', onChange: (e) => change({ redSeconds: clampInt(e.target.value, 1, 5999, 10), redMode: 'seconds' }) });
    const radios = h('fieldset', { class: 'plain', disabled: !s.redIndicator },
      h('legend', { class: 'sr-only' }, 'Rot färben ab'),
      h('label', { class: 'check' }, h('input', { type: 'radio', name: 'tw-red', checked: s.redMode === 'percent', onChange: () => change({ redMode: 'percent' }) }), 'in den letzten', h('span', { class: 'input-unit' }, pct, h('span', null, '%'))),
      h('label', { class: 'check' }, h('input', { type: 'radio', name: 'tw-red', checked: s.redMode === 'seconds', onChange: () => change({ redMode: 'seconds' }) }), 'in den letzten', h('span', { class: 'input-unit' }, sec, h('span', null, 'Sek.'))));
    body.append(section('Anzeige',
      switchRow('Rot färben, wenn die Zeit knapp wird', s.redIndicator, (v) => { change({ redIndicator: v }); radios.disabled = !v; }),
      radios,
      switchRow('Restzeit im Browser-Tab zeigen', s.showInTab, (v) => change({ showInTab: v })),
      switchRow('Nach Ablauf automatisch zurücksetzen', s.resetWhenDone, (v) => change({ resetWhenDone: v }))));

    const d = getWidgetDefaults('timer');
    const dm = h('input', { class: 'input', id: 'tw-dm', inputmode: 'numeric', value: d.minutes != null ? d.minutes : 10, onChange: (e) => setWidgetDefaults('timer', { minutes: clampInt(e.target.value, 0, 99, 10) }) });
    const ds = h('input', { class: 'input', id: 'tw-ds', inputmode: 'numeric', value: d.seconds != null ? d.seconds : 0, onChange: (e) => setWidgetDefaults('timer', { seconds: clampInt(e.target.value, 0, 59, 0) }) });
    body.append(section('Startzeit für neue Timer',
      h('div', { class: 'row' },
        h('label', { class: 'check', for: 'tw-dm' }, h('span', { class: 'input-unit' }, dm, h('span', null, 'Min.'))),
        h('label', { class: 'check', for: 'tw-ds' }, h('span', { class: 'input-unit' }, ds, h('span', null, 'Sek.'))))));

    body.append(section('Farbthema', themePicker(w.themeId, (k) => { w.themeId = k; api.changed(); api.refresh(); })));
  },
};

function clampInt(v, min, max, fallback) {
  const n = parseInt(String(v).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
