import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { StepKey } from '../visuals/StepVisual';

/**
 * Looping mini-app screens for the 3D phone on the home page: each one plays like a short screen
 * recording of that NikTan step. Drawn at 390 × 812 CSS px. Time comes from one rAF loop at ~30 fps.
 */

function useLoop(periodMs: number): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const start = performance.now();
    const tick = (now: number) => {
      if (now - last > 33) {
        last = now;
        setT(((now - start) % periodMs) / periodMs);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [periodMs]);
  return t;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
/** 0 → 1 between a and b of the loop, eased. */
const seg = (t: number, a: number, b: number) => {
  const x = clamp((t - a) / (b - a));
  return 1 - (1 - x) ** 3;
};
const mono: CSSProperties = { fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '0.14em', textTransform: 'uppercase' };

function Label({ children, color = 'rgba(255,255,255,0.55)', style }: { children: ReactNode; color?: string; style?: CSSProperties }) {
  return <div style={{ ...mono, fontSize: 12, color, ...style }}>{children}</div>;
}

const ppg = (p: number) => Math.exp(-((p - 0.18) ** 2) / 0.006) + 0.35 * Math.exp(-((p - 0.45) ** 2) / 0.01);

function FaceScreen({ accent }: { accent: string }) {
  const t = useLoop(6000);
  const time = t * 6;
  const beat = ppg((time % 0.83) / 0.83);
  const progress = seg(t, 0.05, 0.85);
  const bpm = Math.round(58 + 14 * seg(t, 0.15, 0.6));
  const ringC = 2 * Math.PI * 128;
  // Face-shaped point cloud: rows across an oval, narrowing towards the chin.
  const dots: [number, number][] = [];
  for (let y = -150; y <= 150; y += 15) {
    const half = 105 * Math.sqrt(Math.max(0, 1 - (y / 160) ** 2)) * (y > 40 ? 1 - (y - 40) / 300 : 1);
    for (let x = -half; x <= half; x += 15) dots.push([x, y]);
  }
  const sweep = -150 + ((time * 120) % 300);
  const trace = Array.from({ length: 80 }, (_, i) => {
    const p = ((time - (80 - i) * 0.03) % 0.83 + 0.83) % 0.83 / 0.83;
    return `${i * 4.2},${60 - ppg(p) * 46}`;
  }).join(' ');
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 108 }}>
      <svg width="300" height="330" viewBox="-150 -165 300 330">
        <circle r="128" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" transform="scale(1.02 1.25)" />
        <circle r="128" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" strokeDasharray={ringC} strokeDashoffset={ringC * (1 - progress)} transform="scale(1.02 1.25) rotate(-90)" />
        {[[0, -95, 62, 24], [-58, 30, 30, 26], [58, 30, 30, 26]].map(([x, y, rx, ry], i) => (
          <ellipse key={i} cx={x} cy={y} rx={rx} ry={ry} fill={accent} opacity={0.12 + beat * 0.5} style={{ filter: 'blur(8px)' }} />
        ))}
        {dots.map(([x, y], i) => {
          const near = Math.abs(y - sweep) < 22 ? 1 - Math.abs(y - sweep) / 22 : 0;
          return <circle key={i} cx={x} cy={y} r={1.6 + near * 1.2} fill={near > 0.2 ? '#9ff0ff' : '#ffffff'} opacity={0.22 + near * 0.7} />;
        })}
        <rect x="-118" y={sweep - 1} width="236" height="2" rx="1" fill="#64d2ff" opacity="0.8" />
      </svg>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 64, fontWeight: 700, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{bpm}</span>
        <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.6)' }}>bpm</span>
      </div>
      <svg width="336" height="70" style={{ marginTop: 6 }}><polyline points={trace} fill="none" stroke={accent} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /></svg>
      <div style={{ marginTop: 8, padding: '8px 16px', borderRadius: 99, background: 'rgba(255,255,255,0.08)', fontSize: 14 }}>
        {progress < 1 ? 'Hold still · reading your pulse' : 'Pulse locked'}
      </div>
    </div>
  );
}

function EyeScreen({ accent }: { accent: string }) {
  const t = useLoop(6000);
  const lock = seg(t, 0.05, 0.25);
  const flash = t > 0.3 && t < 0.4 ? 1 - Math.abs(t - 0.35) / 0.05 : 0;
  const results = [
    { n: 'Anaemia', at: 0.45 },
    { n: 'Jaundice', at: 0.55 },
    { n: 'Cataract', at: 0.65 },
  ];
  const b = 92 - lock * 22;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 120 }}>
      <svg width="320" height="220" viewBox="-160 -110 320 220">
        <defs>
          <radialGradient id="ps-iris" r="0.5"><stop offset="0.3" stopColor="#140b06" /><stop offset="0.75" stopColor="#6a3e1c" /><stop offset="1" stopColor="#2a160a" /></radialGradient>
          <radialGradient id="ps-sclera" r="0.6"><stop offset="0.5" stopColor="#f2ede4" /><stop offset="1" stopColor="#b9b0a2" /></radialGradient>
          <clipPath id="ps-lid"><path d="M-140 0 Q0 -105 140 0 Q0 95 -140 0Z" /></clipPath>
        </defs>
        <path d="M-140 0 Q0 -105 140 0 Q0 95 -140 0Z" fill="url(#ps-sclera)" />
        <g clipPath="url(#ps-lid)">
          <circle r="50" fill="url(#ps-iris)" />
          {Array.from({ length: 24 }, (_, i) => <line key={i} x1="0" y1="0" x2={Math.cos(i / 3.82) * 48} y2={Math.sin(i / 3.82) * 48} stroke="#8a5a2e" strokeOpacity="0.35" strokeWidth="1" />)}
          <circle r={18 - lock * 4} fill="#050505" />
          <circle cx="-14" cy="-16" r="7" fill="#fff" opacity="0.9" />
        </g>
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => (
          <path key={i} d={`M${sx! * b} ${sy! * (b - 18)} v${-sy! * 18} M${sx! * b} ${sy! * (b - 18)} h${-sx! * 18}`} transform={`translate(0 ${sy! * 0})`} stroke={accent} strokeWidth="3.5" strokeLinecap="round" fill="none" opacity={0.4 + lock * 0.6} />
        ))}
      </svg>
      <Label color={accent} style={{ marginTop: 4, opacity: lock }}>{lock > 0.95 ? 'Iris locked' : 'Finding your eyes'}</Label>
      <div style={{ marginTop: 26, width: 310, borderRadius: 22, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        {results.map((r, i) => {
          const done = t > r.at;
          return (
            <div key={r.n} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 18px', borderTop: i ? '1px solid rgba(255,255,255,0.08)' : 'none', opacity: t > 0.4 ? 1 : 0.35 }}>
              <span style={{ width: 26, height: 26, borderRadius: 99, display: 'grid', placeItems: 'center', background: done ? '#30d158' : 'transparent', border: done ? 'none' : `2.5px solid rgba(255,255,255,0.25)`, borderTopColor: done ? undefined : accent, transform: done ? 'none' : `rotate(${t * 2160}deg)` }}>
                {done && <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7.5l2.6 2.6L11 4.5" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" /></svg>}
              </span>
              <span style={{ flex: 1, fontSize: 17, fontWeight: 600 }}>{r.n}</span>
              <span style={{ fontSize: 13, color: done ? '#30d158' : 'rgba(255,255,255,0.45)' }}>{done ? 'No flag' : 'Reading…'}</span>
            </div>
          );
        })}
      </div>
      {/* The screen lights the eyes like a flash. */}
      <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: flash * 0.9, pointerEvents: 'none' }} />
    </div>
  );
}

const DIRS = [0, 90, 180, 270];
function EGlyph({ size, rot, color = '#000' }: { size: number; rot: number; color?: string }) {
  const u = size / 5;
  return (
    <svg width={size} height={size} style={{ transform: `rotate(${rot}deg)`, transition: 'transform 0.2s' }}>
      <g fill={color}><rect width={u} height={size} /><rect width={size} height={u} /><rect y={2 * u} width={size} height={u} /><rect y={4 * u} width={size} height={u} /></g>
    </svg>
  );
}

function VisionScreen({ accent }: { accent: string }) {
  const t = useLoop(6400);
  const levels = [{ s: 120, l: '6/60' }, { s: 84, l: '6/36' }, { s: 56, l: '6/18' }, { s: 36, l: '6/12' }, { s: 26, l: '6/9' }];
  const k = Math.min(levels.length - 1, Math.floor(t * levels.length));
  const local = t * levels.length - k;
  const rot = DIRS[(k * 3 + 1) % 4]!;
  const pressed = local > 0.55 && local < 0.8;
  const arrows: [number, string, CSSProperties][] = [
    [270, 'M12 4l-7 8h14z', { gridColumn: 2, gridRow: 1 }],
    [180, 'M4 12l8-7v14z', { gridColumn: 1, gridRow: 2 }],
    [0, 'M20 12l-8-7v14z', { gridColumn: 3, gridRow: 2 }],
    [90, 'M12 20l-7-8h14z', { gridColumn: 2, gridRow: 3 }],
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 112 }}>
      <div style={{ width: 290, height: 250, borderRadius: 28, background: '#fff', display: 'grid', placeItems: 'center', position: 'relative', boxShadow: `0 0 60px -20px ${accent}` }}>
        <div style={{ opacity: local < 0.85 ? 1 : 1 - (local - 0.85) / 0.15, transform: `scale(${0.92 + Math.min(1, local * 4) * 0.08})` }}>
          <EGlyph size={levels[k]!.s} rot={rot} />
        </div>
        <span style={{ position: 'absolute', right: 16, bottom: 12, ...mono, fontSize: 12, color: '#8a8b90' }}>{levels[k]!.l}</span>
      </div>
      <div style={{ marginTop: 18, display: 'flex', gap: 6 }}>
        {levels.map((_, i) => <span key={i} style={{ width: 34, height: 6, borderRadius: 99, background: i < k || (i === k && pressed) ? accent : 'rgba(255,255,255,0.15)' }} />)}
      </div>
      <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(3, 70px)', gridTemplateRows: 'repeat(3, 70px)', gap: 8 }}>
        {arrows.map(([dir, d, pos]) => {
          const on = pressed && dir === rot;
          return (
            <span key={dir} style={{ ...pos, borderRadius: 20, display: 'grid', placeItems: 'center', background: on ? accent : 'rgba(255,255,255,0.08)', transform: on ? 'scale(0.92)' : 'none', transition: 'all 0.12s' }}>
              <svg width="26" height="26" viewBox="0 0 24 24"><path d={d} fill="#fff" /></svg>
            </span>
          );
        })}
        <span style={{ gridColumn: 2, gridRow: 2, borderRadius: 20, display: 'grid', placeItems: 'center', fontSize: 11, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.04)' }}>Can&apos;t see</span>
      </div>
      <Label style={{ marginTop: 18 }}>Right eye · card-calibrated</Label>
    </div>
  );
}

function HearingScreen({ accent }: { accent: string }) {
  const t = useLoop(6000);
  const time = t * 6;
  const digits = ['३', '७', '२'];
  const shown = digits.filter((_, i) => t > 0.12 + i * 0.14).length;
  const typed = [3, 7, 2].filter((_, i) => t > 0.55 + i * 0.08);
  const pass = t > 0.85;
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '✓'];
  const lastKey = typed[typed.length - 1];
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 110 }}>
      <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: 90 }}>
        {Array.from({ length: 34 }, (_, i) => {
          const h = 14 + Math.abs(Math.sin(time * 3.1 + i * 0.7) * Math.cos(time * 1.7 + i * 0.31)) * 66;
          return <span key={i} style={{ width: 5, height: h, borderRadius: 4, background: i % 6 === 2 ? accent : 'rgba(255,255,255,0.32)' }} />;
        })}
      </div>
      <div style={{ marginTop: 18, display: 'flex', gap: 14 }}>
        {digits.map((d, i) => (
          <span key={i} style={{ width: 74, height: 86, borderRadius: 20, background: 'rgba(255,255,255,0.08)', display: 'grid', placeItems: 'center', fontSize: 46, fontWeight: 600, fontFamily: '"Noto Sans Devanagari", Inter, sans-serif', opacity: i < shown ? 1 : 0.15, transform: i < shown ? 'none' : 'translateY(8px)', transition: 'all 0.25s' }}>{i < shown ? d : ''}</span>
        ))}
      </div>
      <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(3, 80px)', gap: 8 }}>
        {keys.map((key) => {
          const on = key === lastKey && t < 0.85;
          return (
            <span key={String(key)} style={{ height: 50, borderRadius: 14, display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 600, background: on ? accent : 'rgba(255,255,255,0.07)', color: on ? '#000' : '#fff' }}>{key}</span>
          );
        })}
      </div>
      <div style={{ marginTop: 18, padding: '8px 16px', borderRadius: 99, fontSize: 14, fontWeight: 600, background: pass ? '#30d15833' : 'rgba(255,255,255,0.08)', color: pass ? '#30d158' : 'rgba(255,255,255,0.7)' }}>
        {pass ? '✓ Pass · −9 dB SNR' : `Typed: ${typed.join(' ') || '…'}`}
      </div>
    </div>
  );
}

function SymptomsScreen({ accent }: { accent: string }) {
  const t = useLoop(7000);
  const time = t * 7;
  const phrase = Array.from('3 दिन से बुखार है और खाँसी');
  const typed = phrase.slice(0, Math.floor(seg(t, 0.08, 0.45) * phrase.length)).join('');
  const listening = t < 0.48;
  const chips = [{ n: 'Fever · 3 days', at: 0.55 }, { n: 'Cough', at: 0.62 }];
  const check = seg(t, 0.75, 0.85);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 124 }}>
      <div style={{ position: 'relative', width: 180, height: 180, display: 'grid', placeItems: 'center' }}>
        {listening && [0, 1, 2].map((i) => {
          const p = ((time * 0.6 + i / 3) % 1);
          return <span key={i} style={{ position: 'absolute', width: 96 + p * 90, height: 96 + p * 90, borderRadius: 999, border: `2px solid ${accent}`, opacity: (1 - p) * 0.7 }} />;
        })}
        <span style={{ width: 96, height: 96, borderRadius: 99, background: '#fff', display: 'grid', placeItems: 'center', boxShadow: `0 0 ${listening ? 40 : 10}px ${accent}`, transform: `scale(${listening ? 1 + Math.sin(time * 9) * 0.03 : 1})` }}>
          <svg width="40" height="40" viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0M12 17v4" stroke="#000" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
        </span>
      </div>
      <Label color={listening ? accent : 'rgba(255,255,255,0.5)'} style={{ marginTop: 10 }}>{listening ? 'Listening' : 'Understood'}</Label>
      <div style={{ marginTop: 16, minHeight: 64, width: 320, textAlign: 'center', fontSize: 24, fontWeight: 500, fontFamily: '"Noto Sans Devanagari", Inter, sans-serif', lineHeight: 1.35 }}>
        “{typed}<span style={{ opacity: listening && Math.floor(time * 3) % 2 ? 1 : 0 }}>|</span>”
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
        {chips.map((c) => {
          const p = seg(t, c.at, c.at + 0.08);
          return <span key={c.n} style={{ padding: '10px 16px', borderRadius: 99, background: `${accent}2e`, border: `1px solid ${accent}66`, fontSize: 15, fontWeight: 600, opacity: p, transform: `translateY(${(1 - p) * 16}px) scale(${0.9 + p * 0.1})` }}>✓ {c.n}</span>;
        })}
      </div>
      <div style={{ marginTop: 22, width: 310, padding: '14px 18px', borderRadius: 18, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12, opacity: check, transform: `translateY(${(1 - check) * 14}px)` }}>
        <span style={{ width: 26, height: 26, borderRadius: 99, background: '#30d158', display: 'grid', placeItems: 'center', fontSize: 14, color: '#fff' }}>✓</span>
        <span style={{ fontSize: 15 }}>Chest pain or breathlessness? <b>No</b></span>
      </div>
    </div>
  );
}

export function PhoneScreen({ step, accent }: { step: StepKey; accent: string }) {
  const S = { face: FaceScreen, eye: EyeScreen, vision: VisionScreen, hearing: HearingScreen, symptoms: SymptomsScreen }[step];
  return <S accent={accent} />;
}
