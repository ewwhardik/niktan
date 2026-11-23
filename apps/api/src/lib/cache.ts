import { sha256Hex } from './util';

/**
 * Short-lived edge cache for AI readings, keyed by a hash of the exact input. The same photo read
 * twice (a retry, a double tap, a family member scanning the same strip) answers instantly and
 * spends no AI quota. Only the derived JSON is kept, never the photo, and only for `ttl` seconds.
 */
export async function cachedJson<T>(scope: string, input: string, ttl: number, run: () => Promise<{ body: T; ok: boolean }>): Promise<{ body: T; hit: boolean }> {
  const store = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const key = store ? new Request(`https://cache.niktan.internal/${scope}/${await sha256Hex(input)}`) : null;
  if (store && key) {
    const hit = await store.match(key).catch(() => undefined);
    if (hit) return { body: (await hit.json()) as T, hit: true };
  }
  const { body, ok } = await run();
  if (store && key && ok) {
    await store.put(key, new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttl}` } })).catch(() => undefined);
  }
  return { body, hit: false };
}
