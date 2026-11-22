import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../env';
import { clientIp } from './util';

/** Fixed-window limiter stored in D1, so it survives isolate restarts without any paid add-on. */
export function rateLimit(bucket: string, limit: number, windowSec: number): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const windowStart = Math.floor(Date.now() / 1000 / windowSec) * windowSec;
    const key = `${bucket}:${clientIp(c)}`;
    const row = await c.env.DB.prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN window_start = ?2 THEN count + 1 ELSE 1 END,
         window_start = ?2
       RETURNING count`,
    )
      .bind(key, windowStart)
      .first<{ count: number }>();
    const count = row?.count ?? 1;
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, limit - count)));
    if (count > limit) {
      c.header('Retry-After', String(windowStart + windowSec - Math.floor(Date.now() / 1000)));
      throw new HTTPException(429, { message: 'Too many requests, please try again later' });
    }
    await next();
  };
}
