import { Square, Volume2 } from 'lucide-react';
import { useIsPresent } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import type { ScreeningStep } from '../../state/scan';

export function VoiceGuide({ step }: { step: ScreeningStep }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const present = useIsPresent();
  const button = useRef<HTMLButtonElement>(null);
  const cancel = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  function stop() {
    const dispose = cancel.current;
    cancel.current = null;
    dispose?.();
    setPlaying(false);
  }

  useLayoutEffect(() => {
    stop();
    setFailed(false);

    function onInteraction(event: Event) {
      if (cancel.current && !button.current?.contains(event.target as Node)) stop();
    }

    function onVisibilityChange() {
      if (document.hidden) stop();
    }

    document.addEventListener('pointerdown', onInteraction, true);
    document.addEventListener('click', onInteraction, true);
    document.addEventListener('keydown', onInteraction, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('pointerdown', onInteraction, true);
      document.removeEventListener('click', onInteraction, true);
      document.removeEventListener('keydown', onInteraction, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const dispose = cancel.current;
      cancel.current = null;
      dispose?.();
    };
  }, [location.key, i18n.language, present]);

  async function toggle() {
    if (cancel.current) {
      stop();
      return;
    }
    setFailed(false);
    setPlaying(true);

    let dispose: (() => void) | null = null;
    const complete = (error = false) => {
      if (dispose && cancel.current !== dispose) return;
      stop();
      setFailed(error);
    };

    try {
      if (i18n.language === 'en') {
        const synth = window.speechSynthesis;
        const utterance = new SpeechSynthesisUtterance(t(`voiceGuide.${step}`));
        utterance.lang = 'en-IN';
        utterance.onend = () => complete();
        utterance.onerror = () => complete(true);
        dispose = () => synth.cancel();
        cancel.current = dispose;
        synth.speak(utterance);
        return;
      }

      // Fetch the whole file so the service-worker precache can serve it offline without range requests.
      const audio = new AudioContext();
      const request = new AbortController();
      dispose = () => {
        request.abort();
        void audio.close();
      };
      cancel.current = dispose;
      const [, response] = await Promise.all([
        audio.resume(),
        fetch(`${import.meta.env.BASE_URL}audio/guide/hi/${step}.wav`, { signal: request.signal }),
      ]);
      if (!response.ok) throw new Error('Guide audio unavailable');
      const data = await audio.decodeAudioData(await response.arrayBuffer());
      if (cancel.current !== dispose) return;
      const source = audio.createBufferSource();
      source.buffer = data;
      source.connect(audio.destination);
      source.onended = () => complete();
      source.start();
    } catch {
      complete(true);
    }
  }

  const Icon = playing ? Square : Volume2;
  return (
    <div className="flex flex-wrap items-center gap-x-3">
      <button
        ref={button}
        type="button"
        disabled={!present}
        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent-soft px-3 text-label font-medium text-accent-soft-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onClick={() => void toggle()}
      >
        <Icon size={18} aria-hidden />
        {t(playing ? 'voiceGuide.stop' : 'voiceGuide.listen')}
      </button>
      {failed && <p role="status" className="text-caption text-text-3">{t('voiceGuide.unavailable')}</p>}
    </div>
  );
}
