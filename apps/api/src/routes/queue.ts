import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireOwnerHandle } from '../lib/auth';
import { loadCard, saveTriage } from '../lib/card';
import { queuePosition, type TokenRow } from '../lib/queue';
import { rateLimit } from '../lib/rateLimit';
import { istDay, newId, now, parseBody } from '../lib/util';

export const queue = new Hono<AppEnv>();

const JoinBody = z.object({
  sessionId: z.string().min(1).max(64),
  hospitalId: z.string().min(1).max(64),
  idempotencyKey: z.string().min(8).max(64),
  /** Only honoured at demo hospitals: lets the public demo board show this visit (no identity). */
  showOnDemoBoard: z.boolean().optional().default(false),
});

queue.get('/hospitals', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, name_hi, name_en, district, is_demo FROM hospitals ORDER BY name_en').all();
  return c.json(results);
});

interface CitizenToken extends TokenRow { citizen_id: string }

async function citizenView(env: AppEnv['Bindings'], token: CitizenToken) {
  const { number, status, priority, department_id } = token;
  return { token: { id: token.citizen_id, number, status, priority, department_id }, ...(await queuePosition(env, token)) };
}

queue.post('/join', rateLimit('join', 20, 3600), async (c) => {
  const body = await parseBody(c, JoinBody);
  const db = c.env.DB;
  requireOwnerHandle(body.sessionId);
  const card = await loadCard(c.env, body.sessionId);
  if (!card) throw new HTTPException(404, { message: 'Session not found' });
  if (card.triage.priority === 'emergency') {
    throw new HTTPException(409, { message: 'Call 108 or go to Emergency now. Do not wait in the OPD queue.' });
  }

  const departmentId = `${body.hospitalId}:${card.triage.department}`;
  const dept = await db.prepare('SELECT d.id, h.is_demo FROM departments d JOIN hospitals h ON h.id = d.hospital_id WHERE d.id = ?')
    .bind(departmentId).first<{ id: string; is_demo: number }>();
  if (!dept) throw new HTTPException(404, { message: 'Hospital or department not found' });
  const demoVisible = body.showOnDemoBoard && dept.is_demo ? 1 : 0;
  await saveTriage(c.env, card.session.id, card.triage);
  const day = istDay();
  const id = newId('t');
  // D1 executes the batch atomically. A retry, even from a different tab, picks up the same active visit.
  const [, selected] = await db.batch<CitizenToken>([
    db.prepare(`INSERT INTO tokens (id, citizen_id, session_id, department_id, number, day, priority, status, created_at, idempotency_key, demo_visible)
      SELECT ?1, ?2, ?3, ?4, (SELECT COALESCE(MAX(number),0)+1 FROM tokens WHERE department_id = ?4 AND day = ?5 AND simulated = 0),
        ?5, ?6, 'waiting', ?7, ?8, ?9
      WHERE NOT EXISTS (SELECT 1 FROM tokens WHERE session_id = ?3 AND day = ?5 AND status IN ('waiting','called','in_consult'))
      ON CONFLICT(idempotency_key) DO NOTHING`).bind(id, newId('q'), body.sessionId, departmentId, day, card.triage.priority, now(), body.idempotencyKey, demoVisible),
    db.prepare(`SELECT t.* FROM tokens t JOIN departments d ON d.id = t.department_id
      WHERE t.session_id = ? AND d.hospital_id = ? AND
        (t.idempotency_key = ? OR (t.day = ? AND t.status IN ('waiting','called','in_consult')))
      ORDER BY (t.idempotency_key = ?) DESC LIMIT 1`).bind(body.sessionId, body.hospitalId, body.idempotencyKey, day, body.idempotencyKey),
    db.prepare('UPDATE sessions SET hospital_id = ? WHERE id = ? AND EXISTS (SELECT 1 FROM tokens WHERE id = ?)')
      .bind(body.hospitalId, body.sessionId, id),
  ]);
  const token = selected?.results[0];
  if (!token) throw new HTTPException(409, { message: 'A visit or request already exists at another hospital' });
  return c.json(await citizenView(c.env, token), token.id === id ? 201 : 200);
});

queue.get('/:tokenId', async (c) => {
  const token = await c.env.DB.prepare('SELECT * FROM tokens WHERE citizen_id = ?').bind(c.req.param('tokenId')).first<CitizenToken>();
  if (!token) throw new HTTPException(404, { message: 'Token not found' });
  return c.json(await citizenView(c.env, token));
});

queue.post('/:tokenId/leave', async (c) => {
  const row = await c.env.DB.prepare(`UPDATE tokens SET status = 'left' WHERE citizen_id = ? AND status IN ('waiting','called','left') RETURNING id`)
    .bind(c.req.param('tokenId')).first();
  if (!row) throw new HTTPException(409, { message: 'Visit already started or token unavailable' });
  return c.json({ ok: true });
});
