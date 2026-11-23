import { Play } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const film = '/media/before-the-waiting-room';

export function ProductFilm() {
  const { t } = useTranslation();
  const player = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  function play() {
    const video = player.current;
    if (!video) return;
    const supportsMp4 = video.canPlayType('video/mp4; codecs="avc1.64002a, mp4a.40.2"');
    video.src = film + (supportsMp4 ? '.mp4' : '.webm');
    setStarted(true);
    video.focus();
    // Native controls also allow a second attempt if the browser blocks playback.
    void video.play().catch(() => undefined);
  }

  return (
    <section id="film" aria-label={t('film.title')} className="mx-auto max-w-[1240px] scroll-mt-24 px-5 py-10 md:px-10 md:py-16">
      <div className="relative isolate aspect-video overflow-hidden rounded-[20px] bg-[#091d20] shadow-[0_18px_55px_-30px_#0c303a80] md:rounded-[32px]">
        <video ref={player} controls={started} playsInline preload="none" poster={film + '.webp'}
          tabIndex={started ? 0 : -1} aria-label={t('film.title')} className="block h-full w-full">
          <track kind="captions" src={film + '.en.vtt'} srcLang="en" label="English" />
        </video>
        {!started && (
          <button onClick={play} aria-label={t('film.play')} className="group absolute inset-0 cursor-pointer rounded-[inherit] text-left focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-white">
            <span className="absolute bottom-[12%] left-[5.2%] inline-flex items-center gap-2.5 rounded-full bg-[#fff8e9] px-3 py-2 text-xs font-semibold text-[#142e2e] shadow-lg transition-transform group-hover:scale-105 motion-reduce:transition-none sm:px-5 sm:py-3 sm:text-base">
              <Play size={15} fill="currentColor" aria-hidden /> {t('film.watch')}
              <span className="border-l border-[#28433d]/25 pl-2.5 tabular-nums">1:26</span>
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
