import { json, sessionUser } from '../_lib/session.js';
import { getDeck, putDeck, softDelete } from '../_lib/decks.js';

const idOf = (request) => decodeURIComponent(new URL(request.url).pathname.split('/').pop());

// Schreibende Anfragen nur von der eigenen Seite (Schutz vor Anfragen von fremden Webseiten).
const sameOrigin = (request) => { const o = request.headers.get('origin'); return !o || o === new URL(request.url).origin; };

export async function GET(request) {
  const u = await sessionUser(request);
  if (!u) return json({ error: 'Nicht angemeldet.' }, 401);
  const d = await getDeck(u.userId, idOf(request));
  return d ? json(d) : json({ error: 'Nicht gefunden.' }, 404);
}

export async function PUT(request) {
  if (!sameOrigin(request)) return json({ error: 'Nicht erlaubt.' }, 403);
  const u = await sessionUser(request);
  if (!u) return json({ error: 'Nicht angemeldet.' }, 401);
  let body; try { body = await request.json(); } catch { return json({ error: 'Kein gültiges JSON.' }, 400); }
  try {
    const r = await putDeck(u.userId, idOf(request), body.data, body.baseRev ?? null);
    return r.conflict ? json({ error: 'Konflikt', rev: r.rev }, 409) : json(r.deck);
  } catch (e) { return json({ error: e.message }, e.status || 500); }
}

export async function DELETE(request) {
  if (!sameOrigin(request)) return json({ error: 'Nicht erlaubt.' }, 403);
  const u = await sessionUser(request);
  if (!u) return json({ error: 'Nicht angemeldet.' }, 401);
  const r = await softDelete(u.userId, idOf(request));
  return r ? json(r) : json({ error: 'Nicht gefunden.' }, 404);
}
