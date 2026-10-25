// Poll (W02) at the board: children come forward and tap their answer. Results can stay hidden until revealed.
import { h, iconEl, iconButton } from '../ui/dom.js';
import { section, switchRow } from '../ui/overlays.js';
import { playSound, unlockAudio } from '../audio.js';
import { uid } from '../data/store.js';
import { themePicker } from './themes.js';

const TYPES = {
  mc: { label: 'Auswahl', icon: 'list' },
  smiley: { label: 'Smileys', icon: 'star' },
  tf: { label: 'Richtig / Falsch', icon: 'check' },
};
const SMILEYS = [['😀', 'Super'], ['🙂', 'Gut'], ['😐', 'Geht so'], ['🙁', 'Schwierig']];
const BAR_COLORS = ['#2F6FDB', '#E0A100', '#2C9A4B', '#D7372F', '#8A4FD6'];

function optionsFor(q) {
  if (q.type === 'smiley') return SMILEYS.map(([e, l]) => ({ face: e, label: l }));
  if (q.type === 'tf') return [{ face: '✓', label: 'Richtig' }, { face: '✗', label: 'Falsch' }];
  return q.options.filter((o) => o.trim()).map((o, i) => ({ face: 'ABCDE'[i], label: o }));
}

export default {
  type: 'poll', label: 'Umfrage', icon: 'chart-column',
  size: { w: 980, h: 560 }, minSize: { w: 360, h: 260 },
  create: () => ({ settings: { questions: [{ id: uid(), type: 'mc', text: 'Wie hat dir das Thema gefallen?', options: ['Sehr gut', 'Gut', 'Weniger'] }], hideResults: false, sound: true }, state: { index: 0, votes: {}, revealed: false } }),
  openSettingsOnAdd: () => true,

  mount(root, w, api) {
    const qText = h('div', { class: 'pl__q' });
    const opts = h('div', { class: 'pl__opts' });
    const total = h('span', { class: 'pl__total' });
    const reveal = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', 'data-nodrag': '', onClick: () => { w.state.revealed = !w.state.revealed; api.changed(); update(); } });
    const reset = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'data-nodrag': '', onClick: () => { w.state.votes[q().id] = []; w.state.revealed = false; api.changed(); update(); } }, 'Stimmen löschen');
    const prev = iconButton('chevron-left', 'Vorherige Frage', { cls: 'iconbtn--sm', onClick: () => go(-1) });
    const next = iconButton('chevron-right', 'Nächste Frage', { cls: 'iconbtn--sm', onClick: () => go(1) });
    prev.setAttribute('data-nodrag', ''); next.setAttribute('data-nodrag', '');
    const pager = h('span', { class: 'pl__pager' });
    root.append(h('div', { class: 'pl' }, qText, opts, h('div', { class: 'pl__foot' }, total, h('span', { class: 'sl__spacer' }), reset, reveal, h('span', { class: 'pl__nav' }, prev, pager, next))));
    const q = () => w.settings.questions[Math.min(w.state.index, w.settings.questions.length - 1)] || w.settings.questions[0];
    function go(d) { const n = w.state.index + d; if (n < 0 || n >= w.settings.questions.length) return; w.state.index = n; w.state.revealed = false; api.changed(); update(); }
    function vote(i) {
      unlockAudio();
      const v = w.state.votes[q().id] || (w.state.votes[q().id] = []);
      v[i] = (v[i] || 0) + 1;
      if (w.settings.sound) playSound('pling', 0.15);
      api.changed(); update();
      opts.children[i] && opts.children[i].classList.add('is-bump'); setTimeout(() => opts.children[i] && opts.children[i].classList.remove('is-bump'), 250);
    }
    function update() {
      const cur = q(); if (!cur) return;
      const o = optionsFor(cur);
      const v = w.state.votes[cur.id] || [];
      const sum = o.reduce((s, _, i) => s + (v[i] || 0), 0);
      const show = !w.settings.hideResults || w.state.revealed;
      qText.textContent = cur.text || 'Frage eingeben (Zahnrad)';
      opts.dataset.type = cur.type;
      opts.replaceChildren(...o.map((op, i) => {
        const n = v[i] || 0; const pct = sum ? Math.round((n / sum) * 100) : 0;
        return h('button', { class: 'pl__opt', type: 'button', 'data-nodrag': '', style: { '--c': BAR_COLORS[i % BAR_COLORS.length], '--p': show ? pct + '%' : '0%' },
          'aria-label': `${op.label}${show ? `, ${n} Stimme${n === 1 ? '' : 'n'}` : ''}. Tippen zum Abstimmen`, onClick: () => vote(i) },
        h('span', { class: 'pl__face', 'aria-hidden': 'true' }, op.face), h('span', { class: 'pl__label' }, cur.type === 'smiley' ? '' : op.label),
        h('span', { class: 'pl__bar', 'aria-hidden': 'true' }), h('span', { class: 'pl__count', 'aria-hidden': 'true' }, show ? `${n} · ${pct} %` : ''));
      }));
      total.textContent = `${sum} Stimme${sum === 1 ? '' : 'n'}`;
      reveal.hidden = !w.settings.hideResults; reveal.textContent = w.state.revealed ? 'Ergebnis verbergen' : 'Ergebnis zeigen';
      reset.hidden = !sum;
      const many = w.settings.questions.length > 1;
      prev.hidden = next.hidden = pager.hidden = !many;
      pager.textContent = `${Math.min(w.state.index, w.settings.questions.length - 1) + 1} / ${w.settings.questions.length}`;
      prev.disabled = w.state.index <= 0; next.disabled = w.state.index >= w.settings.questions.length - 1;
      api.setLabel(`Umfrage: ${cur.text}, ${sum} Stimmen`);
    }
    update();
    return { update };
  },

  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    const list = h('div', { class: 'pl-edit' });
    function draw() {
      list.replaceChildren(...w.settings.questions.map((q, qi) => {
        const typeSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': `Art der Frage ${qi + 1}` }, Object.entries(TYPES).map(([k, t]) => {
          const b = h('button', { class: 'seg__btn', type: 'button', role: 'radio', 'aria-checked': String(q.type === k),
            onClick: () => { q.type = k; change(); draw(); } }, t.label);
          return b;
        }));
        const optInputs = q.type === 'mc' ? h('div', { class: 'pl-edit__opts' }, [0, 1, 2, 3, 4].map((i) => h('div', { class: 'row' }, h('span', { class: 'pl-edit__letter', 'aria-hidden': 'true' }, 'ABCDE'[i]),
          h('input', { class: 'input', value: q.options[i] || '', placeholder: i < 2 ? 'Antwort' : 'Antwort (freiwillig)', 'aria-label': `Antwort ${'ABCDE'[i]}`,
            onInput: (e) => { q.options[i] = e.target.value; change(); } })))) : null;
        return h('div', { class: 'pl-edit__q' },
          h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('strong', null, `Frage ${qi + 1}`),
            w.settings.questions.length > 1 ? iconButton('trash-2', `Frage ${qi + 1} entfernen`, { cls: 'iconbtn--sm iconbtn--danger', onClick: () => { w.settings.questions.splice(qi, 1); w.state.index = 0; change(); draw(); } }) : null),
          h('textarea', { class: 'textarea', rows: 2, style: { minHeight: '64px' }, 'aria-label': `Text der Frage ${qi + 1}`, onInput: (e) => { q.text = e.target.value; change(); } }, q.text),
          typeSeg, optInputs);
      }));
    }
    draw();
    body.append(section('Fragen', list, h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => { w.settings.questions.push({ id: uid(), type: 'mc', text: '', options: ['', ''] }); w.state.index = w.settings.questions.length - 1; change(); draw(); } }, '+ Frage')),
      section('Abstimmen', h('p', { class: 'field__hint' }, 'Die Kinder tippen an der Tafel auf ihre Antwort.'),
        switchRow('Ergebnis erst auf Knopfdruck zeigen', w.settings.hideResults, (v) => { w.settings.hideResults = v; w.state.revealed = false; change(); }),
        switchRow('Ton bei jeder Stimme', w.settings.sound, (v) => { w.settings.sound = v; change(); })),
      section('Farbthema', themePicker(w.themeId, (k) => { w.themeId = k; change(); })));
  },
};
