import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { z } from 'zod';

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
export const now = () => Date.now();

/** Calendar day in India (UTC+5:30); token numbers reset at local midnight. */
export function istDay(ts = Date.now()): string {
  return new Date(ts + 330 * 60_000).toISOString().slice(0, 10);
}

const enc = new TextEncoder();
const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

export async function signToken(payload: object, secret: string): Promise<string> {
  const body = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(String.fromCharCode(...new Uint8Array(sig)))}`;
}

export async function verifyToken<T>(token: string, secret: string): Promise<T | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const sigBytes = Uint8Array.from(unb64url(sig), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sigBytes, enc.encode(body));
    return ok ? (JSON.parse(unb64url(body)) as T) : null;
  } catch {
    return null;
  }
}

export async function parseBody<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: 'Body must be JSON' });
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new HTTPException(422, { message: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  }
  return result.data;
}

export const clientIp = (c: Context) => c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'local';
