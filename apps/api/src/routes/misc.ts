import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Feedback } from '@niktan/core';
import type { AppEnv } from '../env';
import { requireOwnerHandle } from '../lib/auth';
import { rateLimit } from '../lib/rateLimit';
import { newId, now, parseBody } from '../lib/util';

export const misc = new Hono<AppEnv>();
export const VERSION = '0.1.0';

misc.post('/feedback', rateLimit('feedback', 10, 3600), async (c) => {
  const body = await parseBody(c, Feedback);
  const sessionId = body.sessionId === 'anonymous' ? null : body.sessionId;
  if (sessionId) requireOwnerHandle(sessionId);
  const result = await c.env.DB.prepare(
    `INSERT INTO feedback (id, session_id, rating, would_use, last_opd_wait_min, comment, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE ?2 IS NULL OR EXISTS (SELECT 1 FROM sessions WHERE id = ?2)`,
  )
    .bind(newId('f'), sessionId, body.rating, body.wouldUse ? 1 : 0, body.lastOpdWaitMin, body.comment, now())
    .run();
  if (!result.meta.changes) throw new HTTPException(404, { message: 'Session not found' });
  return c.json({ ok: true }, 201);
});

/** Public counter for the landing page: real screenings only. */
misc.get('/stats/public', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS screened, (SELECT AVG(rating) FROM feedback) AS rating, (SELECT COUNT(*) FROM feedback) AS ratings
     FROM sessions s WHERE simulated = 0 AND EXISTS (SELECT 1 FROM triage WHERE session_id = s.id)`,
  ).first<{ screened: number; rating: number | null; ratings: number }>();
  c.header('Cache-Control', 'public, max-age=30');
  return c.json(row);
});

/** Liveness for uptime checks: touches no storage, so it stays cheap and says nothing about data. */
misc.get('/health', (c) => c.json({ ok: true, version: VERSION, build: c.env.BUILD_ID ?? null }));

/** Detailed readiness: database reachability and AI provider health over the last day. */
misc.get('/status', async (c) => {
  let db = false;
  try {
    db = !!(await c.env.DB.prepare('SELECT COUNT(*) AS ok FROM staff WHERE demo_only = 1').first());
  } catch {
    db = false;
  }
  const since = now() - 24 * 3600_000;
  const { results } = db
    ? await c.env.DB.prepare(
        `SELECT provider, kind, SUM(ok) AS ok, COUNT(*) AS total, AVG(ms) AS avg_ms
         FROM ai_calls a WHERE created_at > ? GROUP BY provider, kind`,
      )
        .bind(since)
        .all()
    : { results: [] };
  return c.json({
    version: VERSION,
    build: c.env.BUILD_ID ?? null,
    db,
    providers: {
      gemini: !!c.env.GEMINI_API_KEY,
      groq: !!c.env.GROQ_API_KEY,
      workersAi: !!c.env.AI,
    },
    last24h: results,
    demoMode: c.env.DEMO_MODE === 'true',
  });
});
