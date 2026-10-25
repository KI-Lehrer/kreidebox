// Media widgets: Link (W24), Video (W13), Embed (W22), PDF (W20), Webcam (W15).
// Framed content gets a top bar to drag the widget; the frame itself only reacts when the widget is selected.
import { h, iconEl } from '../ui/dom.js';
import { section, switchRow, toast } from '../ui/overlays.js';
import { putUpload, getUploadUrl, pickFile } from '../data/uploads.js';
import { themePicker } from './themes.js';

const field = (id, label, input, hint) => h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, label), input, hint && h('span', { class: 'field__hint' }, hint));
const isHttp = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch { return false; } };
const grip = (label) => h('div', { class: 'mh__bar' }, h('span', { class: 'dw__grip', 'aria-hidden': 'true' }, '⋮⋮'), h('span', { class: 'mh__title' }, label));

// ---------- Link ----------
export const hyperlink = {
  type: 'hyperlink', label: 'Link', icon: 'globe',
  size: { w: 520, h: 180 }, minSize: { w: 200, h: 80 },
  create: () => ({ settings: { url: '', label: '' }, state: {} }),
  openSettingsOnAdd: (w) => !w.settings.url,
  mount(root, w, api) {
    const a = h('a', { class: 'hl__btn', target: '_blank', rel: 'noopener noreferrer', 'data-nodrag': '' });
    root.append(h('div', { class: 'hl' }, a));
    function update() {
      const ok = isHttp(w.settings.url);
      a.replaceChildren(iconEl('globe', { size: 28 }), h('span', null, w.settings.label || (ok ? new URL(w.settings.url).hostname.replace(/^www\./, '') : 'Link im Zahnrad eingeben')));
      if (ok) a.href = w.settings.url; else a.removeAttribute('href');
      api.setLabel('Link: ' + (w.settings.label || w.settings.url || 'leer'));
    }
    update(); return { update };
  },
  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    const err = h('span', { class: 'field__error', hidden: true }, 'Bitte eine Adresse mit https:// eingeben.');
    body.append(section(null,
      field('hl-u', 'Adresse', h('input', { class: 'input', id: 'hl-u', type: 'url', placeholder: 'https://…', value: w.settings.url, onInput: (e) => { const v = e.target.value.trim(); err.hidden = !v || isHttp(v); if (isHttp(v) || !v) { w.settings.url = v; change(); } } })),
      err,
      field('hl-l', 'Beschriftung', h('input', { class: 'input', id: 'hl-l', value: w.settings.label, maxlength: 60, onInput: (e) => { w.settings.label = e.target.value; change(); } }), 'Öffnet sich in einem neuen Tab.')),
    section('Farbthema', themePicker(w.themeId, (k) => { w.themeId = k; change(); })));
  },
};

// ---------- Video (YouTube, privacy-enhanced embed) ----------
export function youtubeId(u) {
  const m = String(u).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : (/^[\w-]{11}$/.test(String(u).trim()) ? String(u).trim() : null);
}
export const video = {
  type: 'video', label: 'Video', icon: 'video',
  size: { w: 960, h: 600 }, minSize: { w: 320, h: 220 },
  create: () => ({ settings: { url: '' }, state: {} }),
  openSettingsOnAdd: (w) => !w.settings.url,
  mount(root, w, api) {
    const holder = h('div', { class: 'mh__body' });
    root.append(h('div', { class: 'mh' }, grip('Video'), holder));
    let shown = null;
    function update() {
      const id = youtubeId(w.settings.url);
      if (id === shown) return; shown = id;
      holder.replaceChildren(id
        ? h('iframe', { class: 'mh__frame', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, title: 'YouTube-Video', allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin' })
        : h('p', { class: 'mh__empty' }, 'YouTube-Link im Zahnrad einfügen.'));
      api.setLabel('Video' + (id ? '' : ', leer'));
    }
    update(); return { update };
  },
  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    const err = h('span', { class: 'field__error', hidden: true }, 'Das ist kein YouTube-Link.');
    body.append(section(null, field('vd-u', 'YouTube-Link', h('input', { class: 'input', id: 'vd-u', type: 'url', placeholder: 'https://www.youtube.com/watch?v=…', value: w.settings.url,
      onInput: (e) => { const v = e.target.value.trim(); err.hidden = !v || !!youtubeId(v); w.settings.url = v; change(); } }), 'Braucht Internet. Livestreams gehen nicht.'), err),
    h('p', { class: 'field__hint' }, 'Zum Verschieben an der oberen Leiste ziehen. Zum Abspielen das Widget zuerst anklicken.'));
  },
};

// ---------- Embed (iframe from a URL or an embed code) ----------
export function embedSrc(input) {
  const s = String(input || '').trim();
  const m = s.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  const url = m ? m[1].replace(/&amp;/g, '&') : s;
  return url.startsWith('https://') ? url : null;
}
export const embed = {
  type: 'embed', label: 'Einbetten', icon: 'layout-grid',
  size: { w: 960, h: 600 }, minSize: { w: 320, h: 220 },
  create: () => ({ settings: { code: '', title: '' }, state: {} }),
  openSettingsOnAdd: (w) => !w.settings.code,
  mount(root, w, api) {
    const holder = h('div', { class: 'mh__body' });
    const bar = grip('Eingebettet');
    root.append(h('div', { class: 'mh' }, bar, holder));
    let shown = null;
    function update() {
      bar.querySelector('.mh__title').textContent = w.settings.title || 'Eingebettet';
      const src = embedSrc(w.settings.code);
      if (src === shown) return; shown = src;
      holder.replaceChildren(src
        ? h('iframe', { class: 'mh__frame', src, title: w.settings.title || 'Eingebetteter Inhalt', sandbox: 'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation', allow: 'autoplay; fullscreen; clipboard-write', referrerpolicy: 'strict-origin-when-cross-origin' })
        : h('p', { class: 'mh__empty' }, 'Einbettungs-Code oder https-Link im Zahnrad einfügen.'));
      api.setLabel('Eingebetteter Inhalt' + (w.settings.title ? ': ' + w.settings.title : ''));
    }
    update(); return { update };
  },
  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    const err = h('span', { class: 'field__error', hidden: true }, 'Nur Inhalte über https:// können eingebettet werden.');
    body.append(section(null,
      field('em-c', 'Einbettungs-Code oder Link', h('textarea', { class: 'textarea', id: 'em-c', rows: 4, style: { minHeight: '96px' }, placeholder: '<iframe src="https://…"></iframe>',
        onInput: (e) => { w.settings.code = e.target.value; err.hidden = !e.target.value.trim() || !!embedSrc(e.target.value); change(); } }, w.settings.code),
      'Funktioniert z. B. mit Google Präsentationen («Im Web veröffentlichen»), Canva («Einbetten»), PowerPoint online, LearningApps.'), err,
      field('em-t', 'Titel', h('input', { class: 'input', id: 'em-t', value: w.settings.title, onInput: (e) => { w.settings.title = e.target.value; change(); } }))));
  },
};

// ---------- PDF (browser's own viewer) ----------
export const pdf = {
  type: 'pdf', label: 'PDF', icon: 'book-open',
  size: { w: 900, h: 640 }, minSize: { w: 320, h: 240 },
  create: () => ({ settings: { uploadId: null, name: '' }, state: {} }),
  openSettingsOnAdd: (w) => !w.settings.uploadId,
  mount(root, w, api) {
    const holder = h('div', { class: 'mh__body' });
    const bar = grip('PDF');
    root.append(h('div', { class: 'mh' }, bar, holder));
    let shown = null;
    async function update() {
      bar.querySelector('.mh__title').textContent = w.settings.name || 'PDF';
      if (w.settings.uploadId === shown) return; shown = w.settings.uploadId;
      const url = shown && await getUploadUrl(shown);
      holder.replaceChildren(url ? h('iframe', { class: 'mh__frame', src: url + '#view=FitH', title: w.settings.name || 'PDF' })
        : h('button', { class: 'iw__empty', type: 'button', 'data-nodrag': '', onClick: () => api.openSettings() }, iconEl('book-open', { size: 40 }), h('span', null, shown ? 'PDF fehlt – neu wählen' : 'PDF wählen')));
      api.setLabel('PDF' + (w.settings.name ? ': ' + w.settings.name : ''));
    }
    update(); return { update };
  },
  settingsPanel(body, w, api) {
    body.append(section('PDF', h('button', { class: 'btn btn--secondary', type: 'button', onClick: async () => {
      const f = await pickFile('application/pdf'); if (!f) return;
      try { const rec = await putUpload(f, 'pdf'); w.settings.uploadId = rec.id; w.settings.name = rec.name.replace(/\.pdf$/i, ''); api.changed(); api.refresh(); toast('PDF eingefügt'); }
      catch (err) { toast(err.message); }
    } }, iconEl('upload', { size: 18 }), w.settings.uploadId ? 'Anderes PDF wählen' : 'PDF wählen'),
    h('p', { class: 'field__hint' }, 'Bis 25 MB. Blättern und Zoomen im Widget. Darauf schreiben: Stift-Knopf links in der Widget-Leiste.')));
  },
};

// ---------- Webcam / document camera ----------
export const webcam = {
  type: 'webcam', label: 'Webcam', icon: 'video',
  size: { w: 800, h: 520 }, minSize: { w: 240, h: 160 },
  create: () => ({ settings: { deviceId: '', mirror: false, flipV: false, rotate: 0 }, state: {} }),
  mount(root, w, api) {
    const vid = h('video', { class: 'cam__video', autoplay: true, muted: true, playsinline: true });
    const msg = h('div', { class: 'cam__msg' });
    const btn = h('button', { class: 'btn btn--primary', type: 'button', 'data-nodrag': '', onClick: () => start() }, iconEl('video', { size: 18 }), 'Kamera einschalten');
    const box = h('div', { class: 'cam' }, vid, h('div', { class: 'cam__off' }, msg, btn));
    root.append(box);
    let stream = null;
    async function start() {
      stop();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = 'Dieser Browser erlaubt hier keine Kamera.'; return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: w.settings.deviceId ? { deviceId: { exact: w.settings.deviceId } } : true, audio: false });
        vid.srcObject = stream; box.classList.add('is-on'); msg.textContent = '';
      } catch (err) { box.classList.remove('is-on'); msg.textContent = 'Kein Zugriff auf die Kamera. Erlaube ihn beim Schloss-Symbol in der Adressleiste.'; }
      update();
    }
    function stop() { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; box.classList.remove('is-on'); }
    function update() {
      vid.style.transform = `rotate(${w.settings.rotate}deg) scale(${w.settings.mirror ? -1 : 1}, ${w.settings.flipV ? -1 : 1})`;
      api.setLabel('Webcam' + (stream ? '' : ', aus'));
    }
    if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: 'camera' }).then((p) => { if (p.state === 'granted') start(); }).catch(() => {});
    update();
    return { update: () => { update(); }, restart: start, destroy: stop };
  },
  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    const sel = h('select', { class: 'select', id: 'wc-dev', onChange: (e) => { w.settings.deviceId = e.target.value; api.changed(); const i = api.instance && api.instance(); if (i && i.restart) i.restart(); } }, h('option', { value: '' }, 'Standard-Kamera'));
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) navigator.mediaDevices.enumerateDevices().then((ds) => ds.filter((d) => d.kind === 'videoinput').forEach((d, i) => sel.append(h('option', { value: d.deviceId, selected: d.deviceId === w.settings.deviceId }, d.label || `Kamera ${i + 1}`))));
    body.append(section(null, field('wc-dev', 'Kamera', sel, 'Zum Beispiel eine Dokumentenkamera.')),
      section('Bild', switchRow('Spiegeln (waagrecht)', w.settings.mirror, (v) => { w.settings.mirror = v; change(); }),
        switchRow('Auf den Kopf stellen', w.settings.flipV, (v) => { w.settings.flipV = v; change(); }),
        h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Drehen' }, [0, 90, 180, 270].map((d) => {
          const b = h('button', { class: 'seg__btn', type: 'button', role: 'radio', 'aria-checked': String(w.settings.rotate === d), onClick: () => { w.settings.rotate = d; b.parentNode.querySelectorAll('[role=radio]').forEach((x) => x.setAttribute('aria-checked', String(x === b))); change(); } }, `${d}°`);
          return b;
        }))));
  },
};
