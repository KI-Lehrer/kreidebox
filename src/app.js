// Router: #/ (dashboard)  #/deck/{id}/{screen}
import * as store from './data/store.js';
import { renderDashboard } from './views/dashboard.js';
import { renderDeck } from './views/deck.js';
import { renderLists } from './views/lists.js';
import { renderTemplates } from './views/templates.js';
import { applyAppearance } from './views/nav.js';

applyAppearance();
import { h } from './ui/dom.js';

const root = document.getElementById('app');
let cleanup = null;
let routing = Promise.resolve();

function route() {
  routing = routing.then(async () => {
    if (cleanup) { await cleanup(); cleanup = null; }
    root.replaceChildren();
    const m = location.hash.match(/^#\/deck\/([\w-]+)(?:\/(\d+))?/);
    const l = location.hash.match(/^#\/listen(?:\/([\w-]+))?/);
    const t = /^#\/vorlagen/.test(location.hash);
    document.body.classList.toggle('is-deck', !!m);
    cleanup = m ? await renderDeck(root, m[1], Number(m[2] || 1) - 1) : l ? await renderLists(root, l[1]) : t ? await renderTemplates(root) : await renderDashboard(root);
  }).catch((err) => {
    console.error(err);
    root.replaceChildren(h('div', { class: 'empty' }, h('h3', null, 'Etwas ist schiefgelaufen'), h('p', null, String(err && err.message || err)),
      h('a', { class: 'btn btn--primary', href: '#/' }, 'Zur Übersicht')));
  });
}

addEventListener('hashchange', route);
store.init().then(route, (err) => {
  root.replaceChildren(h('div', { class: 'empty' }, h('h3', null, 'Speicher nicht verfügbar'),
    h('p', null, 'Dieser Browser erlaubt hier kein Speichern (z. B. privates Fenster). ' + (err && err.message ? err.message : ''))));
});
