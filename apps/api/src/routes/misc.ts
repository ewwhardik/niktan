import { Hono } from 'hono';
import { Feedback } from '@niktan/core';
import type { AppEnv } from '../env';
import { rateLimit } from '../lib/rateLimit';
import { newId, now, parseBody } from '../lib/util';

export const misc = new Hono<AppEnv>();
export const VERSION = '0.1.0';

misc.post('/feedback', rateLimit('feedback', 10, 3600), async (c) => {
  const body = await parseBody(c, Feedback);
  await c.env.DB.prepare(
    'INSERT INTO feedback (id, session_id, rating, would_use, last_opd_wait_min, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(newId('f'), body.sessionId, body.rating, body.wouldUse ? 1 : 0, body.lastOpdWaitMin, body.comment, now())
    .run();
  return c.json({ ok: true }, 201);
});

/** Public counter for the landing page: real screenings only. */
misc.get('/stats/public', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS screened, (SELECT AVG(rating) FROM feedback) AS rating, (SELECT COUNT(*) FROM feedback) AS ratings
     FROM sessions WHERE simulated = 0`,
  ).first<{ screened: number; rating: number | null; ratings: number }>();
  c.header('Cache-Control', 'public, max-age=30');
  return c.json(row);
});

misc.get('/status', async (c) => {
  let db = false;
  try {
    db = !!(await c.env.DB.prepare('SELECT 1 AS ok').first());
  } catch {
    db = false;
  }
  const since = now() - 24 * 3600_000;
  const { results } = db
    ? await c.env.DB.prepare(
        `SELECT provider, kind, SUM(ok) AS ok, COUNT(*) AS total, AVG(ms) AS avg_ms,
           (SELECT error FROM ai_calls a2 WHERE a2.provider = a.provider AND a2.ok = 0 ORDER BY created_at DESC LIMIT 1) AS last_error
         FROM ai_calls a WHERE created_at > ? GROUP BY provider, kind`,
      )
        .bind(since)
        .all()
    : { results: [] };
  return c.json({
    version: VERSION,
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
