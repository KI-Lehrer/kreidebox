import { auth } from './auth.js';

export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

// Browser: Cookie-Sitzung. Gibt { userId, email } oder null zurück.
export async function sessionUser(request) {
  const s = await auth.api.getSession({ headers: request.headers });
  return s && s.user ? { userId: s.user.id, email: s.user.email } : null;
}
