import pg from 'pg';

// Eine Verbindung pro Funktionsinstanz; Neon (gepoolte Adresse) verteilt sie weiter.
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
export const pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10000, ssl: url && /localhost|127\.0\.0\.1/.test(url) ? false : undefined });
