import { pbkdf2Sync } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
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

test('concurrent retries create one screening and preserve its original profile', async () => {
  const creationKey = '9c'.repeat(16);
  const responses = await Promise.all([post('/sessions', { ...profile, creationKey }), post('/sessions', { ...profile, creationKey })]);
  expect(responses.map((response) => response.status)).toEqual([201, 201]);
  const [first, second] = await Promise.all(responses.map((response) => response.json()));
  expect(second.id).toBe(first.id);
  expect((await post('/sessions', { ...profile, age: 75, creationKey })).status).toBe(409);
  const row = await env.DB.prepare('SELECT id, age FROM sessions WHERE creation_key = ?').bind(creationKey).first();
  expect(row).toEqual({ id: first.id, age: profile.age });
});

test('Thali sends the uploaded photo to Workers AI and returns editable catalogue portions', async () => {
  const run = vi.fn().mockResolvedValue({
    response: {
      items: [
        { dishId: 'roti', count: 1.4, confidence: 0.8 },
        { dishId: 'roti', count: 0.1 },
      ],
      noFood: false,
    },
  });
  const form = new FormData();
  form.set('photo', new File(['test photo bytes'], 'thali.jpg', { type: 'image/jpeg' }));
  const response = await app.request('/api/thali/recognize', { method: 'POST', body: form }, { ...env, AI: { run } });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    items: [{ dishId: 'roti', label: null, count: 1.5, confidence: 0.8 }],
    noFood: false,
    provider: 'workers-ai',
  });
  expect(run).toHaveBeenCalledWith('@cf/meta/llama-4-scout-17b-16e-instruct', expect.objectContaining({
    response_format: { type: 'json_object' },
    messages: expect.arrayContaining([expect.objectContaining({
      role: 'user',
      content: expect.arrayContaining([{
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${btoa('test photo bytes')}` },
      }]),
    })]),
  }));
});

test('Cloudflare quota exhaustion switches to backup models until the next UTC day', async () => {
  const quotaError = new Error('3036: daily free allocation exhausted');
  const run = vi.fn()
    .mockRejectedValueOnce(quotaError)
    .mockResolvedValueOnce({ response: { items: [{ dishId: 'roti', count: 1 }], noFood: false } });
  const geminiMeal = Response.json({ candidates: [{
    content: { parts: [{ text: '{"items":[{"dishId":"roti","count":1}],"noFood":false}' }] },
  }] });
  const groqMeal = Response.json({ choices: [{
    message: { content: '{"items":[{"dishId":"rice","count":1}],"noFood":false}' },
  }] });
  const backupMeal = Response.json({
    success: true,
    result: { response: { items: [{ dishId: 'rice', count: 1 }], noFood: false } },
  });
  const upstream = vi.fn()
    .mockResolvedValueOnce(backupMeal)
    .mockResolvedValueOnce(Response.json({ success: false, errors: [{ code: 3036 }] }, { status: 429 }))
    .mockResolvedValueOnce(geminiMeal)
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValueOnce(groqMeal)
    .mockResolvedValueOnce(Response.json({ text: 'Test transcription' }))
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValueOnce(new Response(null, { status: 429 }));
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (url, init) => /^https:\/\/(generativelanguage\.googleapis\.com|api\.groq\.com|api\.cloudflare\.com)\//.test(String(url))
    ? upstream(url, init)
    : realFetch(url, init));

  const backupAccount = 'b'.repeat(32);
  const bindings = {
    ...env, AI: { run }, GEMINI_API_KEY: 'gemini-test', GROQ_API_KEY: 'groq-test',
    CLOUDFLARE_AI_BACKUP_ACCOUNT_ID: backupAccount, CLOUDFLARE_AI_BACKUP_TOKEN: 'workers-backup-test',
  };
  const upload = (route, field, file) => {
    const body = new FormData();
    body.set(field, file);
    return app.request(route, { method: 'POST', body }, bindings);
  };
  const meal = () => upload('/api/thali/recognize', 'photo', new File(['photo'], 'thali.jpg', { type: 'image/jpeg' }));

  try {
    expect(await meal().then((r) => r.json())).toMatchObject({ provider: 'workers-ai-backup', items: [{ dishId: 'rice' }] });
    expect(upstream.mock.calls[0][0]).toContain(`/accounts/${backupAccount}/ai/run/`);
    expect(await meal().then((r) => r.json())).toMatchObject({ provider: 'gemini', items: [{ dishId: 'roti' }] });
    expect(await meal().then((r) => r.json())).toMatchObject({ provider: 'groq', items: [{ dishId: 'rice' }] });

    const speech = await upload('/api/asr', 'audio', new File(['audio'], 'speech.mp4', { type: 'audio/mp4' }));
    expect(await speech.json()).toEqual({ provider: 'groq-whisper', text: 'Test transcription' });
    expect(upstream.mock.calls[5][1].body.get('file').name).toBe('speech.mp4');

    const symptoms = await request('/symptoms/structure', { method: 'POST', body: { text: 'I have a cough' }, bindings });
    expect(await symptoms.json()).toMatchObject({ source: 'offline-rules', symptoms: [{ code: 'cough' }] });
    expect(JSON.parse(upstream.mock.calls[4][1].body).model).toBe('qwen/qwen3.8-27b');
    expect(run).toHaveBeenCalledTimes(1);

    await env.DB.prepare("UPDATE ai_calls SET created_at = created_at - 86400000 WHERE error = 'daily quota exhausted'").run();
    expect(await meal().then((r) => r.json())).toMatchObject({ provider: 'workers-ai' });
    expect(run).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllGlobals();
    await env.DB.prepare("DELETE FROM ai_calls WHERE error IN ('daily quota exhausted', 'backup daily quota exhausted')").run();
  }
});

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

test('a citizen can choose to show their visit on a demo hospital board, and public nurses can seed the demo', async () => {
  const login = (pin, hid = hospitalId) => request('/hospital/login', { method: 'POST', body: { hospitalId: hid, pin } }).then((r) => r.json());
  const { token: nurse } = await login('2468');
  expect((await post(`/hospital/${hospitalId}/simulate`, { count: 1, seed: 3 }, nurse)).status).toBe(200);

  const shown = await createSession();
  const hidden = await createSession();
  const joinDemo = (sessionId, key, showOnDemoBoard) => post('/queue/join', { hospitalId: hospitalId, sessionId, idempotencyKey: key, showOnDemoBoard });
  expect((await joinDemo(shown, 'demo-visible-01', true)).status).toBe(201);
  expect((await joinDemo(hidden, 'demo-visible-02', false)).status).toBe(201);

  const rows = Object.values((await request(`/hospital/${hospitalId}/board`, { token: nurse }).then((r) => r.json())).columns).flat();
  const live = rows.filter((visit) => visit.live);
  expect(live).toHaveLength(1);
  expect(live[0]).toMatchObject({ simulated: false, age: profile.age });
  expect(rows.some((visit) => visit.simulated)).toBe(true);
  // The shown visit can be opened and called by the demo staff; the other stays private.
  expect((await request(`/hospital/tokens/${live[0].id}`, { token: nurse })).status).toBe(200);
  expect((await post(`/hospital/tokens/${live[0].id}/call`, undefined, nurse)).status).toBe(200);
  const other = await env.DB.prepare('SELECT id FROM tokens WHERE session_id = ?').bind(hidden).first();
  expect((await request(`/hospital/tokens/${other.id}`, { token: nurse })).status).toBe(404);
  // Leave the shared demo hospital as it was for the tests that follow.
  for (const id of [shown, hidden]) expect((await remove(`/sessions/${id}`)).status).toBe(200);
  expect((await post(`/hospital/${hospitalId}/simulate/clear`, undefined, (await login('9090')).token)).status).toBe(200);
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

const MIN = 60_000;
const DAY = 86400_000;
// Private staff accounts work with demo mode off; built once the database binding exists.
let real;
// Request log lines are checked in one test and kept out of the rest of the output.
let log;
beforeAll(() => {
  real = { ...env, DEMO_MODE: 'false' };
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => log?.mockRestore());
const today = () => new Date(Date.now() + 330 * MIN).toISOString().slice(0, 10);
let ip = 0;

// Like request(), with extra headers. Each call gets its own client address so login rate limits don't couple tests.
function call(path, { method = 'GET', body, token, headers = {}, bindings = env } = {}) {
  const h = new Headers(headers);
  if (!h.has('cf-connecting-ip')) h.set('cf-connecting-ip', `10.0.${Math.floor(++ip / 250)}.${ip % 250}`);
  if (body !== undefined) h.set('content-type', 'application/json');
  if (token) h.set('authorization', `Bearer ${token}`);
  return app.request(`/api${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: h }, bindings);
}

async function addHospital(hid) {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO hospitals (id, name_hi, name_en, district, is_demo) VALUES (?, ?, ?, 'Raipur', 0)").bind(hid, hid, hid),
    env.DB.prepare("INSERT INTO departments (id, hospital_id, code, avg_consult_min) VALUES (?, ?, 'medicine', 6)").bind(`${hid}:medicine`, hid),
  ]);
}

async function addStaff(id, hid, role, pin) {
  const verifier = pbkdf2Sync(pin, `niktan:${hid}`, 100000, 32, 'sha256').toString('hex');
  await env.DB.prepare('INSERT INTO staff (id, hospital_id, role, pin_hash, demo_only) VALUES (?, ?, ?, ?, 0)').bind(id, hid, role, `v2:${verifier}`).run();
}

async function staffLogin(hid, pin, bindings) {
  const response = await call('/hospital/login', { method: 'POST', body: { hospitalId: hid, pin }, bindings: bindings ?? real });
  expect(response.status).toBe(200);
  return (await response.json()).token;
}

async function addVisit(hid, { id, priority = 'routine', status = 'waiting', arrived = Date.now(), called = null, start = null, end = null, simulated = 0, number = 1 }) {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (id, created_at, age, sex, hospital_id, simulated) VALUES (?, ?, 30, ?, ?, ?)').bind(id, arrived, 'female', hid, simulated),
    env.DB.prepare(
      `INSERT INTO tokens (id, session_id, department_id, number, day, priority, status, created_at, called_at, consult_start, consult_end, simulated)
       VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
    ).bind(id, `${hid}:medicine`, number, today(), priority, status, arrived, called, start, end, simulated),
  ]);
}

test('every response carries a request id and timing, errors quote it, and logs hold no handles', async () => {
  const from = log.mock.calls.length;
  const health = await call('/health');
  expect(health.status).toBe(200);
  expect(health.headers.get('cache-control')).toBe('no-store');
  expect(health.headers.get('server-timing')).toMatch(/^app;dur=\d+$/);
  expect(health.headers.get('x-request-id')).toMatch(/^[a-f0-9]{16}$/);
  expect(await health.json()).toMatchObject({ ok: true, version: expect.any(String), build: null });
  const echoed = await call('/health', { headers: { 'x-request-id': 'edge-1234abcd' } });
  expect(echoed.headers.get('x-request-id')).toBe('edge-1234abcd');
  const unsafe = await call('/health', { headers: { 'x-request-id': 'id with <spaces>' } });
  expect(unsafe.headers.get('x-request-id')).toMatch(/^[a-f0-9]{16}$/);

  const handle = `p_${'0'.repeat(32)}`;
  const missing = await call(`/sessions/${handle}/card`);
  expect(missing.status).toBe(404);
  const missingId = missing.headers.get('x-request-id');
  expect((await missing.json()).requestId).toBe(missingId);

  const big = await call('/sessions', { method: 'POST', body: { ...profile, pad: 'x'.repeat(70 * 1024) } });
  expect(big.status).toBe(413);
  expect((await big.json()).requestId).toBe(big.headers.get('x-request-id'));
  expect((await call('/sessions', { method: 'POST', body: profile })).status).toBe(201);

  const lines = log.mock.calls.slice(from).map(([line]) => String(line));
  const logs = lines.filter((line) => line.includes('"msg":"request"')).map((line) => JSON.parse(line));
  expect(logs.find((entry) => entry.id === missingId)).toMatchObject({ method: 'GET', route: '/api/sessions/:id/card', status: 404 });
  expect(logs.find((entry) => entry.status === 413)).toMatchObject({ method: 'POST', route: '/api/sessions' });
  expect(lines.join('\n')).not.toContain(handle);
});

test('the board answers 304 while unchanged and sends a new tag once it changes', async () => {
  const hid = 'etag-h';
  await addHospital(hid);
  await addStaff('etag-nurse', hid, 'nurse', '11223344');
  const nurse = await staffLogin(hid, '11223344');
  const board = (headers) => call(`/hospital/${hid}/board`, { token: nurse, headers, bindings: real });
  const first = await board();
  expect(first.status).toBe(200);
  const tag = first.headers.get('etag');
  expect(tag).toMatch(/^"[a-f0-9]{32}"$/);
  const same = await board({ 'if-none-match': tag });
  expect(same.status).toBe(304);
  expect(await same.text()).toBe('');
  expect((await board({ 'if-none-match': `"other", W/${tag}` })).status).toBe(304);
  await addVisit(hid, { id: 'etag-visit' });
  const changed = await board({ 'if-none-match': tag });
  expect(changed.status).toBe(200);
  expect(changed.headers.get('etag')).not.toBe(tag);
  expect(Object.values((await changed.json()).columns).flat()).toHaveLength(1);
});

test('the audit trail records staff actions without PINs or notes, is admin-only and follows revocation', async () => {
  const hid = 'audit-h';
  await addHospital(hid);
  await addStaff('audit-admin', hid, 'admin', '55667788');
  await addStaff('audit-doctor', hid, 'doctor', '22334455');
  expect((await call('/hospital/login', { method: 'POST', body: { hospitalId: hid, pin: '99999999' }, bindings: real })).status).toBe(401);
  expect((await call('/hospital/login', { method: 'POST', body: { hospitalId: 'no-such-h', pin: '99999999' }, bindings: real })).status).toBe(401);
  const admin = await staffLogin(hid, '55667788');
  const doctor = await staffLogin(hid, '22334455');
  await addVisit(hid, { id: 'audit-visit' });
  expect((await call('/hospital/tokens/audit-visit/call', { method: 'POST', token: doctor, bindings: real })).status).toBe(200);
  const note = { note: 'Private clinical note', historyPrefilledUseful: true };
  expect((await call('/hospital/tokens/audit-visit/note', { method: 'PUT', body: note, token: doctor, bindings: real })).status).toBe(200);

  const trail = (token, query = '') => call(`/hospital/${hid}/audit${query}`, { token, bindings: real });
  expect((await trail(doctor)).status).toBe(403);
  const { entries } = await (await trail(admin)).json();
  expect(entries.map((entry) => entry.action)).toEqual(['note.save', 'token.call', 'login', 'login', 'login_failed']);
  expect(entries[0]).toMatchObject({ staffId: 'audit-doctor', tokenId: 'audit-visit', detail: { historyPrefilledUseful: 1 } });
  expect(entries[4]).toMatchObject({ staffId: null, tokenId: null, detail: { reason: 'no_match' } });
  const text = JSON.stringify(entries);
  for (const secret of ['Private clinical', '55667788', '22334455', '99999999']) expect(text).not.toContain(secret);
  expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE hospital_id = 'no-such-h'").first('n')).toBe(0);
  expect((await (await trail(admin, '?limit=2')).json()).entries).toHaveLength(2);
  expect((await trail(admin, '?limit=5000')).status).toBe(200);

  // Public demo admins see only what the public demo accounts did in their hospital.
  await addStaff('audit-dh-admin', hospitalId, 'admin', '66778899');
  const privateAdmin = await staffLogin(hospitalId, '66778899');
  const demoAdmin = await staffLogin(hospitalId, '9090', env);
  expect((await call(`/hospital/${hospitalId}/simulate`, { method: 'POST', body: { count: 1, seed: 7 }, token: demoAdmin })).status).toBe(200);
  expect((await call(`/hospital/${hospitalId}/simulate/clear`, { method: 'POST', token: demoAdmin })).status).toBe(200);
  const demoView = (await (await call(`/hospital/${hospitalId}/audit`, { token: demoAdmin })).json()).entries;
  expect(demoView.slice(0, 2).map((entry) => entry.action)).toEqual(['simulate.clear', 'simulate']);
  expect(demoView.every((entry) => entry.staffId?.startsWith('demo-'))).toBe(true);
  const fullView = (await (await call(`/hospital/${hospitalId}/audit`, { token: privateAdmin, bindings: real })).json()).entries;
  expect(fullView.some((entry) => entry.staffId === 'audit-dh-admin')).toBe(true);
  expect(fullView.some((entry) => entry.action === 'simulate')).toBe(true);
  expect((await call(`/hospital/${hid}/audit`, { token: privateAdmin, bindings: real })).status).toBe(403);

  await env.DB.prepare('DELETE FROM staff WHERE id = ?').bind('audit-doctor').run();
  expect((await call(`/hospital/${hid}/board`, { token: doctor, bindings: real })).status).toBe(401);
});

test('impact compares today\'s priority queue with first-come-first-served, for staff of that hospital only', async () => {
  const hid = 'impact-h';
  await addHospital(hid);
  await addStaff('impact-nurse', hid, 'nurse', '33445566');
  const t0 = Date.now() - 60 * MIN;
  const at = (minutes) => t0 + minutes * MIN;
  await addVisit(hid, { id: 'imp-r1', number: 1, arrived: at(0), status: 'done', called: at(8), start: at(8), end: at(14) });
  await addVisit(hid, { id: 'imp-gone', number: 2, arrived: at(0.5), status: 'left' });
  await addVisit(hid, { id: 'imp-r2', number: 3, arrived: at(1) });
  await addVisit(hid, { id: 'imp-r3', number: 4, arrived: at(2) });
  await addVisit(hid, { id: 'imp-t', number: 5, arrived: at(3), priority: 'today', status: 'done', called: at(4), start: at(4), end: at(8) });
  await addVisit(hid, { id: 'imp-sim', number: 1, arrived: at(0), priority: 'emergency', status: 'called', called: at(0.2), simulated: 1 });
  await env.DB.prepare("INSERT INTO doctor_notes (token_id, note, history_prefilled_useful) VALUES ('imp-t', '', 1)").run();

  expect((await call(`/hospital/${hid}/impact`, { bindings: real })).status).toBe(401);
  const nurse = await staffLogin(hid, '33445566');
  expect((await call('/hospital/demo-dh/impact', { token: nurse, bindings: real })).status).toBe(403);
  const response = await call(`/hospital/${hid}/impact`, { token: nurse, bindings: real });
  expect(response.status).toBe(200);
  const impact = await response.json();
  expect(impact.real.priorities.today).toEqual({ n: 1, actualMin: 1, fcfsMin: 17, savedMin: 16 });
  expect(impact.real.priorities.routine).toEqual({ n: 1, actualMin: 8, fcfsMin: 4, savedMin: -4 });
  expect(impact.real.urgent).toEqual({ n: 1, actualMin: 1, fcfsMin: 17, savedMin: 16 });
  expect(impact.real).toMatchObject({ visits: 5, called: 2, simulatedVisits: 0, consultMin: 5, historyUseful: { share: 1, n: 1 } });
  expect(impact.all).toMatchObject({ includesSimulated: true, visits: 6, called: 3, simulatedVisits: 1 });
  expect(impact.all.priorities.emergency.n).toBe(1);
});

test('a red flag reported after joining moves the queued visit to emergency on the board', async () => {
  const hid = 'demo-chc';
  await addStaff('retriage-nurse', hid, 'nurse', '77889900');
  const id = await createSession();
  const joined = await join(id, 'retriage-01', hid);
  expect(joined.status).toBe(201);
  const { token: ticket } = await joined.json();
  expect(ticket.priority).toBe('routine');
  const flagged = await post(`/sessions/${id}/measurements`, {
    module: 'symptoms', data: { symptoms: [], redFlags: { chest_pain: true }, confirmed: true },
  });
  expect(await flagged.json()).toEqual({ ok: true, priority: 'emergency' });
  expect((await request(`/queue/${ticket.id}`).then((r) => r.json())).token.priority).toBe('emergency');
  expect(await env.DB.prepare('SELECT priority FROM triage WHERE session_id = ?').bind(id).first('priority')).toBe('emergency');

  const row = await env.DB.prepare('SELECT id FROM tokens WHERE citizen_id = ?').bind(ticket.id).first();
  const nurse = await staffLogin(hid, '77889900');
  const board = await call(`/hospital/${hid}/board`, { token: nurse, bindings: real }).then((r) => r.json());
  const column = Object.values(board.columns).find((visits) => visits.some((visit) => visit.id === row.id));
  expect(column[0]).toMatchObject({ id: row.id, priority: 'emergency', status: 'waiting' });

  expect((await remove(`/sessions/${id}/measurements/symptoms`).then((r) => r.json())).priority).toBe('routine');
  expect((await request(`/queue/${ticket.id}`).then((r) => r.json())).token.priority).toBe('routine');
});

test('retention keeps each kind of record for its own period and deletes in bounded chunks', async () => {
  const t = Date.now();
  const session = (id, age, simulated) =>
    env.DB.prepare('INSERT INTO sessions (id, created_at, age, sex, simulated) VALUES (?, ?, 30, ?, ?)').bind(id, t - age, 'female', simulated);
  const scan = (id, age) =>
    env.DB.prepare("INSERT INTO thali_scans (id, session_id, items_json, totals_json, flags_json, created_at) VALUES (?, NULL, '[]', '{}', '[]', ?)").bind(id, t - age);
  const entry = (id, age) =>
    env.DB.prepare("INSERT INTO audit_log (id, at, staff_id, hospital_id, action) VALUES (?, ?, NULL, 'demo-dh', 'login')").bind(id, t - age);
  await env.DB.batch([
    session('ret-real-old', 31 * DAY, 0),
    session('ret-real-recent', 10 * DAY, 0),
    session('ret-sim-old', 3 * DAY, 1),
    session('ret-sim-recent', 1 * DAY, 1),
    scan('ret-scan-old', 8 * DAY),
    scan('ret-scan-new', 6 * DAY),
    entry('ret-audit-old', 181 * DAY),
    entry('ret-audit-new', 10 * DAY),
    env.DB.prepare(
      `INSERT INTO sessions (id, created_at, age, sex)
       WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1200) SELECT 'ret-bulk-' || i, 1000, 30, 'female' FROM n`,
    ),
  ]);
  const ids = async (table, prefix) =>
    (await env.DB.prepare(`SELECT id FROM ${table} WHERE id LIKE ? ORDER BY id`).bind(`${prefix}%`).all()).results.map((r) => r.id);

  const result = await worker.scheduled({}, env);
  expect(result.sessions).toBeGreaterThanOrEqual(1202);
  expect(result.rounds).toBeGreaterThanOrEqual(3);
  expect(await ids('sessions', 'ret-')).toEqual(['ret-real-recent', 'ret-sim-recent']);
  expect(await ids('thali_scans', 'ret-')).toEqual(['ret-scan-new']);
  expect(await ids('audit_log', 'ret-')).toEqual(['ret-audit-new']);

  await worker.scheduled({}, { ...env, RETENTION_DAYS: '7' });
  expect(await ids('sessions', 'ret-')).toEqual(['ret-sim-recent']);
});

test('the public counter reports the anonymous feedback survey without any session detail', async () => {
  expect((await post('/feedback', { sessionId: 'anonymous', rating: 5, wouldUse: true, lastOpdWaitMin: 150, comment: '' })).status).toBe(201);
  const stats = await request('/stats/public').then((r) => r.json());
  expect(Object.keys(stats).sort()).toEqual(['lastWaitMin', 'ratings', 'rating', 'screened', 'waits', 'wouldUse'].sort());
  expect(stats.waits).toBeGreaterThanOrEqual(1);
  expect(stats.lastWaitMin).toBeGreaterThan(0);
  expect(stats.wouldUse).toBeGreaterThan(0);
});

test('team reviews are saved without personal numbers or links and averaged per section', async () => {
  const send = (body) => post('/reviews', body);
  expect((await send({ team: 'Code Ninjas', overall: 5, tried: ['pulse', 'eyes', 'thali'], ratings: { ui: 5, ux: 4, pulse: 5, eyes: 4 }, remark: 'Loved it, call 9876543210 or see https://x.io' })).status).toBe(201);
  expect((await send({ team: 'Byte Me', overall: 4, tried: ['pulse'], ratings: { ui: 3, pulse: 3, board: 5 }, remark: '' })).status).toBe(201);
  expect((await send({ team: 'X', overall: 5 })).status).toBe(422);
  expect((await send({ team: 'Valid team', overall: 7 })).status).toBe(422);
  expect((await send({ team: 'Valid team', overall: 4, ratings: { unknown: 3 } })).status).toBe(422);

  const data = await request('/reviews').then((r) => r.json());
  expect(data.count).toBeGreaterThanOrEqual(2);
  const ninjas = data.items.find((i) => i.team === 'Code Ninjas');
  expect(ninjas.remark).toBe('Loved it, call [phone] or see [link]');
  expect(data.sections.pulse).toMatchObject({ avg: 4, n: 2 });
  // Rating a feature marks it tried.
  expect(data.sections.board).toMatchObject({ avg: 5, n: 1, tried: 1 });
  expect(data.sections.thali).toMatchObject({ avg: null, n: 0, tried: 1 });
  expect(data.sections.ui).toMatchObject({ avg: 4, n: 2, tried: null });
  expect(ninjas.tried).toEqual(['pulse', 'eyes', 'thali']);

  const { token: demoAdmin } = await request('/hospital/login', { method: 'POST', body: { hospitalId, pin: '9090' } }).then((r) => r.json());
  expect((await call(`/reviews/${ninjas.id}/hide`, { method: 'POST', token: demoAdmin })).status).toBe(403);
});
