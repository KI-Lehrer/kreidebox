// Image widget (W05): upload, drag & drop, paste. Stored in IndexedDB.
import { h, iconEl } from '../ui/dom.js';
import { section, toast } from '../ui/overlays.js';
import { putUpload, getUploadUrl, listUploads, pickFile } from '../data/uploads.js';
import { themePicker } from './themes.js';

export default {
  type: 'image', label: 'Bild', icon: 'image',
  size: { w: 640, h: 480 }, minSize: { w: 120, h: 90 },
  create: () => ({ settings: { uploadId: null, fit: 'contain', alt: '' }, state: {}, themeId: 'transparent' }),
  openSettingsOnAdd: (w) => !w.settings.uploadId,

  mount(root, w, api) {
    const img = h('img', { class: 'iw__img', alt: '', draggable: 'false' });
    const empty = h('button', { class: 'iw__empty', type: 'button', 'data-nodrag': '', onClick: choose }, iconEl('image-plus', { size: 40 }), h('span', null, 'Bild wählen'));
    const box = h('div', { class: 'iw' }, img, empty);
    root.append(box);
    async function choose() {
      const file = await pickFile('image/*'); if (!file) return;
      try { const rec = await putUpload(file, 'image'); w.settings.uploadId = rec.id; if (!w.settings.alt) w.settings.alt = rec.name.replace(/\.[a-z0-9]+$/i, ''); api.changed(); update(); }
      catch (err) { toast(err.message); }
    }
    let shown = null;
    async function update() {
      box.dataset.fit = w.settings.fit;
      const id = w.settings.uploadId;
      empty.hidden = !!id; img.hidden = !id;
      if (id && id !== shown) {
        shown = id;
        const url = await getUploadUrl(id);
        if (url) img.src = url; else { img.hidden = true; empty.hidden = false; empty.lastChild.textContent = 'Bild fehlt – neu wählen'; }
      }
      img.alt = w.settings.alt || '';
      api.setLabel('Bild' + (w.settings.alt ? `: ${w.settings.alt}` : ''));
    }
    update();
    return { update };
  },

  settingsPanel(body, w, api) {
    const gallery = h('div', { class: 'bg-grid', role: 'radiogroup', 'aria-label': 'Hochgeladene Bilder' });
    async function draw() {
      const ups = await listUploads('image');
      gallery.replaceChildren(...await Promise.all(ups.slice(0, 30).map(async (u) => {
        const b = h('button', { class: 'bg-tile', type: 'button', role: 'radio', 'aria-checked': String(u.id === w.settings.uploadId), title: u.name,
          onClick: () => { w.settings.uploadId = u.id; w.settings.alt = w.settings.alt || u.name.replace(/\.[a-z0-9]+$/i, ''); api.changed(); api.refresh(); gallery.querySelectorAll('[role=radio]').forEach((x) => x.setAttribute('aria-checked', String(x === b))); } },
        h('span', { class: 'bg-tile__swatch', style: { background: `center / cover no-repeat url("${await getUploadUrl(u.id)}")` } }), h('span', null, u.name.slice(0, 18)));
        return b;
      })));
      if (!ups.length) gallery.append(h('p', { class: 'field__hint', style: { gridColumn: '1 / -1' } }, 'Noch keine Bilder.'));
    }
    const up = h('button', { class: 'btn btn--secondary', type: 'button', onClick: async () => {
      const file = await pickFile('image/*'); if (!file) return;
      try { const rec = await putUpload(file, 'image'); w.settings.uploadId = rec.id; w.settings.alt = rec.name.replace(/\.[a-z0-9]+$/i, ''); alt.value = w.settings.alt; api.changed(); api.refresh(); draw(); }
      catch (err) { toast(err.message); }
    } }, iconEl('image-plus', { size: 18 }), 'Bild hochladen');
    const fit = h('div', { class: 'row', role: 'radiogroup', 'aria-label': 'Darstellung' },
      ...[['contain', 'Ganz zeigen'], ['cover', 'Füllen (zuschneiden)']].map(([k, l]) => h('label', { class: 'check' },
        h('input', { type: 'radio', name: 'iw-fit', checked: w.settings.fit === k, onChange: () => { w.settings.fit = k; api.changed(); api.refresh(); } }), l)));
    const alt = h('input', { class: 'input', id: 'iw-alt', value: w.settings.alt || '', onInput: (e) => { w.settings.alt = e.target.value; api.changed(); api.refresh(); } });
    body.append(section('Bild', up, h('p', { class: 'field__hint' }, 'PNG, JPG, GIF, WebP oder SVG bis 25 MB. Du kannst Bilder auch auf den Bildschirm ziehen oder einfügen.'), gallery),
      section('Darstellung', fit),
      section(null, h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'iw-alt' }, 'Beschreibung'), alt, h('span', { class: 'field__hint' }, 'Für Screenreader und die Übersicht.'))),
      section('Rahmen', themePicker(w.themeId, (k) => { w.themeId = k; api.changed(); api.refresh(); }, { transparent: true })));
    draw();
  },
};
