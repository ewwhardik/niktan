import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Measurement, SessionInput } from '@niktan/core';
import type { AppEnv } from '../env';
import { loadCard, saveTriage } from '../lib/card';
import { rateLimit } from '../lib/rateLimit';
import { newId, now, parseBody } from '../lib/util';

export const sessions = new Hono<AppEnv>();

sessions.post('/', rateLimit('session', 30, 3600), async (c) => {
  const body = await parseBody(c, SessionInput);
  const id = newId('s');
  await c.env.DB.prepare('INSERT INTO sessions (id, created_at, age, sex, pregnant, lang) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, now(), body.age, body.sex, body.pregnant && body.sex === 'female' ? 1 : 0, body.lang)
    .run();
  return c.json({ id }, 201);
});

sessions.post('/:id/measurements', rateLimit('measure', 120, 3600), async (c) => {
  const id = c.req.param('id');
  const body = await parseBody(c, Measurement);
  const exists = await c.env.DB.prepare('SELECT 1 FROM sessions WHERE id = ?').bind(id).first();
  if (!exists) throw new HTTPException(404, { message: 'Session not found' });
  const quality = 'quality' in body.data ? (body.data.quality as number) : null;
  // One row per module: a retake replaces the earlier result.
  await c.env.DB.prepare(
    `INSERT INTO measurements (id, session_id, module, data_json, quality, model_version, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(session_id, module) DO UPDATE SET data_json = ?4, quality = ?5, model_version = ?6, created_at = ?7`,
  )
    .bind(newId('m'), id, body.module, JSON.stringify(body.data), quality, c.req.header('x-model-version') ?? null, now())
    .run();
  return c.json({ ok: true });
});

sessions.post('/:id/triage', async (c) => {
  const card = await loadCard(c.env, c.req.param('id'));
  if (!card) throw new HTTPException(404, { message: 'Session not found' });
  await saveTriage(c.env, card.session.id, card.triage);
  return c.json(card.triage);
});

sessions.get('/:id/card', async (c) => {
  const card = await loadCard(c.env, c.req.param('id'));
  if (!card) throw new HTTPException(404, { message: 'Session not found' });
  return c.json(card);
});

/** "Delete my data": removes the session and everything linked to it. */
sessions.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  await db.batch([
    db.prepare('DELETE FROM doctor_notes WHERE token_id IN (SELECT id FROM tokens WHERE session_id = ?)').bind(id),
    db.prepare('DELETE FROM tokens WHERE session_id = ?').bind(id),
    db.prepare('DELETE FROM measurements WHERE session_id = ?').bind(id),
    db.prepare('DELETE FROM triage WHERE session_id = ?').bind(id),
    db.prepare('DELETE FROM thali_scans WHERE session_id = ?').bind(id),
    db.prepare('DELETE FROM feedback WHERE session_id = ?').bind(id),
    db.prepare('DELETE FROM sessions WHERE id = ?').bind(id),
  ]);
  return c.json({ deleted: true });
});
