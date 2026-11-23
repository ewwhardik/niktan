import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, ChevronRight, MessageCircle, X } from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { BrandMark } from './BrandMark';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const STORE = 'niktan.assistant';

function loadChat(): Message[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) ?? '[]') as Message[];
  } catch {
    return [];
  }
}

/** **bold**, "- " bullets and [[/path|label]] links; built as React nodes, never as HTML. */
function Rich({ text, onLink }: { text: string; onLink: (path: string) => void }) {
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>);
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) blocks.push(<ul key={`u${blocks.length}`} className="my-1 flex list-disc flex-col gap-1 pl-5">{bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>);
    bullets = [];
  };
  const links: { path: string; label: string }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const link = line.match(/^\[\[(\/[\w/-]*)\|([^\]]+)\]\]$/);
    if (link) {
      links.push({ path: link[1]!, label: link[2]! });
      continue;
    }
    if (/^[-*•]\s+/.test(line)) {
      bullets.push(line.replace(/^[-*•]\s+/, ''));
      continue;
    }
    flush();
    if (line) blocks.push(<p key={`p${blocks.length}`}>{inline(line.replace(/^#+\s*/, ''))}</p>);
  }
  flush();
  return (
    <div className="flex flex-col gap-1.5">
      {blocks}
      {!!links.length && (
        <div className="mt-1 flex flex-col gap-1.5">
          {links.map((l) => (
            <button key={l.path + l.label} onClick={() => onLink(l.path)} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--surface)] px-3 py-2 text-left text-label font-medium text-[#0071e3] ring-1 ring-border dark:text-[#2997ff]">
              {l.label} <ChevronRight size={16} aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Help assistant available on every page except the camera and audio steps. */
export function Assistant() {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(loadChat);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-30)));
    } catch {
      // Private mode: the chat just isn't kept across reloads.
    }
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 250);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  if (pathname.startsWith('/scan') || pathname === '/review/share') return null;

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setDraft('');
    setBusy(true);
    try {
      const res = await api.post<{ reply: string | null }>('/api/assistant', { messages: next.slice(-12), lang: i18n.language, page: pathname });
      setMessages([...next, { role: 'assistant', content: res.reply ?? t('assistant.down') }]);
    } catch {
      setMessages([...next, { role: 'assistant', content: t('assistant.down') }]);
    } finally {
      setBusy(false);
    }
  }

  const starters = t('assistant.starters', { returnObjects: true }) as string[];
  const onLanding = pathname === '/';

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button key="fab" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 26 }}
            onClick={() => setOpen(true)} aria-label={t('assistant.open')}
            // Away from the landing page the round icon sits above each screen's bottom button bar.
            className={`fixed right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-text text-label font-semibold text-bg shadow-3 sm:right-6 ${onLanding ? 'bottom-[calc(84px+env(safe-area-inset-bottom))] w-12 justify-center sm:bottom-6 sm:w-auto sm:pr-4 sm:pl-3.5' : 'bottom-[calc(max(var(--dock-h,0px),env(safe-area-inset-bottom))+12px)] w-12 justify-center lg:bottom-6'}`}>
            <MessageCircle size={20} aria-hidden /> {onLanding && <span className="hidden sm:inline">{t('assistant.label')}</span>}
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <motion.section key="panel" role="dialog" aria-label={t('assistant.title')}
            initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            style={{ transformOrigin: 'bottom right' }}
            className="fixed inset-x-2 bottom-2 z-50 flex max-h-[min(640px,calc(100dvh-16px))] flex-col overflow-hidden rounded-[26px] bg-bg shadow-4 ring-1 ring-border sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[400px]">
            <header className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span className="grid size-9 place-items-center rounded-full bg-text text-bg"><BrandMark className="size-4 brightness-0 invert dark:invert-0" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-label font-semibold">{t('assistant.title')}</p>
                <p className="text-caption text-text-3">{t('assistant.subtitle')}</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label={t('assistant.close')} className="grid size-9 place-items-center rounded-full bg-sunken"><X size={17} aria-hidden /></button>
            </header>
            <div ref={list} className="flex min-h-[240px] flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-4 text-body">
              {!messages.length && (
                <div className="flex flex-col gap-3">
                  <p className="text-text-2">{t('assistant.hello')}</p>
                  <div className="flex flex-col gap-2">
                    {starters.map((s) => (
                      <button key={s} onClick={() => void send(s)} className="rounded-2xl bg-sunken px-3.5 py-2.5 text-left text-label">{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
                  className={m.role === 'user' ? 'ml-10 self-end rounded-[20px] rounded-br-md bg-[#0071e3] px-3.5 py-2 text-white' : 'mr-6 self-start rounded-[20px] rounded-bl-md bg-sunken px-3.5 py-2.5'}>
                  {m.role === 'user' ? m.content : <Rich text={m.content} onLink={(path) => { setOpen(false); navigate(path); }} />}
                </motion.div>
              ))}
              {busy && (
                <div className="flex gap-1 self-start rounded-[20px] bg-sunken px-4 py-3" aria-label={t('assistant.thinking')}>
                  {[0, 1, 2].map((i) => <motion.span key={i} className="size-1.5 rounded-full bg-text-3" animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />)}
                </div>
              )}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void send(draft); }} className="flex items-end gap-2 border-t border-border p-3">
              <textarea ref={input} value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} maxLength={1000}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(draft); } }}
                placeholder={t('assistant.placeholder')} aria-label={t('assistant.placeholder')}
                className="max-h-28 min-h-11 flex-1 resize-none rounded-[22px] bg-sunken px-4 py-2.5 text-body outline-none" />
              <button type="submit" disabled={!draft.trim() || busy} aria-label={t('assistant.send')} className="grid size-11 shrink-0 place-items-center rounded-full bg-[#0071e3] text-white disabled:opacity-40">
                <ArrowUp size={19} aria-hidden />
              </button>
            </form>
            <p className="px-4 pb-3 text-center text-[11px] text-text-3">{t('assistant.disclaimer')}</p>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
