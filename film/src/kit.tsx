import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, F, GRAD, MARK, prog } from './theme';

/** Soft drifting colour fields on a pale ground, like light through frosted glass. */
export function Mesh({ base = C.bg, blobs = [C.blue, C.violet, C.teal], strength = 0.32 }: { base?: string; blobs?: string[]; strength?: number }) {
  const f = useCurrentFrame();
  const spots = [
    { x: 18 + Math.sin(f / 60) * 6, y: 26 + Math.cos(f / 70) * 6, s: 46 },
    { x: 82 + Math.cos(f / 55) * 5, y: 30 + Math.sin(f / 50) * 7, s: 40 },
    { x: 60 + Math.sin(f / 65) * 8, y: 88 + Math.cos(f / 60) * 4, s: 50 },
  ];
  return (
    <AbsoluteFill style={{ background: base }}>
      {spots.map((p, i) => (
        <AbsoluteFill key={i} style={{ background: `radial-gradient(${p.s}% ${p.s * 1.4}% at ${p.x}% ${p.y}%, ${blobs[i % blobs.length]} 0%, transparent 70%)`, opacity: strength }} />
      ))}
    </AbsoluteFill>
  );
}

/** Text filled with the brand gradient. */
export function Grad({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', ...style }}>{children}</span>;
}

/** Italic serif accent word, the film's signature emphasis. */
export function Em({ children, color = C.blue }: { children: ReactNode; color?: string }) {
  return <span style={{ fontFamily: F.serif, fontStyle: 'italic', fontWeight: 400, color, letterSpacing: '-0.01em' }}>{children}</span>;
}

/**
 * Kinetic word swaps: each entry takes the stage at its frame and hands over to the next with a
 * quick blur-rise, so only one phrase is ever on screen.
 */
export function Swap({ items, size = 104, color = C.ink, style }: { items: { at: number; node: ReactNode }[]; size?: number; color?: string; style?: CSSProperties }) {
  const f = useCurrentFrame();
  const idx = items.reduce((k, it, i) => (f >= it.at ? i : k), -1);
  if (idx < 0) return null;
  const it = items[idx]!;
  const next = items[idx + 1];
  const tin = prog(f, it.at, 9);
  const tout = next ? prog(f, next.at - 4, 4) : 0;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', ...style }}>
      <div style={{ fontFamily: F.sans, fontSize: size, fontWeight: 600, letterSpacing: '-0.035em', color, textAlign: 'center', lineHeight: 1.08, opacity: tin * (1 - tout), transform: `translateY(${(1 - tin) * 28 - tout * 18}px) scale(${0.97 + tin * 0.03})`, filter: `blur(${(1 - tin) * 10 + tout * 8}px)` }}>
        {it.node}
      </div>
    </AbsoluteFill>
  );
}

/** One line that rises in as a whole, for headings above a card. */
export function Rise({ children, at = 0, dur = 12, style }: { children: ReactNode; at?: number; dur?: number; style?: CSSProperties }) {
  const f = useCurrentFrame();
  const t = prog(f, at, dur);
  return <div style={{ opacity: t, transform: `translateY(${(1 - t) * 26}px)`, filter: `blur(${(1 - t) * 8}px)`, ...style }}>{children}</div>;
}

/** Headline zone at the top third of the frame, so it never meets the card below it. */
export function Headline({ children, at = 0, top = 120, size = 72 }: { children: ReactNode; at?: number; top?: number; size?: number }) {
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0, textAlign: 'center', fontFamily: F.sans, fontSize: size, fontWeight: 600, letterSpacing: '-0.035em', color: C.ink }}>
      <Rise at={at}>{children}</Rise>
    </div>
  );
}

export const cardShadow = '0 40px 90px -40px rgba(30,50,120,0.45), 0 12px 30px -18px rgba(30,50,120,0.25), 0 0 0 1px rgba(17,24,39,0.06)';

/** The film's main stage: a white card that settles from a tilted, slightly blurred approach and keeps drifting. */
export function Card({ children, width, height, at = 0, top, style, glow = C.blue }: { children: ReactNode; width: number; height: number; at?: number; top?: number; style?: CSSProperties; glow?: string }) {
  const f = useCurrentFrame();
  const { height: H } = useVideoConfig();
  const t = prog(f, at, 18);
  const drift = interpolate(f, [at, at + 120], [0, 1]);
  return (
    <div style={{ position: 'absolute', left: '50%', top: top ?? (H - height) / 2, width, height, marginLeft: -width / 2, perspective: 1800 }}>
      <div style={{ width: '100%', height: '100%', borderRadius: 34, background: C.card, boxShadow: `${cardShadow}, 0 0 120px -50px ${glow}`, overflow: 'hidden', opacity: t, transform: `translateY(${(1 - t) * 80}px) rotateX(${(1 - t) * 18}deg) scale(${0.94 + t * 0.06 + drift * 0.02})`, filter: t < 1 ? `blur(${(1 - t) * 10}px)` : undefined, transformOrigin: '50% 100%', ...style }}>
        {children}
      </div>
    </div>
  );
}

/** Faint repeated word pattern behind a centred headline. */
export function WordWall({ word, rows = 7, color = 'rgba(17,24,39,0.045)' }: { word: string; rows?: number; color?: string }) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: 'center', gap: 4, overflow: 'hidden' }}>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ whiteSpace: 'nowrap', fontFamily: F.sans, fontStyle: 'italic', fontWeight: 500, fontSize: 96, letterSpacing: '-0.03em', color, transform: `translateX(${(r % 2 ? -1 : 1) * (f * 1.4) - 300}px)` }}>
          {Array.from({ length: 8 }, () => word).join('   ')}
        </div>
      ))}
      {/* A clear zone in the middle keeps the headline clean. */}
      <AbsoluteFill style={{ background: 'radial-gradient(48% 22% at 50% 52%, rgba(243,245,249,0.97) 0%, rgba(243,245,249,0.85) 55%, transparent 100%)' }} />
    </AbsoluteFill>
  );
}

/** Deep-blue curved 3D surface with specular edges (the film's dramatic beats). */
export function DeepSurface({ tint = C.deep }: { tint?: string }) {
  const f = useCurrentFrame();
  const sway = Math.sin(f / 40) * 18;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 40%, ${tint} 0%, #04103f 75%)` }}>
      <svg viewBox="0 0 1920 1080" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="ds-a" x1="0" x2="1"><stop offset="0" stopColor="#2c5bff" /><stop offset="1" stopColor="#0b1f8a" /></linearGradient>
          <linearGradient id="ds-edge" x1="0" x2="1"><stop offset="0" stopColor="#ffffff" stopOpacity="0" /><stop offset="0.6" stopColor="#cfe0ff" stopOpacity="0.9" /><stop offset="1" stopColor="#ffffff" stopOpacity="0.2" /></linearGradient>
        </defs>
        <path d={`M0 0 H1920 V${150 + sway} Q960 ${330 - sway} 0 ${120 + sway} Z`} fill="url(#ds-a)" opacity="0.9" />
        <path d={`M0 ${120 + sway} Q960 ${330 - sway} 1920 ${150 + sway}`} stroke="url(#ds-edge)" strokeWidth="3" fill="none" />
        <path d={`M0 1080 H1920 V${880 - sway} Q1000 ${790 + sway} 0 ${960 - sway} Z`} fill="url(#ds-a)" opacity="0.85" />
        <path d={`M0 ${960 - sway} Q1000 ${790 + sway} 1920 ${880 - sway}`} stroke="url(#ds-edge)" strokeWidth="3" fill="none" />
      </svg>
    </AbsoluteFill>
  );
}

/** Dark teal room with slow light rays, for the closing card. */
export function Rays() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(90% 80% at 50% 30%, #10474d 0%, ${C.deepTeal} 55%, #031416 100%)`, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: 'repeating-conic-gradient(from 200deg at 20% -10%, rgba(255,255,255,0.10) 0deg 4deg, transparent 4deg 13deg)', filter: 'blur(18px)', opacity: 0.8, transform: `rotate(${Math.sin(f / 80) * 2}deg) scale(1.2)` }} />
    </AbsoluteFill>
  );
}

/** Frosted-glass pill. */
export function GlassPill({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 18, padding: '24px 44px', borderRadius: 999, background: 'rgba(255,255,255,0.10)', border: '1.5px solid rgba(255,255,255,0.35)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 20px 60px -20px rgba(0,0,0,0.6)', backdropFilter: 'blur(14px)', color: '#fff', fontFamily: F.sans, fontWeight: 500, fontSize: 48, letterSpacing: '-0.01em', ...style }}>
      {children}
    </div>
  );
}

export function Mark({ size = 120, color = C.ink, draw = 1, fill = 1 }: { size?: number; color?: string; draw?: number; fill?: number }) {
  return (
    <svg width={size} height={(size * 82) / 88} viewBox="-2 -2 92 86" style={{ overflow: 'visible', flexShrink: 0 }}>
      <path d={MARK} fill={color} fillOpacity={fill} stroke={color} strokeWidth={1.6} pathLength={100} strokeDasharray={100} strokeDashoffset={100 - draw * 100} strokeLinejoin="round" />
    </svg>
  );
}

/** Spinner that turns into a check when `done`. */
export function Tick({ done, color = C.green }: { done: number; color?: string }) {
  const f = useCurrentFrame();
  return (
    <svg width="40" height="40" viewBox="0 0 40 40">
      {done < 1 ? (
        Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2 + f / 4;
          return <line key={i} x1={20 + Math.cos(a) * 8} y1={20 + Math.sin(a) * 8} x2={20 + Math.cos(a) * 15} y2={20 + Math.sin(a) * 15} stroke={C.violet} strokeWidth="3" strokeLinecap="round" opacity={0.25 + (i / 8) * 0.75} />;
        })
      ) : (
        <>
          <circle cx="20" cy="20" r="18" fill={color} />
          <path d="M12 20.5l5.5 5.5L28.5 14.5" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.min(1, (done - 1) * 4 + 1)} />
        </>
      )}
    </svg>
  );
}

/** Very light grain so flat gradients don't band. */
export function Finish() {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const seed = Math.floor(f / 2) % 6;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0, opacity: 0.045, mixBlendMode: 'overlay' }}>
        <filter id={`grain${seed}`}><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={seed} stitchTiles="stitch" /></filter>
        <rect width="100%" height="100%" filter={`url(#grain${seed})`} />
      </svg>
    </AbsoluteFill>
  );
}

/** Cursor that glides to a point and clicks. */
export function Cursor({ from, to, at, click }: { from: [number, number]; to: [number, number]; at: number; click: number }) {
  const f = useCurrentFrame();
  const t = prog(f, at, 16);
  const x = from[0] + (to[0] - from[0]) * t;
  const y = from[1] + (to[1] - from[1]) * t;
  const press = f >= click && f < click + 5 ? 0.85 : 1;
  const ring = prog(f, click, 12);
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `scale(${press})`, opacity: prog(f, at - 4, 6), zIndex: 5 }}>
      {f >= click && <div style={{ position: 'absolute', left: -30, top: -30, width: 60, height: 60, borderRadius: 99, border: `3px solid ${C.blue}`, transform: `scale(${0.4 + ring})`, opacity: 1 - ring }} />}
      <svg width="40" height="40" viewBox="0 0 24 24" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))' }}><path d="M4 3l7 17 2.5-7L21 10.5z" fill="#111" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
    </div>
  );
}
