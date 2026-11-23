import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv, Env } from './env';
import { observe } from './lib/observe';
import { runRetention } from './lib/retention';
import { ai } from './routes/ai';
import { hospital } from './routes/hospital';
import { misc } from './routes/misc';
import { queue } from './routes/queue';
import { sessions, shared } from './routes/sessions';

const app = new Hono<AppEnv>();

app.use('*', observe());
app.use('*', secureHeaders());
app.use(
  '/api/*',
  cors({
    origin: (origin, c) => {
      const allowed = (c.env as Env).ALLOWED_ORIGINS.split(',').map((s) => s.trim());
      return allowed.includes(origin) || /^https:\/\/[a-z0-9-]+\.niktan\.pages\.dev$/.test(origin) ? origin : null;
    },
    credentials: true,
    allowHeaders: ['content-type', 'authorization', 'x-model-version', 'x-request-id', 'if-none-match'],
    exposeHeaders: ['x-request-id', 'server-timing', 'etag', 'retry-after'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  }),
);

app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});

// Every JSON endpoint is small. Uploads read their multipart body themselves and enforce their own caps.
const UPLOADS = new Set(['/api/asr', '/api/thali/recognize']);
const jsonLimit = bodyLimit({
  maxSize: 64 * 1024,
  onError: () => {
    throw new HTTPException(413, { message: 'Request body too large' });
  },
});
app.use('/api/*', (c, next) => (UPLOADS.has(c.req.path) ? next() : jsonLimit(c, next)));

app.route('/api/shared', shared);
app.route('/api/sessions', sessions);
app.route('/api/queue', queue);
app.route('/api/hospital', hospital);
app.route('/api', ai);
app.route('/api', misc);
app.get('/status', (c) => c.redirect('/api/status'));
app.get('/', (c) => c.json({ name: 'niktan-api', docs: '/api/status' }));

// The request id lets a user quote a failure without describing what they entered.
app.notFound((c) => c.json({ error: 'Not found', requestId: c.get('requestId') }, 404));
app.onError((err, c) => {
  const requestId = c.get('requestId');
  if (err instanceof HTTPException) return c.json({ error: err.message, requestId }, err.status);
  console.error(JSON.stringify({ msg: 'request failed', id: requestId, error: err.name }));
  return c.json({ error: 'Something went wrong', requestId }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env) {
    const deleted = await runRetention(env);
    console.log(JSON.stringify({ msg: 'retention', ...deleted }));
    return deleted;
  },
};

export { app };
