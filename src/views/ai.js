// Von Claude oder ChatGPT: Text einfügen oder Link öffnen (#/ki?d=...). Es wird erst nach einem Klick auf «Anlegen» etwas gespeichert.
import { h } from '../ui/dom.js';
import { customDialog } from '../ui/overlays.js';
import { deckFromAiSpec, parseAiText } from '../data/aispec.js';
import { importFile } from '../data/transfer.js';
import { WIDGETS } from '../widgets/registry.js';

function preview(deck, notes) {
  const rows = deck.screens.map((s, i) => h('li', null, h('strong', null, `Bildschirm ${i + 1}${s.name ? ' · ' + s.name : ''}: `),
    s.widgets.length ? s.widgets.map((w) => WIDGETS[w.type].label).join(', ') : 'leer'));
  return h('div', null,
    h('p', null, 'Name: ', h('strong', null, deck.name), ` · ${deck.screens.length} Bildschirm${deck.screens.length === 1 ? '' : 'e'}`),
    h('ul', { class: 'ai__list' }, ...rows),
    notes.length ? h('details', null, h('summary', null, `${notes.length} Hinweis${notes.length === 1 ? '' : 'e'}`), h('ul', null, ...notes.slice(0, 20).map((n) => h('li', null, n)))) : null);
}

// Zeigt die Vorschau; legt bei «Anlegen» ein neues Deck an und gibt es zurück (sonst null).
export function confirmAiDeck(spec, { title = 'Aus KI übernehmen' } = {}) {
  const { deck, notes } = deckFromAiSpec(spec);
  return customDialog((d, done) => {
    const id = 'ai-' + Math.random().toString(36).slice(2);
    d.setAttribute('aria-labelledby', id);
    const ok = h('button', { class: 'btn btn--primary', type: 'button', onClick: async () => {
      ok.disabled = true;
      try { const r = await importFile(new File([JSON.stringify(spec)], 'ki.json', { type: 'application/json' })); done(r.decks[0]); }
      catch (e) { ok.disabled = false; err.textContent = e.message || 'Anlegen fehlgeschlagen'; }
    } }, 'Anlegen');
    const err = h('p', { class: 'field__error', role: 'alert' });
    d.append(
      h('div', { class: 'modal__body' }, h('h2', { id }, title),
        h('p', null, 'Dieser Inhalt kommt von einer KI oder einem Link. Prüfe die Vorschau; erst «Anlegen» speichert ein neues Deck. Deine bisherigen Decks bleiben unverändert.'),
        preview(deck, notes), err),
      h('div', { class: 'modal__actions' },
        h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => done(null) }, 'Abbrechen'), ok));
  });
}

// Dashboard: Text einfügen (JSON, ganzer Link oder nur der Code hinter d=).
export function pasteAiDialog() {
  return customDialog((d, done) => {
    const id = 'ai-' + Math.random().toString(36).slice(2);
    d.setAttribute('aria-labelledby', id);
    const ta = h('textarea', { class: 'input', id: id + '-in', rows: 10, style: 'width:100%;font-family:monospace', placeholder: '{ "kreidebox": 1, "name": "…", "screens": [ … ] }' });
    const err = h('p', { class: 'field__error', role: 'alert' });
    const form = h('form', { method: 'dialog', onSubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      try { const spec = parseAiText(ta.value); d.close(); d.remove(); done(await confirmAiDeck(spec)); }
      catch (x) { if (!d.isConnected) return; err.textContent = x.message; }
    } },
      h('div', { class: 'modal__body' }, h('h2', { id }, 'Von Claude oder ChatGPT einfügen'),
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: id + '-in' }, 'Text oder Link, den die KI geschrieben hat'), ta, err)),
      h('div', { class: 'modal__actions' },
        h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => done(null) }, 'Abbrechen'),
        h('button', { class: 'btn btn--primary', type: 'submit' }, 'Prüfen')));
    d.append(form);
    setTimeout(() => ta.focus(), 0);
  });
}

// Route #/ki?d=<base64url-JSON>
export async function renderAiLink(root) {
  document.title = 'Von KI übernehmen · Kreidebox';
  const page = h('main', { class: 'dash', id: 'main' }, h('p', null, 'Link wird geprüft …'));
  root.append(page);
  let deck = null, error = null;
  try { deck = await confirmAiDeck(parseAiText(location.hash)); } catch (e) { error = e; }
  if (error) {
    page.replaceChildren(h('div', { class: 'empty' }, h('h3', null, 'Der Link konnte nicht gelesen werden'), h('p', null, error.message),
      h('a', { class: 'btn btn--primary', href: '#/' }, 'Zur Übersicht')));
    return null;
  }
  location.hash = deck ? `#/deck/${deck.id}/1` : '#/';
  return null;
}
