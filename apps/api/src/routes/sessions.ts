import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Measurement, SessionInput } from '@niktan/core';
import type { AppEnv } from '../env';
import { requireOwnerHandle } from '../lib/auth';
import { loadCard, shareableCard, saveTriage } from '../lib/card';
import { rateLimit } from '../lib/rateLimit';
import { newId, now, parseBody } from '../lib/util';

export const sessions = new Hono<AppEnv>();

sessions.post('/', rateLimit('session', 30, 3600), async (c) => {
  const body = await parseBody(c, SessionInput);
  const id = newId('p');
  await c.env.DB.prepare('INSERT INTO sessions (id, created_at, age, sex, pregnant, lang) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, now(), body.age, body.sex, body.pregnant && body.sex === 'female' ? 1 : 0, body.lang)
    .run();
  return c.json({ id }, 201);
});

sessions.use('/:id/*', async (c, next) => {
  requireOwnerHandle(c.req.param('id')!);
  await next();
});

sessions.delete('/:id/measurements/:module', async (c) => {
  const module = c.req.param('module');
  if (!['vitals', 'eye', 'vision', 'hearing', 'symptoms'].includes(module)) throw new HTTPException(404);
  await c.env.DB.prepare('DELETE FROM measurements WHERE session_id = ? AND module = ?')
    .bind(c.req.param('id'), module).run();
  return c.json({ ok: true });
});

sessions.post('/:id/share', async (c) => {
  const row = await c.env.DB.prepare('UPDATE sessions SET share_id = COALESCE(share_id, ?) WHERE id = ? RETURNING share_id')
    .bind(newId('r'), c.req.param('id')).first<{ share_id: string }>();
  if (!row) throw new HTTPException(404, { message: 'Session not found' });
  return c.json({ shareId: row.share_id });
});

export const shared = new Hono<AppEnv>();
shared.get('/:id/card', async (c) => {
  const row = await c.env.DB.prepare('SELECT id FROM sessions WHERE share_id = ?').bind(c.req.param('id')).first<{ id: string }>();
  const card = row && await loadCard(c.env, row.id);
  if (!card) throw new HTTPException(404, { message: 'Shared card unavailable' });
  return c.json(shareableCard(card));
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
  requireOwnerHandle(id);
  const db = c.env.DB;
  await db.batch([
    db.prepare('DELETE FROM feedback WHERE session_id = ?').bind(id),
    db.prepare('DELETE FROM sessions WHERE id = ?').bind(id),
  ]);
  return c.json({ deleted: true });
});
