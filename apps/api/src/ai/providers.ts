import type { Env } from '../env';
import { extractJson, type Provider } from './adapter';

export interface LlmInput {
  system: string;
  user: string;
}
export interface VisionInput extends LlmInput {
  imageBase64: string;
  mimeType: string;
}
export interface AsrInput {
  audio: ArrayBuffer;
  mimeType: string;
  language: string;
}

const geminiModel = (env: Env) => env.GEMINI_MODEL ?? 'gemini-2.5-flash';

async function gemini(env: Env, parts: unknown[], system: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel(env)}:generateContent`,
    {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return extractJson(text);
}

async function groqChat(env: Env, input: LlmInput, signal: AbortSignal): Promise<unknown> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return extractJson(data.choices?.[0]?.message?.content ?? '');
}

function workersAiText(out: unknown): string {
  if (typeof out === 'string') return out;
  const o = out as { response?: unknown; choices?: { message?: { content?: string } }[] };
  if (typeof o.response === 'string') return o.response;
  if (o.response && typeof o.response === 'object') return JSON.stringify(o.response);
  return o.choices?.[0]?.message?.content ?? '';
}

export const llmProviders: Provider<LlmInput, unknown>[] = [
  {
    name: 'gemini',
    available: (env) => !!env.GEMINI_API_KEY,
    run: (env, input, signal) => gemini(env, [{ text: input.user }], input.system, signal),
  },
  {
    name: 'groq',
    available: (env) => !!env.GROQ_API_KEY,
    run: groqChat,
  },
  {
    name: 'workers-ai',
    available: (env) => !!env.AI,
    run: async (env, input) => {
      const out = await env.AI!.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast' as never, {
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        temperature: 0,
      } as never);
      return extractJson(workersAiText(out));
    },
  },
];

export const visionProviders: Provider<VisionInput, unknown>[] = [
  {
    name: 'gemini',
    available: (env) => !!env.GEMINI_API_KEY,
    run: (env, input, signal) =>
      gemini(env, [{ inlineData: { mimeType: input.mimeType, data: input.imageBase64 } }, { text: input.user }], input.system, signal),
  },
  {
    name: 'workers-ai',
    available: (env) => !!env.AI,
    run: async (env, input) => {
      const out = await env.AI!.run('@cf/meta/llama-4-scout-17b-16e-instruct' as never, {
        messages: [
          { role: 'system', content: input.system },
          {
            role: 'user',
            content: [
              { type: 'text', text: input.user },
              { type: 'image_url', image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` } },
            ],
          },
        ],
        temperature: 0,
      } as never);
      return extractJson(workersAiText(out));
    },
  },
];

export const asrProviders: Provider<AsrInput, string>[] = [
  {
    name: 'groq-whisper',
    available: (env) => !!env.GROQ_API_KEY,
    run: async (env, input, signal) => {
      const form = new FormData();
      form.append('file', new Blob([input.audio], { type: input.mimeType }), 'speech.webm');
      form.append('model', 'whisper-large-v3-turbo');
      form.append('language', input.language);
      form.append('response_format', 'json');
      form.append('temperature', '0');
      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        signal,
        headers: { authorization: `Bearer ${env.GROQ_API_KEY}` },
        body: form,
      });
      if (!res.ok) throw new Error(`groq-whisper ${res.status}`);
      return ((await res.json()) as { text?: string }).text?.trim() ?? '';
    },
  },
  {
    name: 'workers-ai-whisper',
    available: (env) => !!env.AI,
    run: async (env, input) => {
      const bytes = new Uint8Array(input.audio);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const out = (await env.AI!.run('@cf/openai/whisper-large-v3-turbo' as never, {
        audio: btoa(binary),
        language: input.language,
      } as never)) as { text?: string };
      return out.text?.trim() ?? '';
    },
  },
];
