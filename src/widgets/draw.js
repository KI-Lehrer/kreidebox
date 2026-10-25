// Draw widget (W21): a small whiteboard. Drag the widget by its top bar; draw on the paper.
import { h, iconEl } from '../ui/dom.js';
import { section, switchRow } from '../ui/overlays.js';
import { attachInk, INK_COLORS, INK_SIZES } from '../ui/ink.js';

const TOOLS = [['pen', 'Stift', 'pencil'], ['marker', 'Textmarker', 'paintbrush-vertical'], ['line', 'Linie', 'ruler'], ['rect', 'Rechteck', 'square'], ['ellipse', 'Kreis', 'circle'], ['eraser', 'Radierer', 'x']];
const PAPERS = [['blank', 'Leer'], ['lined', 'Liniert'], ['grid', 'Kariert'], ['dots', 'Punkte']];

export default {
  type: 'draw', label: 'Zeichnen', icon: 'paintbrush-vertical',
  size: { w: 900, h: 600 }, minSize: { w: 300, h: 220 },
  create: () => ({ settings: { paper: 'blank' }, state: { strokes: [], tool: 'pen', color: '#191B22', size: 1 } }),

  mount(root, w, api) {
    const canvas = h('canvas', { class: 'dw__canvas', 'data-nodrag': '', role: 'img', 'aria-label': 'Zeichenfläche' });
    const toolBtns = TOOLS.map(([k, label, ic]) => h('button', { class: 'dw__tool', type: 'button', 'data-nodrag': '', 'aria-label': label, title: label, 'aria-pressed': 'false',
      onClick: () => { w.state.tool = k; api.changed(); paint(); } }, iconEl(ic, { size: 18 })));
    const colorBtns = INK_COLORS.map((c) => h('button', { class: 'dw__color', type: 'button', 'data-nodrag': '', 'aria-label': `Farbe ${c}`, title: 'Farbe', style: { background: c }, 'aria-pressed': 'false',
      onClick: () => { w.state.color = c; if (w.state.tool === 'eraser') w.state.tool = 'pen'; api.changed(); paint(); } }));
    const sizeBtns = INK_SIZES.map((_, i) => h('button', { class: 'dw__size', type: 'button', 'data-nodrag': '', 'aria-label': ['Dünn', 'Mittel', 'Dick'][i], title: ['Dünn', 'Mittel', 'Dick'][i], 'aria-pressed': 'false',
      onClick: () => { w.state.size = i; api.changed(); paint(); } }, h('i', { style: { width: `${6 + i * 6}px`, height: `${6 + i * 6}px` } })));
    const undoBtn = h('button', { class: 'dw__tool', type: 'button', 'data-nodrag': '', 'aria-label': 'Letzten Strich entfernen', title: 'Letzten Strich entfernen', onClick: () => { w.state.strokes.pop(); api.changed(); ink.render(); } }, iconEl('rotate-ccw', { size: 18 }));
    const clearBtn = h('button', { class: 'dw__tool', type: 'button', 'data-nodrag': '', 'aria-label': 'Alles löschen', title: 'Alles löschen', onClick: () => { if (!w.state.strokes.length) return; w.state.strokes = []; api.changed(); ink.render(); } }, iconEl('trash-2', { size: 18 }));
    const bar = h('div', { class: 'dw__bar' }, h('span', { class: 'dw__grip', title: 'Hier ziehen zum Verschieben', 'aria-hidden': 'true' }, '⋮⋮'),
      h('div', { class: 'dw__group' }, toolBtns), h('div', { class: 'dw__group' }, colorBtns), h('div', { class: 'dw__group' }, sizeBtns), h('div', { class: 'dw__group' }, undoBtn, clearBtn));
    const paper = h('div', { class: 'dw__paper' }, canvas);
    const box = h('div', { class: 'dw' }, bar, paper);
    root.append(box);
    const ink = attachInk(canvas, {
      getStrokes: () => w.state.strokes,
      getTool: () => ({ tool: w.state.tool, color: w.state.tool === 'eraser' ? '#000' : w.state.color, size: INK_SIZES[w.state.size] || INK_SIZES[1] }),
      onCommit: (s) => { w.state.strokes = s; api.changed(); paint(); },
    });
    function paint() {
      paper.dataset.paper = w.settings.paper;
      toolBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(TOOLS[i][0] === w.state.tool)));
      colorBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(INK_COLORS[i] === w.state.color && w.state.tool !== 'eraser')));
      sizeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === w.state.size)));
      api.setLabel(`Zeichenfläche, ${w.state.strokes.length} Striche`);
    }
    paint(); ink.render();
    return { update: () => { paint(); ink.render(); }, destroy: ink.destroy };
  },

  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    body.append(section('Papier', h('fieldset', { class: 'plain' }, h('legend', { class: 'sr-only' }, 'Papier'),
      ...PAPERS.map(([k, l]) => h('label', { class: 'check' }, h('input', { type: 'radio', name: 'dw-paper', checked: w.settings.paper === k, onChange: () => { w.settings.paper = k; change(); } }), l)))),
    section(null, h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => { w.state.strokes = []; change(); } }, iconEl('trash-2', { size: 16 }), 'Zeichnung löschen')),
    h('p', { class: 'field__hint' }, 'Zum Verschieben an der oberen Leiste ziehen. Über den ganzen Bildschirm zeichnen: Stift-Knopf links in der Widget-Leiste.'));
  },
};
