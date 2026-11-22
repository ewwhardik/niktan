import { pbkdf2Sync } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, expect, test } from 'vitest';
import worker, { app } from '../src/index';

const require = createRequire(import.meta.url);
const requireWrangler = createRequire(require.resolve('wrangler/package.json'));
// Use the same workerd-backed D1 implementation that Wrangler runs locally.
const { Miniflare } = requireWrangler('miniflare');
const env = { DEMO_MODE: 'true', STAFF_SECRET: 'local-integration-test-secret-012345', ALLOWED_ORIGINS: 'http://localhost:5174' };
const profile = { age: 30, sex: 'female', lang: 'en' };
const hospitalId = 'demo-dh';
let sandbox;

beforeAll(async () => {
  sandbox = new Miniflare({
    script: 'export default { fetch: () => new Response() }',
    modules: true,
    d1Databases: ['DB'],
  });
  env.DB = await sandbox.getD1Database('DB');
  const migrations = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(migrations)).filter((file) => file.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(name, migrations), 'utf8');
    const statements = sql.replace(/^--.*$/gm, '').split(';').map((statement) => statement.trim()).filter(Boolean);
    await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
  }
});
afterAll(async () => sandbox?.dispose());

function request(path, { method = 'GET', body, token, bindings = env } = {}) {
  const headers = new Headers();
  if (body !== undefined) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  return app.request(`/api${path}`, { method, body: JSON.stringify(body), headers }, bindings);
}

const post = (path, body, token) => request(path, { method: 'POST', body, token });
const remove = (path) => request(path, { method: 'DELETE' });
const join = (sessionId, idempotencyKey, hid = hospitalId) => post('/queue/join', { hospitalId: hid, sessionId, idempotencyKey });
const createSession = async () => {
  const response = await post('/sessions', profile);
  expect(response.status).toBe(201);
  return (await response.json()).id;
};

test('shared cards redact the owner handle, reflect measurement deletion and expire with the session', async () => {
  const id = await createSession();
  expect(id).toMatch(/^p_[a-f0-9]{32}$/);
  expect((await post(`/sessions/${id}/measurements`, { module: 'vitals', data: { heartRate: 70, quality: 0.9 } })).status).toBe(200);
  const share = await post(`/sessions/${id}/share`);
  expect(share.status).toBe(200);
  const { shareId } = await share.json();
  const sharedCard = () => request(`/shared/${shareId}/card`);
  const publicResponse = await sharedCard();
  expect(publicResponse.headers.get('cache-control')).toBe('no-store');
  const card = await publicResponse.json();
  expect(card.session).not.toHaveProperty('id');
  expect(card.vitals.heartRate).toBe(70);
  expect((await request(`/sessions/${shareId}/card`)).status).toBe(404);
  expect((await remove(`/sessions/${shareId}/measurements/vitals`)).status).toBe(404);
  expect((await join(shareId, 'shared-attempt')).status).toBe(404);
  expect((await remove(`/sessions/${id}/measurements/vitals`)).status).toBe(200);
  expect((await sharedCard().then((r) => r.json())).vitals).toBeNull();
  expect((await post(`/sessions/${id}/share`).then((r) => r.json())).shareId).toBe(shareId);
  expect((await remove(`/sessions/${id}`)).status).toBe(200);
  expect((await sharedCard()).status).toBe(404);
});

test('queue retries reuse a single visit and confirmed emergency cases bypass the OPD', async () => {
  const id = await createSession();
  const replies = await Promise.all([join(id, 'concurrent-01'), join(id, 'concurrent-02')]);
  expect(replies.map((response) => response.status).sort()).toEqual([200, 201]);
  const [a, b] = await Promise.all(replies.map((response) => response.json()));
  expect(a.token).toEqual(b.token);
  expect(a.token.id).toMatch(/^q_[a-f0-9]{32}$/);
  expect((await join(id, 'concurrent-03', 'demo-chc')).status).toBe(409);
  expect((await post(`/queue/${a.token.id}/leave`)).status).toBe(200);
  expect((await request(`/queue/${a.token.id}`).then((r) => r.json())).token.status).toBe('left');
  const emergency = await createSession();
  await post(`/sessions/${emergency}/measurements`, {
    module: 'symptoms', data: { symptoms: [], redFlags: { chest_pain: true }, confirmed: true },
  });
  expect((await join(emergency, 'emergency-01')).status).toBe(409);
});

test('public staff PINs cannot view or change citizen visits, and private access stays hospital-scoped', async () => {
  const id = await createSession();
  await post(`/sessions/${id}/measurements`, { module: 'eye', data: { quality: 0.9, pallor: true } });
  const { token: ticket } = await join(id, 'staff-visit-01').then((r) => r.json());
  const row = await env.DB.prepare('SELECT id FROM tokens WHERE citizen_id = ?').bind(ticket.id).first();
  expect((await request(`/queue/${row.id}`)).status).toBe(404);
  const tokenPath = `/hospital/tokens/${row.id}`;
  const login = (pin, hid = hospitalId, bindings = env) => request('/hospital/login', { method: 'POST', body: { hospitalId: hid, pin }, bindings });
  const { token: demo } = await login('9090').then((r) => r.json());
  expect(demo).toBeTruthy();
  const disabled = { ...env, DEMO_MODE: 'false' };
  expect((await login('9090', hospitalId, disabled)).status).toBe(401);
  expect((await request('/hospital/me', { token: demo, bindings: disabled })).status).toBe(403);
  expect((await request(tokenPath, { token: demo })).status).toBe(404);
  expect((await post(`${tokenPath}/call`, undefined, demo)).status).toBe(409);
  const note = (token) => request(`${tokenPath}/note`, { method: 'PUT', body: { note: 'Reviewed' }, token });
  expect((await note(demo)).status).toBe(404);
  const demoStats = await request(`/hospital/${hospitalId}/stats`, { token: demo }).then((r) => r.json());
  expect(demoStats.priorities).toEqual([]);
  const seed = await post(`/hospital/${hospitalId}/simulate`, { count: 2, seed: 42 }, demo);
  expect(seed.status).toBe(200);
  const board = (token, hid = hospitalId) => request(`/hospital/${hid}/board`, { token });
  const demoBoard = await board(demo).then((r) => r.json());
  const demoRows = Object.values(demoBoard.columns).flat();
  expect(demoRows).toHaveLength(2);
  expect(demoRows.every((visit) => visit.simulated)).toBe(true);

  const pin = '40512689';
  const verifier = pbkdf2Sync(pin, `niktan:${hospitalId}`, 100000, 32, 'sha256').toString('hex');
  await env.DB.prepare('INSERT INTO staff (id, hospital_id, role, pin_hash, demo_only) VALUES (?, ?, ?, ?, 0)')
    .bind('private-doctor', hospitalId, 'doctor', `v2:${verifier}`).run();
  const { token: doctor } = await login(pin, hospitalId, disabled).then((r) => r.json());
  expect((await board(doctor, 'demo-chc')).status).toBe(403);
  const detail = await request(tokenPath, { token: doctor }).then((r) => r.json());
  expect(detail.card.session).not.toHaveProperty('id');
  expect(detail.token).not.toHaveProperty('citizen_id');
  expect((await note(doctor)).status).toBe(200);
  expect((await post(`${tokenPath}/call`, undefined, doctor)).status).toBe(200);
  expect((await request(`/queue/${ticket.id}`).then((r) => r.json())).token.status).toBe('called');
  expect((await post(`/hospital/${hospitalId}/simulate/clear`, undefined, demo)).status).toBe(200);
  expect((await request(tokenPath, { token: doctor })).status).toBe(200);
});

test('retention deletes linked and anonymous old records and keeps recent screenings', async () => {
  const id = await createSession();
  const fresh = await createSession();
  const { token } = await join(id, 'retention-01').then((r) => r.json());
  const { shareId } = await post(`/sessions/${id}/share`).then((r) => r.json());
  const feedback = (sessionId) => post('/feedback', { sessionId, rating: 4, wouldUse: true });
  expect((await feedback(id)).status).toBe(201);
  expect((await feedback('anonymous')).status).toBe(201);
  expect((await feedback(shareId)).status).toBe(404);
  const row = await env.DB.prepare('SELECT id FROM tokens WHERE citizen_id = ?').bind(token.id).first();
  await env.DB.batch([
    env.DB.prepare('UPDATE sessions SET created_at = 1 WHERE id = ?').bind(id),
    env.DB.prepare('UPDATE feedback SET created_at = 1 WHERE session_id IS NULL'),
    env.DB.prepare("INSERT INTO doctor_notes (token_id, note) VALUES (?, 'expiring note')").bind(row.id),
  ]);
  await worker.scheduled({}, env);
  expect((await request(`/shared/${shareId}/card`)).status).toBe(404);
  expect((await request(`/queue/${token.id}`)).status).toBe(404);
  expect((await request(`/sessions/${fresh}/card`)).status).toBe(200);
  expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM feedback').first('n')).toBe(0);
  expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM doctor_notes WHERE token_id = ?').bind(row.id).first('n')).toBe(0);
});

test('a see-today patient arriving 15th ranks first in an idle medicine queue', async () => {
  const hid = 'demo-chc';
  const department = `${hid}:medicine`;
  const day = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const arrival = Date.now() - 60_000;
  const fixtures = Array.from({ length: 14 }, (_, index) => {
    const number = index + 1;
    const id = `fifo-example-${number}`;
    const time = arrival + index * 1000;
    return [
      env.DB.prepare('INSERT INTO sessions (id, created_at, age, sex, hospital_id) VALUES (?, ?, ?, ?, ?)')
        .bind(id, time, profile.age, profile.sex, hid),
      env.DB.prepare(
        "INSERT INTO tokens (id, session_id, department_id, number, day, priority, status, created_at) VALUES (?, ?, ?, ?, ?, 'routine', 'waiting', ?)",
      ).bind(id, id, department, number, day, time),
    ];
  });
  await env.DB.batch(fixtures.flat());

  const id = await createSession();
  const measurement = await post(`/sessions/${id}/measurements`, {
    module: 'symptoms', data: { symptoms: [{ code: 'fever', durationDays: 3 }], confirmed: true },
  });
  expect(measurement.status).toBe(200);

  const response = await join(id, 'fifo-example-15', hid);
  expect(response.status).toBe(201);
  const queue = await response.json();
  expect(queue.token).toMatchObject({ number: 15, status: 'waiting', priority: 'today', department_id: department });
  expect(queue.ahead).toBe(0);
  expect(queue.etaMin).toBe(0);

  const fifo = await env.DB.prepare(
    "SELECT citizen_id, status FROM tokens WHERE department_id = ? AND day = ? AND status IN ('waiting','called','in_consult') ORDER BY created_at, number",
  ).bind(department, day).all();
  expect(fifo.results).toHaveLength(15);
  expect(fifo.results.every((visit) => visit.status === 'waiting')).toBe(true);
  expect(fifo.results.findIndex((visit) => visit.citizen_id === queue.token.id)).toBe(14);
});
