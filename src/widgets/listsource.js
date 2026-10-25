// Shared "which names?" logic for randomizer and group maker, plus the panel section to choose them.
import { h, iconEl } from '../ui/dom.js';
import { section, showMenu } from '../ui/overlays.js';
import { listNameLists, getNameList, getDefaultList, onListsChange, parseNames, SUGGESTIONS } from '../data/namelists.js';

// settings: { listId: 'default' | id | null, localNames: [] }
// returns { name, students: [{id, name}], pairing, missing }
export async function resolveNames(settings) {
  if (settings.listId === 'local' || (!settings.listId && settings.localNames && settings.localNames.length)) {
    return { name: 'Eigene Liste', students: (settings.localNames || []).map((n, i) => ({ id: 'local-' + i, name: n })), pairing: [], local: true };
  }
  if (!settings.listId || settings.listId === 'default') {
    const d = await getDefaultList();
    if (d) { settings.listId = d.id; return { name: d.name, students: d.students, pairing: d.pairing || [], resolvedDefault: true }; }
    return { name: '', students: [], pairing: [], missing: false };
  }
  const l = await getNameList(settings.listId);
  if (!l) return { name: '', students: [], pairing: [], missing: true };
  return { name: l.name, students: l.students, pairing: l.pairing || [] };
}

export const watchLists = onListsChange;

export function listChooser(settings, onChange) {
  const wrap = h('div', { class: 'panel__section' });
  async function draw() {
    const lists = await listNameLists();
    const id = 'ls-' + Math.random().toString(36).slice(2);
    const local = settings.listId === 'local';
    const radios = lists.map((l) => h('label', { class: 'check' },
      h('input', { type: 'radio', name: id, checked: settings.listId === l.id, onChange: () => { settings.listId = l.id; onChange(); draw(); } }),
      h('span', null, h('strong', null, l.name), ` · ${l.students.length} Namen`)));
    const area = h('textarea', { class: 'textarea', rows: 7, placeholder: 'Ein Name pro Zeile …', 'aria-label': 'Eigene Namen für dieses Widget',
      onInput: () => { settings.localNames = parseNames(area.value); onChange(); } }, (settings.localNames || []).join('\n'));
    const sug = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-haspopup': 'menu', onClick: () => showMenu(sug,
      Object.entries(SUGGESTIONS).map(([k, v]) => ({ label: k, onClick: () => { settings.listId = 'local'; settings.localNames = v.slice(); onChange(); draw(); } })), { label: 'Vorschläge', align: 'left' }) },
    iconEl('wand-sparkles', { size: 16 }), 'Vorschläge');
    wrap.replaceChildren(...[
      h('h3', null, 'Namen'),
      ...radios,
      h('label', { class: 'check' }, h('input', { type: 'radio', name: id, checked: local, onChange: () => { settings.listId = 'local'; onChange(); draw(); } }), 'Eigene Namen nur für dieses Widget'),
      local ? area : null,
      h('div', { class: 'row', style: { flexWrap: 'wrap' } }, sug, h('a', { class: 'btn btn--ghost btn--sm', href: '#/listen' }, iconEl('users', { size: 16 }), 'Namenslisten verwalten')),
      !lists.length && !local ? h('p', { class: 'field__hint' }, 'Noch keine gespeicherten Listen. Lege unter «Namenslisten» eine an oder tippe eigene Namen ein.') : null,
    ].filter(Boolean));
  }
  draw();
  return wrap;
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export { section };
