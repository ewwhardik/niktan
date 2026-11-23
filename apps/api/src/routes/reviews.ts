import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { REVIEW_FEATURES, REVIEW_SECTIONS, Review } from '@niktan/core';
import type { AppEnv } from '../env';
import { requireStaff } from '../lib/auth';
import { rateLimit } from '../lib/rateLimit';
import { newId, now, parseBody } from '../lib/util';
import { redact } from './ai';

export const reviews = new Hono<AppEnv>();

/** Removes links and personal numbers, and collapses whitespace: the text is shown publicly. */
function clean(text: string): string {
  return redact(text).replace(/https?:\/\/\S+|www\.\S+/gi, '[link]').replace(/\s+/g, ' ').trim();
}

reviews.post('/reviews', rateLimit('review', 6, 3600), async (c) => {
  const body = await parseBody(c, Review);
  const team = clean(body.team).slice(0, 60);
  if (team.length < 2) throw new HTTPException(400, { message: 'Team name is required' });
  const id = newId('r');
  // A rated feature counts as tried; an untried feature cannot carry a rating.
  const tried = [...new Set([...body.tried, ...REVIEW_FEATURES.filter((f) => body.ratings[f])])];
  const ratings = Object.fromEntries(Object.entries(body.ratings).filter(([k]) => !(REVIEW_FEATURES as readonly string[]).includes(k) || tried.includes(k as never)));
  await c.env.DB.prepare('INSERT INTO reviews (id, team, overall, ratings_json, tried_json, remark, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, team, body.overall, JSON.stringify(ratings), JSON.stringify(tried), clean(body.remark).slice(0, 400), now())
    .run();
  return c.json({ id }, 201);
});

interface Row { id: string; team: string; overall: number; ratings_json: string; tried_json: string; remark: string; created_at: number }

/** Latest reviews plus the average for every section, for the home page. */
reviews.get('/reviews', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, team, overall, ratings_json, tried_json, remark, created_at FROM reviews WHERE hidden = 0 ORDER BY created_at DESC LIMIT 200',
  ).all<Row>();
  const items = results.map((r) => ({ id: r.id, team: r.team, overall: r.overall, ratings: JSON.parse(r.ratings_json) as Record<string, number>, tried: JSON.parse(r.tried_json) as string[], remark: r.remark, createdAt: r.created_at }));
  const sections = Object.fromEntries(
    REVIEW_SECTIONS.map((s) => {
      const vals = items.map((i) => i.ratings[s]).filter((v): v is number => typeof v === 'number');
      const tried = (REVIEW_FEATURES as readonly string[]).includes(s) ? items.filter((i) => i.tried.includes(s)).length : null;
      return [s, { avg: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null, n: vals.length, tried }];
    }),
  );
  const overall = items.length ? Math.round((items.reduce((a, i) => a + i.overall, 0) / items.length) * 10) / 10 : null;
  c.header('Cache-Control', 'public, max-age=15');
  return c.json({ count: items.length, overall, sections, items: items.slice(0, 60) });
});

/** A hospital's own admin (not a public demo PIN) can take a review down. */
reviews.post('/reviews/:id/hide', requireStaff(['admin']), async (c) => {
  if (c.get('staff')!.demoOnly) throw new HTTPException(403, { message: 'Not allowed for demo accounts' });
  const res = await c.env.DB.prepare('UPDATE reviews SET hidden = 1 WHERE id = ?').bind(c.req.param('id')).run();
  if (!res.meta.changes) throw new HTTPException(404, { message: 'Review not found' });
  return c.json({ ok: true });
});
