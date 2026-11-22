import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv, StaffClaims } from '../env';
import { verifyToken } from './util';

export const STAFF_COOKIE = 'niktan_staff';
export const staffSecret = (env: AppEnv['Bindings']) => env.STAFF_SECRET ?? 'dev-only-secret-change-me';

export function requireStaff(roles?: StaffClaims['role'][]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const raw = getCookie(c, STAFF_COOKIE) ?? c.req.header('authorization')?.replace(/^Bearer /, '');
    const claims = raw ? await verifyToken<StaffClaims>(raw, staffSecret(c.env)) : null;
    if (!claims || claims.exp < Date.now()) throw new HTTPException(401, { message: 'Staff login required' });
    if (roles && !roles.includes(claims.role)) throw new HTTPException(403, { message: 'Not allowed for this role' });
    const hid = c.req.param('hid');
    if (hid && hid !== claims.hid) throw new HTTPException(403, { message: 'Different hospital' });
    c.set('staff', claims);
    await next();
  };
}
