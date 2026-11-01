// Schülernamen verlassen das Gerät nie: vor dem Speichern auf dem Server werden sie aus dem Deck entfernt.
// Die App führt sie beim Abgleich mit den lokalen Daten wieder zusammen (gleiche Widget-ID).
const NAME_WIDGETS = new Set(['randomizer', 'groupmaker']);

export function stripNames(deck) {
  const d = JSON.parse(JSON.stringify(deck));
  // KI-Format (kreidebox: 1): «names» und settings.localNames entfernen
  const specScrub = (w) => { if (w && typeof w === 'object') { delete w.names; if (w.settings && typeof w.settings === 'object') { delete w.settings.localNames; delete w.settings.absent; } } };
  if (d.kreidebox === 1) { for (const s of d.screens || []) for (const w of (s && s.widgets) || []) specScrub(w); return d; }
  const scrub = (w) => {
    if (!w || !NAME_WIDGETS.has(w.type)) return;
    w.settings = { ...(w.settings || {}), localNames: [], absent: [], listId: 'default' };
    w.state = w.type === 'randomizer' ? { drawn: [], current: null, rotation: 0 } : { groups: null };
  };
  for (const s of d.screens || []) for (const w of s.widgets || []) scrub(w);
  for (const w of d.pinnedWidgets || []) scrub(w);
  return d;
}

export const MAX_DECK_BYTES = 1_000_000;
export const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function checkDeck(deck) {
  if (!deck || typeof deck !== 'object' || Array.isArray(deck)) return 'Kein gültiges Deck.';
  if (!Array.isArray(deck.screens) || deck.screens.length === 0 || deck.screens.length > 100) return 'Ein Deck braucht 1 bis 100 Bildschirme.';
  if (typeof deck.name !== 'string') return 'Name fehlt.';
  return null;
}
