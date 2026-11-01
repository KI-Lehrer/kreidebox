import pg from 'pg';

// Eine Verbindung pro Funktionsinstanz; Neon (gepoolte Adresse) verteilt sie weiter.
const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
// Gleiches Verhalten wie bisher, ohne die Warnung von pg zum SSL-Modus.
const url = raw && raw.replace(/sslmode=(require|prefer|verify-ca)/, 'sslmode=verify-full');
export const pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10000, ssl: url && /localhost|127\.0\.0\.1/.test(url) ? false : undefined });
