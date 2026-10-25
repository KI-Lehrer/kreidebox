// Vorlagen: built-in starter screens and own saved screens.
import * as store from '../data/store.js';
import { listTemplates, renameTemplate, deleteTemplate, deckFromTemplate, saveTemplate } from '../data/library.js';
import { BUILTIN, builtinScreen } from '../data/builtin-templates.js';
import { h, iconEl, iconButton, relativeTime } from '../ui/dom.js';
import { toast, promptDialog, confirmDialog, showMenu } from '../ui/overlays.js';
import { backgroundCss, resolveBackground } from '../backgrounds.js';
import { topNav } from './nav.js';
import { cachedTheme, loadThemes } from '../data/library.js';
import { slideshowFirst } from '../backgrounds.js';

export function thumbOf(screen) {
  const t = h('div', { class: 'deck__thumb', style: { background: backgroundCss(screen && screen.background) }, 'aria-hidden': 'true' });
  const bgv = screen && screen.background;
  if (bgv && (bgv.type === 'upload' || bgv.type === 'slideshow')) resolveBackground(bgv.type === 'slideshow' ? slideshowFirst(bgv) : bgv).then((css) => { t.style.background = css; });
  for (const w of (screen ? screen.widgets : [])) {
    const ct = w.themeId && w.themeId.startsWith('custom:') ? cachedTheme(w.themeId.slice(7)) : null;
    t.append(h('span', { class: `thumb-w w--${ct || (w.themeId || '').startsWith('custom:') ? 'standard' : (w.themeId || 'standard')}`, style: {
      left: (w.x / 19.2) + '%', top: (w.y / 10.8) + '%', width: (w.w / 19.2) + '%', height: (w.h / 10.8) + '%',
      transform: w.rotation ? `rotate(${w.rotation}deg)` : null, '--w-bg': ct ? ct.bg : null,
    } }));
  }
  return t;
}

export async function newDeckFromBuiltin(id) {
  const b = BUILTIN.find((x) => x.id === id);
  const deck = await store.createDeck({ name: b.name });
  deck.screens = [builtinScreen(id)];
  await store.saveDeck(deck);
  return deck;
}

export async function renderTemplates(root) {
  document.title = 'Vorlagen · Kreidebox';
  const page = h('main', { class: 'dash', id: 'main' });
  root.append(page);
  await loadThemes();
  await draw();
  return () => {};

  async function draw() {
    const own = await listTemplates();
    page.replaceChildren(
      topNav('templates'),
      h('header', { class: 'dash__head' },
        h('div', null, h('h1', null, 'Vorlagen'), h('p', { class: 'dash__sub' }, 'Fertige Bildschirme als Startpunkt. Eigene Vorlagen speicherst du im Deck über ⋮ → «Als Vorlage speichern».'))),
      h('section', { 'aria-labelledby': 'own-h' }, h('h2', { id: 'own-h', class: 'dash__h2' }, `Meine Vorlagen (${own.length})`),
        own.length ? h('ul', { class: 'deckgrid', role: 'list' }, own.map((t) => h('li', null, card({
          name: t.name, sub: `gespeichert ${relativeTime(t.createdAt)}`, screen: t.screen,
          use: async () => { const d = await deckFromTemplate(t.id); location.hash = `#/deck/${d.id}/1`; },
          menu: [
            { icon: 'pencil-line', label: 'Umbenennen', onClick: async () => { const n = await promptDialog({ title: 'Vorlage umbenennen', label: 'Name', value: t.name }); if (n) { await renameTemplate(t.id, n); draw(); } } },
            'sep',
            { icon: 'trash-2', label: 'Löschen', danger: true, onClick: async () => { if (await confirmDialog({ title: `Vorlage «${t.name}» löschen?`, text: 'Decks, die damit erstellt wurden, bleiben erhalten.', ok: 'Löschen', danger: true })) { await deleteTemplate(t.id); toast('Vorlage gelöscht'); draw(); } } },
          ] }))))
          : h('div', { class: 'empty empty--small' }, iconEl('layout-grid', { size: 40 }), h('p', null, 'Noch keine eigenen Vorlagen. Öffne ein Deck und wähle im Menü ⋮ oben rechts «Als Vorlage speichern».'))),
      h('section', { 'aria-labelledby': 'bi-h' }, h('h2', { id: 'bi-h', class: 'dash__h2' }, 'Mitgeliefert'),
        h('ul', { class: 'deckgrid', role: 'list' }, BUILTIN.map((b) => h('li', null, card({
          name: b.name, sub: b.note, screen: builtinScreen(b.id),
          use: async () => { const d = await newDeckFromBuiltin(b.id); location.hash = `#/deck/${d.id}/1`; },
          menu: [{ icon: 'copy', label: 'Als eigene Vorlage kopieren', onClick: async () => { await saveTemplate(b.name, builtinScreen(b.id)); toast(`«${b.name}» liegt jetzt bei «Meine Vorlagen»`); draw(); } }],
        }))))));
  }

  function card({ name, sub, screen, use, menu }) {
    const menuBtn = iconButton('ellipsis-vertical', `Optionen für Vorlage ${name}`, { cls: 'iconbtn--sm' });
    menuBtn.setAttribute('aria-haspopup', 'menu');
    menuBtn.addEventListener('click', () => showMenu(menuBtn, [{ icon: 'plus', label: 'Neues Deck daraus', onClick: use }, ...menu], { label: `Optionen für Vorlage ${name}` }));
    return h('article', { class: 'deck' },
      h('button', { class: 'deck__link deck__link--btn', type: 'button', 'aria-label': `Neues Deck aus Vorlage ${name}`, onClick: use }, thumbOf(screen)),
      h('div', { class: 'deck__meta' }, h('div', null, h('div', { class: 'deck__name' }, name), h('div', { class: 'deck__time' }, sub)), menuBtn));
  }
}
