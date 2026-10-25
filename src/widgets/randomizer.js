// Randomizer (W03): one name at a time or a wheel; remembers who already had a turn.
import { h, iconEl } from '../ui/dom.js';
import { section, switchRow } from '../ui/overlays.js';
import { playSound, unlockAudio } from '../audio.js';
import { resolveNames, watchLists, listChooser } from './listsource.js';
import { themePicker } from './themes.js';

const WHEEL_COLORS = ['#F2B5A7', '#F6D58E', '#B9E0B5', '#A9D3EE', '#C9B8EE', '#F3B9D4', '#B8E2DA', '#F5C79B'];

export default {
  type: 'randomizer', label: 'Zufall', icon: 'shuffle',
  size: { w: 640, h: 360 }, minSize: { w: 280, h: 200 },
  create: () => ({ settings: { listId: 'default', localNames: [], mode: 'standard', sound: true, animation: true, remember: true }, state: { drawn: [], current: null, rotation: 0 } }),

  mount(root, w, api) {
    let data = { students: [] };
    const nameEl = h('div', { class: 'rz__name', 'aria-live': 'polite' });
    const info = h('div', { class: 'rz__info' });
    const pickBtn = h('button', { class: 'rz__btn', type: 'button', 'data-nodrag': '', onClick: pick }, iconEl('shuffle', { size: 28 }), h('span', null, 'Ziehen'));
    const resetBtn = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', 'data-nodrag': '', onClick: newRound }, 'Neue Runde');
    const wheel = h('div', { class: 'rz__wheel', 'aria-hidden': 'true' });
    const empty = h('div', { class: 'rz__empty' }, iconEl('users', { size: 36 }), h('p', null, 'Noch keine Namen'),
      h('button', { class: 'btn btn--primary btn--sm', type: 'button', 'data-nodrag': '', onClick: () => api.openSettings() }, 'Liste wählen'));
    const box = h('div', { class: 'rz' }, wheel, h('div', { class: 'rz__main' }, nameEl, info), h('div', { class: 'rz__ctrl' }, pickBtn, resetBtn), empty);
    root.append(box);
    let busy = false;

    async function load() {
      data = await resolveNames(w.settings);
      if (data.resolvedDefault) api.changed();
      update();
    }
    const unwatch = watchLists(load);

    const pool = () => data.students.map((s) => s.name).filter((n) => !w.settings.remember || !w.state.drawn.includes(n));

    async function pick() {
      if (busy) return;
      unlockAudio();
      let p = pool();
      if (!p.length) { if (!w.settings.remember) return; newRound(); p = pool(); }
      if (!p.length) return;
      const chosen = p[Math.floor(Math.random() * p.length)];
      busy = true; box.classList.add('is-busy');
      if (w.settings.mode === 'wheel') await spinTo(chosen);
      else if (w.settings.animation) await flicker(p, chosen);
      w.state.current = chosen;
      if (w.settings.remember && !w.state.drawn.includes(chosen)) w.state.drawn.push(chosen);
      busy = false; box.classList.remove('is-busy');
      if (w.settings.sound) playSound('pling');
      api.changed(); update();
    }

    function flicker(p, chosen) {
      return new Promise((res) => {
        let i = 0; const steps = 14;
        const tick = () => {
          nameEl.textContent = i < steps ? p[Math.floor(Math.random() * p.length)] : chosen;
          if (i++ < steps) setTimeout(tick, 30 + i * 6); else res();
        };
        tick();
      });
    }

    function spinTo(chosen) {
      const names = data.students.map((s) => s.name);
      const idx = names.indexOf(chosen); const seg = 360 / names.length;
      // segment idx is centred at idx*seg + seg/2 (clockwise from the top); bring it under the pointer at the top
      const target = 360 - (idx * seg + seg / 2);
      const base = Math.ceil((w.state.rotation || 0) / 360) * 360;
      w.state.rotation = base + 360 * (w.settings.animation ? 5 : 0) + target;
      const svg = wheel.querySelector('svg');
      if (svg) svg.style.transform = `rotate(${w.state.rotation}deg)`;
      return new Promise((res) => setTimeout(res, w.settings.animation ? 3200 : 50));
    }

    function drawWheel() {
      const names = data.students.map((s) => s.name);
      if (w.settings.mode !== 'wheel' || !names.length) { wheel.replaceChildren(); return; }
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '-100 -100 200 200');
      svg.style.transform = `rotate(${w.state.rotation || 0}deg)`;
      const seg = 360 / names.length;
      names.forEach((n, i) => {
        const a0 = (i * seg - 90) * Math.PI / 180; const a1 = ((i + 1) * seg - 90) * Math.PI / 180;
        const path = document.createElementNS(NS, 'path');
        const large = seg > 180 ? 1 : 0;
        path.setAttribute('d', names.length === 1 ? 'M0,-96 A96,96 0 1,1 -0.01,-96 Z' : `M0,0 L${96 * Math.cos(a0)},${96 * Math.sin(a0)} A96,96 0 ${large},1 ${96 * Math.cos(a1)},${96 * Math.sin(a1)} Z`);
        path.setAttribute('fill', WHEEL_COLORS[i % WHEEL_COLORS.length]);
        path.setAttribute('opacity', w.settings.remember && w.state.drawn.includes(n) ? '0.35' : '1');
        path.setAttribute('stroke', '#fff'); path.setAttribute('stroke-width', '0.8');
        svg.append(path);
        const mid = (i + 0.5) * seg - 90;
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('transform', `rotate(${mid}) translate(58 0)`);
        t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'middle');
        t.setAttribute('font-size', String(Math.max(5, Math.min(11, 150 / names.length + 3))));
        t.textContent = n.length > 14 ? n.slice(0, 13) + '…' : n;
        svg.append(t);
      });
      const hub = document.createElementNS(NS, 'circle'); hub.setAttribute('r', '9'); hub.setAttribute('fill', '#fff'); svg.append(hub);
      wheel.replaceChildren(svg, h('span', { class: 'rz__pointer' }));
    }

    function newRound() { w.state.drawn = []; w.state.current = null; api.changed(); update(); }

    function update() {
      const has = data.students.length > 0;
      box.classList.toggle('is-wheel', w.settings.mode === 'wheel');
      empty.hidden = has; pickBtn.disabled = !has;
      if (data.missing) { empty.querySelector('p').textContent = 'Die gewählte Liste wurde gelöscht'; }
      if (!busy) {
        drawWheel();
        const left = pool().length;
        const done = has && w.settings.remember && left === 0;
        nameEl.textContent = w.state.current || (has ? (w.settings.mode === 'wheel' ? '' : '?') : '');
        info.textContent = !has ? '' : done ? 'Alle waren dran!' : w.settings.remember ? `${data.students.length - left} von ${data.students.length} gezogen` : data.name;
        resetBtn.hidden = !(w.settings.remember && w.state.drawn.length);
        box.classList.toggle('is-done', done);
      }
      api.setLabel(`Zufallsgenerator${w.state.current ? ', zuletzt: ' + w.state.current : ''}`);
    }

    load();
    return { update: () => { load(); }, destroy: unwatch };
  },

  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    const mode = h('div', { class: 'choices', role: 'radiogroup', 'aria-label': 'Darstellung' },
      ...[['standard', 'Ein Name', 'type'], ['wheel', 'Glücksrad', 'circle']].map(([k, l, ic]) => {
        const b = h('button', { class: 'choice', type: 'button', role: 'radio', 'aria-checked': String(w.settings.mode === k),
          onClick: () => { w.settings.mode = k; mode.querySelectorAll('[role=radio]').forEach((x) => x.setAttribute('aria-checked', String(x === b))); change(); } }, iconEl(ic, { size: 28 }), h('span', null, l));
        return b;
      }));
    body.append(
      listChooser(w.settings, () => { w.state.drawn = []; w.state.current = null; change(); }),
      section('Darstellung', mode),
      section('Verhalten',
        switchRow('Gezogene merken, bis alle dran waren', w.settings.remember, (v) => { w.settings.remember = v; change(); }),
        switchRow('Ton', w.settings.sound, (v) => { w.settings.sound = v; change(); }),
        switchRow('Animation', w.settings.animation, (v) => { w.settings.animation = v; change(); })),
      section('Farbthema', themePicker(w.themeId, (k) => { w.themeId = k; change(); })));
  },
};
