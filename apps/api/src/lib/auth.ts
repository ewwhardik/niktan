import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv, Env, StaffClaims } from '../env';
import { verifyToken } from './util';

export function staffSecret(env: Env): string {
  if (!env.STAFF_SECRET || env.STAFF_SECRET.length < 32 || env.STAFF_SECRET === 'change-me-to-a-long-random-string') {
    throw new HTTPException(503, { message: 'Staff access has not been configured' });
  }
  return env.STAFF_SECRET;
}

export function requireStaff(roles?: StaffClaims['role'][]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const raw = c.req.header('authorization')?.replace(/^Bearer /, '');
    const claims = raw ? await verifyToken<StaffClaims>(raw, staffSecret(c.env)) : null;
    if (!claims || claims.exp <= Date.now() || typeof claims.demoOnly !== 'boolean') {
      throw new HTTPException(401, { message: 'Staff login required' });
    }
    if (claims.demoOnly && c.env.DEMO_MODE !== 'true') throw new HTTPException(403, { message: 'Demo access disabled' });
    // A removed account, or one moved to another hospital or role, loses access now rather than at token expiry.
    const current = await c.env.DB.prepare('SELECT hospital_id, role, demo_only FROM staff WHERE id = ?')
      .bind(claims.sid)
      .first<{ hospital_id: string; role: string; demo_only: number }>();
    if (!current || current.hospital_id !== claims.hid || current.role !== claims.role || !!current.demo_only !== claims.demoOnly) {
      throw new HTTPException(401, { message: 'Staff login required' });
    }
    if (roles && !roles.includes(claims.role)) throw new HTTPException(403, { message: 'Not allowed for this role' });
    const hid = c.req.param('hid');
    if (hid && hid !== claims.hid) throw new HTTPException(403, { message: 'Different hospital' });
    c.set('staff', claims);
    await next();
  };
}

// Legacy session IDs were distributed in shared QR codes and cannot establish ownership.
export function requireOwnerHandle(id: string): void {
  if (!/^p_[a-f0-9]{32}$/.test(id)) throw new HTTPException(404, { message: 'Session unavailable' });
}
