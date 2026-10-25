// Group maker (W12): groups from a name list, respects "never/always together" rules, absent children can be left out.
import { h, iconEl } from '../ui/dom.js';
import { section, switchRow, toast } from '../ui/overlays.js';
import { playSound, unlockAudio } from '../audio.js';
import { resolveNames, watchLists, listChooser, shuffle } from './listsource.js';
import { themePicker } from './themes.js';

const GROUP_COLORS = ['#F2B5A7', '#F6D58E', '#B9E0B5', '#A9D3EE', '#C9B8EE', '#F3B9D4', '#B8E2DA', '#F5C79B'];

// Returns { groups: [[student]], conflicts } ; tries several random arrangements and keeps the best.
export function makeGroups(students, pairing, mode, value) {
  const n = students.length;
  if (!n) return { groups: [], conflicts: 0 };
  const count = Math.max(1, Math.min(n, mode === 'size' ? Math.ceil(n / Math.max(1, value)) : value));
  const cap = Math.ceil(n / count);
  const ids = new Set(students.map((s) => s.id));
  const rules = pairing.filter((p) => ids.has(p.a) && ids.has(p.b));
  // union "always" pairs into clusters
  const parent = new Map(students.map((s) => [s.id, s.id]));
  const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
  rules.filter((r) => r.kind === 'always').forEach((r) => parent.set(find(r.a), find(r.b)));
  const clusters = new Map();
  for (const s of students) { const r = find(s.id); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(s); }
  const never = rules.filter((r) => r.kind === 'never');
  const clash = (group, s) => never.filter((r) => (r.a === s.id && group.some((g) => g.id === r.b)) || (r.b === s.id && group.some((g) => g.id === r.a))).length;

  let best = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const groups = Array.from({ length: count }, () => []);
    const units = shuffle([...clusters.values()]).sort((a, b) => b.length - a.length);
    let conflicts = 0;
    for (const unit of units) {
      let bestG = null; let bestScore = Infinity;
      for (const g of shuffle(groups)) {
        const over = Math.max(0, g.length + unit.length - cap);
        const score = unit.reduce((c, s) => c + clash(g, s), 0) * 100 + over * 1000 + g.length;
        if (score < bestScore) { bestScore = score; bestG = g; }
      }
      conflicts += unit.reduce((c, s) => c + clash(bestG, s), 0);
      bestG.push(...unit);
    }
    const spread = Math.max(...groups.map((g) => g.length)) - Math.min(...groups.map((g) => g.length));
    const score = conflicts * 100 + spread;
    if (!best || score < best.score) best = { groups, conflicts, score };
    if (best.score <= 1) break;
  }
  return { groups: best.groups.map((g) => shuffle(g)), conflicts: best.conflicts };
}

export default {
  type: 'groupmaker', label: 'Gruppen', icon: 'users',
  size: { w: 1100, h: 560 }, minSize: { w: 360, h: 240 },
  create: () => ({ settings: { listId: 'default', localNames: [], mode: 'count', value: 4, absent: [], sound: true }, state: { groups: null } }),

  mount(root, w, api) {
    let data = { students: [], pairing: [] };
    const grid = h('div', { class: 'gm__grid' });
    const makeBtn = h('button', { class: 'rz__btn', type: 'button', 'data-nodrag': '', onClick: () => generate() }, iconEl('shuffle', { size: 24 }), h('span', null, 'Gruppen bilden'));
    const info = h('span', { class: 'gm__info' });
    const empty = h('div', { class: 'rz__empty' }, iconEl('users', { size: 36 }), h('p', null, 'Noch keine Namen'),
      h('button', { class: 'btn btn--primary btn--sm', type: 'button', 'data-nodrag': '', onClick: () => api.openSettings() }, 'Liste wählen'));
    const rotBtn = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', 'data-nodrag': '', title: 'Alle Gruppen rücken eine Station weiter', onClick: () => {
      const g = w.state.groups; if (!g || g.length < 2) return;
      w.state.groups = [g[g.length - 1], ...g.slice(0, -1)]; api.changed(); update();
    } }, iconEl('rotate-cw', { size: 16 }), 'Stationen wechseln');
    const box = h('div', { class: 'gm' }, grid, h('div', { class: 'gm__bar' }, info, h('span', { class: 'sl__spacer' }), rotBtn, makeBtn), empty);
    root.append(box);

    async function load() { data = await resolveNames(w.settings); if (data.resolvedDefault) api.changed(); update(); }
    const unwatch = watchLists(load);
    const present = () => data.students.filter((s) => !w.settings.absent.includes(s.id));

    function generate() {
      unlockAudio();
      const r = makeGroups(present(), data.pairing, w.settings.mode, w.settings.value);
      w.state.groups = r.groups.map((g) => g.map((s) => s.name));
      if (r.conflicts) toast(`${r.conflicts} Regel${r.conflicts > 1 ? 'n' : ''} liess${r.conflicts > 1 ? 'en' : ''} sich nicht einhalten.`);
      if (w.settings.sound) playSound('pling');
      api.changed(); update();
    }

    function update() {
      const has = data.students.length > 0;
      empty.hidden = has; makeBtn.disabled = !has;
      const groups = w.state.groups || [];
      rotBtn.hidden = groups.length < 2;
      grid.style.setProperty('--cols', String(Math.min(groups.length || 1, groups.length > 4 ? Math.ceil(groups.length / 2) : groups.length || 1)));
      grid.replaceChildren(...groups.map((g, i) => h('section', { class: 'gm__group', style: { '--g': GROUP_COLORS[i % GROUP_COLORS.length] }, 'aria-label': `Gruppe ${i + 1}` },
        h('h4', null, `Gruppe ${i + 1}`), h('ul', null, g.map((n) => h('li', null, n))))));
      const p = present().length;
      info.textContent = has ? `${p} Kinder${w.settings.absent.length ? ` (${w.settings.absent.length} abwesend)` : ''} · ${w.settings.mode === 'count' ? `${w.settings.value} Gruppen` : `je ${w.settings.value}`}` : '';
      api.setLabel(`Gruppen${groups.length ? `, ${groups.length} Gruppen` : ''}`);
    }
    load();
    return { update: () => load(), destroy: unwatch };
  },

  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    const absentBox = h('div', { class: 'panel__section' });
    async function drawAbsent() {
      const d = await resolveNames(w.settings);
      absentBox.replaceChildren(h('h3', null, 'Anwesend'),
        d.students.length ? h('div', { class: 'absent' }, d.students.map((s) => h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: !w.settings.absent.includes(s.id), onChange: (e) => {
            w.settings.absent = e.target.checked ? w.settings.absent.filter((x) => x !== s.id) : [...w.settings.absent, s.id]; change();
          } }), s.name))) : h('p', { class: 'field__hint' }, 'Zuerst Namen wählen.'));
    }
    const out = h('output', { role: 'spinbutton', tabindex: '0', 'aria-label': 'Anzahl', 'aria-valuemin': '1', 'aria-valuemax': '30' });
    const minus = h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Weniger', onClick: () => setVal(w.settings.value - 1) }, iconEl('minus', { size: 16 }));
    const plus = h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Mehr', onClick: () => setVal(w.settings.value + 1) }, iconEl('plus', { size: 16 }));
    function setVal(n) { w.settings.value = Math.max(1, Math.min(30, n)); out.textContent = w.settings.value; out.setAttribute('aria-valuenow', w.settings.value); minus.disabled = w.settings.value <= 1; change(); }
    out.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp') { e.preventDefault(); setVal(w.settings.value + 1); } if (e.key === 'ArrowDown') { e.preventDefault(); setVal(w.settings.value - 1); } });
    out.textContent = w.settings.value; minus.disabled = w.settings.value <= 1;
    const modes = h('fieldset', { class: 'plain' }, h('legend', { class: 'sr-only' }, 'Einteilung'),
      ...[['count', 'Anzahl Gruppen'], ['size', 'Kinder pro Gruppe']].map(([k, l]) => h('label', { class: 'check' },
        h('input', { type: 'radio', name: 'gm-mode', checked: w.settings.mode === k, onChange: () => { w.settings.mode = k; change(); } }), l)));
    body.append(
      listChooser(w.settings, () => { w.settings.absent = []; change(); drawAbsent(); }),
      section('Einteilung', modes, h('div', { class: 'stepper' }, minus, out, plus),
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => { const m = api; m.refresh(); document.querySelector(`[data-id="${w.id}"] .rz__btn`)?.click(); } }, 'Gruppen neu bilden')),
      absentBox,
      section('Weiteres', switchRow('Ton', w.settings.sound, (v) => { w.settings.sound = v; change(); }),
        h('p', { class: 'field__hint' }, 'Regeln wie «nie zusammen» legst du unter Namenslisten fest.')),
      section('Farbthema', themePicker(w.themeId, (k) => { w.themeId = k; change(); })));
    drawAbsent();
  },
};
