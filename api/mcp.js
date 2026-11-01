// Kreidebox als MCP-Server (Streamable HTTP, ohne Sitzung). Anmeldung per OAuth (Better Auth, mcp-Plugin).
import { readFileSync } from 'node:fs';
import { auth, baseURL } from './_lib/auth.js';
import { json } from './_lib/session.js';
import { listDecks, getDeck, putDeck, softDelete } from './_lib/decks.js';
import { toSpec } from './_lib/spec.js';

const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];
const newId = () => 'ki' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
let formatText = null;
const formatHelp = () => formatText ?? (formatText = readFileSync(new URL('../ki-format.md', import.meta.url), 'utf8'));
const SPEC_NOTE = 'Das Deck im KI-Format (siehe Werkzeug format_help). Namen von Kindern werden nicht gespeichert; die Lehrperson trägt sie in Kreidebox selbst ein.';
const SPEC_SCHEMA = { type: 'object', description: SPEC_NOTE, required: ['kreidebox', 'name', 'screens'], properties: { kreidebox: { const: 1 }, name: { type: 'string' }, aspect: { enum: ['16:9', '4:3'] }, screens: { type: 'array', items: { type: 'object' } } } };

const TOOLS = [
  { name: 'format_help', description: 'Beschreibt das Format für Decks und alle Widgets. Zuerst lesen, bevor du ein Deck erstellst oder änderst.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'list_decks', description: 'Listet die Decks der angemeldeten Lehrperson (id, Name, Stand).', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'get_deck', description: 'Liest ein Deck im KI-Format. Ändere es und schicke es mit update_deck zurück.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } }, annotations: { readOnlyHint: true } },
  { name: 'create_deck', description: 'Legt ein neues Deck an. Es erscheint in Kreidebox, sobald die Lehrperson die App öffnet.', inputSchema: { type: 'object', required: ['deck'], properties: { deck: SPEC_SCHEMA } }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: 'update_deck', description: 'Ersetzt ein bestehendes Deck vollständig durch die gegebene Fassung. Hole es vorher mit get_deck und ändere nur, was verlangt wurde.', inputSchema: { type: 'object', required: ['id', 'deck'], properties: { id: { type: 'string' }, deck: SPEC_SCHEMA } }, annotations: { readOnlyHint: false, destructiveHint: true } },
  { name: 'delete_deck', description: 'Legt ein Deck in den Papierkorb (kann in Kreidebox wiederhergestellt werden). Nur auf ausdrücklichen Wunsch der Lehrperson verwenden.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } }, annotations: { readOnlyHint: false, destructiveHint: true } },
];

const text = (t, isError = false) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }], isError });
const checkSpec = (d) => (d && d.kreidebox === 1 && typeof d.name === 'string' && Array.isArray(d.screens) && d.screens.length ? null : 'Ungültiges Deck: erwartet {"kreidebox":1,"name":"…","screens":[…]}.');

async function callTool(userId, name, args = {}) {
  switch (name) {
    case 'format_help': return text(formatHelp());
    case 'list_decks': {
      const rows = (await listDecks(userId)).filter((r) => !r.deleted_at);
      return text(rows.length ? rows.map((r) => ({ id: r.id, name: r.name, geaendert: r.updated_at })) : 'Keine Decks.');
    }
    case 'get_deck': {
      const d = await getDeck(userId, String(args.id || ''));
      return d && !d.deleted_at ? text(toSpec(d.data)) : text('Deck nicht gefunden.', true);
    }
    case 'create_deck': {
      const bad = checkSpec(args.deck); if (bad) return text(bad, true);
      const id = newId();
      await putDeck(userId, id, args.deck, null);
      return text({ id, hinweis: 'Angelegt. Die Lehrperson sieht es in Kreidebox nach dem Öffnen oder Aktualisieren.' });
    }
    case 'update_deck': {
      const bad = checkSpec(args.deck); if (bad) return text(bad, true);
      const cur = await getDeck(userId, String(args.id || ''));
      if (!cur || cur.deleted_at) return text('Deck nicht gefunden.', true);
      const r = await putDeck(userId, cur.id, args.deck, cur.rev);
      return r.conflict ? text('Das Deck wurde gleichzeitig geändert. Hole es mit get_deck neu und versuche es nochmals.', true) : text({ id: cur.id, hinweis: 'Aktualisiert.' });
    }
    case 'delete_deck': {
      const r = await softDelete(userId, String(args.id || ''));
      return r ? text('Im Papierkorb.') : text('Deck nicht gefunden.', true);
    }
    default: return null;
  }
}

async function rpc(userId, msg) {
  const ok = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return err(-32600, 'Ungültige Anfrage');
  if (msg.id === undefined) return null; // Benachrichtigung
  switch (msg.method) {
    case 'initialize': {
      const want = msg.params && msg.params.protocolVersion;
      return ok({ protocolVersion: SUPPORTED.includes(want) ? want : SUPPORTED[0], capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'kreidebox', version: '1.0.0' },
        instructions: 'Kreidebox: Unterrichtsbildschirme (Timer, Zufall, Ampel …). Lies zuerst format_help. Kinder-Namen werden nicht gespeichert.' });
    }
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': {
      const p = msg.params || {};
      try { const r = await callTool(userId, p.name, p.arguments); return r ? ok(r) : err(-32602, `Unbekanntes Werkzeug: ${p.name}`); }
      catch (e) { console.error('mcp tool', p.name, e); return ok(text(e.status && e.status < 500 ? e.message : 'Interner Fehler.', true)); }
    }
    default: return err(-32601, `Methode nicht unterstützt: ${msg.method}`);
  }
}

const unauthorized = () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json', 'www-authenticate': `Bearer resource_metadata="${baseURL}/.well-known/oauth-protected-resource"` } });

export async function POST(request) {
  const session = await auth.api.getMcpSession({ headers: request.headers });
  if (!session || !session.userId) return unauthorized();
  let body; try { body = await request.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Kein gültiges JSON' } }, 400); }
  const batch = Array.isArray(body);
  const out = (await Promise.all((batch ? body : [body]).map((m) => rpc(session.userId, m)))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202 });
  return json(batch ? out : out[0]);
}

export async function GET(request) {
  const session = await auth.api.getMcpSession({ headers: request.headers });
  if (!session) return unauthorized();
  return new Response('Nur POST', { status: 405, headers: { allow: 'POST' } });
}
export async function DELETE() { return new Response(null, { status: 405, headers: { allow: 'POST' } }); }
