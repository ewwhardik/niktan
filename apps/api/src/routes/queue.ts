import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { loadCard, saveTriage } from '../lib/card';
import { queuePosition, type TokenRow } from '../lib/queue';
import { rateLimit } from '../lib/rateLimit';
import { istDay, newId, now, parseBody } from '../lib/util';

export const queue = new Hono<AppEnv>();

const JoinBody = z.object({
  sessionId: z.string().min(1).max(64),
  hospitalId: z.string().min(1).max(64),
  idempotencyKey: z.string().min(8).max(64),
});

queue.get('/hospitals', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, name_hi, name_en, district, is_demo FROM hospitals ORDER BY name_en').all();
  return c.json(results);
});

queue.post('/join', rateLimit('join', 20, 3600), async (c) => {
  const body = await parseBody(c, JoinBody);
  const db = c.env.DB;

  const existing = await db.prepare('SELECT * FROM tokens WHERE idempotency_key = ?').bind(body.idempotencyKey).first<TokenRow>();
  if (existing) return c.json({ token: existing, ...(await queuePosition(c.env, existing)) });

  const card = await loadCard(c.env, body.sessionId);
  if (!card) throw new HTTPException(404, { message: 'Session not found' });
  await saveTriage(c.env, card.session.id, card.triage);

  const departmentId = `${body.hospitalId}:${card.triage.department}`;
  const dept = await db.prepare('SELECT id FROM departments WHERE id = ?').bind(departmentId).first();
  if (!dept) throw new HTTPException(404, { message: 'Hospital or department not found' });

  const day = istDay();
  const id = newId('t');
  // Number assignment and insert happen in one statement so two joins can't get the same number.
  await db
    .prepare(
      `INSERT INTO tokens (id, session_id, department_id, number, day, priority, status, created_at, idempotency_key)
       SELECT ?1, ?2, ?3, COALESCE(MAX(number), 0) + 1, ?4, ?5, 'waiting', ?6, ?7 FROM tokens WHERE department_id = ?3 AND day = ?4`,
    )
    .bind(id, card.session.id, departmentId, day, card.triage.priority, now(), body.idempotencyKey)
    .run();
  await db.prepare('UPDATE sessions SET hospital_id = ? WHERE id = ?').bind(body.hospitalId, card.session.id).run();
  const token = (await db.prepare('SELECT * FROM tokens WHERE id = ?').bind(id).first<TokenRow>())!;
  return c.json({ token, ...(await queuePosition(c.env, token)) }, 201);
});

queue.get('/:tokenId', async (c) => {
  const token = await c.env.DB.prepare('SELECT * FROM tokens WHERE id = ?').bind(c.req.param('tokenId')).first<TokenRow>();
  if (!token) throw new HTTPException(404, { message: 'Token not found' });
  return c.json({ token, ...(await queuePosition(c.env, token)) });
});

queue.post('/:tokenId/leave', async (c) => {
  await c.env.DB.prepare(`UPDATE tokens SET status = 'left' WHERE id = ? AND status = 'waiting'`).bind(c.req.param('tokenId')).run();
  return c.json({ ok: true });
});
