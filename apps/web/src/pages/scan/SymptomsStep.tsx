import { AnimatePresence, motion } from 'motion/react';
import { Mic, OctagonAlert, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseSymptoms, RED_FLAGS, symptoms as VOCAB, type RedFlag, type SymptomEntry } from '@niktan/core';
import { SymptomCapture } from '../../audio/symptomCapture';
import { pickLang } from '../../i18n';
import { api } from '../../lib/api';
import { haptic } from '../../lib/perf';
import { useScan } from '../../state/scan';
import { Button } from '../../ui/Button';
import { ToggleChip } from '../../ui/Chip';
import { Dock } from '../../ui/Layout';
import { Sheet } from '../../ui/Sheet';
import { spring } from '../../ui/motion';
import type { StepProps } from './ScanStep';

const COMMON = ['fever', 'cough', 'breathlessness', 'chest_pain', 'fatigue', 'headache', 'abdominal_pain', 'vomiting', 'diarrhoea', 'joint_pain', 'back_pain', 'dizziness', 'skin_rash', 'blurred_vision', 'ear_pain', 'burning_urine'];

const FLAG_TEXT: Record<RedFlag, { hi: string; en: string }> = {
  chest_pain: { hi: 'सीने में दर्द', en: 'chest pain' },
  breathlessness: { hi: 'बहुत साँस फूलना', en: 'severe breathlessness' },
  unconscious: { hi: 'बेहोशी', en: 'unconsciousness' },
  severe_bleeding: { hi: 'बहुत खून बहना', en: 'heavy bleeding' },
  seizure: { hi: 'दौरा', en: 'a seizure' },
  pregnancy_bleeding: { hi: 'गर्भावस्था में रक्तस्राव', en: 'bleeding in pregnancy' },
  child_lethargic: { hi: 'बच्चे में बहुत सुस्ती', en: 'a very drowsy child' },
};

type SR = { start: () => void; stop: () => void; abort: () => void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null };

function speechRecognition(): SR | null {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}

export default function SymptomsStep({ next, guide }: StepProps) {
  const { t, i18n } = useTranslation();
  const { record, profile, results } = useScan();
  const [text, setText] = useState(results.symptoms?.summaryHi ?? '');
  const [selected, setSelected] = useState<Map<string, SymptomEntry>>(() => new Map((results.symptoms?.symptoms ?? []).map((s) => [s.code, s])));
  const [flags, setFlags] = useState<Partial<Record<RedFlag, boolean>>>({});
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<RedFlag[]>([]);
  const [level, setLevel] = useState(0);
  const capture = useRef<SymptomCapture | null>(null);
  const sr = useRef<SR | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);
  const [micIssue, setMicIssue] = useState(false);
  const [browserFallback, setBrowserFallback] = useState(false);
  const [pendingMic, setPendingMic] = useState(false);
  const parsedText = useRef(text);
  const parsedCodes = useRef(new Set<string>());
  const decisions = useRef<{ yes: Partial<Record<RedFlag, boolean>>; no: RedFlag[] }>({ yes: {}, no: [] });

  useEffect(() => {
    mounted.current = true;
    const cancel = () => {
      capture.current?.cancel();
      capture.current = null;
      clearTimeout(timeout.current);
      if (sr.current) {
        sr.current.onend = sr.current.onresult = sr.current.onerror = null;
        try { sr.current.abort(); } catch { /* Already stopped. */ }
        sr.current = null;
      }
    };
    const onHide = () => {
      if (!document.hidden) return;
      cancel();
      setLevel(0);
      setListening(false);
      setPendingMic(false);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      mounted.current = false;
      cancel();
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  const applyParsed = (input: string, list: SymptomEntry[], red: Partial<Record<RedFlag, boolean>>) => {
    if (!mounted.current) return;
    const old = parsedCodes.current;
    parsedCodes.current = new Set(list.map((item) => item.code));
    parsedText.current = input;
    setSelected((prev) => {
      const m = new Map([...prev].filter(([code]) => !old.has(code)));
      for (const item of list) m.set(item.code, item);
      return m;
    });
    setFlags(red);
  };

  const structure = async (input: string) => {
    if (!input.trim()) {
      applyParsed(input, [], {});
      return;
    }
    setBusy(true);
    try {
      const r = await api.post<{ symptoms: SymptomEntry[]; redFlags: Partial<Record<RedFlag, boolean>>; summaryHi: string }>('/api/symptoms/structure', {
        text: input,
        age: profile?.age,
        pregnant: profile?.pregnant,
      });
      applyParsed(input, r.symptoms, r.redFlags);
    } catch {
      const local = parseSymptoms(input, { age: profile?.age, pregnant: profile?.pregnant });
      applyParsed(input, local.symptoms, local.redFlags);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const stopListening = async () => {
    clearTimeout(timeout.current);
    if (sr.current) {
      try { sr.current.stop(); } catch { /* Already stopped. */ }
    }
    const active = capture.current;
    if (!active) return;
    capture.current = null;
    setPendingMic(false);
    setListening(false);
    setLevel(0);
    setBusy(true);
    try {
      const blob = await active.finish();
      if (!blob || !mounted.current) return;
      const form = new FormData();
      form.append('audio', blob, blob.type.includes('mp4') ? 'speech.mp4' : 'speech.webm');
      form.append('language', i18n.language === 'en' ? 'en' : 'hi');
      const response = await api.post<{ text: string | null }>('/api/asr', form);
      if (!mounted.current) return;
      if (!response.text?.trim()) throw new Error('No transcript');
      setText(response.text);
      await structure(response.text);
    } catch {
      if (mounted.current) {
        setBrowserFallback(true);
        setMicIssue(true);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const startListening = async () => {
    if (busy || capture.current || sr.current) return;
    haptic(15);
    setMicIssue(false);
    // Browser recognition may use its vendor's service. Only start it on a new gesture after the fallback notice.
    if (browserFallback || typeof MediaRecorder === 'undefined') {
      const recognizer = speechRecognition();
      if (!browserFallback || !recognizer) {
        setBrowserFallback(true);
        setMicIssue(true);
        return;
      }
      sr.current = recognizer;
      recognizer.lang = i18n.language === 'en' ? 'en-IN' : 'hi-IN';
      recognizer.interimResults = false;
      recognizer.continuous = false;
      recognizer.onresult = (e) => {
        const words = Array.from(e.results).map((x) => x[0]?.transcript ?? '').join(' ').trim();
        if (words) {
          setText(words);
          void structure(words);
        }
      };
      recognizer.onerror = () => setMicIssue(true);
      recognizer.onend = () => {
        clearTimeout(timeout.current);
        sr.current = null;
        setListening(false);
      };
      try {
        recognizer.start();
        setListening(true);
        timeout.current = setTimeout(() => void stopListening(), 30000);
      } catch {
        sr.current = null;
        setMicIssue(true);
      }
      return;
    }
    const active = new SymptomCapture();
    capture.current = active;
    setPendingMic(true);
    try {
      const started = await active.start(setLevel);
      if (capture.current !== active || !mounted.current) return;
      setPendingMic(false);
      if (started) {
        setListening(true);
        timeout.current = setTimeout(() => void stopListening(), 30000);
      }
    } catch {
      if (capture.current !== active || !mounted.current) return;
      capture.current = null;
      setPendingMic(false);
      setMicIssue(true);
      setBrowserFallback(true);
    }
  };

  const toggle = (code: string) =>
    setSelected((prev) => {
      const m = new Map(prev);
      if (m.has(code)) m.delete(code);
      else m.set(code, { code, durationDays: null, severity: 'moderate' });
      return m;
    });

  const finish = (confirmedFlags: Partial<Record<RedFlag, boolean>>, declined: RedFlag[] = []) => {
    const list = [...selected.values()];
    record('symptoms', { symptoms: list, redFlags: confirmedFlags, summaryHi: text.slice(0, 500), confirmed: true, declined });
    next();
  };

  const onContinue = () => {
    if (text !== parsedText.current) {
      void structure(text);
      return;
    }
    decisions.current = { yes: {}, no: [] };
    // Every red flag from speech or chips is asked once before it can make the case an emergency.
    const fromChips: RedFlag[] = [];
    for (const code of selected.keys()) if ((RED_FLAGS as readonly string[]).includes(code)) fromChips.push(code as RedFlag);
    const pending = [...new Set([...(Object.keys(flags) as RedFlag[]).filter((f) => flags[f]), ...fromChips])];
    if (pending.length) setAsk(pending);
    else finish({});
  };

  const decide = (confirmed: boolean) => {
    const [current, ...remaining] = ask;
    if (!current) return;
    if (confirmed) decisions.current.yes[current] = true;
    else decisions.current.no.push(current);
    setAsk(remaining);
    if (!remaining.length) finish(decisions.current.yes, decisions.current.no);
  };

  const vocab = new Map(VOCAB.map((s) => [s.code, s]));
  const understood = [...selected.values()];
  const chipCodes = [...new Set([...understood.map((s) => s.code), ...COMMON])];

  return (
    <div className="flex flex-1 flex-col pt-5">
      {!busy && !pendingMic && !listening && !ask.length && <div className="mb-3">{guide}</div>}
      <h2 className="text-title-2 font-semibold">{t('symptoms.title')}</h2>

      <div className="mt-6 flex flex-col items-center">
        <div className="relative flex size-32 items-center justify-center">
          <AnimatePresence>
            {listening && (
              <motion.span className="absolute inset-0 rounded-full bg-accent/20" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1 + level * 0.5, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} />
            )}
          </AnimatePresence>
          <motion.button
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId);
              void startListening();
            }}
            onPointerUp={() => void stopListening()}
            onPointerCancel={() => {
              capture.current?.cancel();
              capture.current = null;
              if (sr.current) {
                sr.current.onend = sr.current.onresult = sr.current.onerror = null;
                try { sr.current.abort(); } catch { /* Already stopped. */ }
                sr.current = null;
              }
              clearTimeout(timeout.current);
              setListening(false);
              setPendingMic(false);
              setLevel(0);
            }}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                if (!e.repeat) void startListening();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                void stopListening();
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
            whileTap={{ scale: 0.94 }}
            animate={{ scale: listening ? 1.06 : 1 }}
            transition={spring.tap}
            className="relative flex size-24 select-none items-center justify-center rounded-full bg-accent text-on-accent shadow-3"
            style={{ touchAction: 'none', WebkitUserSelect: 'none' }}
            aria-label={t('symptoms.hold')}
            aria-describedby="symptom-voice-notice"
          >
            <Mic size={36} strokeWidth={1.75} aria-hidden />
          </motion.button>
        </div>
        <p className="mt-2 text-body text-text-2" aria-live="polite">
          {listening ? t('symptoms.listening') : busy || pendingMic ? t('common.loading') : t('symptoms.hold')}
        </p>
        {micIssue && <p role="status" className="mt-2 text-center text-body text-text-2">{t('symptoms.micIssue')}</p>}
        <p id="symptom-voice-notice" className="mt-2 text-center text-caption text-text-3">
          {t(browserFallback ? 'symptoms.browserFallback' : 'symptoms.voiceNotice')}
        </p>
      </div>

      <form
        className="mt-5 flex items-center gap-2 rounded-md border border-border-strong bg-sunken pl-4 pr-1.5 focus-within:border-accent"
        onSubmit={(e) => {
          e.preventDefault();
          void structure(text);
        }}
      >
        <input disabled={busy || pendingMic || listening} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('symptoms.placeholder')} className="h-14 min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-3" aria-label={t('symptoms.typeInstead')} />
        <motion.button whileTap={{ scale: 0.9 }} type="submit" disabled={!text.trim() || busy || pendingMic || listening} className="flex size-11 items-center justify-center rounded-sm bg-accent text-on-accent disabled:bg-border disabled:text-text-3" aria-label={t('common.next')}>
          <Send size={18} aria-hidden />
        </motion.button>
      </form>

      <p className="mt-6 text-label font-medium text-text-2">{understood.length ? t('symptoms.understood') : t('symptoms.chips')}</p>
      <motion.div layout className="mt-3 flex flex-wrap gap-2">
        {chipCodes.map((code) => {
          const s = vocab.get(code);
          if (!s) return null;
          const sel = selected.get(code);
          return (
            <ToggleChip key={code} selected={!!sel} onToggle={() => toggle(code)}>
              {pickLang(s, i18n.language)}
              {sel?.durationDays ? <span className="tnum text-caption opacity-80">· {t('symptoms.duration', { n: sel.durationDays })}</span> : null}
              {sel?.severity === 'severe' ? <span className="text-caption opacity-80">· {t('symptoms.severe')}</span> : null}
            </ToggleChip>
          );
        })}
      </motion.div>

      <Dock>
        <Button onClick={onContinue} disabled={busy || listening || pendingMic}>
          {selected.size || text.trim() ? t('common.continue') : t('symptoms.nothing')}
        </Button>
      </Dock>

      <Sheet open={ask.length > 0} onClose={() => setAsk([])} title={t('symptoms.confirm')}>
        <div className="flex flex-col gap-3 pb-2">
          {ask.slice(0, 1).map((f) => (
            <div key={f} className="rounded-lg bg-emergency-tint p-4 text-emergency-ink">
              <p className="flex items-center gap-2 text-title-3 font-semibold">
                <OctagonAlert size={22} aria-hidden /> {t('symptoms.redFlagAsk', { flag: pickLang(FLAG_TEXT[f], i18n.language) })}
              </p>
            </div>
          ))}
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              onClick={() => decide(false)}
            >
              {t('info.no')}
            </Button>
            <Button
              variant="emergency"
              onClick={() => decide(true)}
            >
              {t('info.yes')}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
