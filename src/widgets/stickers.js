// Stickers (W25): one big emoji sticker per widget (system emoji, no image files). Search in German.
import { h } from '../ui/dom.js';
import { section, switchRow } from '../ui/overlays.js';

export const STICKERS = {
  'Lob': [['⭐', 'stern super'], ['🌟', 'stern glanz'], ['🏆', 'pokal sieger'], ['🥇', 'medaille gold erster'], ['👍', 'daumen gut'], ['👏', 'klatschen applaus'], ['💯', 'hundert perfekt'], ['🎉', 'party feier'], ['✅', 'erledigt richtig haken'], ['💪', 'stark kraft']],
  'Schule': [['📚', 'bücher lesen'], ['✏️', 'bleistift schreiben'], ['📏', 'lineal'], ['✂️', 'schere basteln'], ['🖍️', 'farbstift malen'], ['🧮', 'rechnen abakus'], ['🔬', 'mikroskop forschen'], ['🌍', 'welt erde nmg'], ['🎒', 'schulsack thek'], ['🔔', 'glocke pause'], ['⏰', 'wecker zeit'], ['💡', 'idee']],
  'Gefühle': [['😀', 'froh lachen'], ['🙂', 'gut'], ['😐', 'neutral'], ['🙁', 'traurig'], ['😢', 'weinen'], ['😡', 'wütend'], ['😴', 'müde schlafen'], ['🤔', 'denken nachdenken'], ['🤫', 'leise psst ruhe'], ['❤️', 'herz liebe']],
  'Natur': [['🌞', 'sonne'], ['🌧️', 'regen'], ['❄️', 'schnee winter'], ['🍂', 'herbst blatt'], ['🌷', 'blume frühling'], ['🌳', 'baum wald'], ['🍎', 'apfel znüni'], ['🐻', 'bär'], ['🦊', 'fuchs'], ['🐝', 'biene'], ['🦉', 'eule'], ['🐸', 'frosch']],
  'Feste': [['🎄', 'weihnachten baum'], ['🎅', 'samichlaus weihnachten'], ['🎃', 'kürbis halloween'], ['🐣', 'ostern küken'], ['🎂', 'geburtstag kuchen'], ['🎈', 'ballon'], ['🎁', 'geschenk'], ['🎆', 'feuerwerk neujahr']],
  'Zeichen': [['➡️', 'pfeil rechts'], ['⬅️', 'pfeil links'], ['⬆️', 'pfeil oben'], ['⬇️', 'pfeil unten'], ['❗', 'achtung wichtig'], ['❓', 'frage'], ['🛑', 'stopp'], ['⚠️', 'warnung'], ['🔇', 'stumm ruhe'], ['🚫', 'verboten nein']],
};

export default {
  type: 'stickers', label: 'Sticker', icon: 'palette',
  size: { w: 260, h: 260 }, minSize: { w: 60, h: 60 },
  create: () => ({ settings: { emoji: '⭐', flipX: false, flipY: false }, state: {}, themeId: 'transparent' }),
  openSettingsOnAdd: () => true,

  mount(root, w, api) {
    const el = h('div', { class: 'st__emoji', 'aria-hidden': 'true' });
    root.append(h('div', { class: 'st' }, el));
    function update() {
      el.textContent = w.settings.emoji;
      el.style.transform = `scale(${w.settings.flipX ? -1 : 1}, ${w.settings.flipY ? -1 : 1})`;
      const name = Object.values(STICKERS).flat().find(([e]) => e === w.settings.emoji);
      api.setLabel('Sticker' + (name ? ': ' + name[1].split(' ')[0] : ''));
    }
    update();
    return { update };
  },

  settingsPanel(body, w, api) {
    const change = () => { api.changed(); api.refresh(); };
    const grid = h('div', { class: 'st-grid', role: 'radiogroup', 'aria-label': 'Sticker wählen' });
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Suchen, z. B. Stern, Herbst, Pause', 'aria-label': 'Sticker suchen', onInput: () => draw() });
    function draw() {
      const q = search.value.trim().toLowerCase();
      grid.replaceChildren(...Object.entries(STICKERS).flatMap(([cat, list]) => {
        const items = list.filter(([e, words]) => !q || words.includes(q) || cat.toLowerCase().includes(q));
        if (!items.length) return [];
        return [h('div', { class: 'st-grid__cat' }, cat), ...items.map(([e, words]) => h('button', { class: 'st-grid__btn', type: 'button', role: 'radio', 'aria-checked': String(e === w.settings.emoji), 'aria-label': words.split(' ')[0], title: words.split(' ')[0],
          onClick: () => { w.settings.emoji = e; change(); draw(); } }, e))];
      }));
      if (!grid.children.length) grid.append(h('p', { class: 'field__hint' }, 'Nichts gefunden.'));
    }
    draw();
    body.append(section(null, search, grid),
      section('Spiegeln', switchRow('Waagrecht spiegeln', w.settings.flipX, (v) => { w.settings.flipX = v; change(); }),
        switchRow('Senkrecht spiegeln', w.settings.flipY, (v) => { w.settings.flipY = v; change(); })));
  },
};
