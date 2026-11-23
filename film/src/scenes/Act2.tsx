import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Card, Cursor, DeepSurface, Em, Grad, Headline, Mark, Mesh, Rise, Tick } from '../kit';
import { beatPulse, C, F, GRAD, prog, T } from '../theme';

/** Drop 1: the brand on the deep curved surface. */
export function Brand() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - 2, fps, config: { damping: 15, stiffness: 110 } });
  const flash = interpolate(f, [0, 8], [1, 0], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <DeepSurface />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: F.sans, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 34, transform: `scale(${0.82 + s * 0.18})`, opacity: s, marginTop: -60 }}>
          <Mark size={128} color="#fff" draw={prog(f, 0, 14)} fill={prog(f, 8, 10)} />
          <span style={{ fontSize: 150, fontWeight: 600, letterSpacing: '-0.045em' }}>NikTan</span>
        </div>
        <Rise at={20} style={{ marginTop: 44, fontSize: 54, fontWeight: 500, letterSpacing: '-0.02em' }}>
          Your phone is the <Em color="#9EC0FF">first</Em> checkup.
        </Rise>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: '#fff', opacity: flash }} />
    </AbsoluteFill>
  );
}

const ppg = (p: number) => Math.exp(-((p - 0.18) ** 2) / 0.006) + 0.35 * Math.exp(-((p - 0.45) ** 2) / 0.01);

export function PulseCard() {
  const f = useCurrentFrame();
  const period = 25;
  const beat = ppg((f % period) / period);
  const pts = Array.from({ length: 110 }, (_, i) => {
    const t = f - 110 + i;
    return `${i * 4},${80 - ppg((((t % period) + period) % period) / period) * 64}`;
  }).join(' ');
  const bpm = Math.round(interpolate(f, [8, 36], [58, 72], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  return (
    <AbsoluteFill>
      <Mesh strength={0.22} blobs={[C.heart, C.blue, C.violet]} />
      <Headline at={0}>Heart rate <Em>from your face.</Em></Headline>
      <Card width={1080} height={560} top={300} glow={C.heart}>
        <div style={{ display: 'flex', height: '100%', fontFamily: F.sans }}>
          <div style={{ width: 470, background: 'linear-gradient(160deg,#F6F8FC,#EDF1F8)', display: 'grid', placeItems: 'center' }}>
            <svg width="330" height="400" viewBox="0 0 330 400">
              <defs><filter id="pb"><feGaussianBlur stdDeviation="9" /></filter></defs>
              <ellipse cx="165" cy="200" rx="128" ry="168" fill="#fff" stroke="#D5DAE5" strokeWidth="2" />
              {[[165, 96, 70, 26], [104, 238, 32, 30], [226, 238, 32, 30]].map(([x, y, rx, ry], i) => (
                <ellipse key={i} cx={x} cy={y} rx={rx} ry={ry} fill={C.heart} opacity={0.16 + beat * 0.5} filter="url(#pb)" />
              ))}
              <g fill="none" stroke="#9AA3B5" strokeWidth="3" strokeLinecap="round">
                <path d="M96 160 q24 -12 48 0 M186 160 q24 -12 48 0" />
                <path d="M100 186 q18 -11 36 0 q-18 11 -36 0Z M194 186 q18 -11 36 0 q-18 11 -36 0Z" />
                <path d="M165 192 v50 q-10 10 -2 14" />
                <path d="M128 296 q37 20 74 0" />
              </g>
              {Array.from({ length: 40 }, (_, i) => {
                const a = (i / 40) * Math.PI * 2;
                return <circle key={i} cx={165 + Math.cos(a) * 128} cy={200 + Math.sin(a) * 168} r="2.6" fill={C.teal} opacity={0.4 + 0.6 * ((Math.floor(f / 2) + i) % 6 === 0 ? 1 : 0.4)} />;
              })}
            </svg>
          </div>
          <div style={{ flex: 1, padding: '62px 60px', display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 24, fontWeight: 600, color: C.ink3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Heart rate</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 8 }}>
              <span style={{ fontSize: 148, fontWeight: 600, letterSpacing: '-0.05em', color: C.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{bpm}</span>
              <span style={{ fontSize: 40, fontWeight: 500, color: C.ink3 }}>bpm</span>
            </div>
            <svg width="440" height="96" style={{ marginTop: 26 }}><polyline points={pts} fill="none" stroke={C.heart} strokeWidth="4" strokeLinejoin="round" /></svg>
            <div style={{ marginTop: 'auto', display: 'flex', gap: 12 }}>
              {['30-second scan', 'On-device'].map((c) => (
                <span key={c} style={{ padding: '10px 20px', borderRadius: 99, background: '#F1F3F8', fontSize: 24, fontWeight: 500, color: C.ink2 }}>{c}</span>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </AbsoluteFill>
  );
}

export function EyeCard() {
  const f = useCurrentFrame();
  const rows = [
    { title: 'Anaemia', sub: 'Inner-eyelid colour', at: 12 },
    { title: 'Jaundice', sub: 'White-referenced sclera colour', at: 12 + T.beat },
    { title: 'Cataract', sub: 'Pupil clarity and a glare test', at: 12 + T.beat * 2 },
  ];
  return (
    <AbsoluteFill>
      <Mesh strength={0.22} blobs={[C.teal, C.blue, C.violet]} />
      <Headline at={0}>Eyes, read in <Em>colour.</Em></Headline>
      <Card width={940} height={480} top={320} glow={C.teal}>
        <div style={{ fontFamily: F.sans }}>
          {rows.map((r, i) => {
            const enter = prog(f, 4 + i * 4, 12);
            const done = f >= r.at ? 1 + prog(f, r.at, 8) * 0.25 : 0;
            return (
              <div key={r.title} style={{ display: 'flex', alignItems: 'center', gap: 28, height: 160, padding: '0 54px', borderTop: i ? `1px solid ${C.line}` : 'none', opacity: enter, transform: `translateY(${(1 - enter) * 20}px)` }}>
                <Tick done={done} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.02em', color: C.ink }}>{r.title}</div>
                  <div style={{ fontSize: 26, color: C.ink3, marginTop: 4 }}>{r.sub}</div>
                </div>
                <span style={{ fontSize: 24, fontWeight: 600, color: done ? C.green : C.ink3, background: done ? '#E8F7EE' : '#F1F3F8', padding: '10px 18px', borderRadius: 99, opacity: done ? 1 : 0.6 }}>{done ? 'No flag' : 'Reading…'}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </AbsoluteFill>
  );
}

export function VoiceCard() {
  const f = useCurrentFrame();
  const phrase = Array.from('5 दिन से बुखार और कमज़ोरी');
  const typed = phrase.slice(0, Math.floor(prog(f, 6, 18, (t) => t) * phrase.length)).join('');
  const clicked = f >= 34;
  return (
    <AbsoluteFill>
      <Mesh strength={0.24} blobs={[C.violet, C.blue, C.teal]} />
      <Headline at={0}>Symptoms, in <Em>your words.</Em></Headline>
      <Card width={1040} height={250} top={290} glow={C.violet}>
        <div style={{ padding: '44px 54px', fontFamily: F.deva, fontSize: 56, fontWeight: 500, color: C.ink, letterSpacing: '-0.01em' }}>
          {typed}<span style={{ display: 'inline-block', width: 3, height: 56, marginLeft: 4, background: C.ink, verticalAlign: 'middle', opacity: f % 14 < 7 ? 1 : 0 }} />
        </div>
        <div style={{ position: 'absolute', left: 54, bottom: 34, display: 'flex', gap: 12, fontFamily: F.sans }}>
          {['हिंदी', 'English', 'छत्तीसगढ़ी'].map((l, i) => (
            <span key={l} style={{ fontFamily: F.deva, padding: '8px 18px', borderRadius: 99, border: `1.5px solid ${i === 0 ? C.blue : C.line}`, color: i === 0 ? C.blue : C.ink2, fontSize: 22, fontWeight: 500 }}>{l}</span>
          ))}
        </div>
      </Card>
      <div style={{ position: 'absolute', top: 590, left: '50%', marginLeft: -170, width: 340, height: 92, borderRadius: 99, background: GRAD, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontFamily: F.sans, fontSize: 34, fontWeight: 600, boxShadow: '0 20px 50px -20px rgba(47,107,255,0.7)', transform: `scale(${f >= 34 && f < 39 ? 0.94 : 1})`, opacity: prog(f, 10, 10) }}>
        ✦ Understand
      </div>
      <Cursor from={[1350, 900]} to={[1010, 640]} at={16} click={34} />
      <div style={{ position: 'absolute', top: 730, width: '100%', display: 'flex', justifyContent: 'center', gap: 18, fontFamily: F.sans }}>
        {['Fever · 5 days', 'Tiredness · 5 days'].map((c, i) => {
          const t = clicked ? prog(f, 38 + i * 4, 10) : 0;
          return (
            <span key={c} style={{ padding: '16px 28px', borderRadius: 99, background: '#fff', boxShadow: '0 10px 30px -14px rgba(30,50,120,0.4)', fontSize: 30, fontWeight: 600, color: C.ink, opacity: t, transform: `translateY(${(1 - t) * 20}px)` }}>
              <Grad>✓</Grad> {c}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

export function VerdictCard() {
  const f = useCurrentFrame();
  const wipe = prog(f, 6, 16);
  return (
    <AbsoluteFill>
      <Mesh strength={0.24} blobs={[C.amber, C.blue, C.violet]} />
      <Headline at={0}>One clear <Em>next step.</Em></Headline>
      <Card width={760} height={500} top={290} glow={C.amber}>
        <div style={{ padding: 34, display: 'flex', flexDirection: 'column', gap: 18, height: '100%', boxSizing: 'border-box', fontFamily: F.sans }}>
          <div style={{ borderRadius: 26, background: C.amber, color: C.amberInk, padding: '28px 32px', clipPath: `circle(${wipe * 160}% at 10% 15%)` }}>
            <div style={{ fontSize: 50, fontWeight: 700, letterSpacing: '-0.03em' }}>See a doctor today</div>
            <div style={{ fontSize: 26, marginTop: 6 }}>Go to: General Medicine</div>
          </div>
          <div style={{ fontSize: 24, color: C.ink3, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: prog(f, 14, 8) }}>Why</div>
          {['Fever for 5 days', 'Tiredness and weakness'].map((r, i) => (
            <div key={r} style={{ fontSize: 32, fontWeight: 500, color: C.ink, display: 'flex', gap: 14, alignItems: 'center', opacity: prog(f, 16 + i * 4, 8) }}>
              <span style={{ width: 12, height: 12, borderRadius: 99, background: C.amber }} /> {r}
            </div>
          ))}
          <div style={{ marginTop: 'auto', height: 86, borderRadius: 99, background: C.ink, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 600, opacity: prog(f, 22, 8), transform: `scale(${f >= 40 && f < 45 ? 0.95 : 1})` }}>
            Join OPD queue →
          </div>
        </div>
      </Card>
      <Cursor from={[1400, 960]} to={[1010, 790]} at={24} click={40} />
    </AbsoluteFill>
  );
}

type P = 'today' | 'routine';
const PCOL: Record<P, string> = { today: C.amber, routine: C.teal };

function Row({ n, who, why, waited, p, live }: { n: number; who: string; why: string; waited: number; p: P; live?: boolean }) {
  return (
    <div style={{ height: 96, borderRadius: 18, background: '#fff', display: 'flex', alignItems: 'center', gap: 24, padding: '0 28px', boxShadow: live ? `0 0 0 3px ${C.blue}, 0 20px 40px -20px ${C.blue}` : `0 0 0 1px ${C.line}`, fontFamily: F.sans }}>
      <span style={{ width: 8, height: 56, borderRadius: 8, background: PCOL[p] }} />
      <span style={{ fontSize: 34, fontWeight: 700, width: 86, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>#{n}</span>
      <span style={{ flex: 1, fontSize: 26, color: C.ink2 }}>{who} · {why}</span>
      {live && <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.1em', color: C.blue, border: `1.5px solid ${C.blue}`, borderRadius: 8, padding: '4px 10px' }}>LIVE</span>}
      <span style={{ fontSize: 22, fontWeight: 600, color: p === 'today' ? '#9A5B00' : '#0B6B62', background: p === 'today' ? '#FFF3DA' : '#E2F4F0', padding: '8px 16px', borderRadius: 99 }}>{p === 'today' ? 'See today' : 'Routine'}</span>
      <span style={{ fontSize: 22, color: C.ink3, width: 120, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{waited} min</span>
    </div>
  );
}

export function BoardScene() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ROW = 112;
  const arrive = spring({ frame: f - 18, fps, config: { damping: 18 } });
  const lift = spring({ frame: f - 46, fps, config: { damping: 15, stiffness: 90 } });
  const routine = [
    { n: 11, who: '46 F', why: 'Headache', waited: 34 },
    { n: 12, who: '29 M', why: 'BP refill', waited: 31 },
    { n: 13, who: '62 M', why: 'Knee pain', waited: 27 },
    { n: 14, who: '24 F', why: 'Skin rash', waited: 22 },
  ];
  const tilt = interpolate(f, [0, 139], [26, 14]);
  const push = interpolate(f, [0, 139], [0.92, 1]);
  const enter = prog(f, 0, 20);
  const saved = Math.round(11 * prog(f, 80, 24));
  return (
    <AbsoluteFill>
      <Mesh strength={0.26} />
      <Headline at={2} top={90} size={64}>The OPD knows you <Em>before you arrive.</Em></Headline>
      <AbsoluteFill style={{ perspective: 2400, top: 210 }}>
        <div style={{ position: 'absolute', left: '50%', top: 30, width: 1480, marginLeft: -740, height: 760, borderRadius: 30, background: 'linear-gradient(180deg,#FFFFFF,#F7F9FD)', boxShadow: '0 0 0 1px rgba(17,24,39,0.06), 0 -6px 60px -10px rgba(47,107,255,0.35), 0 60px 120px -50px rgba(30,50,120,0.5)', transform: `rotateX(${tilt}deg) scale(${push})`, transformOrigin: '50% 0%', opacity: enter, padding: '28px 40px', boxSizing: 'border-box', fontFamily: F.sans }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Mark size={34} color={C.ink} />
            <span style={{ fontSize: 30, fontWeight: 700, color: C.ink }}>Triage board</span>
            <span style={{ fontSize: 20, fontWeight: 600, color: '#0B6B62', background: '#E2F4F0', borderRadius: 99, padding: '5px 14px' }}>● Live</span>
            <span style={{ marginLeft: 'auto', fontSize: 22, color: C.ink3 }}>General Medicine · District Hospital</span>
          </div>
          <div style={{ marginTop: 22, borderRadius: 18, background: '#F1F5FF', padding: '18px 26px', display: 'flex', alignItems: 'center', gap: 18, opacity: prog(f, 76, 10) }}>
            <span style={{ fontSize: 22, color: C.ink3 }}>Today vs first-come, first-served</span>
            <span style={{ fontSize: 30, fontWeight: 700, color: C.ink }}>Urgent patients called <Grad>{saved} min sooner</Grad></span>
          </div>
          <div style={{ position: 'relative', marginTop: 22, height: ROW * 5 }}>
            {routine.map((r, i) => (
              <div key={r.n} style={{ position: 'absolute', left: 0, right: 0, top: (i + lift) * ROW }}>
                <Row {...r} p="routine" />
              </div>
            ))}
            <div style={{ position: 'absolute', left: 0, right: 0, top: interpolate(arrive, [0, 1], [ROW * 5.5, ROW * 4]) * (1 - lift), opacity: arrive, zIndex: 2 }}>
              <Row n={15} who="62 M" why="Fever 5 days, tiredness" waited={0} p="today" live />
            </div>
          </div>
        </div>
      </AbsoluteFill>
      <div style={{ position: 'absolute', right: 150, top: 300, opacity: prog(f, 50, 10) * (1 - prog(f, 76, 8)), fontFamily: F.sans, fontSize: 26, fontWeight: 600, color: '#fff', background: C.blue, padding: '12px 22px', borderRadius: 99, boxShadow: `0 10px 30px -10px ${C.blue}`, transform: `scale(${1 + beatPulse(f, 50) * 0.04})` }}>
        Moved from 15th to 1st
      </div>
    </AbsoluteFill>
  );
}
