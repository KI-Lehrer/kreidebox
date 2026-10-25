// Toast, confirm and prompt dialogs, popover menu, settings panel.
import { h, iconEl, iconButton } from './dom.js';

// ---------- Toast ----------
let toastHost;
export function toast(message, { action, onAction, ms = 5000 } = {}) {
  if (!toastHost) {
    toastHost = h('div', { class: 'toast-host no-print', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  toastHost.innerHTML = '';
  let timer;
  const close = () => { clearTimeout(timer); el.remove(); };
  const el = h('div', { class: 'toast' }, message,
    action && h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => { close(); onAction && onAction(); } }, action));
  toastHost.append(el);
  const arm = () => { timer = setTimeout(close, ms); };
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', arm);
  arm();
}

// ---------- Dialogs ----------
function dialog(build) {
  return new Promise((resolve) => {
    const d = h('dialog', { class: 'modal' });
    const done = (v) => { d.close(); d.remove(); resolve(v); };
    d.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    build(d, done);
    document.body.append(d);
    d.showModal();
  });
}

export function confirmDialog({ title, text, ok = 'OK', danger = false }) {
  return dialog((d, done) => {
    const id = 'dlg-' + Math.random().toString(36).slice(2);
    d.setAttribute('aria-labelledby', id);
    d.append(
      h('div', { class: 'modal__body' }, h('h2', { id }, title), text && h('p', null, text)),
      h('div', { class: 'modal__actions' },
        h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => done(false) }, 'Abbrechen'),
        h('button', { class: 'btn ' + (danger ? 'btn--danger' : 'btn--primary'), type: 'button', onClick: () => done(true) }, ok)));
  });
}

export function promptDialog({ title, label, value = '', ok = 'Speichern' }) {
  return dialog((d, done) => {
    const id = 'dlg-' + Math.random().toString(36).slice(2);
    d.setAttribute('aria-labelledby', id);
    const input = h('input', { class: 'input', id: id + '-in', value, maxlength: 80, autocomplete: 'off' });
    const form = h('form', { method: 'dialog', onSubmit: (e) => { e.preventDefault(); done(input.value.trim() || null); } },
      h('div', { class: 'modal__body' }, h('h2', { id }, title),
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: id + '-in' }, label), input)),
      h('div', { class: 'modal__actions' },
        h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => done(null) }, 'Abbrechen'),
        h('button', { class: 'btn btn--primary', type: 'submit' }, ok)));
    d.append(form);
    setTimeout(() => { input.focus(); input.select(); });
  });
}

// ---------- Popover menu ----------
let openMenu = null;
export function closeMenu() { if (openMenu) openMenu(); }

// items: [{icon, label, kbd, onClick, danger, disabled} | 'sep']
export function showMenu(anchor, items, { label = 'Menü', align = 'right' } = {}) {
  closeMenu();
  const list = h('ul', { class: 'menu popover no-print', role: 'menu', 'aria-label': label });
  for (const it of items.filter(Boolean)) {
    if (it === 'sep') { list.append(h('li', { role: 'separator', class: 'menu__sep' })); continue; }
    list.append(h('li', { role: 'none' },
      h('button', { class: 'menu__item' + (it.danger ? ' menu__item--danger' : ''), role: 'menuitem', type: 'button', disabled: it.disabled,
        onClick: () => { close(); it.onClick && it.onClick(); } },
      it.icon && iconEl(it.icon), h('span', null, it.label), it.kbd && h('span', { class: 'kbd' }, it.kbd))));
  }
  document.body.append(list);
  const r = anchor.getBoundingClientRect();
  const w = list.offsetWidth; const hgt = list.offsetHeight;
  let left = align === 'right' ? r.right - w : r.left;
  let top = r.bottom + 6;
  if (top + hgt > innerHeight - 8) top = Math.max(8, r.top - hgt - 6);
  left = Math.min(Math.max(8, left), innerWidth - w - 8);
  Object.assign(list.style, { left: left + 'px', top: top + 'px' });
  anchor.setAttribute('aria-expanded', 'true');
  const buttons = [...list.querySelectorAll('button:not(:disabled)')];
  buttons[0] && buttons[0].focus();
  const onKey = (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); anchor.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); buttons[(i + 1) % buttons.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length].focus(); }
    else if (e.key === 'Tab') close();
  };
  const onDown = (e) => { if (!list.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close(); };
  function close() {
    list.remove(); anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onDown, true);
    openMenu = null;
  }
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onDown, true);
  openMenu = close;
  return close;
}

// ---------- Settings panel (one at a time) ----------
let currentPanel = null;
export function closePanel() { if (currentPanel) currentPanel.close(); }
export const panelOpenFor = () => (currentPanel ? currentPanel.key : null);

export function openPanel({ key, title, iconName, build, onClose, returnFocus }) {
  closePanel();
  const titleId = 'panel-title';
  const body = h('div', { class: 'panel__body' });
  const el = h('aside', { class: 'panel panel--floating no-print', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': titleId },
    h('div', { class: 'panel__head' }, iconName && iconEl(iconName, { size: 24 }), h('h2', { id: titleId, tabindex: '-1' }, title),
      iconButton('x', 'Einstellungen schliessen', { kbd: 'S', onClick: () => close() })),
    body);
  build(body);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('is-open'));
  el.querySelector('h2').focus();
  const onKey = (e) => { if (e.key === 'Escape' && el.contains(document.activeElement)) { e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey);
  function close() {
    if (!currentPanel || currentPanel.el !== el) return;
    document.removeEventListener('keydown', onKey);
    el.remove(); currentPanel = null;
    onClose && onClose();
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
  }
  currentPanel = { key, el, close, body };
  return currentPanel;
}

// ---------- form helpers used in panels ----------
export function switchRow(label, checked, onChange) {
  const b = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!checked),
    onClick: () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); onChange(v); } },
  h('span', { class: 'switch__track' }), label);
  return b;
}

export function section(title, ...kids) {
  return h('div', { class: 'panel__section' }, title && h('h3', null, title), ...kids);
}
export const customDialog = dialog;
