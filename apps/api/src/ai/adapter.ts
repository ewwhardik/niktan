import type { Env } from '../env';
import { newId } from '../lib/util';

export type AiKind = 'asr' | 'llm' | 'vision';

export interface Provider<I, O> {
  name: string;
  available: (env: Env) => boolean;
  run: (env: Env, input: I, signal: AbortSignal) => Promise<O>;
}

export class AllProvidersFailed extends Error {
  constructor(public readonly attempts: { provider: string; error: string }[]) {
    super(`All providers failed: ${attempts.map((a) => `${a.provider} (${a.error})`).join(', ')}`);
  }
}

const TIMEOUT_MS = 8000;

async function logCall(env: Env, provider: string, kind: AiKind, ok: boolean, ms: number, error?: string) {
  try {
    await env.DB.prepare('INSERT INTO ai_calls (id, provider, kind, ok, ms, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(newId('ai'), provider, kind, ok ? 1 : 0, ms, error?.slice(0, 200) ?? null, Date.now())
      .run();
  } catch {
    // Logging must never break a request.
  }
}

/**
 * Tries each configured provider in order with an 8 s timeout. A provider that throws, times out
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
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const output = await p.run(env, input, ctrl.signal);
      if (!validate(output)) throw new Error('invalid output');
      await logCall(env, p.name, kind, true, Date.now() - started);
      return { provider: p.name, output };
    } catch (err) {
      const msg = ctrl.signal.aborted ? 'timeout' : err instanceof Error ? err.message : String(err);
      attempts.push({ provider: p.name, error: msg });
      await logCall(env, p.name, kind, false, Date.now() - started, msg);
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
