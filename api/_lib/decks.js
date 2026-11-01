import { pool } from './db.js';
import { stripNames, checkDeck, MAX_DECK_BYTES, ID_RE } from './privacy.js';

export const listDecks = async (userId) =>
  (await pool.query('SELECT id, name, rev, updated_at, deleted_at FROM kb_decks WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 500', [userId])).rows;

export async function getDeck(userId, id) {
  const r = await pool.query('SELECT id, name, data, rev, updated_at, deleted_at FROM kb_decks WHERE user_id = $1 AND id = $2', [userId, id]);
  return r.rows[0] || null;
}

// baseRev: Stand, auf dem die Änderung beruht (null = neues Deck). Gibt { deck } oder { conflict: true } zurück.
export async function putDeck(userId, id, deckData, baseRev) {
  if (!ID_RE.test(id)) throw Object.assign(new Error('Ungültige ID.'), { status: 400 });
  const bad = checkDeck(deckData);
  if (bad) throw Object.assign(new Error(bad), { status: 400 });
  const clean = stripNames(deckData);
  clean.id = id;
  if (Buffer.byteLength(JSON.stringify(clean)) > MAX_DECK_BYTES) throw Object.assign(new Error('Das Deck ist zu gross (max. 1 MB ohne Bilder).'), { status: 413 });
  const name = String(clean.name).slice(0, 120);
  const cur = await pool.query('SELECT rev FROM kb_decks WHERE user_id = $1 AND id = $2', [userId, id]);
  if (!cur.rows.length) {
    const count = (await pool.query('SELECT count(*)::int AS n FROM kb_decks WHERE user_id = $1 AND deleted_at IS NULL', [userId])).rows[0].n;
    if (count >= 300) throw Object.assign(new Error('Zu viele Decks (max. 300).'), { status: 409 });
    const r = await pool.query('INSERT INTO kb_decks (id, user_id, name, data) VALUES ($1, $2, $3, $4) RETURNING id, name, rev, updated_at', [id, userId, name, clean]);
    return { deck: r.rows[0] };
  }
  if (baseRev == null || Number(baseRev) !== cur.rows[0].rev) return { conflict: true, rev: cur.rows[0].rev };
  const r = await pool.query('UPDATE kb_decks SET name = $3, data = $4, rev = rev + 1, updated_at = now(), deleted_at = NULL WHERE user_id = $1 AND id = $2 AND rev = $5 RETURNING id, name, rev, updated_at', [userId, id, name, clean, cur.rows[0].rev]);
  if (!r.rows.length) return { conflict: true };
  return { deck: r.rows[0] };
}

export async function softDelete(userId, id) {
  const r = await pool.query('UPDATE kb_decks SET deleted_at = now(), rev = rev + 1, updated_at = now() WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id, rev', [userId, id]);
  return r.rows[0] || null;
}
