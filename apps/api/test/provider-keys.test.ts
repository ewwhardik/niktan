import { afterEach, assert, expect, test, vi } from 'vitest';
import { runChain } from '../src/ai/adapter';
import { asrProviders, llmProviders } from '../src/ai/providers';
import type { Env } from '../src/env';

const input = { system: 'Return JSON.', user: 'Test request.' };
const signal = new AbortController().signal;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('a stalled Workers AI call releases the request so the next provider can run', async () => {
  vi.useFakeTimers();
  const result = runChain({} as Env, 'vision', [
    { name: 'workers-ai', available: () => true, run: () => new Promise(() => {}) },
    { name: 'fallback', available: () => true, run: async () => 'ok' },
  ], input);
  await vi.advanceTimersByTimeAsync(8000);
  await expect(result).resolves.toEqual({ provider: 'fallback', output: 'ok' });
});

test('Gemini retries a rejected primary key with the backup', async () => {
  const env = { GEMINI_API_KEY: 'primary', GEMINI_API_KEY_2: 'backup' } as Env;
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ error: { details: [{ reason: 'API_KEY_INVALID' }] } }, { status: 400 }))
    .mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }));
  vi.stubGlobal('fetch', fetchMock);

  const provider = llmProviders.find(({ name }) => name === 'gemini');
  assert(provider);
  await expect(provider.run(env, input, signal)).resolves.toEqual({ ok: true });
  expect(fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get('x-goog-api-key')))
    .toEqual(['primary', 'backup']);
});

test('Groq chat retries a rejected primary key with the backup', async () => {
  const env = { GROQ_API_KEY: 'primary', GROQ_API_KEY_2: 'backup' } as Env;
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '{"ok":true}' } }] }));
  vi.stubGlobal('fetch', fetchMock);

  const provider = llmProviders.find(({ name }) => name === 'groq');
  assert(provider);
  await expect(provider.run(env, input, signal)).resolves.toEqual({ ok: true });
  expect(fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get('authorization')))
    .toEqual(['Bearer primary', 'Bearer backup']);
});

test('Groq speech can run with only the backup key', async () => {
  const env = { GROQ_API_KEY_2: 'backup' } as Env;
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ text: 'test recording' }));
  vi.stubGlobal('fetch', fetchMock);

  const provider = asrProviders.find(({ name }) => name === 'groq-whisper');
  assert(provider);
  expect(provider.available(env)).toBe(true);
  await expect(provider.run(env, { audio: new ArrayBuffer(0), mimeType: 'audio/webm', language: 'en' }, signal))
    .resolves.toBe('test recording');
  expect(fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get('authorization')))
    .toEqual(['Bearer backup']);
});
