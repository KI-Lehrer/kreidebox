// Visual timer (W16): a coloured disc that shrinks. Drag on the dial to set up to 60 minutes.
// Uses the same state as the Timer (endsAt / pausedRemainingMs), so it keeps running across screens and reloads.
import { h, iconEl } from '../ui/dom.js';
import { section, switchRow } from '../ui/overlays.js';
import { playSound, unlockAudio, SOUNDS } from '../audio.js';
import { remainingMs, format, advance } from './timer.js';
import { themePicker } from './themes.js';

const pad = (n) => String(n).padStart(2, '0');
const NS = 'http://www.w3.org/2000/svg';

export default {
  type: 'visualtimer', label: 'Kreis-Timer', icon: 'timer',
  size: { w: 520, h: 600 }, minSize: { w: 200, h: 220 },
  create: () => ({
    settings: { sound: 'gong', repeat: 0, digital: true, clockwise: true, color: '#D7372F', redIndicator: false, redMode: 'percent', redPercent: 25, redSeconds: 10, resetWhenDone: false },
    state: { durationMs: 10 * 60000, endsAt: null, pausedRemainingMs: null, done: false, repeatsLeft: null },
  }),

  mount(root, w, api) {
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '-110 -110 220 220'); svg.setAttribute('class', 'vt__dial');
    svg.setAttribute('data-nodrag', ''); svg.setAttribute('role', 'slider'); svg.setAttribute('tabindex', '0');
    svg.setAttribute('aria-label', 'Zeit einstellen (Pfeiltasten: 1 Minute)'); svg.setAttribute('aria-valuemin', '0'); svg.setAttribute('aria-valuemax', '60');
    const face = document.createElementNS(NS, 'circle'); face.setAttribute('r', '100'); face.setAttribute('class', 'vt__face'); svg.append(face);
    const wedge = document.createElementNS(NS, 'path'); wedge.setAttribute('class', 'vt__wedge'); svg.append(wedge);
    for (let i = 0; i < 60; i++) {
      const l = document.createElementNS(NS, 'line'); const big = i % 5 === 0;
      l.setAttribute('x1', 0); l.setAttribute('x2', 0); l.setAttribute('y1', -100); l.setAttribute('y2', big ? -90 : -95);
      l.setAttribute('transform', `rotate(${i * 6})`); l.setAttribute('class', 'vt__tick'); svg.append(l);
      if (big) { const t = document.createElementNS(NS, 'text'); const a = (i * 6 - 90) * Math.PI / 180; t.setAttribute('x', 80 * Math.cos(a)); t.setAttribute('y', 80 * Math.sin(a)); t.setAttribute('class', 'vt__num'); t.textContent = i; svg.append(t); }
    }
    const hub = document.createElementNS(NS, 'circle'); hub.setAttribute('r', '8'); hub.setAttribute('class', 'vt__hub'); svg.append(hub);
    const digits = h('div', { class: 'vt__digits', 'aria-hidden': 'true' });
    const playBtn = h('button', { class: 'tw__btn', type: 'button', 'data-nodrag': '', onClick: toggle });
    const resetBtn = h('button', { class: 'tw__btn tw__btn--ghost', type: 'button', 'data-nodrag': '', 'aria-label': 'Zurücksetzen', title: 'Zurücksetzen', onClick: reset }, iconEl('rotate-ccw'));
    const live = h('span', { class: 'sr-only', 'aria-live': 'polite' });
    const box = h('div', { class: 'vt' }, svg, h('div', { class: 'vt__row' }, digits, playBtn, resetBtn), live);
    root.append(box);

    // set minutes by dragging around the dial
    let dragging = false;
    const setFromPointer = (e) => {
      const r = svg.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2); const y = e.clientY - (r.top + r.height / 2);
      let deg = Math.atan2(y, x) * 180 / Math.PI + 90; if (deg < 0) deg += 360;
      if (!w.settings.clockwise) deg = 360 - deg;
      let min = Math.round(deg / 6); if (min === 0 && dragging === 'high') min = 60;
      dragging = min > 45 ? 'high' : min < 15 ? 'low' : true;
      setDuration(min * 60000);
    };
    svg.addEventListener('pointerdown', (e) => { if (w.state.endsAt) return; e.stopPropagation(); e.preventDefault(); svg.setPointerCapture(e.pointerId); dragging = true; setFromPointer(e); });
    svg.addEventListener('pointermove', (e) => { if (dragging) setFromPointer(e); });
    svg.addEventListener('pointerup', () => { if (dragging) { dragging = false; api.changed(); } });
    svg.addEventListener('keydown', (e) => {
      if (w.state.endsAt) return;
      const cur = Math.round(remainingMs(w.state) / 60000);
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); setDuration(Math.min(60, cur + 1) * 60000); api.changed(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); setDuration(Math.max(0, cur - 1) * 60000); api.changed(); }
    });
    function setDuration(ms) { Object.assign(w.state, { durationMs: ms, endsAt: null, pausedRemainingMs: null, done: false, repeatsLeft: null }); update(); }

    function toggle() {
      unlockAudio();
      const st = w.state;
      if (st.endsAt) { st.pausedRemainingMs = remainingMs(st); st.endsAt = null; }
      else {
        let rem = remainingMs(st); if (rem <= 0) { rem = st.durationMs; st.done = false; } if (rem <= 0) return;
        if (st.repeatsLeft == null) st.repeatsLeft = w.settings.repeat;
        st.endsAt = Date.now() + rem; st.pausedRemainingMs = null; st.done = false;
      }
      api.changed(); update();
    }
    function reset() { Object.assign(w.state, { endsAt: null, pausedRemainingMs: null, done: false, repeatsLeft: null }); api.changed(); update(); }

    function update(now = Date.now()) {
      const rem = remainingMs(w.state, now);
      const deg = Math.min(359.999, (rem / 60000) * 6);
      const a = (w.settings.clockwise ? deg : -deg) * Math.PI / 180;
      const large = deg > 180 ? 1 : 0; const sweep = w.settings.clockwise ? 1 : 0;
      wedge.setAttribute('d', rem <= 0 ? '' : `M0,0 L0,-100 A100,100 0 ${large},${sweep} ${100 * Math.sin(a)},${-100 * Math.cos(a)} Z`);
      wedge.style.fill = w.settings.color;
      const { m, s } = format(rem);
      digits.textContent = `${pad(m)}:${pad(s)}`; digits.hidden = !w.settings.digital;
      const running = !!w.state.endsAt;
      playBtn.replaceChildren(iconEl(running ? 'pause' : 'play', { size: 28 }));
      playBtn.setAttribute('aria-label', running ? 'Pause' : 'Start');
      resetBtn.hidden = !running && w.state.pausedRemainingMs == null && !w.state.done;
      box.classList.toggle('is-running', running); box.classList.toggle('is-done', !!w.state.done);
      svg.setAttribute('aria-valuenow', String(Math.round(rem / 60000))); svg.setAttribute('aria-valuetext', `${m} Minuten ${s} Sekunden`);
      api.setLabel(`Kreis-Timer, ${m} Minuten ${s} Sekunden` + (running ? ', läuft' : w.state.done ? ', abgelaufen' : ''));
    }
    function tick(now) { if (advance(w, now)) { if (!w.state.endsAt) live.textContent = 'Die Zeit ist abgelaufen.'; api.changed(); } update(now); }
    update();
    return { update: () => update(), tick };
  },

  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    const snd = h('select', { class: 'select', id: 'vt-sound', onChange: (e) => { w.settings.sound = e.target.value; change(); } }, Object.entries(SOUNDS).map(([k, v]) => h('option', { value: k, selected: k === w.settings.sound }, v)));
    const colors = ['#D7372F', '#2F6FDB', '#2C9A4B', '#E0A100', '#8A4FD6', '#191B22'];
    const cg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Farbe' }, colors.map((c) => {
      const b = h('button', { class: 'seg__btn', type: 'button', role: 'radio', 'aria-checked': String(c === w.settings.color), 'aria-label': `Farbe ${c}`,
        onClick: () => { w.settings.color = c; cg.querySelectorAll('[role=radio]').forEach((x) => x.setAttribute('aria-checked', String(x === b))); change(); } }, h('span', { class: 'dot', style: { background: c } }));
      return b;
    }));
    const rep = h('input', { class: 'input', type: 'number', min: 0, max: 20, value: w.settings.repeat, id: 'vt-rep', style: { width: '96px' }, onChange: (e) => { w.settings.repeat = Math.max(0, Math.min(20, +e.target.value || 0)); change(); } });
    body.append(
      h('p', { class: 'field__hint' }, 'Zeit einstellen: auf dem Zifferblatt ziehen (bis 60 Minuten) oder Pfeiltasten.'),
      section('Farbe', cg),
      section('Anzeige', switchRow('Digitale Zeit zeigen', w.settings.digital, (v) => { w.settings.digital = v; change(); }),
        switchRow('Im Uhrzeigersinn', w.settings.clockwise, (v) => { w.settings.clockwise = v; change(); })),
      section(null, h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'vt-sound' }, 'Ton bei Ablauf'), h('div', { class: 'row' }, snd,
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Ton anhören', onClick: () => playSound(snd.value) }, iconEl('volume-2')))),
      h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'vt-rep' }, 'Wiederholen'), rep)),
      section('Farbthema', themePicker(w.themeId, (k) => { w.themeId = k; change(); })));
  },
};
