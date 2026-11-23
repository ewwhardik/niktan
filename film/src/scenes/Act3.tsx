import type { ReactNode } from 'react';
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { DeepSurface, Em, GlassPill, Grad, Mark, Mesh, Rays, Rise, Swap, WordWall } from '../kit';
import { C, F, GRAD, prog, T } from '../theme';

function Statement({ bg, children, sub, light = false }: { bg: ReactNode; children: ReactNode; sub?: string; light?: boolean }) {
  return (
    <AbsoluteFill>
      {bg}
      <Swap size={120} color={light ? '#fff' : C.ink} items={[{ at: 0, node: children }]} />
      {sub && (
        <div style={{ position: 'absolute', top: 640, width: '100%', textAlign: 'center', fontFamily: F.sans, fontSize: 40, fontWeight: 500, color: light ? 'rgba(255,255,255,0.85)' : C.ink2 }}>
          <Rise at={4} dur={10}>{sub}</Rise>
        </div>
      )}
    </AbsoluteFill>
  );
}

/** Quick half-bar statements closing the second drop; the last one runs to the seam. */
export function Statements() {
  const cards: ReactNode[] = [
    <Statement key="a" bg={<Mesh strength={0.28} />} sub="On any phone browser. No app."><Grad>3 minutes.</Grad></Statement>,
    <Statement key="b" light bg={<AbsoluteFill style={{ background: GRAD }} />} sub="No sign-up. No name, phone or Aadhaar.">₹0 for patients.</Statement>,
    <Statement key="c" bg={<><Mesh strength={0.2} /><WordWall word="private" /></>} sub="Only numbers reach the server.">Face video stays <Em>on the phone.</Em></Statement>,
    <Statement key="d" light bg={<DeepSurface />} sub="Speak in your own words."><span style={{ fontFamily: F.deva }}>हिंदी · छत्तीसगढ़ी · English</span></Statement>,
    <Statement key="e" bg={<Mesh strength={0.22} blobs={[C.heart, C.violet, C.heart]} />} sub="Red flags skip the queue.">Emergency? <span style={{ color: C.heart }}>Call 108.</span></Statement>,
  ];
  const last = 27;
  return (
    <AbsoluteFill>
      {cards.map((c, i) => (
        <Sequence key={i} from={i * T.half} durationInFrames={i === cards.length - 1 ? last : T.half}>{c}</Sequence>
      ))}
    </AbsoluteFill>
  );
}

const FEATURES = [
  { t: 'NikTan Thali', s: 'Nutrition from a meal photo', c: C.amber },
  { t: 'Health Papers', s: 'Prescriptions, generics, lab reports', c: C.blue },
  { t: 'Sahayak', s: 'Help assistant in three languages', c: C.teal },
  { t: 'Vision and hearing', s: 'Tumbling-E, glare and digits-in-noise', c: C.violet },
  { t: 'Live triage board', s: 'Sickest first, then arrival', c: C.heart },
];

function FeatureList({ dim = 0, at = 0 }: { dim?: number; at?: number }) {
  const f = useCurrentFrame();
  return (
    <div style={{ width: '100%', height: '100%', background: '#fff', borderRadius: 34, padding: '30px 34px', boxSizing: 'border-box', fontFamily: F.sans, filter: dim ? `blur(${dim * 3}px)` : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 30, fontWeight: 700, color: C.ink }}><Mark size={30} /> NikTan</span>
        <span style={{ fontSize: 22, color: C.ink3 }}>All tools</span>
      </div>
      {FEATURES.map((x, i) => {
        const t = prog(f, at + i * 4, 10);
        return (
          <div key={x.t} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '16px 0', borderTop: `1px solid ${C.line}`, opacity: t, transform: `translateX(${(1 - t) * 30}px)` }}>
            <span style={{ width: 54, height: 54, borderRadius: 16, background: `${x.c}22`, border: `2px solid ${x.c}`, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 28, fontWeight: 600, color: C.ink }}>{x.t}</span>
              <span style={{ display: 'block', fontSize: 21, color: C.ink3 }}>{x.s}</span>
            </span>
            <span style={{ fontSize: 28, color: C.ink3 }}>›</span>
          </div>
        );
      })}
    </div>
  );
}

/** Carousel of tool cards, the centre one in focus, on a blue-violet field. */
export function Carousel() {
  const f = useCurrentFrame();
  const spin = interpolate(f, [0, 112], [10, -6]);
  const enter = prog(f, 0, 18);
  const W = 640;
  const H = 640;
  const side = (k: number) => ({
    position: 'absolute' as const,
    left: '50%',
    top: 290,
    width: W,
    height: H,
    marginLeft: -W / 2,
    transform: `translateX(${k * (560 - (1 - enter) * 120)}px) translateZ(${-260 * Math.abs(k)}px) rotateY(${-k * 38 + spin}deg)`,
    opacity: Math.abs(k) === 2 ? 0.35 * enter : Math.abs(k) === 1 ? 0.75 * enter : 1,
    boxShadow: '0 50px 100px -40px rgba(10,20,80,0.6)',
    borderRadius: 34,
  });
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(120deg, #2F6BFF 0%, #5B5CFF 45%, #9B5CFF 100%)' }}>
      <div style={{ position: 'absolute', top: 100, width: '100%', textAlign: 'center', fontFamily: F.sans, fontSize: 68, fontWeight: 600, letterSpacing: '-0.035em', color: '#fff' }}>
        <Rise at={0}>Everything before <Em color="#D9E4FF">the counter.</Em></Rise>
      </div>
      <AbsoluteFill style={{ perspective: 2000 }}>
        {[-1, 1].map((k) => (
          <div key={k} style={side(k)}><FeatureList dim={Math.abs(k)} /></div>
        ))}
        <div style={{ ...side(0), transform: `translateY(${(1 - enter) * 80}px) rotateY(${spin * 0.4}deg)` }}><FeatureList at={8} /></div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function EndCard({ dur = 142 }: { dur?: number }) {
  const f = useCurrentFrame();
  const out = interpolate(f, [dur - 22, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: '#000' }}>
     <AbsoluteFill style={{ opacity: out }}>
      <Rays />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: F.sans, color: '#fff' }}>
        <Rise at={2} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Mark size={62} color="#fff" draw={prog(f, 2, 14)} fill={prog(f, 10, 8)} />
          <span style={{ fontSize: 62, fontWeight: 600, letterSpacing: '-0.04em' }}>NikTan</span>
        </Rise>
        <Rise at={10} style={{ fontFamily: F.deva, fontSize: 112, fontWeight: 600, marginTop: 40 }}>तबियत कइसन हे?</Rise>
        <Rise at={18} style={{ fontSize: 40, fontWeight: 500, color: 'rgba(255,255,255,0.78)', marginTop: 10 }}>How are you feeling? Find out in three minutes.</Rise>
        <Rise at={28} style={{ marginTop: 60 }}>
          <GlassPill><Mark size={40} color="#fff" /> niktan.vercel.app</GlassPill>
        </Rise>
      </AbsoluteFill>
      <div style={{ position: 'absolute', bottom: 48, width: '100%', textAlign: 'center', fontFamily: F.sans, fontSize: 20, color: 'rgba(255,255,255,0.55)', opacity: prog(f, 36, 10) }}>
        Hackasol 5.0 · Open Innovation · Screening, not diagnosis · Music: “EDM Detection Mode” by Kevin MacLeod (incompetech.com), CC BY 4.0
      </div>
     </AbsoluteFill>
    </AbsoluteFill>
  );
}
