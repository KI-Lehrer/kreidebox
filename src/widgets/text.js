// Text widget (W06). Double-click (or Enter when selected) to write; Ctrl/Cmd+B/I/U format. Content is sanitised.
import { h, iconEl } from '../ui/dom.js';
import { section } from '../ui/overlays.js';
import { themePicker } from './themes.js';

const SIZES = [['s', 'Klein', 32], ['m', 'Mittel', 48], ['l', 'Gross', 72], ['xl', 'Riesig', 110]];
const COLORS = [['', 'Standard'], ['#191B22', 'Schwarz'], ['#B42323', 'Rot'], ['#1D4A86', 'Blau'], ['#1D7346', 'Grün'], ['#6B4A00', 'Braun'], ['#5B2A86', 'Violett'], ['#FFFFFF', 'Weiss']];
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI', 'SPAN']);

export function sanitize(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html || '');
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 1) {
        if (!ALLOWED.has(child.tagName)) { child.replaceWith(...child.childNodes); continue; }
        for (const a of [...child.attributes]) child.removeAttribute(a.name);
        walk(child);
      } else if (child.nodeType !== 3) child.remove();
    }
  };
  walk(tpl.content);
  // drop the clutter of empty wrappers some browsers leave behind
  return tpl.innerHTML.replace(/(<div><br><\/div>)+$/g, '').trim();
}

export default {
  type: 'text', label: 'Text', icon: 'type',
  size: { w: 820, h: 300 }, minSize: { w: 160, h: 80 },
  create: () => ({ settings: { size: 'm', align: 'left', color: '' }, state: { html: '' } }),

  mount(root, w, api) {
    const ed = h('div', { class: 'tx__edit', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Text', 'data-placeholder': 'Doppelklicken und schreiben …', spellcheck: 'true', lang: 'de-CH' });
    ed.innerHTML = sanitize(w.state.html);
    const box = h('div', { class: 'tx' }, ed);
    root.append(box);
    let editing = false; let t = null;
    function edit() {
      if (editing) return;
      editing = true; ed.contentEditable = 'true';
      try { document.execCommand('styleWithCSS', false, false); } catch { /* old browsers */ } ed.setAttribute('data-nodrag', ''); box.classList.add('is-editing');
      ed.focus();
      const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
    function stop() {
      if (!editing) return;
      editing = false; ed.contentEditable = 'false'; ed.removeAttribute('data-nodrag'); box.classList.remove('is-editing');
      save(); update();
    }
    function save() { clearTimeout(t); w.state.html = sanitize(ed.innerHTML); api.changed(); }
    ed.addEventListener('input', () => { clearTimeout(t); t = setTimeout(save, 400); box.classList.toggle('is-empty', !ed.textContent.trim()); });
    ed.addEventListener('blur', stop);
    ed.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stop(); ed.closest('.wf').focus(); } });
    ed.addEventListener('paste', (e) => { if (!editing) return; e.preventDefault(); const text = e.clipboardData.getData('text/plain'); document.execCommand('insertText', false, text); });
    function update() {
      const size = SIZES.find((s) => s[0] === w.settings.size) || SIZES[1];
      ed.style.fontSize = size[2] + 'px';
      ed.style.textAlign = w.settings.align;
      ed.style.color = w.settings.color || '';
      box.classList.toggle('is-empty', !ed.textContent.trim());
      const plain = ed.textContent.trim();
      api.setLabel('Text' + (plain ? ': ' + plain.slice(0, 60) : ', leer'));
    }
    update();
    return { update, edit, destroy: () => clearTimeout(t) };
  },

  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    const group = (name, items, current, onPick, render) => {
      const g = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': name });
      for (const it of items) {
        const b = h('button', { class: 'seg__btn', type: 'button', role: 'radio', 'aria-checked': String(it[0] === current),
          onClick: () => { g.querySelectorAll('[role=radio]').forEach((x) => x.setAttribute('aria-checked', String(x === b))); onPick(it[0]); } }, render(it));
        g.append(b);
      }
      return g;
    };
    body.append(
      h('p', { class: 'field__hint' }, 'Zum Schreiben doppelt klicken (oder Widget wählen und Enter drücken). Fett, kursiv, unterstrichen: ' + (navigator.platform.includes('Mac') ? '⌘' : 'Ctrl') + '+B, I, U.'),
      section('Grösse', group('Schriftgrösse', SIZES, w.settings.size, (k) => { w.settings.size = k; change(); }, (it) => it[1])),
      section('Ausrichtung', group('Ausrichtung', [['left', 'Links'], ['center', 'Mitte'], ['right', 'Rechts']], w.settings.align, (k) => { w.settings.align = k; change(); }, (it) => it[1])),
      section('Textfarbe', group('Textfarbe', COLORS, w.settings.color, (k) => { w.settings.color = k; change(); },
        (it) => h('span', { class: 'dot', style: { background: it[0] || 'var(--w-text, #191B22)' }, title: it[1] }, h('span', { class: 'sr-only' }, it[1])))),
      section('Hintergrund', themePicker(w.themeId, (k) => { w.themeId = k; change(); }, { transparent: true })));
  },
};
