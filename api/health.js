import { pool } from './_lib/db.js';
import { json } from './_lib/session.js';

export async function GET() {
  try { await pool.query('SELECT 1'); return json({ ok: true }); } catch { return json({ ok: false }, 503); }
}
