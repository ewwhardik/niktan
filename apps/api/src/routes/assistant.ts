import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { AllProvidersFailed, runChain } from '../ai/adapter';
import { ASSISTANT_SYSTEM } from '../ai/knowledge';
import { chatProviders } from '../ai/providers';
import { rateLimit } from '../lib/rateLimit';
import { parseBody } from '../lib/util';
import { redact } from './ai';

export const assistant = new Hono<AppEnv>();

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(1200) })).min(1).max(16),
  lang: z.enum(['en', 'hi', 'hne']).optional(),
  page: z.string().max(80).optional(),
});

const LANG_NAME = { en: 'English', hi: 'Hindi', hne: 'Chhattisgarhi' } as const;

/** Help assistant. Only the last 10 turns are sent, and phone or Aadhaar-like numbers are masked first. */
assistant.post('/assistant', rateLimit('assistant', 60, 3600), async (c) => {
  const body = await parseBody(c, Body);
  const messages = body.messages.slice(-10).map((m) => ({ role: m.role, content: m.role === 'user' ? redact(m.content) : m.content }));
  if (messages[0]?.role !== 'user') messages.shift();
  const context = `\n\nCONTEXT: The person is on page ${body.page ?? '/'} and chose ${LANG_NAME[body.lang ?? 'en']} as the site language.`;
  try {
    const { provider, output } = await runChain(c.env, 'llm', chatProviders, { system: ASSISTANT_SYSTEM + context, messages }, (text) => text.length > 0);
    return c.json({ reply: output.slice(0, 4000), provider });
  } catch (err) {
    if (!(err instanceof AllProvidersFailed)) throw err;
    return c.json({ reply: null, provider: null }, 503);
  }
});
