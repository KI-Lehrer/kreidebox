// Widget colour themes: built-in ones (values live in tokens.css as --c-w-<key>-*)
// plus own themes made by the teacher (stored in IndexedDB, referenced as 'custom:<id>').
import { h, iconEl } from '../ui/dom.js';
import { customDialog, confirmDialog, toast } from '../ui/overlays.js';
import { cachedThemes, cachedTheme, saveTheme, deleteTheme, contrast } from '../data/library.js';

export const THEMES = [
  { key: 'standard', label: 'Standard' },
  { key: 'sunken', label: 'Grau' },
  { key: 'night', label: 'Nacht' },
  { key: 'mint', label: 'Minze' },
  { key: 'sky', label: 'Himmel' },
  { key: 'sun', label: 'Sonne' },
  { key: 'rose', label: 'Rose' },
  { key: 'lilac', label: 'Flieder' },
];

// Sets class and (for own themes) inline colours on a widget content element.
export function applyWidgetTheme(el, themeId, extra = 'wc') {
  const id = themeId || 'standard';
  const ct = id.startsWith('custom:') ? cachedTheme(id.slice(7)) : null;
  const key = ct ? 'custom' : id.startsWith('custom:') ? 'standard' : id;
  el.className = `w w--${key}${extra ? ' ' + extra : ''}`;
  for (const [p, v] of [['--w-bg', ct && ct.bg], ['--w-text', ct && ct.text], ['--w-accent', ct && ct.accent]]) {
    if (v) el.style.setProperty(p, v); else el.style.removeProperty(p);
  }
}

// Tell open screens that own themes changed (edited or deleted)
const themesChanged = () => dispatchEvent(new CustomEvent('nachbau:themes'));

// transparent: offers a "no card" option (text, image)
export function themePicker(current, onPick, { transparent = false } = {}) {
  const wrap = h('div', { class: 'themepick' });
  let cur = current || 'standard';
  const pick = (k) => { cur = k; onPick(k); draw(); };
  draw();
  return wrap;

  function draw() {
    const grid = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Farbthema' });
    const list = transparent ? [{ key: 'transparent', label: 'Ohne Karte' }, ...THEMES] : THEMES;
    for (const t of list) {
      const isT = t.key === 'transparent';
      const accent = t.key === 'standard' || t.key === 'night' ? 'accent' : 'text';
      grid.append(swatch(t.key, t.label, isT ? null : `var(--c-w-${t.key}-bg)`, isT ? 'var(--c-text)' : `var(--c-w-${t.key}-text)`, isT ? 'var(--c-text-muted)' : `var(--c-w-${t.key}-${accent})`, isT));
    }
    for (const t of cachedThemes()) grid.append(swatch('custom:' + t.id, t.name, t.bg, t.text, t.accent, false));
    grid.append(h('button', { class: 'swatch swatch--add', type: 'button', 'aria-label': 'Eigenes Farbthema erstellen', title: 'Eigenes Farbthema erstellen',
      onClick: async () => { const t = await editTheme(null); if (t) pick('custom:' + t.id); } }, iconEl('plus', { size: 22 })));
    const own = cur.startsWith('custom:') ? cachedTheme(cur.slice(7)) : null;
    wrap.replaceChildren(grid, own ? h('button', { class: 'btn btn--ghost btn--sm themepick__edit', type: 'button', onClick: async () => {
      const r = await editTheme(own);
      if (r === 'deleted') pick('standard'); else if (r) { themesChanged(); onPick(cur); draw(); }
    } }, iconEl('palette', { size: 16 }), `«${own.name}» bearbeiten`) : null);
  }

  function swatch(key, label, bg, text, acc, isT) {
    return h('button', { class: 'swatch' + (isT ? ' swatch--transparent' : ''), type: 'button', role: 'radio', 'aria-checked': String(key === cur), 'aria-label': label, title: label,
      style: bg ? { background: bg } : null, onClick: () => pick(key) },
    h('i', { style: { background: text } }), h('i', { style: { background: acc, opacity: '.6' } }));
  }
}

// Editor for an own theme. Resolves to the saved theme, 'deleted' or null.
export function editTheme(theme) {
  const t = theme ? { ...theme } : { name: '', bg: '#FFF4D6', text: '#3B2A00', accent: '#B5520A' };
  return customDialog((d, done) => {
    const id = 'th-' + Math.random().toString(36).slice(2);
    d.setAttribute('aria-labelledby', id);
    const name = h('input', { class: 'input', id: id + '-n', value: t.name, maxlength: 40, placeholder: 'z. B. Mathe-Gelb', autocomplete: 'off' });
    const color = (key, label) => {
      const inp = h('input', { type: 'color', class: 'colorinput', id: `${id}-${key}`, value: t[key], onInput: () => { t[key] = inp.value.toUpperCase(); paint(); } });
      return h('div', { class: 'field field--color' }, h('label', { class: 'field__label', for: `${id}-${key}` }, label), inp);
    };
    const preview = h('div', { class: 'w themeprev', 'aria-hidden': 'true' },
      h('strong', null, '12:30'), h('span', null, 'So sieht ein Widget aus.'), h('span', { class: 'themeprev__btn' }, 'Start'));
    const report = h('p', { class: 'themeprev__report', role: 'status' });
    function paint() {
      preview.style.setProperty('--w-bg', t.bg); preview.style.setProperty('--w-text', t.text); preview.style.setProperty('--w-accent', t.accent);
      const c1 = contrast(t.text, t.bg); const c2 = contrast(t.accent, t.bg);
      const ok = c1 >= 4.5 && c2 >= 3;
      report.className = 'themeprev__report' + (ok ? '' : ' is-warn');
      report.replaceChildren(iconEl(ok ? 'check' : 'triangle-alert', { size: 16 }),
        ok ? `Gut lesbar (Schrift ${c1.toFixed(1)} : 1, Akzent ${c2.toFixed(1)} : 1).`
          : `Schwer lesbar: ${c1 < 4.5 ? `Schrift nur ${c1.toFixed(1)} : 1 (mind. 4.5)` : ''}${c1 < 4.5 && c2 < 3 ? ', ' : ''}${c2 < 3 ? `Akzent nur ${c2.toFixed(1)} : 1 (mind. 3)` : ''}. Speichern geht trotzdem.`);
    }
    paint();
    const form = h('form', { method: 'dialog', onSubmit: async (e) => {
      e.preventDefault();
      const saved = await saveTheme({ ...t, name: name.value.trim() || 'Eigenes Thema' });
      done(saved);
    } },
    h('div', { class: 'modal__body' }, h('h2', { id }, theme ? 'Farbthema bearbeiten' : 'Eigenes Farbthema'),
      h('div', { class: 'field' }, h('label', { class: 'field__label', for: id + '-n' }, 'Name'), name),
      h('div', { class: 'colorrow' }, color('bg', 'Hintergrund'), color('text', 'Schrift'), color('accent', 'Akzent')),
      preview, report),
    h('div', { class: 'modal__actions' },
      theme ? h('button', { class: 'btn btn--ghost btn--danger-text', type: 'button', style: { marginRight: 'auto' }, onClick: async () => {
        d.close();
        if (await confirmDialog({ title: `«${theme.name}» löschen?`, text: 'Widgets mit diesem Thema werden wieder im Standard-Thema gezeigt.', ok: 'Löschen', danger: true })) {
          await deleteTheme(theme.id); themesChanged(); toast('Farbthema gelöscht'); done('deleted');
        } else d.showModal();
      } }, 'Löschen') : null,
      h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => done(null) }, 'Abbrechen'),
      h('button', { class: 'btn btn--primary', type: 'submit' }, 'Speichern')));
    d.append(form);
    setTimeout(() => name.focus());
  });
}
