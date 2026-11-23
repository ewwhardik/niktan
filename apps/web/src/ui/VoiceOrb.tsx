import { motion } from 'motion/react';

/** Layered, softly morphing orb that swells with the speaker's voice level (0..1). */
export function VoiceOrb({ level, active }: { level: number; active: boolean }) {
  const s = active ? 1 + level * 0.55 : 1;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute size-full rounded-[46%]"
          style={{
            background: i === 0 ? 'radial-gradient(circle at 35% 30%, #64D2FF, #0a84ff 55%, transparent 72%)' : i === 1 ? 'radial-gradient(circle at 65% 65%, #5EF0C8, transparent 65%)' : 'radial-gradient(circle at 50% 50%, #bf5af2, transparent 60%)',
            filter: 'blur(14px)',
            mixBlendMode: 'screen',
          }}
          animate={{ rotate: active ? [0, 360] : 0, scale: active ? s * (1 - i * 0.08) : 0.7, opacity: active ? 0.9 : 0 }}
          transition={{ rotate: { duration: 6 + i * 2, repeat: Infinity, ease: 'linear' }, scale: { type: 'spring', stiffness: 260, damping: 18 }, opacity: { duration: 0.3 } }}
        />
      ))}
    </div>
  );
}
