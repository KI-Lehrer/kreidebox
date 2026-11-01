// Legt Tabellen an (idempotent). Läuft beim Build auf Vercel und lokal: node scripts/migrate.mjs
import { readFileSync } from 'node:fs';
import { getMigrations } from 'better-auth/db/migration';

if (!(process.env.DATABASE_URL || process.env.POSTGRES_URL)) { console.log('Keine DATABASE_URL: Migration übersprungen.'); process.exit(0); }
if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) { console.error('BETTER_AUTH_SECRET fehlt oder ist kürzer als 32 Zeichen. Erzeuge eins mit: openssl rand -base64 32'); process.exit(1); }
const { auth } = await import('../api/_lib/auth.js');
const { pool } = await import('../api/_lib/db.js');
const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
console.log(`Login-Tabellen: ${toBeCreated.length} neu, ${toBeAdded.length} ergänzt`);
await runMigrations();
await pool.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
console.log('Migration fertig.');
await pool.end();
