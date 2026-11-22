import { AnimatePresence, motion } from 'motion/react';
import { Mic, OctagonAlert, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseSymptoms, RED_FLAGS, symptoms as VOCAB, type RedFlag, type SymptomEntry } from '@niktan/core';
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

type SR = { start: () => void; stop: () => void; abort: () => void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null };

function speechRecognition(): SR | null {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}

export default function SymptomsStep({ next }: StepProps) {
  const { t, i18n } = useTranslation();
  const { record, profile, results } = useScan();
  const [text, setText] = useState(results.symptoms?.summaryHi ?? '');
  const [selected, setSelected] = useState<Map<string, SymptomEntry>>(() => new Map((results.symptoms?.symptoms ?? []).map((s) => [s.code, s])));
  const [flags, setFlags] = useState<Partial<Record<RedFlag, boolean>>>({});
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<RedFlag[]>([]);
  const [level, setLevel] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const sr = useRef<SR | null>(null);
  const srText = useRef('');
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      stream.current?.getTracks().forEach((tr) => tr.stop());
    },
    [],
  );

  const applyParsed = (list: SymptomEntry[], red: Partial<Record<RedFlag, boolean>>) => {
    setSelected((prev) => {
      const m = new Map(prev);
      for (const s of list) m.set(s.code, s);
      return m;
    });
    setFlags((f) => ({ ...f, ...red }));
  };

  const structure = async (input: string) => {
    if (!input.trim()) return;
    setBusy(true);
    try {
      const r = await api.post<{ symptoms: SymptomEntry[]; redFlags: Partial<Record<RedFlag, boolean>>; summaryHi: string }>('/api/symptoms/structure', {
        text: input,
        age: profile?.age,
        pregnant: profile?.pregnant,
      });
      applyParsed(r.symptoms, r.redFlags);
    } catch {
      const local = parseSymptoms(input, { age: profile?.age, pregnant: profile?.pregnant });
      applyParsed(local.symptoms, local.redFlags);
    } finally {
      setBusy(false);
    }
  };

  const startListening = async () => {
    haptic(15);
    srText.current = '';
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return;
    }
    setListening(true);
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(stream.current).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let s = 0;
      for (const v of data) s += ((v - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(s / data.length) * 4));
      raf.current = requestAnimationFrame(tick);
    };
    tick();
    chunks.current = [];
    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    rec.current = new MediaRecorder(stream.current, { mimeType: mime });
    rec.current.ondataavailable = (e) => chunks.current.push(e.data);
    rec.current.onstop = () => void ctx.close();
    rec.current.start();
    // On-device recogniser runs alongside: instant text, and the fallback when the server can't transcribe.
    const r = speechRecognition();
    if (r) {
      r.lang = i18n.language === 'en' ? 'en-IN' : 'hi-IN';
      r.interimResults = true;
      r.continuous = true;
      r.onresult = (e) => {
        srText.current = Array.from(e.results)
          .map((x) => x[0]?.transcript ?? '')
          .join(' ');
        setText(srText.current);
      };
      r.onerror = () => undefined;
      try {
        r.start();
        sr.current = r;
      } catch {
        sr.current = null;
      }
    }
  };

  const stopListening = async () => {
    if (!listening) return;
    setListening(false);
    cancelAnimationFrame(raf.current);
    setLevel(0);
    haptic(10);
    sr.current?.stop();
    const recorder = rec.current;
    if (!recorder) return;
    const done = new Promise<void>((r) => recorder.addEventListener('stop', () => r(), { once: true }));
    recorder.stop();
    await done;
    stream.current?.getTracks().forEach((tr) => tr.stop());
    const blob = new Blob(chunks.current, { type: recorder.mimeType });
    let transcript = srText.current;
    if (blob.size > 2000) {
      setBusy(true);
      try {
        const form = new FormData();
        form.append('audio', blob, 'speech');
        form.append('language', i18n.language === 'en' ? 'en' : 'hi');
        const r = await api.post<{ text: string | null }>('/api/asr', form);
        if (r.text) transcript = r.text;
      } catch {
        // keep on-device transcript
      }
      setBusy(false);
    }
    setText(transcript);
    await structure(transcript);
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
    // Every red flag from speech or chips is asked once before it can make the case an emergency.
    const fromChips: RedFlag[] = [];
    for (const code of selected.keys()) if ((RED_FLAGS as readonly string[]).includes(code)) fromChips.push(code as RedFlag);
    const pending = [...new Set([...(Object.keys(flags) as RedFlag[]).filter((f) => flags[f]), ...fromChips])];
    if (pending.length) setAsk(pending);
    else finish({});
  };

  const vocab = new Map(VOCAB.map((s) => [s.code, s]));
  const understood = [...selected.values()];
  const chipCodes = [...new Set([...understood.map((s) => s.code), ...COMMON])];

  return (
    <div className="flex flex-1 flex-col pt-5">
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
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              void startListening();
            }}
            onPointerUp={() => void stopListening()}
            onPointerCancel={() => void stopListening()}
            onContextMenu={(e) => e.preventDefault()}
            whileTap={{ scale: 0.94 }}
            animate={{ scale: listening ? 1.06 : 1 }}
            transition={spring.tap}
            className="relative flex size-24 select-none items-center justify-center rounded-full bg-accent text-on-accent shadow-3"
            style={{ touchAction: 'none', WebkitUserSelect: 'none' }}
            aria-label={t('symptoms.hold')}
          >
            <Mic size={36} strokeWidth={1.75} aria-hidden />
          </motion.button>
        </div>
        <p className="mt-2 text-body text-text-2" aria-live="polite">
          {listening ? t('symptoms.listening') : busy ? t('common.loading') : t('symptoms.hold')}
        </p>
      </div>

      <form
        className="mt-5 flex items-center gap-2 rounded-md border border-border-strong bg-sunken pl-4 pr-1.5 focus-within:border-accent"
        onSubmit={(e) => {
          e.preventDefault();
          void structure(text);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('symptoms.placeholder')} className="h-14 min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-3" aria-label={t('symptoms.typeInstead')} />
        <motion.button whileTap={{ scale: 0.9 }} type="submit" disabled={!text.trim() || busy} className="flex size-11 items-center justify-center rounded-sm bg-accent text-on-accent disabled:bg-border disabled:text-text-3" aria-label={t('common.next')}>
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
        <Button onClick={onContinue} disabled={busy || listening}>
          {selected.size ? t('common.continue') : t('symptoms.nothing')}
        </Button>
      </Dock>

      <Sheet open={ask.length > 0} onClose={() => setAsk([])} title={t('symptoms.confirm')}>
        <div className="flex flex-col gap-3 pb-2">
          {ask.map((f) => (
            <div key={f} className="rounded-lg bg-emergency-tint p-4 text-emergency-ink">
              <p className="flex items-center gap-2 text-title-3 font-semibold">
                <OctagonAlert size={22} aria-hidden /> {t('symptoms.redFlagAsk', { flag: pickLang(FLAG_TEXT[f], i18n.language) })}
              </p>
            </div>
          ))}
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                // "No": not an emergency now, but still seen today.
                const declined = ask;
                setAsk([]);
                finish({}, declined);
              }}
            >
              {t('info.no')}
            </Button>
            <Button
              variant="emergency"
              onClick={() => {
                const confirmed = Object.fromEntries(ask.map((f) => [f, true])) as Partial<Record<RedFlag, boolean>>;
                setAsk([]);
                finish(confirmed);
              }}
            >
              {t('info.yes')}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
