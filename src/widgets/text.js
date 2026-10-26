// Text widget (W06). Double-click (or Enter when selected) to write. While writing, a format bar shows:
// bold / italic / underline, font size and font. With text marked it changes the marked part, otherwise the whole text.
// Content is sanitised: only a few tags, and on <span> only our own fs-*/ff-* classes.
import { h, modKey } from '../ui/dom.js';
import { section } from '../ui/overlays.js';
import { themePicker } from './themes.js';

// [key, label, px]. The first four are the classic presets of the settings panel.
export const SIZES = [['xs', '24', 24], ['s', '32', 32], ['m', '48', 48], ['ml', '60', 60], ['l', '72', 72], ['xl', '110', 110], ['xxl', '150', 150]];
const PRESETS = [['s', 'Klein'], ['m', 'Mittel'], ['l', 'Gross'], ['xl', 'Riesig']];
// [key, label, css font-family]. Andika, Edu SA Beginner and Playpen Sans are bundled (offline); the rest are on every computer.
export const FONTS = [
  ['std', 'Standard', "'Atkinson Hyperlegible Next', system-ui, sans-serif"],
  ['andika', 'Andika (Leseschrift)', "'Andika', 'Atkinson Hyperlegible Next', sans-serif"],
  ['schul', 'Schulschrift', "'Edu SA Beginner', 'Andika', cursive"],
  ['playpen', 'Playpen (verspielt)', "'Playpen Sans', 'Comic Sans MS', cursive"],
  ['arial', 'Arial', 'Arial, Helvetica, sans-serif'],
  ['georgia', 'Georgia', "Georgia, 'Times New Roman', serif"],
  ['courier', 'Courier', "'Courier New', Courier, monospace"],
];
// [hex for the whole text, label, class key for marked text]
const COLORS = [['', 'Standard', 'std'], ['#191B22', 'Schwarz', 'black'], ['#B42323', 'Rot', 'red'], ['#1D4A86', 'Blau', 'blue'], ['#1D7346', 'Grün', 'green'], ['#6B4A00', 'Braun', 'brown'], ['#5B2A86', 'Violett', 'violet'], ['#FFFFFF', 'Weiss', 'white']];
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI', 'SPAN']);
const CLASS_OK = new RegExp(`^(fs-(${SIZES.map((s) => s[0]).join('|')})|ff-(${FONTS.map((f) => f[0]).join('|')})|fc-(${COLORS.map((c) => c[2]).join('|')}))$`);
const MARK = 'kb-mark-x';

export function sanitize(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html || '');
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 1) {
        walk(child);
        if (!ALLOWED.has(child.tagName)) { child.replaceWith(...child.childNodes); continue; }
        const keep = child.tagName === 'SPAN' ? [...child.classList].filter((c) => CLASS_OK.test(c)) : [];
        for (const a of [...child.attributes]) child.removeAttribute(a.name);
        if (child.tagName === 'SPAN') { if (!keep.length) { child.replaceWith(...child.childNodes); continue; } child.className = keep.join(' '); }
      } else if (child.nodeType !== 3) child.remove();
    }
  };
  walk(tpl.content);
  // drop the clutter of empty wrappers some browsers leave behind
  return tpl.innerHTML.replace(/(<div><br><\/div>)+$/g, '').trim();
}

const sizeOf = (k) => (SIZES.find((s) => s[0] === k) || SIZES[2])[2];
const fontOf = (k) => (FONTS.find((f) => f[0] === k) || FONTS[0])[2];
const dropClasses = (root, prefix) => root.querySelectorAll('span').forEach((s) => {
  [...s.classList].forEach((c) => { if (c.startsWith(prefix)) s.classList.remove(c); });
});

export default {
  type: 'text', label: 'Text', icon: 'type',
  size: { w: 820, h: 300 }, minSize: { w: 160, h: 80 },
  create: () => ({ settings: { size: 'm', align: 'left', color: '', font: 'std' }, state: { html: '' } }),

  mount(root, w, api) {
    const ed = h('div', { class: 'tx__edit', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Text', 'data-placeholder': 'Doppelklicken und schreiben …', spellcheck: 'true', lang: 'de-CH' });
    ed.innerHTML = sanitize(w.state.html);
    const box = h('div', { class: 'tx' }, ed);
    root.append(box);
    let editing = false; let t = null; let lastRange = null; let barPointer = false;

    // ---------- format bar (lives in <body>, so it keeps its size however the stage is scaled) ----------
    const fmtBtn = (cmd, label, letter, key) => h('button', { class: 'fbar__btn fbar__btn--' + cmd, type: 'button', 'aria-label': label, 'aria-pressed': 'false', title: `${label} (${modKey}+${key})`,
      onPointerdown: (e) => e.preventDefault(), // keep the caret and the marked text
      onClick: () => { restore(); document.execCommand(cmd); afterChange(); } }, letter);
    const bBold = fmtBtn('bold', 'Fett', 'F', 'B');
    const bItalic = fmtBtn('italic', 'Kursiv', 'K', 'I');
    const bUnder = fmtBtn('underline', 'Unterstrichen', 'U', 'U');
    const hint = 'Text markieren: nur die Markierung ändert sich. Ohne Markierung: der ganze Text.';
    const sizeSel = h('select', { class: 'fbar__sel fbar__sel--size', 'aria-label': 'Schriftgrösse', title: 'Schriftgrösse. ' + hint,
      onChange: () => applyClass('fs-', sizeSel.value) }, SIZES.map((s) => h('option', { value: s[0] }, s[1])));
    const fontSel = h('select', { class: 'fbar__sel fbar__sel--font', 'aria-label': 'Schriftart', title: 'Schriftart. ' + hint,
      onChange: () => applyClass('ff-', fontSel.value) }, FONTS.map((f) => h('option', { value: f[0], style: { fontFamily: f[2] } }, f[1])));
    const colorDot = h('span', { class: 'fbar__dot', 'aria-hidden': 'true' });
    const colorPop = h('div', { class: 'fbar__pop', role: 'group', 'aria-label': 'Textfarbe wählen', hidden: true },
      COLORS.map((c) => h('button', { class: 'fbar__swatch', type: 'button', title: c[1], 'aria-label': c[1], style: { background: c[0] || 'var(--w-text, #191B22)' },
        onPointerdown: (e) => e.preventDefault(),
        onClick: () => { colorPop.hidden = true; bColor.setAttribute('aria-expanded', 'false'); applyClass('fc-', c[2]); } })));
    const bColor = h('button', { class: 'fbar__btn fbar__btn--color', type: 'button', 'aria-label': 'Textfarbe', title: 'Textfarbe. ' + hint, 'aria-expanded': 'false',
      onPointerdown: (e) => e.preventDefault(),
      onClick: () => { colorPop.hidden = !colorPop.hidden; bColor.setAttribute('aria-expanded', String(!colorPop.hidden)); } }, 'A', colorDot);
    const bar = h('div', { class: 'fbar no-print', role: 'toolbar', 'aria-label': 'Text formatieren', hidden: true },
      bBold, bItalic, bUnder, bColor, h('span', { class: 'fbar__sep', 'aria-hidden': 'true' }), sizeSel, fontSel, colorPop);
    bar.addEventListener('pointerdown', () => { barPointer = true; setTimeout(() => { barPointer = false; }, 400); });
    bar.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); restore(); } });
    bar.addEventListener('focusout', () => setTimeout(maybeStop, 0));

    const inEd = (node) => node && (node === ed || ed.contains(node));
    function rememberRange() {
      const s = getSelection();
      if (editing && s.rangeCount && inEd(s.anchorNode)) { lastRange = s.getRangeAt(0).cloneRange(); syncBar(); }
    }
    function restore() {
      ed.focus({ preventScroll: true });
      if (!lastRange) return;
      const s = getSelection(); s.removeAllRanges(); s.addRange(lastRange);
    }
    function maybeStop() {
      if (!editing || barPointer) return;
      const a = document.activeElement;
      if (inEd(a) || bar.contains(a)) return;
      stop();
    }
    const onDocDown = (e) => { if (editing && !box.contains(e.target) && !bar.contains(e.target)) stop(); };

    // Wrap the marked text in <span class="fs-…">/<span class="ff-…">; without a marking change the whole text.
    function applyClass(prefix, key) {
      restore();
      const s = getSelection();
      const marked = s.rangeCount && !s.isCollapsed && inEd(s.anchorNode) && inEd(s.focusNode);
      if (!marked) {
        dropClasses(ed, prefix);
        if (prefix === 'fs-') w.settings.size = key; else if (prefix === 'ff-') w.settings.font = key; else w.settings.color = (COLORS.find((c) => c[2] === key) || COLORS[0])[0];
        update(); afterChange(); return;
      }
      try { document.execCommand('styleWithCSS', false, false); } catch { /* old browsers */ }
      document.execCommand('fontName', false, MARK); // the browser splits the marking into <font face=MARK> pieces for us
      const spans = [];
      for (const f of ed.querySelectorAll(`font[face="${MARK}"]`)) {
        const span = h('span', { class: prefix + key });
        span.append(...f.childNodes);
        dropClasses(span, prefix);
        f.replaceWith(span); spans.push(span);
      }
      if (spans.length) {
        const r = document.createRange(); r.setStartBefore(spans[0]); r.setEndAfter(spans[spans.length - 1]);
        s.removeAllRanges(); s.addRange(r); lastRange = r.cloneRange();
      }
      afterChange();
    }
    function afterChange() { clearTimeout(t); t = setTimeout(save, 400); box.classList.toggle('is-empty', !ed.textContent.trim()); syncBar(); }

    function syncBar() {
      if (!editing) return;
      for (const [b, cmd] of [[bBold, 'bold'], [bItalic, 'italic'], [bUnder, 'underline']]) {
        let on = false; try { on = document.queryCommandState(cmd); } catch { /* */ }
        b.setAttribute('aria-pressed', String(on));
      }
      const s = getSelection();
      let node = s.rangeCount && inEd(s.anchorNode) ? s.anchorNode : null;
      if (node && node.nodeType === 1 && s.rangeCount) { const r = s.getRangeAt(0); node = r.startContainer.childNodes[r.startOffset] || node; }
      let fs = null; let ff = null; let fc = null;
      for (let n = node && node.nodeType === 3 ? node.parentNode : node; n && n !== ed; n = n.parentNode) {
        if (n.classList) for (const c of n.classList) { if (!fs && c.startsWith('fs-')) fs = c.slice(3); if (!ff && c.startsWith('ff-')) ff = c.slice(3); if (!fc && c.startsWith('fc-')) fc = c.slice(3); }
      }
      sizeSel.value = fs || w.settings.size || 'm';
      fontSel.value = ff || w.settings.font || 'std';
      const col = fc ? COLORS.find((c) => c[2] === fc) : COLORS.find((c) => c[0] === (w.settings.color || ''));
      colorDot.style.background = (col && col[0]) || 'var(--w-text, #191B22)';
      placeBar();
    }
    function placeBar() {
      if (bar.hidden) return;
      const r = box.getBoundingClientRect(); const bw = bar.offsetWidth; const bh = bar.offsetHeight;
      let top = r.bottom + 58; // under the rotate handle
      if (top + bh > innerHeight - 8) top = Math.max(8, r.bottom - bh - 12); // no room below: inside the widget, at the bottom
      const left = Math.min(Math.max(8, r.left + r.width / 2 - bw / 2), innerWidth - bw - 8);
      Object.assign(bar.style, { top: top + 'px', left: left + 'px' });
    }

    function edit() {
      if (editing) return;
      editing = true; ed.contentEditable = 'true';
      try { document.execCommand('styleWithCSS', false, false); } catch { /* old browsers */ } ed.setAttribute('data-nodrag', ''); box.classList.add('is-editing');
      ed.focus();
      const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); lastRange = r.cloneRange();
      if (!bar.isConnected) document.body.append(bar);
      bar.hidden = false;
      document.addEventListener('selectionchange', rememberRange);
      document.addEventListener('pointerdown', onDocDown, true);
      addEventListener('resize', placeBar);
      syncBar();
    }
    function stop() {
      if (!editing) return;
      editing = false; ed.contentEditable = 'false'; ed.removeAttribute('data-nodrag'); box.classList.remove('is-editing');
      bar.hidden = true; colorPop.hidden = true; lastRange = null;
      document.removeEventListener('selectionchange', rememberRange);
      document.removeEventListener('pointerdown', onDocDown, true);
      removeEventListener('resize', placeBar);
      save(); update();
    }
    function save() { clearTimeout(t); w.state.html = sanitize(ed.innerHTML); api.changed(); }
    ed.addEventListener('input', () => { clearTimeout(t); t = setTimeout(save, 400); box.classList.toggle('is-empty', !ed.textContent.trim()); });
    ed.addEventListener('keyup', syncBar);
    ed.addEventListener('blur', () => setTimeout(maybeStop, 0));
    ed.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stop(); ed.closest('.wf').focus(); } });
    ed.addEventListener('paste', (e) => { if (!editing) return; e.preventDefault(); const text = e.clipboardData.getData('text/plain'); document.execCommand('insertText', false, text); });
    function update() {
      ed.style.fontSize = sizeOf(w.settings.size) + 'px';
      ed.style.fontFamily = fontOf(w.settings.font);
      ed.style.textAlign = w.settings.align;
      ed.style.color = w.settings.color || '';
      box.classList.toggle('is-empty', !ed.textContent.trim());
      const plain = ed.textContent.trim();
      api.setLabel('Text' + (plain ? ': ' + plain.slice(0, 60) : ', leer'));
      if (editing) syncBar();
    }
    update();
    return { update, edit, destroy: () => { clearTimeout(t); if (editing) stop(); bar.remove(); } };
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
    const fontPick = h('select', { class: 'select', 'aria-label': 'Schriftart für den ganzen Text', onChange: (e) => { w.settings.font = e.target.value; change(); } },
      FONTS.map((f) => h('option', { value: f[0], selected: f[0] === (w.settings.font || 'std'), style: { fontFamily: f[2] } }, f[1])));
    body.append(
      h('p', { class: 'field__hint' }, 'Zum Schreiben doppelt klicken (oder Widget wählen und Enter drücken). Beim Schreiben erscheint unter dem Text eine Leiste für Fett, Kursiv, Unterstrichen, Textfarbe, Grösse und Schriftart. '
        + `Markierter Text ändert sich allein, sonst der ganze Text. Kürzel: ${modKey}+B, I, U.`),
      section('Grösse', group('Schriftgrösse', PRESETS, w.settings.size, (k) => { w.settings.size = k; change(); }, (it) => it[1])),
      section('Schriftart', fontPick),
      section('Ausrichtung', group('Ausrichtung', [['left', 'Links'], ['center', 'Mitte'], ['right', 'Rechts']], w.settings.align, (k) => { w.settings.align = k; change(); }, (it) => it[1])),
      section('Textfarbe', group('Textfarbe', COLORS, w.settings.color, (k) => { w.settings.color = k; change(); },
        (it) => h('span', { class: 'dot', style: { background: it[0] || 'var(--w-text, #191B22)' }, title: it[1] }, h('span', { class: 'sr-only' }, it[1])))),
      section('Hintergrund', themePicker(w.themeId, (k) => { w.themeId = k; change(); }, { transparent: true })));
  },
};
