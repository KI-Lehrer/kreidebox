// QR code (W23): generated locally (qrcode-generator, MIT), works offline.
import qrcode from 'qrcode-generator';
import { h } from '../ui/dom.js';
import { section } from '../ui/overlays.js';
import { themePicker } from './themes.js';

export function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(unescape(encodeURIComponent(text))); // UTF-8 (umlauts)
  q.make();
  const n = q.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
  return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" aria-hidden="true"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

export default {
  type: 'qr', label: 'QR-Code', icon: 'qr-code',
  size: { w: 420, h: 500 }, minSize: { w: 160, h: 180 },
  create: () => ({ settings: { text: '', title: '' }, state: {} }),
  openSettingsOnAdd: (w) => !w.settings.text,

  mount(root, w, api) {
    const code = h('div', { class: 'qr__code' });
    const title = h('div', { class: 'qr__title' });
    root.append(h('div', { class: 'qr' }, code, title));
    function update() {
      const t = w.settings.text.trim();
      if (!t) { code.innerHTML = ''; code.append(h('p', { class: 'qr__empty' }, 'Text oder Link im Zahnrad eingeben')); }
      else { try { code.innerHTML = qrSvg(t); } catch { code.textContent = 'Der Text ist zu lang für einen QR-Code.'; } }
      title.textContent = w.settings.title || t.replace(/^https?:\/\//, '').slice(0, 60);
      api.setLabel('QR-Code' + (t ? ': ' + (w.settings.title || t) : ''));
    }
    update();
    return { update };
  },

  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    body.append(section(null,
      h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'qr-t' }, 'Link oder Text'),
        h('textarea', { class: 'textarea', id: 'qr-t', rows: 3, style: { minHeight: '80px' }, placeholder: 'https://…', onInput: (e) => { w.settings.text = e.target.value; change(); } }, w.settings.text)),
      h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'qr-ti' }, 'Titel (freiwillig)'),
        h('input', { class: 'input', id: 'qr-ti', value: w.settings.title, maxlength: 60, onInput: (e) => { w.settings.title = e.target.value; change(); } }))),
    section('Farbthema', themePicker(w.themeId, (k) => { w.themeId = k; change(); })));
  },
};
