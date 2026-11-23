/**
 * Thin typed client for the NikTan API. In dev, Vite proxies /api to the local worker; in
 * production VITE_API_URL points at the deployed worker.
 */
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json');
  const staff = readStaffToken();
  if (staff && path.startsWith('/api/hospital')) headers.set('authorization', `Bearer ${staff}`);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'offline');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
  return data;
}

const etags = new Map<string, { tag: string; body: unknown }>();

/** GET that revalidates with If-None-Match; a 304 returns the cached body without re-downloading. */
async function getFresh<T>(path: string): Promise<T> {
  const cached = etags.get(path);
  const headers = new Headers();
  if (cached) headers.set('if-none-match', cached.tag);
  const staff = readStaffToken();
  if (staff && path.startsWith('/api/hospital')) headers.set('authorization', `Bearer ${staff}`);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { headers, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'offline');
  }
  if (res.status === 304 && cached) return cached.body as T;
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
  const tag = res.headers.get('etag');
  if (tag) etags.set(path, { tag, body: data });
  return data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  getFresh,
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', signal, body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'DELETE', signal }),
};

const STAFF_KEY = 'niktan.staff';
export function readStaffToken(): string | null {
  try {
    return sessionStorage.getItem(STAFF_KEY);
  } catch {
    return null;
  }
}
export function writeStaffToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(STAFF_KEY, token);
    else sessionStorage.removeItem(STAFF_KEY);
  } catch {
    // Private mode: the httpOnly cookie still works.
  }
}
