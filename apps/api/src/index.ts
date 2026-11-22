import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv, Env } from './env';
import { ai } from './routes/ai';
import { hospital } from './routes/hospital';
import { misc } from './routes/misc';
import { queue } from './routes/queue';
import { sessions } from './routes/sessions';

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
  console.error(err);
  return c.json({ error: 'Something went wrong' }, 500);
});

export default {
  fetch: app.fetch,
  /** Daily housekeeping: old rate-limit windows, AI call logs older than 30 days. */
  async scheduled(_event: ScheduledEvent, env: Env) {
    const t = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(Math.floor(t / 1000) - 86400),
      env.DB.prepare('DELETE FROM ai_calls WHERE created_at < ?').bind(t - 30 * 86400_000),
    ]);
  },
};

export { app };
