import { json, sessionUser } from '../_lib/session.js';
import { listDecks } from '../_lib/decks.js';

export async function GET(request) {
  const u = await sessionUser(request);
  if (!u) return json({ error: 'Nicht angemeldet.' }, 401);
  return json({ decks: await listDecks(u.userId) });
}
