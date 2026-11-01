// Server-Tests: Konten, Decks, Zugriffsschutz, MCP mit OAuth. Brauchen eine Test-Datenbank:
//   TEST_DATABASE_URL=postgres://… npx playwright test tests/api.spec.js   (der Dev-Server startet automatisch auf Port 3111)
import { test, expect, request as pwRequest } from '@playwright/test';
import crypto from 'node:crypto';
import pg from 'pg';

const BASE = 'http://localhost:3111';
test.skip(!process.env.TEST_DATABASE_URL, 'TEST_DATABASE_URL nicht gesetzt');
test.describe.configure({ mode: 'serial' });

const uniq = () => crypto.randomBytes(5).toString('hex');
const pw = 'Ein-langes-Passwort-42';
const deckData = (name, extra = {}) => ({ id: 'x', name, aspectRatio: '16:9', screens: [{ id: 's1', name: '', background: { type: 'color', value: '#DFF0EC' }, widgets: [
  { id: 'w1abcdefgh', type: 'randomizer', x: 0, y: 0, w: 640, h: 360, settings: { listId: 'local', localNames: ['Anna', 'Ben'], mode: 'standard' }, state: { drawn: ['Anna'], current: 'Anna', rotation: 0 } },
  { id: 'w2abcdefgh', type: 'timer', x: 700, y: 0, w: 640, h: 260, settings: {}, state: { durationMs: 300000 } } ] }], pinnedWidgets: [], ...extra });

async function newUser(label) {
  const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: BASE } });
  const email = `${label}-${uniq()}@example.test`;
  const r = await ctx.post('/api/auth/sign-up/email', { data: { email, password: pw, name: label } });
  expect(r.ok(), await r.text()).toBeTruthy();
  return { ctx, email };
}

let A, B;
const clearLimits = async () => { const c = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await c.connect(); await c.query('DELETE FROM "rateLimit"'); await c.end(); };
test.beforeAll(async () => { await clearLimits(); A = await newUser('anna'); B = await newUser('bernd'); });

test('Gesundheit, Konto und Sitzung', async () => {
  const anon = await pwRequest.newContext({ baseURL: BASE });
  expect((await (await anon.get('/api/health')).json()).ok).toBe(true);
  expect((await anon.get('/api/decks')).status()).toBe(401);
  const s = await (await A.ctx.get('/api/auth/get-session')).json();
  expect(s.user.email).toBe(A.email);
  const bad = await anon.post('/api/auth/sign-in/email', { data: { email: A.email, password: 'falsch-falsch-1' }, headers: { origin: BASE } });
  expect(bad.status()).toBe(401);
  const short = await anon.post('/api/auth/sign-up/email', { data: { email: `k-${uniq()}@example.test`, password: 'kurz', name: 'k' }, headers: { origin: BASE } });
  expect(short.status()).toBe(400);
});

test('Deck speichern, lesen, Namen werden entfernt, Konflikt', async () => {
  const id = 'deck-' + uniq();
  const put = await A.ctx.put(`/api/decks/${id}`, { data: { data: deckData('Montag'), baseRev: null } });
  expect(put.ok(), await put.text()).toBeTruthy();
  const got = await (await A.ctx.get(`/api/decks/${id}`)).json();
  expect(got.rev).toBe(1);
  const rand = got.data.screens[0].widgets[0];
  expect(JSON.stringify(got.data)).not.toMatch(/Anna|Ben/);
  expect(rand.settings.localNames).toEqual([]);
  expect(rand.state.drawn).toEqual([]);
  expect(got.data.screens[0].widgets[1].state.durationMs).toBe(300000);
  const ok = await A.ctx.put(`/api/decks/${id}`, { data: { data: deckData('Montag neu'), baseRev: 1 } });
  expect((await ok.json()).rev).toBe(2);
  const stale = await A.ctx.put(`/api/decks/${id}`, { data: { data: deckData('Alt'), baseRev: 1 } });
  expect(stale.status()).toBe(409);
  const noBase = await A.ctx.put(`/api/decks/${id}`, { data: { data: deckData('Ohne'), baseRev: null } });
  expect(noBase.status()).toBe(409);
  const list = await (await A.ctx.get('/api/decks')).json();
  expect(list.decks.find((d) => d.id === id).name).toBe('Montag neu');
});

test('Zugriffsschutz: fremde Decks sind unsichtbar und unveränderbar', async () => {
  const id = 'priv-' + uniq();
  await A.ctx.put(`/api/decks/${id}`, { data: { data: deckData('Nur Anna'), baseRev: null } });
  expect((await B.ctx.get(`/api/decks/${id}`)).status()).toBe(404);
  expect((await B.ctx.delete(`/api/decks/${id}`)).status()).toBe(404);
  const list = await (await B.ctx.get('/api/decks')).json();
  expect(list.decks.some((d) => d.id === id)).toBe(false);
  // gleiche ID bei einer anderen Person ist ein eigenes Deck und überschreibt nichts
  const own = await B.ctx.put(`/api/decks/${id}`, { data: { data: deckData('Bernds Deck'), baseRev: null } });
  expect(own.ok()).toBeTruthy();
  expect((await (await A.ctx.get(`/api/decks/${id}`)).json()).name).toBe('Nur Anna');
});

test('Eingaben werden geprüft, fremde Webseiten dürfen nicht schreiben', async () => {
  const id = 'chk-' + uniq();
  expect((await A.ctx.put(`/api/decks/${id}`, { data: { data: { name: 'x' }, baseRev: null } })).status()).toBe(400);
  expect((await A.ctx.put('/api/decks/a%27b', { data: { data: deckData('x'), baseRev: null } })).status()).toBe(400);
  const big = deckData('Gross'); big.screens[0].name = 'x'.repeat(1_100_000);
  expect((await A.ctx.put(`/api/decks/${id}`, { data: { data: big, baseRev: null } })).status()).toBe(413);
  const evil = await A.ctx.put(`/api/decks/${id}`, { data: { data: deckData('x'), baseRev: null }, headers: { origin: 'https://boese.example' } });
  expect(evil.status()).toBe(403);
  const evilDel = await A.ctx.delete(`/api/decks/${id}`, { headers: { origin: 'https://boese.example' } });
  expect(evilDel.status()).toBe(403);
});

// ---------- MCP mit OAuth (so, wie Claude und ChatGPT es tun) ----------
async function oauthToken(userCtx) {
  const meta = await (await userCtx.get('/.well-known/oauth-authorization-server')).json();
  const redirect = 'https://client.example/callback';
  const reg = await (await userCtx.post(new URL(meta.registration_endpoint).pathname, { data: { client_name: 'Test-KI', redirect_uris: [redirect], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] } })).json();
  expect(reg.client_id).toBeTruthy();
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: redirect, scope: 'openid', state: 's1', code_challenge: challenge, code_challenge_method: 'S256' });
  const auth = await userCtx.get(new URL(meta.authorization_endpoint).pathname + '?' + q, { maxRedirects: 0 });
  const loc = auth.headers().location;
  expect(loc, `Antwort ${auth.status()}`).toBeTruthy();
  const code = new URL(loc, BASE).searchParams.get('code');
  expect(code, loc).toBeTruthy();
  const tok = await userCtx.post(new URL(meta.token_endpoint).pathname, { form: { grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: reg.client_id, code_verifier: verifier } });
  const t = await tok.json();
  expect(t.access_token, JSON.stringify(t)).toBeTruthy();
  return t.access_token;
}

async function mcp(token, method, params, id = 1) {
  const anon = await pwRequest.newContext({ baseURL: BASE });
  const r = await anon.post('/api/mcp', { data: { jsonrpc: '2.0', id, method, params }, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' } });
  return { status: r.status(), body: r.status() === 202 ? null : await r.json() };
}
const callTool = async (token, name, args) => { const r = await mcp(token, 'tools/call', { name, arguments: args }); return { ...r, text: r.body.result.content[0].text, isError: r.body.result.isError }; };

test('MCP: ohne Anmeldung 401, mit gefälschtem Token 401', async () => {
  const anon = await pwRequest.newContext({ baseURL: BASE });
  const r = await anon.post('/api/mcp', { data: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
  expect(r.status()).toBe(401);
  expect(r.headers()['www-authenticate']).toContain('resource_metadata');
  expect((await mcp('gefaelscht', 'tools/list')).status).toBe(401);
});

test('MCP: Anmelden per OAuth, Werkzeuge, Deck erstellen, lesen, ändern, löschen', async () => {
  const token = await oauthToken(A.ctx);
  const init = await mcp(token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  expect(init.body.result.serverInfo.name).toBe('kreidebox');
  expect((await mcp(token, 'notifications/initialized', undefined, undefined)).status).toBeDefined();
  const tools = (await mcp(token, 'tools/list')).body.result.tools.map((t) => t.name);
  expect(tools).toEqual(['format_help', 'list_decks', 'get_deck', 'create_deck', 'update_deck', 'delete_deck']);
  expect((await callTool(token, 'format_help', {})).text).toContain('# Format');

  const spec = { kreidebox: 1, name: 'Von der KI', screens: [{ name: 'A', widgets: [{ type: 'timer', minutes: 4 }, { type: 'randomizer', names: ['Geheim', 'Streng'] }] }] };
  const created = await callTool(token, 'create_deck', { deck: spec });
  expect(created.isError).toBeFalsy();
  const id = JSON.parse(created.text).id;
  const list = await callTool(token, 'list_decks', {});
  expect(list.text).toContain('Von der KI');
  const got = JSON.parse((await callTool(token, 'get_deck', { id })).text);
  expect(got.name).toBe('Von der KI');
  expect(JSON.stringify(got)).not.toMatch(/Geheim|Streng/); // Namen werden nicht gespeichert
  got.name = 'Von der KI (geändert)';
  expect((await callTool(token, 'update_deck', { id, deck: got })).isError).toBeFalsy();
  expect((await callTool(token, 'get_deck', { id })).text).toContain('geändert');
  expect((await callTool(token, 'create_deck', { deck: { kreidebox: 1 } })).isError).toBe(true);
  expect((await callTool(token, 'delete_deck', { id })).isError).toBeFalsy();
  expect((await callTool(token, 'get_deck', { id })).isError).toBe(true);
});

test('MCP: eine Person sieht über die KI nur ihre eigenen Decks', async () => {
  const idA = 'mcpa-' + uniq();
  await A.ctx.put(`/api/decks/${idA}`, { data: { data: deckData('Annas geheimes Deck'), baseRev: null } });
  const tokenB = await oauthToken(B.ctx);
  expect((await callTool(tokenB, 'list_decks', {})).text).not.toContain('Annas geheimes Deck');
  expect((await callTool(tokenB, 'get_deck', { id: idA })).isError).toBe(true);
  expect((await callTool(tokenB, 'update_deck', { id: idA, deck: { kreidebox: 1, name: 'gekapert', screens: [{}] } })).isError).toBe(true);
  expect((await callTool(tokenB, 'delete_deck', { id: idA })).isError).toBe(true);
  expect((await (await A.ctx.get(`/api/decks/${idA}`)).json()).name).toBe('Annas geheimes Deck');
});

// ---------- Anmeldeseite im Browser, auch als Teil der OAuth-Anmeldung ----------
test('Anmeldeseite: Konto erstellen, abmelden, anmelden', async ({ page }) => {
  const email = `seite-${uniq()}@example.test`;
  await page.goto(`${BASE}/konto.html`);
  await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
  await page.getByRole('link', { name: 'Konto erstellen' }).click();
  await page.getByLabel('Name (Vorname genügt)').fill('Sabine');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel(/^Passwort/).fill('kurz');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await expect(page.getByText('Das Passwort ist zu kurz')).toBeVisible();
  await page.getByLabel(/^Passwort/).fill(pw);
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await expect(page.getByRole('heading', { name: 'Dein Konto' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill('falsches-passwort-1');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByText('E-Mail oder Passwort stimmt nicht.')).toBeVisible();
  await page.getByLabel('Passwort').fill(pw);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Dein Konto' })).toBeVisible();
});

test('OAuth im Browser: nicht angemeldet → Anmeldeseite → zurück zur KI mit Code', async ({ page }) => {
  const meta = await (await page.request.get(`${BASE}/.well-known/oauth-authorization-server`)).json();
  const redirect = 'https://client.example/callback';
  const reg = await (await page.request.post(new URL(meta.registration_endpoint).href, { data: { client_name: 'Test-KI', redirect_uris: [redirect], token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'] } })).json();
  const challenge = crypto.createHash('sha256').update('v'.repeat(43)).digest('base64url');
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: redirect, scope: 'openid', state: 'abc', code_challenge: challenge, code_challenge_method: 'S256' });
  await page.route('https://client.example/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
  await page.goto(`${BASE}/api/auth/mcp/authorize?${q}`);
  await expect(page).toHaveURL(/\/konto\.html/);
  const { email } = B;
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill(pw);
  const back = page.waitForRequest((r) => r.url().startsWith('https://client.example/callback'));
  await page.getByRole('button', { name: 'Anmelden' }).click();
  const url = new URL((await back).url());
  expect(url.searchParams.get('code')).toBeTruthy();
  expect(url.searchParams.get('state')).toBe('abc');
});

test('Zu viele falsche Anmeldungen werden gebremst', async () => {
  await clearLimits();
  const anon = await pwRequest.newContext({ baseURL: BASE });
  const codes = [];
  for (let i = 0; i < 10; i++) codes.push((await anon.post('/api/auth/sign-in/email', { data: { email: A.email, password: 'falsch-falsch-' + i }, headers: { origin: BASE } })).status());
  expect(codes).toContain(429);
  await clearLimits();
});

// ---------- Abgleich in der App ----------
test('Abgleich: zwei Geräte, KI-Deck erscheint, Namen bleiben lokal', async ({ browser }) => {
  const email = `sync-${uniq()}@example.test`;
  const login = async (page) => { await page.goto(`${BASE}/konto.html`); await page.getByRole('link', { name: 'Konto erstellen' }).click().catch(() => {}); };
  // Gerät 1: Konto erstellen, Deck mit Namen anlegen
  const c1 = await browser.newContext({ baseURL: BASE }); const p1 = await c1.newPage();
  const errors = []; p1.on('pageerror', (e) => errors.push(e.message));
  expect((await c1.request.post(`${BASE}/api/auth/sign-up/email`, { data: { email, password: pw, name: 'Sync' }, headers: { origin: BASE } })).ok()).toBeTruthy();
  await p1.goto(`${BASE}/dist/index.html`);
  await expect(p1.getByText(email)).toBeVisible();
  await p1.getByRole('button', { name: 'Neues Deck' }).click();
  await p1.getByRole('button', { name: /^Zufall/ }).first().click();
  await p1.waitForTimeout(600);
  // Namen von Hand in das Widget schreiben (lokal)
  await p1.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('nachbau'); r.onsuccess = () => res(r.result); });
    const tx = db.transaction('decks', 'readwrite'); const st = tx.objectStore('decks');
    const all = await new Promise((res) => { const r = st.getAll(); r.onsuccess = () => res(r.result); });
    const d = all[0]; const w = d.screens[0].widgets.find((x) => x.type === 'randomizer');
    w.settings.listId = 'local'; w.settings.localNames = ['Geheim1', 'Geheim2']; d.name = 'Syncdeck'; d.updatedAt = new Date().toISOString();
    st.put(d); await new Promise((res) => { tx.oncomplete = res; });
  });
  await p1.reload(); // löst den Abgleich aus (Deck ist neuer als gespeicherter Stand)
  await expect.poll(async () => (await (await c1.request.get(`${BASE}/api/decks`)).json()).decks.some((d) => d.name === 'Syncdeck')).toBe(true);
  const remote = await (await c1.request.get(`${BASE}/api/decks`)).json();
  const id = remote.decks.find((d) => d.name === 'Syncdeck').id;
  expect(JSON.stringify(await (await c1.request.get(`${BASE}/api/decks/${id}`)).json())).not.toMatch(/Geheim/);

  // Gerät 2: gleiches Konto, sieht das Deck
  const c2 = await browser.newContext({ baseURL: BASE }); const p2 = await c2.newPage();
  await c2.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password: pw }, headers: { origin: BASE } });
  await p2.goto(`${BASE}/dist/index.html`);
  await expect(p2.getByText('Syncdeck').first()).toBeVisible();

  // KI legt ein Deck an (über die Schnittstelle des Kontos), Gerät 2 übernimmt es beim nächsten Abgleich
  const kiCtx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: BASE }, storageState: await c1.storageState() });
  const token = await oauthToken(kiCtx);
  const created = await callTool(token, 'create_deck', { deck: { kreidebox: 1, name: 'KI-Deck', screens: [{ name: 'A', widgets: [{ type: 'timer', minutes: 7 }, { type: 'trafficlight' }] }] } });
  expect(created.isError).toBeFalsy();
  await p2.reload();
  await expect(p2.getByText('KI-Deck').first()).toBeVisible();
  await p2.getByText('KI-Deck').first().click();
  await expect(p2.locator('.stage')).toContainText('7');
  // nach der Übernahme liegt auf dem Server ein vollständiges Deck, kein KI-Entwurf mehr
  await expect.poll(async () => { const l = await (await c2.request.get(`${BASE}/api/decks`)).json(); const k = l.decks.find((d) => d.name === 'KI-Deck'); return k ? (await (await c2.request.get(`${BASE}/api/decks/${k.id}`)).json()).data.kreidebox : 'fehlt'; }).toBeUndefined();
  // KI ändert das Deck mit Namen-Widget: Gerät 1 übernimmt die Änderung und behält seine lokalen Namen
  await p1.goto(`${BASE}/dist/index.html#/`); await p1.waitForTimeout(1500); // Gerät 1 ist im Dashboard, es bearbeitet nichts
  const spec = JSON.parse((await callTool(token, 'get_deck', { id })).text);
  spec.name = 'Syncdeck von der KI geändert';
  expect((await callTool(token, 'update_deck', { id, deck: spec })).isError).toBeFalsy();
  await p1.reload();
  await expect(p1.getByText('Syncdeck von der KI geändert').first()).toBeVisible();
  const names = await p1.evaluate(async (deckId) => {
    const db = await new Promise((res) => { const r = indexedDB.open('nachbau'); r.onsuccess = () => res(r.result); });
    const d = await new Promise((res) => { const r = db.transaction('decks').objectStore('decks').get(deckId); r.onsuccess = () => res(r.result); });
    return d.screens[0].widgets.find((w) => w.type === 'randomizer').settings.localNames;
  }, id);
  expect(names).toEqual(['Geheim1', 'Geheim2']);
  expect(errors).toEqual([]);
  await c1.close(); await c2.close();
});

test('Konto löschen entfernt Konto und Decks auf dem Server', async ({ page }) => {
  const u = await newUser('loesch');
  const id = 'del-' + uniq();
  await u.ctx.put(`/api/decks/${id}`, { data: { data: deckData('Weg damit'), baseRev: null } });
  const c = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await c.connect();
  expect((await c.query('SELECT 1 FROM kb_decks WHERE id = $1', [id])).rowCount).toBe(1);
  const bad = await u.ctx.post('/api/auth/delete-user', { data: { password: 'falsch-falsch-1' } });
  expect(bad.ok()).toBe(false);
  const ok = await u.ctx.post('/api/auth/delete-user', { data: { password: pw } });
  expect(ok.ok(), await ok.text()).toBe(true);
  expect((await c.query('SELECT 1 FROM kb_decks WHERE id = $1', [id])).rowCount).toBe(0);
  expect((await c.query('SELECT 1 FROM "user" WHERE email = $1', [u.email])).rowCount).toBe(0);
  await c.end();
  expect((await u.ctx.get('/api/decks')).status()).toBe(401);
});
