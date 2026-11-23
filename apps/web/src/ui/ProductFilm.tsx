import { Play } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Launch film, rendered from /film (Remotion). H.264 MP4 plays in every current browser. */
const film = '/media/niktan-launch';

/** `inHero` drops the section's own outer padding when it sits inside the hero. */
export function ProductFilm({ inHero = false }: { inHero?: boolean }) {
  const { t } = useTranslation();
  const player = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  function play() {
    const video = player.current;
    if (!video) return;
    video.src = film + '.mp4';
    setStarted(true);
    video.focus();
    // Native controls also allow a second attempt if the browser blocks playback.
    void video.play().catch(() => undefined);
  }

  return (
    <section id="film" aria-label={t('film.title')} className={inHero ? 'mx-auto mt-10 max-w-[1080px] scroll-mt-24 md:mt-14' : 'mx-auto max-w-[1240px] scroll-mt-24 px-5 py-10 md:px-10 md:py-16'}>
      <div className="relative isolate aspect-video overflow-hidden rounded-[20px] bg-[#091d20] shadow-[0_18px_55px_-30px_#0c303a80] md:rounded-[32px]">
        {/* Music only, no narration, so there is no caption track. */}
        <video ref={player} controls={started} playsInline preload="none" poster={film + '.jpg'}
          tabIndex={started ? 0 : -1} aria-label={t('film.title')} className="block h-full w-full" />
        {!started && (
          <button onClick={play} aria-label={t('film.play')} className="group absolute inset-0 cursor-pointer rounded-[inherit] text-left focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-white">
            <span className="absolute bottom-[12%] left-[5.2%] inline-flex items-center gap-2.5 rounded-full bg-[#fff8e9] px-3 py-2 text-xs font-semibold text-[#142e2e] shadow-lg transition-transform group-hover:scale-105 motion-reduce:transition-none sm:px-5 sm:py-3 sm:text-base">
              <Play size={15} fill="currentColor" aria-hidden /> {t('film.watch')}
              <span className="border-l border-[#28433d]/25 pl-2.5 tabular-nums">0:36</span>
            </span>
          </button>
        )}
      </div>
      {/* CC BY 4.0 requires this credit wherever the film is shown. */}
      <p className="mt-3 text-center text-caption text-text-3">
        {t('film.music')} <a href="https://incompetech.com" target="_blank" rel="noreferrer" className="underline underline-offset-2">Kevin MacLeod</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className="underline underline-offset-2">CC BY 4.0</a>
      </p>
    </section>
  );
}
