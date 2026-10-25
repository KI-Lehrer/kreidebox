// Sound level (W04): microphone level with a limit, bell and counter. Nothing is recorded or stored.
import { h, iconEl } from '../ui/dom.js';
import { section, switchRow } from '../ui/overlays.js';
import { playSound, SOUNDS } from '../audio.js';
import { themePicker } from './themes.js';

const SMOOTH = [[0, 'sofort'], [1, '1 Sekunde'], [2, '2 Sekunden'], [3, '3 Sekunden'], [5, '5 Sekunden']];
const REPEAT_MS = 10000;

export default {
  type: 'soundlevel', label: 'Lautstärke', icon: 'audio-lines',
  size: { w: 760, h: 300 }, minSize: { w: 280, h: 160 },
  create: () => ({ settings: { sensitivity: 60, smoothing: 1, limit: 65, sound: 'glocke', showCounter: true }, state: { count: 0 } }),

  mount(root, w, api) {
    const fill = h('div', { class: 'sl__fill' });
    const mark = h('div', { class: 'sl__limit', title: 'Grenze' });
    const meter = h('div', { class: 'sl__meter', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Lautstärke' }, fill, mark);
    const counter = h('span', { class: 'sl__count', title: 'So oft wurde es zu laut' });
    const micBtn = h('button', { class: 'tw__btn tw__btn--ghost', type: 'button', 'data-nodrag': '', onClick: () => (stream ? stop() : start()) });
    const resetBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'data-nodrag': '', onClick: () => { w.state.count = 0; api.changed(); update(); } }, 'Zähler auf 0');
    const msg = h('div', { class: 'sl__msg' });
    const box = h('div', { class: 'sl' }, h('div', { class: 'sl__top' }, iconEl('audio-lines', { size: 28 }), counter, h('span', { class: 'sl__spacer' }), resetBtn, micBtn), meter, msg);
    root.append(box);

    let ctx = null; let stream = null; let analyser = null; let buf = null; let level = 0; let above = false; let lastBell = 0; let raf = 0; let denied = false;

    async function start() {
      msg.textContent = '';
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { denied = true; msg.textContent = 'Dieser Browser erlaubt hier kein Mikrofon (nur über https oder als Datei in Chrome/Edge).'; update(); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const src = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser(); analyser.fftSize = 2048; buf = new Float32Array(analyser.fftSize);
        src.connect(analyser);
        denied = false; loop();
      } catch (err) {
        denied = true; stream = null;
        msg.replaceChildren(h('strong', null, 'Kein Zugriff aufs Mikrofon. '), 'Erlaube den Zugriff beim Schloss-Symbol links in der Adressleiste und klicke dann hier nochmals auf das Mikrofon.');
      }
      update();
    }
    function stop() {
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (ctx) ctx.close();
      stream = null; ctx = null; level = 0; update();
    }
    let lastT = performance.now();
    function loop() {
      raf = requestAnimationFrame(loop);
      analyser.getFloatTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const db = 20 * Math.log10(rms + 1e-8); // about -100 (silent) .. 0
      const raw = Math.max(0, Math.min(100, ((db + 70) / 60) * 100 * (0.4 + w.settings.sensitivity / 83)));
      const now = performance.now(); const dt = (now - lastT) / 1000; lastT = now;
      const tau = Math.max(0.05, w.settings.smoothing);
      level += (raw - level) * Math.min(1, dt / tau);
      const over = level > w.settings.limit;
      if (over && (!above || Date.now() - lastBell > REPEAT_MS)) {
        lastBell = Date.now(); w.state.count += 1; playSound(w.settings.sound); api.changed();
      }
      above = over;
      paint();
    }
    function paint() {
      fill.style.width = `${level}%`;
      const rel = level / Math.max(1, w.settings.limit);
      box.dataset.zone = !stream ? 'off' : rel > 1 ? 'red' : rel > 0.75 ? 'yellow' : 'green';
      meter.setAttribute('aria-valuenow', String(Math.round(level)));
    }
    function update() {
      mark.style.left = `${w.settings.limit}%`;
      counter.textContent = String(w.state.count); counter.hidden = !w.settings.showCounter; resetBtn.hidden = !w.settings.showCounter || !w.state.count;
      micBtn.replaceChildren(iconEl(stream ? 'mic' : 'mic-off', { size: 24 }));
      micBtn.setAttribute('aria-label', stream ? 'Mikrofon ausschalten' : 'Mikrofon einschalten');
      box.classList.toggle('is-denied', denied);
      if (!stream && !denied && !msg.textContent) msg.textContent = 'Auf das Mikrofon klicken, um zu starten.';
      if (stream) msg.textContent = '';
      paint();
      api.setLabel(`Lautstärke${stream ? '' : ', Mikrofon aus'}${w.settings.showCounter ? `, ${w.state.count}-mal zu laut` : ''}`);
    }
    // start automatically if the permission was given before
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' }).then((p) => { if (p.state === 'granted') start(); }).catch(() => {});
    }
    update();
    return { update, destroy: stop };
  },

  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    const slider = (id, label, min, max, step, val, fmt, onVal) => {
      const out = h('span', { class: 'slider-value' }, fmt(val));
      const inp = h('input', { class: 'slider', id, type: 'range', min, max, step, value: val, 'aria-valuetext': fmt(val),
        onInput: (e) => { const v = Number(e.target.value); out.textContent = fmt(v); e.target.setAttribute('aria-valuetext', fmt(v)); onVal(v); } });
      return h('div', { class: 'field' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('label', { class: 'field__label', for: id }, label), out), inp);
    };
    const sound = h('select', { class: 'select', id: 'sl-sound', onChange: (e) => { w.settings.sound = e.target.value; change(); } },
      Object.entries(SOUNDS).map(([k, v]) => h('option', { value: k, selected: k === w.settings.sound }, v)));
    body.append(
      section(null,
        slider('sl-limit', 'Grenze', 10, 100, 1, w.settings.limit, (v) => `${v} %`, (v) => { w.settings.limit = v; change(); }),
        slider('sl-sens', 'Empfindlichkeit', 0, 100, 1, w.settings.sensitivity, (v) => `${v} %`, (v) => { w.settings.sensitivity = v; change(); }),
        slider('sl-smooth', 'Glättung (kurze Geräusche wie Husten ignorieren)', 0, SMOOTH.length - 1, 1, Math.max(0, SMOOTH.findIndex((s) => s[0] === w.settings.smoothing)),
          (i) => SMOOTH[i][1], (i) => { w.settings.smoothing = SMOOTH[i][0]; change(); })),
      section(null, h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'sl-sound' }, 'Ton, wenn es zu laut ist'), sound,
        h('span', { class: 'field__hint' }, 'Bleibt es laut, ertönt er alle 10 Sekunden wieder.'))),
      section('Anzeige', switchRow('Zähler zeigen', w.settings.showCounter, (v) => { w.settings.showCounter = v; change(); })),
      h('p', { class: 'field__hint' }, 'Es wird nichts aufgenommen oder gespeichert, nur die Lautstärke gemessen.'),
      section('Farbthema', themePicker(w.themeId, (k) => { w.themeId = k; change(); })));
  },
};
