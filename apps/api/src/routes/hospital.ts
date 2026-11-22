import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv, StaffClaims } from '../env';
import { requireStaff, STAFF_COOKIE, staffSecret } from '../lib/auth';
import { loadCard } from '../lib/card';
import { compareTokens, tickSimulation, type TokenRow } from '../lib/queue';
import { rateLimit } from '../lib/rateLimit';
import { mulberry32, simulatePatient } from '../lib/simulate';
import { istDay, newId, now, parseBody, sha256Hex, signToken } from '../lib/util';

export const hospital = new Hono<AppEnv>();

const Login = z.object({ hospitalId: z.string().min(1).max(64), pin: z.string().regex(/^\d{4,8}$/) });
const SESSION_HOURS = 12;

hospital.post('/login', rateLimit('login', 10, 600), async (c) => {
  const body = await parseBody(c, Login);
  const hash = await sha256Hex(`niktan:${body.hospitalId}:${body.pin}`);
  const staff = await c.env.DB.prepare('SELECT id, hospital_id, role FROM staff WHERE hospital_id = ? AND pin_hash = ?')
    .bind(body.hospitalId, hash)
    .first<{ id: string; hospital_id: string; role: StaffClaims['role'] }>();
  if (!staff) throw new HTTPException(401, { message: 'Wrong PIN' });
  const claims: StaffClaims = { sid: staff.id, hid: staff.hospital_id, role: staff.role, exp: now() + SESSION_HOURS * 3600_000 };
  const token = await signToken(claims, staffSecret(c.env));
  setCookie(c, STAFF_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'None', path: '/', maxAge: SESSION_HOURS * 3600 });
  return c.json({ role: staff.role, hospitalId: staff.hospital_id, token });
});

hospital.post('/logout', (c) => {
  deleteCookie(c, STAFF_COOKIE, { path: '/', secure: true, sameSite: 'None' });
  return c.json({ ok: true });
});

hospital.get('/me', requireStaff(), (c) => c.json(c.get('staff')));

interface BoardRow extends TokenRow {
  code: string;
  age: number;
  sex: string;
  reasons_json: string | null;
  eye_json: string | null;
  vitals_json: string | null;
}

hospital.get('/:hid/board', requireStaff(), async (c) => {
  const hid = c.req.param('hid');
  if (c.env.DEMO_MODE === 'true') await tickSimulation(c.env, hid);
  const { results } = await c.env.DB.prepare(
    `SELECT t.*, d.code, s.age, s.sex, tr.reasons_json,
       (SELECT data_json FROM measurements WHERE session_id = t.session_id AND module = 'eye') AS eye_json,
       (SELECT data_json FROM measurements WHERE session_id = t.session_id AND module = 'vitals') AS vitals_json
     FROM tokens t
     JOIN departments d ON d.id = t.department_id
     JOIN sessions s ON s.id = t.session_id
     LEFT JOIN triage tr ON tr.session_id = t.session_id
     WHERE d.hospital_id = ? AND t.day = ? AND t.status IN ('waiting', 'called', 'in_consult')`,
  )
    .bind(hid, istDay())
    .all<BoardRow>();

  const columns: Record<string, unknown[]> = {};
  const sorted = [...results].sort((a, b) => {
    const active = (s: string) => (s === 'waiting' ? 1 : 0);
    return active(a.status) - active(b.status) || compareTokens(a, b);
  });
  for (const r of sorted) {
    const vitals = r.vitals_json ? (JSON.parse(r.vitals_json) as { heartRate: number; quality: number }) : null;
    const eye = r.eye_json ? (JSON.parse(r.eye_json) as { pallor: boolean | null; jaundice: boolean | null; cataract: boolean | null }) : null;
    (columns[r.code] ??= []).push({
      id: r.id,
      number: r.number,
      priority: r.priority,
      status: r.status,
      age: r.age,
      sex: r.sex,
      createdAt: r.created_at,
      waitedMin: Math.round((now() - r.created_at) / 60000),
      simulated: !!r.simulated,
      heartRate: vitals && vitals.quality >= 0.5 ? Math.round(vitals.heartRate) : null,
      flags: [eye?.pallor && 'pallor', eye?.jaundice && 'jaundice', eye?.cataract && 'cataract'].filter(Boolean),
      reasons: r.reasons_json ? JSON.parse(r.reasons_json) : [],
    });
  }
  return c.json({ day: istDay(), updatedAt: now(), columns });
});

hospital.get('/tokens/:id', requireStaff(), async (c) => {
  const staff = c.get('staff')!;
  const token = await c.env.DB.prepare(
    `SELECT t.*, d.hospital_id, d.code FROM tokens t JOIN departments d ON d.id = t.department_id WHERE t.id = ?`,
  )
    .bind(c.req.param('id'))
    .first<TokenRow & { hospital_id: string; code: string }>();
  if (!token || token.hospital_id !== staff.hid) throw new HTTPException(404, { message: 'Token not found' });
  const card = await loadCard(c.env, token.session_id);
  const note = await c.env.DB.prepare('SELECT note, history_prefilled_useful FROM doctor_notes WHERE token_id = ?').bind(token.id).first();
  return c.json({ token, card, note });
});

const Transition = z.enum(['call', 'start', 'end', 'left', 'requeue']);
const TRANSITIONS: Record<z.infer<typeof Transition>, { from: string[]; sql: string }> = {
  call: { from: ['waiting'], sql: `status = 'called', called_at = ?2` },
  start: { from: ['waiting', 'called'], sql: `status = 'in_consult', consult_start = ?2, called_at = COALESCE(called_at, ?2)` },
  end: { from: ['in_consult'], sql: `status = 'done', consult_end = ?2` },
  left: { from: ['waiting', 'called'], sql: `status = 'left'` },
  requeue: { from: ['called'], sql: `status = 'waiting', called_at = NULL` },
};

hospital.post('/tokens/:id/:action', requireStaff(), async (c) => {
  const action = Transition.safeParse(c.req.param('action'));
  if (!action.success) throw new HTTPException(404, { message: 'Unknown action' });
  const staff = c.get('staff')!;
  const t = TRANSITIONS[action.data];
  const placeholders = t.from.map((_, i) => `?${i + 4}`).join(', ');
  const res = await c.env.DB.prepare(
    `UPDATE tokens SET ${t.sql} WHERE id = ?1 AND status IN (${placeholders})
       AND department_id IN (SELECT id FROM departments WHERE hospital_id = ?3)`,
  )
    .bind(c.req.param('id'), now(), staff.hid, ...t.from)
    .run();
  if (!res.meta.changes) throw new HTTPException(409, { message: 'Token is not in a state that allows this' });
  return c.json({ ok: true });
});

const Note = z.object({ note: z.string().max(4000), historyPrefilledUseful: z.boolean().nullable().default(null) });

hospital.put('/tokens/:id/note', requireStaff(['doctor', 'admin']), async (c) => {
  const body = await parseBody(c, Note);
  const useful = body.historyPrefilledUseful === null ? null : body.historyPrefilledUseful ? 1 : 0;
  await c.env.DB.prepare(
    `INSERT INTO doctor_notes (token_id, note, history_prefilled_useful) VALUES (?1, ?2, ?3)
     ON CONFLICT(token_id) DO UPDATE SET note = ?2, history_prefilled_useful = ?3`,
  )
    .bind(c.req.param('id'), body.note, useful)
    .run();
  return c.json({ ok: true });
});

const Simulate = z.object({
  count: z.number().int().min(1).max(40).default(10),
  scenario: z.enum(['random', 'hidden_emergency']).default('random'),
  seed: z.number().int().optional(),
});

hospital.post('/:hid/simulate', requireStaff(['admin', 'nurse']), async (c) => {
  if (c.env.DEMO_MODE !== 'true') throw new HTTPException(403, { message: 'Simulator is off' });
  const hid = c.req.param('hid');
  const body = await parseBody(c, Simulate);
  const rand = mulberry32(body.seed ?? Date.now());
  const day = istDay();
  const base = now() - body.count * 45_000;
  const db = c.env.DB;
  const stmts: D1PreparedStatement[] = [];

  for (let i = 0; i < body.count; i++) {
    // In the demo scenario the emergency arrives 15th, so a first-come queue would make them wait.
    const forceEmergency = body.scenario === 'hidden_emergency' && i === Math.min(14, body.count - 1);
    const p = simulatePatient(rand, forceEmergency);
    const sid = newId('s');
    const created = base + i * 45_000;
    const deptId = `${hid}:${p.result.department}`;
    stmts.push(
      db.prepare('INSERT INTO sessions (id, created_at, age, sex, pregnant, lang, simulated, hospital_id) VALUES (?, ?, ?, ?, 0, ?, 1, ?)')
        .bind(sid, created, p.input.age, p.input.sex, 'hi', hid),
      db.prepare('INSERT INTO measurements (id, session_id, module, data_json, quality, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(newId('m'), sid, 'vitals', JSON.stringify(p.input.vitals), p.input.vitals!.quality, created),
      db.prepare('INSERT INTO measurements (id, session_id, module, data_json, quality, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(newId('m'), sid, 'eye', JSON.stringify(p.input.eye), 0.8, created),
      db.prepare('INSERT INTO measurements (id, session_id, module, data_json, quality, created_at) VALUES (?, ?, ?, ?, NULL, ?)')
        .bind(newId('m'), sid, 'symptoms', JSON.stringify({ symptoms: p.input.symptoms, redFlags: p.input.redFlags, summaryHi: '', confirmed: true }), created),
      db.prepare('INSERT INTO triage (session_id, priority, department, reasons_json, rules_version, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(sid, p.result.priority, p.result.department, JSON.stringify(p.result.reasons), p.result.rulesVersion, created),
      db.prepare(
        `INSERT INTO tokens (id, session_id, department_id, number, day, priority, status, created_at, simulated)
         SELECT ?1, ?2, ?3, COALESCE(MAX(number), 0) + 1, ?4, ?5, 'waiting', ?6, 1 FROM tokens WHERE department_id = ?3 AND day = ?4`,
      ).bind(newId('t'), sid, deptId, day, p.result.priority, created),
    );
  }
  await db.batch(stmts);
  return c.json({ created: body.count });
});

hospital.post('/:hid/simulate/clear', requireStaff(['admin']), async (c) => {
  const hid = c.req.param('hid');
  const db = c.env.DB;
  const sub = 'SELECT id FROM sessions WHERE simulated = 1 AND hospital_id = ?';
  await db.batch([
    db.prepare(`DELETE FROM tokens WHERE session_id IN (${sub})`).bind(hid),
    db.prepare(`DELETE FROM measurements WHERE session_id IN (${sub})`).bind(hid),
    db.prepare(`DELETE FROM triage WHERE session_id IN (${sub})`).bind(hid),
    db.prepare('DELETE FROM sessions WHERE simulated = 1 AND hospital_id = ?').bind(hid),
  ]);
  return c.json({ ok: true });
});

hospital.get('/:hid/stats', requireStaff(), async (c) => {
  const hid = c.req.param('hid');
  const day = istDay();
  const db = c.env.DB;
  const since = now() - 24 * 3600_000;
  const [priorities, departments, waits, flags, scans, feedback, consults] = await db.batch([
    db.prepare(
      `SELECT t.priority, t.simulated, COUNT(*) AS n FROM tokens t JOIN departments d ON d.id = t.department_id
       WHERE d.hospital_id = ? AND t.day = ? GROUP BY t.priority, t.simulated`,
    ).bind(hid, day),
    db.prepare(
      `SELECT d.code, SUM(t.status = 'waiting') AS waiting, SUM(t.status = 'done') AS done, COUNT(*) AS total
       FROM tokens t JOIN departments d ON d.id = t.department_id WHERE d.hospital_id = ? AND t.day = ? GROUP BY d.code`,
    ).bind(hid, day),
    db.prepare(
      `SELECT t.priority, AVG((COALESCE(t.called_at, t.consult_start) - t.created_at) / 60000.0) AS avg_wait_min, COUNT(*) AS n
       FROM tokens t JOIN departments d ON d.id = t.department_id
       WHERE d.hospital_id = ? AND t.day = ? AND COALESCE(t.called_at, t.consult_start) IS NOT NULL GROUP BY t.priority`,
    ).bind(hid, day),
    db.prepare(
      `SELECT SUM(json_extract(data_json, '$.pallor') = 1) AS pallor, SUM(json_extract(data_json, '$.jaundice') = 1) AS jaundice,
              SUM(json_extract(data_json, '$.cataract') = 1) AS cataract, COUNT(*) AS n
       FROM measurements m JOIN sessions s ON s.id = m.session_id
       WHERE m.module = 'eye' AND s.created_at > ? AND (s.hospital_id = ? OR s.hospital_id IS NULL)`,
    ).bind(since, hid),
    db.prepare(
      `SELECT CAST(((created_at / 3600000) * 3600000) AS INTEGER) AS hour, SUM(simulated = 0) AS real, SUM(simulated = 1) AS sim
       FROM sessions WHERE created_at > ? GROUP BY hour ORDER BY hour`,
    ).bind(since),
    db.prepare(
      `SELECT AVG(rating) AS avg_rating, AVG(would_use) AS would_use, AVG(last_opd_wait_min) AS last_wait, COUNT(*) AS n FROM feedback`,
    ),
    db.prepare(
      `SELECT AVG((consult_end - consult_start) / 60000.0) AS avg_consult_min, COUNT(*) AS n FROM tokens t
       JOIN departments d ON d.id = t.department_id WHERE d.hospital_id = ? AND t.simulated = 0 AND consult_end IS NOT NULL`,
    ).bind(hid),
  ]);
  return c.json({
    day,
    priorities: priorities!.results,
    departments: departments!.results,
    waits: waits!.results,
    flags: flags!.results[0],
    scans: scans!.results,
    feedback: feedback!.results[0],
    consults: consults!.results[0],
  });
});
