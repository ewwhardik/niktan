import type { Env } from '../env';
import { newId } from '../lib/util';

export type AiKind = 'asr' | 'llm' | 'vision';

export interface Provider<I, O> {
  name: string;
  cloudflareAccount?: 'primary' | 'backup';
  timeoutMs?: number;
  available: (env: Env) => boolean;
  run: (env: Env, input: I, signal: AbortSignal) => Promise<O>;
}

export class AllProvidersFailed extends Error {
  constructor(public readonly attempts: { provider: string; error: string }[]) {
    super(`All providers failed: ${attempts.map((a) => `${a.provider} (${a.error})`).join(', ')}`);
  }
}

const TIMEOUT_MS = 8000;
const DAY_MS = 86_400_000;
const WORKERS_AI_QUOTA_ERRORS = { primary: 'daily quota exhausted', backup: 'backup daily quota exhausted' };

async function logCall(env: Env, provider: string, kind: AiKind, ok: boolean, started: number, error?: string) {
  try {
    await env.DB.prepare('INSERT INTO ai_calls (id, provider, kind, ok, ms, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(newId('ai'), provider, kind, ok ? 1 : 0, Date.now() - started, error ?? null, started)
      .run();
  } catch {
    // Logging must never break a request.
  }
}

function isWorkersAiQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: number | string; message?: string };
  return String(code) === '3036' || /\b3036\b/.test(message ?? '');
}

async function workersAiQuotaExhausted(env: Env, now: number, quotaError: string): Promise<boolean> {
  try {
    const midnight = now - (now % DAY_MS);
    const failure = await env.DB.prepare(
      'SELECT 1 FROM ai_calls WHERE created_at >= ? AND error = ? LIMIT 1',
    ).bind(midnight, quotaError).first();
    return !!failure;
  } catch {
    // The providers can still be tried while the quota history is unavailable.
    return false;
  }
}

/**
 * Tries configured providers in order with an 8 s default timeout. A provider that throws, times out
 * or returns output that fails `validate` is skipped. The caller decides the final fallback.
 */
export async function runChain<I, O>(
  env: Env,
  kind: AiKind,
  providers: Provider<I, O>[],
  input: I,
  validate: (out: O) => boolean = () => true,
): Promise<{ provider: string; output: O }> {
  const attempts: { provider: string; error: string }[] = [];
  for (const p of providers) {
    if (!p.available(env)) continue;
    const started = Date.now();
    const quotaError = p.cloudflareAccount ? WORKERS_AI_QUOTA_ERRORS[p.cloudflareAccount] : undefined;
    if (quotaError && await workersAiQuotaExhausted(env, started, quotaError)) {
      attempts.push({ provider: p.name, error: quotaError });
      continue;
    }
    const ctrl = new AbortController();
    const deadline = new Promise<never>((_, reject) => {
      ctrl.signal.addEventListener('abort', () => reject(ctrl.signal.reason), { once: true });
    });
    const timer = setTimeout(() => ctrl.abort(), p.timeoutMs ?? TIMEOUT_MS);
    try {
      const output = await Promise.race([p.run(env, input, ctrl.signal), deadline]);
      if (!validate(output)) throw new Error('invalid output');
      await logCall(env, p.name, kind, true, started);
      return { provider: p.name, output };
    } catch (error) {
      const msg = quotaError && isWorkersAiQuotaError(error)
        ? quotaError
        : ctrl.signal.aborted ? 'timeout' : 'provider request failed';
      attempts.push({ provider: p.name, error: msg });
      await logCall(env, p.name, kind, false, started, msg);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new AllProvidersFailed(attempts);
}

/** Pulls the first JSON object out of a model reply that may be wrapped in prose or code fences. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON in reply');
  return JSON.parse(candidate.slice(start, end + 1));
}
