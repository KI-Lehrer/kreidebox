// Namenslisten (S12): create, edit, default list, pairing rules. Autosaves while typing.
import { listNameLists, getNameList, createNameList, saveNameList, applyNames, parseNames, deleteNameList, restoreNameList, setDefaultList, onListsChange, SUGGESTIONS } from '../data/namelists.js';
import { h, iconEl, iconButton } from '../ui/dom.js';
import { toast, showMenu } from '../ui/overlays.js';
import { topNav } from './nav.js';

export async function renderLists(root, listId) {
  document.title = 'Namenslisten · Kreidebox';
  const page = h('main', { class: 'dash', id: 'main' });
  root.append(page);
  let current = listId || null;
  let saveTimer = null; let editing = null;
  const unsub = onListsChange(() => { if (!saveTimer) drawSide(); });
  const side = h('nav', { class: 'lists__side', 'aria-label': 'Namenslisten' });
  const editor = h('section', { class: 'lists__editor', 'aria-live': 'polite' });
  page.append(
    topNav('lists'),
    h('header', { class: 'dash__head' },
      h('div', null, h('h1', null, 'Namenslisten'), h('p', { class: 'dash__sub' }, 'Für Zufallsgenerator und Gruppen. Die Namen bleiben auf diesem Computer.')),
      h('div', { class: 'dash__actions' }, h('button', { class: 'btn btn--primary btn--lg', type: 'button', onClick: newList }, iconEl('plus', { size: 20 }), 'Neue Liste'))),
    h('div', { class: 'lists' }, side, editor));
  await drawSide();
  if (!current) { const all = await listNameLists(); if (all[0]) current = all[0].id; }
  await drawEditor();
  return async () => { unsub(); await flush(); };

  async function newList() {
    await flush();
    const l = await createNameList('Neue Liste', []);
    current = l.id; history.replaceState(null, '', `#/listen/${l.id}`);
    await drawSide(); await drawEditor();
    editor.querySelector('#nl-name').select();
  }

  async function drawSide() {
    const all = await listNameLists();
    side.replaceChildren(all.length
      ? h('ul', { role: 'list', class: 'lists__ul' }, all.map((l) => h('li', null,
        h('a', { class: 'lists__item', href: `#/listen/${l.id}`, 'aria-current': l.id === current ? 'page' : null,
          onClick: async (e) => { e.preventDefault(); await flush(); current = l.id; history.replaceState(null, '', `#/listen/${l.id}`); drawSide(); drawEditor(); } },
        h('span', { class: 'lists__name' }, l.name), l.isDefault && h('span', { class: 'badge-soft', title: 'Standardliste' }, iconEl('star', { size: 14 }), 'Standard'),
        h('span', { class: 'lists__count' }, `${l.students.length}`)))))
      : h('p', { class: 'field__hint' }, 'Noch keine Listen.'));
  }

  async function drawEditor() {
    const l = current && await getNameList(current);
    editing = l;
    if (!l) {
      editor.replaceChildren(h('div', { class: 'empty' }, iconEl('users', { size: 48 }), h('h3', null, 'Noch keine Namenslisten'),
        h('p', null, 'Lege eine Liste an, z. B. «6b», und füge die Namen ein: einen pro Zeile.'),
        h('button', { class: 'btn btn--primary', type: 'button', onClick: newList }, iconEl('plus', { size: 18 }), 'Neue Liste')));
      return;
    }
    const name = h('input', { class: 'input', id: 'nl-name', value: l.name, maxlength: 60, onInput: (e) => { l.name = e.target.value.trim() || 'Ohne Namen'; schedule(); } });
    const area = h('textarea', { class: 'textarea', id: 'nl-names', rows: 14, placeholder: 'Ein Name pro Zeile …\nAnna\nBen\nCelia', onInput: () => { applyNames(l, parseNames(area.value)); count.textContent = countText(); schedule(); drawRules(); } },
      l.students.map((s) => s.name).join('\n'));
    const count = h('span', { class: 'field__hint' });
    const countText = () => `${l.students.length} Name${l.students.length === 1 ? '' : 'n'} · Leere Zeilen und doppelte Namen werden ignoriert.`;
    count.textContent = countText();
    const sugBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-haspopup': 'menu', onClick: () => showMenu(sugBtn,
      Object.entries(SUGGESTIONS).map(([k, v]) => ({ label: k, onClick: () => { area.value = v.join('\n'); area.dispatchEvent(new Event('input')); } })), { label: 'Vorschläge', align: 'left' }) },
    iconEl('wand-sparkles', { size: 16 }), 'Vorschläge');
    const star = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', 'aria-pressed': String(!!l.isDefault),
      onClick: async () => { await flush(); await setDefaultList(l.id); toast(l.isDefault ? 'Keine Standardliste mehr' : `«${l.name}» ist jetzt die Standardliste`); await drawSide(); await drawEditor(); } },
    iconEl('star', { size: 16 }), l.isDefault ? 'Standardliste' : 'Als Standard setzen');
    const del = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: async () => {
      await flush(); await deleteNameList(l.id); const id = l.id; current = null; await drawSide(); await drawEditor();
      toast(`«${l.name}» gelöscht`, { action: 'Rückgängig', onAction: async () => { await restoreNameList(id); current = id; await drawSide(); await drawEditor(); } });
    } }, iconEl('trash-2', { size: 16 }), 'Löschen');

    const rules = h('div', { class: 'rules' });
    function drawRules() {
      const byId = new Map(l.students.map((s) => [s.id, s.name]));
      const opts = (sel) => l.students.map((s) => h('option', { value: s.id, selected: s.id === sel }, s.name));
      const a = h('select', { class: 'select', 'aria-label': 'Erstes Kind' }, opts());
      const b = h('select', { class: 'select', 'aria-label': 'Zweites Kind' }, opts(l.students[1] && l.students[1].id));
      const kind = h('select', { class: 'select', 'aria-label': 'Regel' }, h('option', { value: 'never' }, 'nie zusammen'), h('option', { value: 'always' }, 'immer zusammen'));
      const add = h('button', { class: 'btn btn--secondary', type: 'button', disabled: l.students.length < 2, onClick: () => {
        if (a.value === b.value) { toast('Bitte zwei verschiedene Kinder wählen.'); return; }
        if (l.pairing.some((p) => (p.a === a.value && p.b === b.value) || (p.a === b.value && p.b === a.value))) { toast('Für diese zwei gibt es schon eine Regel.'); return; }
        l.pairing.push({ a: a.value, b: b.value, kind: kind.value }); schedule(); drawRules();
      } }, 'Hinzufügen');
      rules.replaceChildren(
        l.pairing.length ? h('ul', { role: 'list', class: 'rules__ul' }, l.pairing.map((p, i) => h('li', { class: 'rules__row' },
          h('span', null, h('strong', null, byId.get(p.a) || '?'), p.kind === 'never' ? ' und ' : ' mit ', h('strong', null, byId.get(p.b) || '?'), p.kind === 'never' ? ' nie zusammen' : ' immer zusammen'),
          iconButton('x', 'Regel entfernen', { cls: 'iconbtn--sm', onClick: () => { l.pairing.splice(i, 1); schedule(); drawRules(); } })))) : h('p', { class: 'field__hint' }, 'Noch keine Regeln.'),
        h('div', { class: 'rules__add' }, a, kind, b, add));
    }
    drawRules();

    editor.replaceChildren(
      h('div', { class: 'demo' },
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'nl-name' }, 'Name der Liste'), name),
        h('div', { class: 'field' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('label', { class: 'field__label', for: 'nl-names' }, 'Namen'), sugBtn), area, count),
        h('div', { class: 'row', style: { flexWrap: 'wrap' } }, star, del, h('span', { class: 'savestate', role: 'status', id: 'nl-save' }, 'Gespeichert'))),
      h('div', { class: 'demo' }, h('h2', { class: 'dash__h2', style: { marginBottom: 0 } }, 'Regeln für Gruppen'),
        h('p', { class: 'field__hint' }, 'Die Gruppenbildung hält sich daran, so gut es geht. Im Widget sind die Regeln nicht sichtbar.'), rules));
  }

  function schedule() {
    const st = editor.querySelector('#nl-save'); if (st) st.textContent = 'Wird gespeichert …';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 500);
  }
  async function flush() {
    if (!saveTimer || !editing) { saveTimer = null; return; }
    clearTimeout(saveTimer); saveTimer = null;
    await saveNameList(editing);
    const st = editor.querySelector('#nl-save'); if (st) st.textContent = 'Gespeichert';
    drawSide();
  }
}
