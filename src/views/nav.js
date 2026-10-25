import { h, iconEl } from '../ui/dom.js';
import { getSettings, setSettings } from '../data/store.js';
import { showMenu } from '../ui/overlays.js';

export function topNav(active) {
  const link = (key, href, icon, label) => h('a', { class: 'topnav__link', href, 'aria-current': key === active ? 'page' : null }, iconEl(icon, { size: 18 }), label);
  return h('nav', { class: 'topnav no-print', 'aria-label': 'Bereiche' },
    link('decks', '#/', 'layout-grid', 'Bildschirme'),
    link('templates', '#/vorlagen', 'layout-template', 'Vorlagen'),
    link('lists', '#/listen', 'users', 'Namenslisten'),
    // Die Einzeldatei (file://) hat keine Datenschutzseite daneben.
    location.protocol.startsWith('http') ? h('a', { class: 'topnav__link', href: 'datenschutz.html', style: 'margin-left:auto' }, 'Datenschutz') : null);
}

// ---------- appearance: light / dark / follow the system ----------
export const APPEARANCE = [
  { key: 'light', label: 'Hell', icon: 'sun' },
  { key: 'dark', label: 'Dunkel', icon: 'moon' },
  { key: 'auto', label: 'Wie das System', icon: 'monitor' },
];
export function currentAppearance() {
  const s = getSettings();
  return s.appearance || (s.darkMode === true ? 'dark' : 'auto');
}
export function applyAppearance(mode = currentAppearance()) {
  const root = document.documentElement;
  if (mode === 'auto') delete root.dataset.theme; else root.dataset.theme = mode;
}
export function setAppearance(mode) { setSettings({ appearance: mode }); applyAppearance(mode); }

export function themeToggle({ cls = 'btn btn--secondary btn--lg' } = {}) {
  const cur = APPEARANCE.find((a) => a.key === currentAppearance());
  const b = h('button', { class: cls, type: 'button', 'aria-haspopup': 'menu', 'aria-label': `Darstellung: ${cur.label}` }, iconEl(cur.icon, { size: 20 }), h('span', { class: 'hide-sm' }, cur.label));
  b.addEventListener('click', () => showMenu(b, APPEARANCE.map((a) => ({ icon: a.key === cur.key ? 'check' : a.icon, label: a.label, onClick: () => {
    setAppearance(a.key);
    const fresh = themeToggle({ cls }); b.replaceWith(fresh); fresh.focus();
  } })), { label: 'Darstellung' }));
  return b;
}
