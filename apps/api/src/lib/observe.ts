import type { MiddlewareHandler } from 'hono';
import { matchedRoutes } from 'hono/route';
import type { AppEnv } from '../env';

// An upstream id is echoed only if it cannot smuggle anything into headers or logs.
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Request id, Server-Timing and one JSON log line per request. The log carries the route pattern,
 * never the concrete path, so session handles, token ids and bodies stay out of it.
 */
export function observe(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const started = Date.now();
    const incoming = c.req.header('x-request-id');
    const id = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    c.set('requestId', id);
    await next();
    const ms = Date.now() - started;
    c.header('X-Request-Id', id);
    c.header('Server-Timing', `app;dur=${ms}`);
    const route = matchedRoutes(c).filter((r) => r.method !== 'ALL').at(-1)?.path ?? 'unmatched';
    console.log(JSON.stringify({ msg: 'request', id, method: c.req.method, route, status: c.res.status, ms }));
  };
}
