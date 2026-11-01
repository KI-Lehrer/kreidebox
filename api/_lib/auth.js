import { betterAuth } from 'better-auth';
import { mcp } from 'better-auth/plugins';
import { pool } from './db.js';

const host = process.env.BETTER_AUTH_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
export const baseURL = host.replace(/\/$/, '');

async function sendMail({ to, subject, text }) {
  const key = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM;
  if (!key || !from) { console.warn('E-Mail-Versand nicht eingerichtet (RESEND_API_KEY, MAIL_FROM): Mail an', to, 'nicht gesendet'); return; }
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, subject, text }) });
  if (!r.ok) console.error('E-Mail-Versand fehlgeschlagen', r.status);
}

export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  trustedOrigins: [baseURL, ...(process.env.TRUSTED_ORIGINS ? process.env.TRUSTED_ORIGINS.split(',') : [])],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      void sendMail({ to: user.email, subject: 'Kreidebox: Passwort zurücksetzen', text: `Hallo\n\nÖffne diesen Link, um ein neues Passwort für Kreidebox zu wählen (1 Stunde gültig):\n${url}\n\nWenn du das nicht angefordert hast, ignoriere diese Nachricht.` });
    },
  },
  user: { deleteUser: { enabled: true, beforeDelete: async (user) => { await pool.query('DELETE FROM kb_decks WHERE user_id = $1', [user.id]); } } },
  rateLimit: { enabled: true, storage: 'database', window: 60, max: 60, customRules: { '/sign-in/email': { window: 60, max: 8 }, '/sign-up/email': { window: 3600, max: 10 }, '/request-password-reset': { window: 3600, max: 5 } } },
  advanced: { useSecureCookies: baseURL.startsWith('https://'), ipAddress: { ipAddressHeaders: ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for'] } },
  plugins: [mcp({ loginPage: '/konto.html' })],
});
