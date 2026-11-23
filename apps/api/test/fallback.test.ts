import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllProvidersFailed, runChain, type Provider } from '../src/ai/adapter';
import { asrProviders, chatProviders, llmProviders, visionProviders } from '../src/ai/providers';
import { app } from '../src/index';
import type { Env } from '../src/env';

/**
 * Fallback matrix: every AI chain with every provider configured. Each provider is taken down in
 * turn and the next one must answer; with all of them down, each route must degrade gracefully.
 */

type Name = 'gemini' | 'groq' | 'groq-whisper' | 'workers-ai' | 'workers-ai-backup';
let down = new Set<Name>();

const JSON_LLM = '{"symptoms":[{"code":"fever","durationDays":3,"severity":"moderate"}],"redFlags":{}}';
const JSON_VISION = '{"items":[],"noFood":true,"medicines":[],"advice":[],"notPrescription":true}';

/** Rate limits always allow the request; every other lookup (e.g. Workers AI quota history) finds nothing. */
function fakeDb() {
  const stmt = (sql: string) => {
    const s = { bind: () => s, run: async () => ({}), first: async () => (sql.includes('rate_limits') ? { count: 1 } : null), all: async () => ({ results: [] }) };
    return s;
  };
  return { prepare: stmt, batch: async () => [] } as unknown as D1Database;
}

function env(): Env {
  return {
    DB: fakeDb(),
    AI: {
      run: vi.fn(async (_model: string, input: { audio?: string }) => {
        if (down.has('workers-ai')) throw new Error('workers-ai down');
        return input.audio ? { text: 'तीन दिन से बुखार' } : { response: currentText };
      }),
    } as unknown as Ai,
    ALLOWED_ORIGINS: 'https://niktan.vercel.app',
    DEMO_MODE: 'true',
    GEMINI_API_KEY: 'g',
    GROQ_API_KEY: 'q',
    CLOUDFLARE_AI_BACKUP_ACCOUNT_ID: 'a'.repeat(32),
    CLOUDFLARE_AI_BACKUP_TOKEN: 't',
  };
}

/** What a text provider should answer for the chain under test. */
let currentText = JSON_LLM;

beforeEach(() => {
  down = new Set();
  currentText = JSON_LLM;
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
    const u = String(url);
    const name: Name = u.includes('generativelanguage') ? 'gemini'
      : u.includes('audio/transcriptions') ? 'groq-whisper'
      : u.includes('api.groq.com') ? 'groq'
      : 'workers-ai-backup';
    if (down.has(name)) return new Response('down', { status: 503 });
    if (name === 'gemini') return Response.json({ candidates: [{ content: { parts: [{ text: currentText }] } }] });
    if (name === 'groq') return Response.json({ choices: [{ message: { content: currentText } }] });
    if (name === 'groq-whisper') return Response.json({ text: 'तीन दिन से बुखार' });
    return Response.json({ success: true, result: u.includes('whisper') ? { text: 'तीन दिन से बुखार' } : { response: currentText } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

/** Maps a provider's name to the service it calls. */
const service = (p: string): Name => (p.startsWith('workers-ai-backup') ? 'workers-ai-backup' : p.startsWith('workers-ai') ? 'workers-ai' : p as Name);

async function walk<I, O>(providers: Provider<I, O>[], input: I, validate: (o: O) => boolean) {
  const order = providers.map((p) => p.name);
  for (let i = 0; i < order.length; i++) {
    down = new Set(order.slice(0, i).map(service));
    const { provider } = await runChain(env(), 'llm', providers, input, validate);
    expect(provider, `with ${[...down].join(', ') || 'nothing'} down`).toBe(order[i]);
  }
  down = new Set(order.map(service));
  await expect(runChain(env(), 'llm', providers, input, validate)).rejects.toBeInstanceOf(AllProvidersFailed);
  return order;
}

describe('every provider in every chain takes over when the ones before it fail', () => {
  it('symptom structuring', async () => {
    const order = await walk(llmProviders, { system: 's', user: 'u' }, (o) => !!o && typeof o === 'object');
    expect(order).toHaveLength(4);
  });

  it('vision (Thali and prescriptions)', async () => {
    currentText = JSON_VISION;
    const order = await walk(visionProviders, { system: 's', user: 'u', imageBase64: 'AA==', mimeType: 'image/jpeg' }, (o) => !!o && typeof o === 'object');
    expect(order).toHaveLength(4);
  });

  it('speech to text', async () => {
    const order = await walk(asrProviders, { audio: new ArrayBuffer(8), mimeType: 'audio/webm', language: 'hi' }, (t) => t.length > 0);
    expect(order).toHaveLength(3);
  });

  it('help assistant', async () => {
    currentText = 'Namaste! NikTan is a 3-minute check.';
    const order = await walk(chatProviders, { system: 's', messages: [{ role: 'user', content: 'hi' }] }, (t) => t.length > 0);
    expect(order).toEqual(['groq', 'gemini', 'workers-ai', 'workers-ai-backup']);
  });
});

describe('prescription inputs', () => {
  it.each(['text', 'photo'])('returns written advice without a medicine for %s', async kind => {
    currentText = JSON.stringify({ medicines: [], advice: ['Review Monday'], unreadable: ['Last line'] });
    const body = new FormData();
    if (kind === 'text') body.set('text', 'Review Monday');
    else body.set('photo', new File([new Uint8Array(128 * 1024)], 'page.jpg', { type: 'image/jpeg' }));
    const res = await app.request('/api/rx/read', { method: 'POST', body }, env());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ medicines: [], advice: ['Review Monday'], unreadable: ['Last line'], notPrescription: false });
  });
});

describe('each route degrades gracefully when every provider is down', () => {
  const all: Name[] = ['gemini', 'groq', 'groq-whisper', 'workers-ai', 'workers-ai-backup'];
  const post = (path: string, body: BodyInit, json = false) =>
    app.request(path, { method: 'POST', body, headers: { origin: 'https://niktan.vercel.app', ...(json ? { 'content-type': 'application/json' } : {}) } }, env());
  const image = () => {
    const f = new FormData();
    f.append('photo', new File([new Uint8Array([255, 216, 255, 0])], 'p.jpg', { type: 'image/jpeg' }));
    return f;
  };

  beforeEach(() => {
    down = new Set(all);
  });

  it('symptoms fall back to the on-device rule parser', async () => {
    const res = await post('/api/symptoms/structure', JSON.stringify({ text: '3 din se bukhar hai' }), true);
    expect(res.status).toBe(200);
    const body = await res.json() as { source: string; symptoms: { code: string }[] };
    expect(body.source).toBe('offline-rules');
    expect(body.symptoms.map((s) => s.code)).toContain('fever');
  });

  it('speech tells the app to use the browser recogniser', async () => {
    const f = new FormData();
    f.append('audio', new File([new Uint8Array(16)], 'a.webm', { type: 'audio/webm' }));
    const res = await post('/api/asr', f);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ fallback: 'web-speech' });
  });

  it('Thali switches to adding dishes by hand', async () => {
    const res = await post('/api/thali/recognize', image());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ fallback: 'manual' });
  });

  it('the prescription reader reports it could not read, never an invented list', async () => {
    const res = await post('/api/rx/read', image());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ medicines: [], fallback: true });
  });

  it('the assistant returns no reply so the app shows its offline message', async () => {
    const res = await post('/api/assistant', JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }), true);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ reply: null });
  });
});

describe('failure classes in the status log', () => {
  it('keep the HTTP status and known parse failures, nothing else', async () => {
    const { failureClass } = await import('../src/ai/adapter');
    expect(failureClass(new Error('Workers AI backup returned HTTP 401'))).toBe('http 401');
    expect(failureClass(new Error('gemini 503'))).toBe('http 503');
    expect(failureClass(new Error('groq-whisper 429'))).toBe('http 429');
    expect(failureClass(new Error('invalid output'))).toBe('invalid output');
    expect(failureClass(new Error('missing Workers AI backup credentials'))).toBe('missing credentials');
    expect(failureClass(new Error('secret key sk-123 leaked in body'))).toBe('provider request failed');
  });
});
