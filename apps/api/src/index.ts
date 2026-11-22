import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv, Env } from './env';
import { ai } from './routes/ai';
import { hospital } from './routes/hospital';
import { misc } from './routes/misc';
import { queue } from './routes/queue';
import { sessions, shared } from './routes/sessions';

const app = new Hono<AppEnv>();

app.use('*', secureHeaders());
app.use(
  '/api/*',
  cors({
    origin: (origin, c) => {
      const allowed = (c.env as Env).ALLOWED_ORIGINS.split(',').map((s) => s.trim());
      return allowed.includes(origin) || /^https:\/\/[a-z0-9-]+\.niktan\.pages\.dev$/.test(origin) ? origin : null;
    },
    credentials: true,
    allowHeaders: ['content-type', 'authorization', 'x-model-version'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  }),
);

app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});
app.route('/api/shared', shared);
app.route('/api/sessions', sessions);
app.route('/api/queue', queue);
app.route('/api/hospital', hospital);
app.route('/api', ai);
app.route('/api', misc);
app.get('/status', (c) => c.redirect('/api/status'));
app.get('/', (c) => c.json({ name: 'niktan-api', docs: '/api/status' }));

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error('Worker request failed', err.name);
  return c.json({ error: 'Something went wrong' }, 500);
});

export default {
  fetch: app.fetch,
  /** Expire screening data and AI call logs after 30 days, and rate-limit windows after a day. */
  async scheduled(_event: ScheduledEvent, env: Env) {
    const t = Date.now();
    const cutoff = t - 30 * 86400_000;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM feedback WHERE created_at < ? OR session_id IN (SELECT id FROM sessions WHERE created_at < ?)').bind(cutoff, cutoff),
      env.DB.prepare('DELETE FROM sessions WHERE created_at < ?').bind(cutoff),
      env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(Math.floor(t / 1000) - 86400),
      env.DB.prepare('DELETE FROM ai_calls WHERE created_at < ?').bind(cutoff),
    ]);
  },
};

export { app };
