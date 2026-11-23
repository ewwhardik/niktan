import type { Env } from '../env';
import { extractJson, type Provider } from './adapter';

export interface LlmInput {
  maxTokens?: number;
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

const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/flac': 'flac',
  'audio/m4a': 'm4a',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/x-m4a': 'm4a',
  'audio/x-wav': 'wav',
  'video/mp4': 'mp4',
};

const geminiModel = (env: Env) => env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
const hasGeminiKey = (env: Env) => !!(env.GEMINI_API_KEY || env.GEMINI_API_KEY_2);
const hasGroqKey = (env: Env) => !!(env.GROQ_API_KEY || env.GROQ_API_KEY_2);
export const hasBackupWorkersAi = (env: Env) =>
  /^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_AI_BACKUP_ACCOUNT_ID ?? '') && !!env.CLOUDFLARE_AI_BACKUP_TOKEN;

const WORKERS_TEXT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const WORKERS_VISION_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
const WORKERS_SPEECH_MODEL = '@cf/openai/whisper-large-v3-turbo';

async function backupWorkersAi(env: Env, model: string, input: unknown, signal: AbortSignal): Promise<unknown> {
  if (!hasBackupWorkersAi(env)) throw new Error('missing Workers AI backup credentials');
  const account = env.CLOUDFLARE_AI_BACKUP_ACCOUNT_ID;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.CLOUDFLARE_AI_BACKUP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(input),
    redirect: 'error',
    signal,
  });
  const payload = await response.json().catch(() => null) as {
    success?: boolean;
    result?: unknown;
    errors?: { code?: number | string }[];
  } | null;
  if (!response.ok || !payload?.success) {
    const code = payload?.errors?.find(({ code }) => String(code) === '3036')?.code;
    throw Object.assign(new Error(`Workers AI backup returned HTTP ${response.status}`), { code });
  }
  return payload.result;
}

async function fetchWithBackupKey(
  primary: string | undefined,
  backup: string | undefined,
  request: (key: string) => Promise<Response>,
  isInvalidKey?: (response: Response) => Promise<boolean>,
): Promise<Response> {
  const key = primary || backup;
  if (!key) throw new Error('missing provider credential');
  const response = await request(key);
  if (
    backup && backup !== key &&
    (response.status === 401 || response.status === 403 || await isInvalidKey?.(response))
  ) {
    if (!response.bodyUsed) await response.body?.cancel();
    return request(backup);
  }
  return response;
}

async function geminiInvalidKey(response: Response): Promise<boolean> {
  if (response.status !== 400) return false;
  const body = await response.json().catch(() => null) as {
    error?: { details?: { reason?: string }[] };
  } | null;
  return body?.error?.details?.some((detail) => detail.reason === 'API_KEY_INVALID') ?? false;
}

async function gemini(env: Env, parts: unknown[], system: string, signal: AbortSignal): Promise<unknown> {
  const request = (key: string) => fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel(env)}:generateContent`,
    {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    },
  );
  const res = await fetchWithBackupKey(env.GEMINI_API_KEY, env.GEMINI_API_KEY_2, request, geminiInvalidKey);
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return extractJson(text);
}

function visionContent(input: VisionInput) {
  return [
    { type: 'text', text: input.user },
    { type: 'image_url', image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` } },
  ];
}

async function groqChat(
  env: Env,
  input: { system: string; user: string | ReturnType<typeof visionContent> },
  signal: AbortSignal,
  model = 'openai/gpt-oss-120b',
): Promise<unknown> {
  const request = (key: string) => fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
    }),
  });
  const res = await fetchWithBackupKey(env.GROQ_API_KEY, env.GROQ_API_KEY_2, request);
  if (!res.ok) throw new Error(`groq ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return extractJson(data.choices?.[0]?.message?.content ?? '');
}

function workersAiText(out: unknown): string {
  if (typeof out === 'string') return out;
  if (!out || typeof out !== 'object') return '';
  const o = out as { response?: unknown; choices?: { message?: { content?: string } }[] };
  if (typeof o.response === 'string') return o.response;
  if (o.response && typeof o.response === 'object') return JSON.stringify(o.response);
  return o.choices?.[0]?.message?.content ?? '';
}

const workersAiJson = { temperature: 0, max_tokens: 768, response_format: { type: 'json_object' as const } };

function workersAiPrompt<Content extends string | ReturnType<typeof visionContent>>(system: string, content: Content, maxTokens = workersAiJson.max_tokens) {
  return {
    ...workersAiJson, max_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, { role: 'user', content }],
  };
}

function workersAiSpeech(input: AsrInput) {
  const bytes = new Uint8Array(input.audio);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { audio: btoa(binary), language: input.language };
}

export const llmProviders: Provider<LlmInput, unknown>[] = [
  {
    name: 'gemini',
    available: hasGeminiKey,
    run: (env, input, signal) => gemini(env, [{ text: input.user }], input.system, signal),
  },
  {
    name: 'groq',
    available: hasGroqKey,
    run: groqChat,
  },
  {
    name: 'workers-ai',
    cloudflareAccount: 'primary',
    available: (env) => !!env.AI,
    run: async (env, input) => {
      const out = await env.AI!.run(WORKERS_TEXT_MODEL, workersAiPrompt(input.system, input.user, input.maxTokens));
      return extractJson(workersAiText(out));
    },
  },
  {
    name: 'workers-ai-backup',
    cloudflareAccount: 'backup',
    available: hasBackupWorkersAi,
    run: async (env, input, signal) => {
      const { messages, response_format } = workersAiPrompt(input.system, input.user, input.maxTokens);
      const out = await backupWorkersAi(env, '@cf/openai/gpt-oss-120b', {
        messages, response_format, max_completion_tokens: input.maxTokens ?? 768, reasoning_effort: 'low',
      }, signal);
      return extractJson(workersAiText(out));
    },
  },
];

export const visionProviders: Provider<VisionInput, unknown>[] = [
  {
    name: 'workers-ai',
    cloudflareAccount: 'primary',
    timeoutMs: 18000,
    available: (env) => !!env.AI,
    run: async (env, input) => {
      const out = await env.AI!.run(WORKERS_VISION_MODEL, workersAiPrompt(input.system, visionContent(input), input.maxTokens));
      return extractJson(workersAiText(out));
    },
  },
  {
    name: 'workers-ai-backup',
    cloudflareAccount: 'backup',
    // The REST endpoint can take longer than the in-Worker binding for image requests.
    timeoutMs: 28000,
    available: hasBackupWorkersAi,
    run: async (env, input, signal) => {
      const out = await backupWorkersAi(env, WORKERS_VISION_MODEL, workersAiPrompt(input.system, visionContent(input), input.maxTokens), signal);
      return extractJson(workersAiText(out));
    },
  },
  {
    name: 'gemini',
    available: hasGeminiKey,
    run: (env, input, signal) =>
      gemini(env, [{ inlineData: { mimeType: input.mimeType, data: input.imageBase64 } }, { text: input.user }], input.system, signal),
  },
  {
    name: 'groq',
    available: hasGroqKey,
    run: (env, input, signal) => groqChat(
      env, { system: input.system, user: visionContent(input) }, signal, 'qwen/qwen3.8-27b',
    ),
  },
];

export const asrProviders: Provider<AsrInput, string>[] = [
  {
    name: 'workers-ai-whisper',
    cloudflareAccount: 'primary',
    available: (env) => !!env.AI,
    run: async (env, input) => {
      const out = await env.AI!.run(WORKERS_SPEECH_MODEL, workersAiSpeech(input));
      return out.text?.trim() ?? '';
    },
  },
  {
    name: 'workers-ai-backup-whisper',
    cloudflareAccount: 'backup',
    available: hasBackupWorkersAi,
    run: async (env, input, signal) => {
      const out = await backupWorkersAi(env, WORKERS_SPEECH_MODEL, workersAiSpeech(input), signal) as { text?: string } | undefined;
      return out?.text?.trim() ?? '';
    },
  },
  {
    name: 'groq-whisper',
    available: hasGroqKey,
    run: async (env, input, signal) => {
      const form = new FormData();
      const mime = input.mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
      const extension = AUDIO_EXTENSIONS[mime] ?? 'webm';
      form.append('file', new Blob([input.audio], { type: input.mimeType }), `speech.${extension}`);
      form.append('model', 'whisper-large-v3-turbo');
      form.append('language', input.language);
      form.append('response_format', 'json');
      form.append('temperature', '0');
      const request = (key: string) => fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        signal,
        headers: { authorization: `Bearer ${key}` },
        body: form,
      });
      const res = await fetchWithBackupKey(env.GROQ_API_KEY, env.GROQ_API_KEY_2, request);
      if (!res.ok) throw new Error(`groq-whisper ${res.status}`);
      return ((await res.json()) as { text?: string }).text?.trim() ?? '';
    },
  },
];

export interface ChatInput {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

/** Free-text conversation for the help assistant: Groq first, then Gemini, Workers AI and the backup account. */
export const chatProviders: Provider<ChatInput, string>[] = [
  {
    name: 'groq',
    timeoutMs: 12000,
    available: hasGroqKey,
    run: async (env, input, signal) => {
      const request = (key: string) => fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          temperature: 0.3,
          max_completion_tokens: 700,
          reasoning_effort: 'low',
          messages: [{ role: 'system', content: input.system }, ...input.messages],
        }),
      });
      const res = await fetchWithBackupKey(env.GROQ_API_KEY, env.GROQ_API_KEY_2, request);
      if (!res.ok) throw new Error(`groq ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return data.choices?.[0]?.message?.content?.trim() ?? '';
    },
  },
  {
    name: 'gemini',
    timeoutMs: 12000,
    available: hasGeminiKey,
    run: async (env, input, signal) => {
      const request = (key: string) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel(env)}:generateContent`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: input.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: { temperature: 0.3, maxOutputTokens: 700 },
        }),
      });
      const res = await fetchWithBackupKey(env.GEMINI_API_KEY, env.GEMINI_API_KEY_2, request, geminiInvalidKey);
      if (!res.ok) throw new Error(`gemini ${res.status}`);
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? '';
    },
  },
  {
    name: 'workers-ai',
    cloudflareAccount: 'primary',
    timeoutMs: 12000,
    available: (env) => !!env.AI,
    run: async (env, input) => {
      const out = await env.AI!.run(WORKERS_TEXT_MODEL, { max_tokens: 700, messages: [{ role: 'system', content: input.system }, ...input.messages] });
      return workersAiText(out).trim();
    },
  },
  {
    name: 'workers-ai-backup',
    cloudflareAccount: 'backup',
    timeoutMs: 15000,
    available: hasBackupWorkersAi,
    run: async (env, input, signal) => {
      const out = await backupWorkersAi(env, WORKERS_TEXT_MODEL, { max_tokens: 700, messages: [{ role: 'system', content: input.system }, ...input.messages] }, signal);
      return workersAiText(out).trim();
    },
  },
];
