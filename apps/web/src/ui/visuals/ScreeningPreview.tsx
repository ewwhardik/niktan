import { useState } from 'react';
import { motion, useReducedMotion, useTransform, type MotionValue } from 'motion/react';
import { Activity, Eye, IdCard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './screening-preview.css';

// Project a gently twisted torus onto the optical plane. Each loop follows its surface.
const loops = Array.from({ length: 84 }, (_, i) => {
  const u = i * Math.PI / 42;
  const points = Array.from({ length: 49 }, (_, j) => {
    const v = j * Math.PI / 24 + u;
    const radius = 129 + 29 * Math.cos(v) + 14 * Math.sin(3 * u);
    const x = radius * Math.cos(u);
    const y = radius * Math.sin(u);
    const z = 36 * Math.sin(v) + 22 * Math.cos(2 * u);
    return (j ? 'L' : 'M') + (200 + x * .94 - y * .32).toFixed(1) + ' ' + (140 + x * .19 + y * .55 - z * .8).toFixed(1);
  });
  return points.join('') + 'Z';
});
const modes = [
  { label: 'card.hr', icon: Activity }, { label: 'card.visionRow', icon: Eye }, { label: 'card.title', icon: IdCard },
];

export function ScreeningPreview({ progress }: { progress: MotionValue<number> }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState(0);
  const reduce = useReducedMotion();
  const turn = useTransform(progress, [0, 1], reduce ? [0, 0] : [-8, 24]);
  const sweep = useTransform(progress, [0, .8], reduce ? ['34%', '34%'] : ['26%', '54%']);
  return (
    <section className="screening-preview" aria-label={t('home.example')}>
      <div className="preview-caption"><span className="preview-lamp" />NikTan <span> / </span>{t('home.example')}</div>
      <div className="preview-optics">
        <motion.svg className="preview-field" viewBox="0 0 400 280" aria-hidden style={{ rotate: turn }}>
          <defs><linearGradient id="optical-ink" x2="1" y2=".7" gradientUnits="objectBoundingBox">
            <stop stopColor="#83ffe5"/><stop offset=".43" stopColor="#9bb6ff"/><stop offset=".7" stopColor="#cc93ff"/><stop offset="1" stopColor="#706fff"/>
          </linearGradient></defs>
          <g fill="none" stroke="url(#optical-ink)" strokeWidth=".9">
            {loops.map((d, i) => <path key={i} d={d} />)}
          </g>
        </motion.svg>
        {mode === 0 && <div className="preview-portrait">
          <img src="/art/screening-fold.webp" width="1050" height="788" alt={t('design.screeningArt')} fetchPriority="high" />
          <motion.span aria-hidden className="hero-scan" style={{ top: sweep }} />
        </div>}
        {mode === 1 && <div className="preview-lens" aria-hidden><span>E</span></div>}
        {mode === 2 && <div className="preview-paper">
          <div className="flex items-center justify-between"><img src="/brand/niktan-mark.svg" width="23" height="23" alt=""/><IdCard size={21} aria-hidden /></div>
          <strong>{t('card.title')}</strong><div className="preview-card-row"><Activity size={16}/>72 bpm</div><div className="preview-card-row"><Eye size={16}/>6/9</div>
        </div>}
      </div>
      <div className="preview-reading" aria-live="polite"><span>{t(modes[mode]!.label)}</span><strong>{mode === 0 ? '72 bpm' : mode === 1 ? '6/9' : t('card.routine')}</strong></div>
      <div className="preview-controls" role="group" aria-label={t('home.example')}>
        {modes.map(({ label, icon: Icon }, i) => <button key={label} type="button" aria-pressed={mode === i} onClick={() => setMode(i)}>
          <Icon size={17} aria-hidden/><span>{t(label)}</span>
        </button>)}
      </div>
    </section>
  );
}
