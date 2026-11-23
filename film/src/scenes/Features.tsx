import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Card, Em, Grad, Headline, Mesh } from '../kit';
import { C, F, GRAD, prog } from '../theme';

const label = { fontSize: 22, fontWeight: 600, color: C.ink3, letterSpacing: '0.08em', textTransform: 'uppercase' as const };
const chip = (bg: string, fg: string) => ({ padding: '8px 16px', borderRadius: 99, background: bg, color: fg, fontSize: 22, fontWeight: 600 });

/** Tumbling E, opening to the right, drawn on a 5×5 grid. */
function E({ size, rot = 0, color = C.ink }: { size: number; rot?: number; color?: string }) {
  const u = size / 5;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: `rotate(${rot}deg)` }}>
      <g fill={color}>
        <rect x={0} y={0} width={u} height={size} />
        <rect x={0} y={0} width={size} height={u} />
        <rect x={0} y={2 * u} width={size} height={u} />
        <rect x={0} y={4 * u} width={size} height={u} />
      </g>
    </svg>
  );
}

export function VisionHearing() {
  const f = useCurrentFrame();
  const rows = [{ s: 74, r: 0 }, { s: 52, r: 90 }, { s: 36, r: 180 }, { s: 24, r: 270 }];
  const digits = ['३', '७', '२'];
  const wave = Array.from({ length: 90 }, (_, i) => `${i * 5},${40 + Math.sin(i * 0.9 + f * 0.6) * (10 + 14 * Math.abs(Math.sin(i * 0.31 + f * 0.13)))}`).join(' ');
  return (
    <AbsoluteFill>
      <Mesh strength={0.22} blobs={[C.blue, C.teal, C.violet]} />
      <Headline at={0}>Vision and hearing, <Em>calibrated.</Em></Headline>
      <Card width={1140} height={500} top={300} glow={C.blue}>
        <div style={{ display: 'flex', height: '100%', fontFamily: F.sans }}>
          <div style={{ flex: 1, padding: '44px 52px', borderRight: `1px solid ${C.line}` }}>
            <div style={label}>Tumbling-E chart</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, marginTop: 30 }}>
              {rows.map((r, i) => {
                const t = prog(f, 4 + i * 5, 10);
                const active = i === Math.min(3, Math.floor(f / 12));
                return (
                  <div key={i} style={{ opacity: t, padding: 8, borderRadius: 14, background: active ? '#EEF3FF' : 'transparent', boxShadow: active ? `0 0 0 2px ${C.blue}` : 'none' }}>
                    <E size={r.s} rot={r.r} />
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 22, fontSize: 24, color: C.ink2, textAlign: 'center' }}>Sized to your screen with a bank card</div>
          </div>
          <div style={{ flex: 1, padding: '44px 52px', display: 'flex', flexDirection: 'column' }}>
            <div style={label}>Digits in noise</div>
            <div style={{ marginTop: 40, display: 'flex', gap: 26, justifyContent: 'center' }}>
              {digits.map((d, i) => {
                const t = prog(f, 14 + i * 7, 8);
                return (
                  <span key={d} style={{ width: 110, height: 130, borderRadius: 22, background: '#F4F6FA', display: 'grid', placeItems: 'center', fontFamily: F.deva, fontSize: 78, fontWeight: 600, color: C.ink, opacity: t, transform: `translateY(${(1 - t) * 20}px)` }}>{d}</span>
                );
              })}
            </div>
            <svg width="450" height="80" style={{ marginTop: 40, alignSelf: 'center' }}><polyline points={wave} fill="none" stroke={C.violet} strokeWidth="3" strokeOpacity="0.55" /></svg>
            <div style={{ marginTop: 'auto', fontSize: 24, color: C.ink2, textAlign: 'center' }}>Hindi digits, the method behind WHO hearWHO</div>
          </div>
        </div>
      </Card>
    </AbsoluteFill>
  );
}

export function Thali() {
  const f = useCurrentFrame();
  const food = [
    { name: 'Dal', x: 108, y: 120, r: 70, c: '#E8B33A', at: 8 },
    { name: 'Rice', x: 250, y: 118, r: 74, c: '#F4EFE6', at: 12 },
    { name: 'Roti', x: 116, y: 262, r: 66, c: '#D9A66B', at: 16 },
    { name: 'Lal bhaji', x: 256, y: 262, r: 64, c: '#9E2A4A', at: 20 },
  ];
  const bars = [
    { n: 'Protein', v: 0.62, c: C.blue },
    { n: 'Iron', v: 0.48, c: C.heart },
    { n: 'Fibre', v: 0.71, c: C.teal },
  ];
  return (
    <AbsoluteFill>
      <Mesh strength={0.24} blobs={[C.amber, C.teal, C.blue]} />
      <Headline at={0}>Your plate, <Em>in numbers.</Em></Headline>
      <Card width={1140} height={500} top={300} glow={C.amber}>
        <div style={{ display: 'flex', height: '100%', fontFamily: F.sans }}>
          <div style={{ width: 500, background: 'linear-gradient(160deg,#F7F4EE,#EFEAE1)', display: 'grid', placeItems: 'center' }}>
            <svg width="370" height="380" viewBox="0 0 370 380">
              <circle cx="185" cy="190" r="178" fill="#fff" stroke="#E3DDD2" strokeWidth="4" />
              {food.map((d) => {
                const t = prog(f, d.at, 10);
                return (
                  <g key={d.name}>
                    <circle cx={d.x} cy={d.y} r={d.r} fill={d.c} />
                    <rect x={d.x - d.r} y={d.y - d.r} width={d.r * 2} height={d.r * 2} rx="14" fill="none" stroke={C.blue} strokeWidth="3" opacity={t} />
                    <rect x={d.x - d.r} y={d.y - d.r - 34} width={d.name.length * 13 + 22} height="30" rx="8" fill={C.blue} opacity={t} />
                    <text x={d.x - d.r + 11} y={d.y - d.r - 13} fill="#fff" style={{ font: `600 18px ${F.sans}` }} opacity={t}>{d.name}</text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div style={{ flex: 1, padding: '48px 54px', display: 'flex', flexDirection: 'column', gap: 26 }}>
            <div style={label}>This meal, against your daily need</div>
            {bars.map((b, i) => {
              const t = prog(f, 14 + i * 5, 18);
              return (
                <div key={b.n}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28, fontWeight: 500, color: C.ink }}>
                    <span>{b.n}</span><span style={{ fontVariantNumeric: 'tabular-nums', color: C.ink2 }}>{Math.round(b.v * 100 * t)}%</span>
                  </div>
                  <div style={{ height: 16, borderRadius: 99, background: '#F0F2F6', marginTop: 10 }}>
                    <div style={{ height: '100%', width: `${b.v * 100 * t}%`, borderRadius: 99, background: b.c }} />
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 'auto', opacity: prog(f, 32, 10), display: 'flex', alignItems: 'center', gap: 12, fontSize: 24, color: C.ink2 }}>
              <span style={chip('#E8F7EE', C.green)}>Swap</span> Add amla or guava to absorb more iron
            </div>
          </div>
        </div>
      </Card>
    </AbsoluteFill>
  );
}

export function Saver() {
  const f = useCurrentFrame();
  const brand = prog(f, 10, 16);
  const generic = prog(f, 20, 12);
  return (
    <AbsoluteFill>
      <Mesh strength={0.24} blobs={[C.teal, C.blue, C.violet]} />
      <Headline at={0}>Same medicine, <Em>lower price.</Em></Headline>
      <Card width={1000} height={470} top={310} glow={C.teal}>
        <div style={{ padding: '46px 56px', fontFamily: F.sans, display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
          <div style={label}>Medicine Saver</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 18 }}>
            <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.02em', color: C.ink }}>Pantoprazole 40 mg</span>
            <span style={chip('#F1F3F8', C.ink2)}>same salt · same strength</span>
          </div>
          <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 26 }}>
            {[
              { n: 'Branded pack', w: 0.92 * brand, c: '#C7CBD6' },
              { n: 'Jan Aushadhi generic', w: 0.18 * generic, c: C.teal },
            ].map((r) => (
              <div key={r.n} style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                <span style={{ width: 300, fontSize: 28, color: C.ink }}>{r.n}</span>
                <div style={{ flex: 1, height: 26, borderRadius: 99, background: '#F0F2F6' }}>
                  <div style={{ height: '100%', width: `${Math.max(0.02, r.w) * 100}%`, borderRadius: 99, background: r.c }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: prog(f, 28, 10) }}>
            <span style={{ fontSize: 24, color: C.ink3 }}>Illustration · prices from the official PMBJP list</span>
            <span style={{ fontSize: 30, fontWeight: 700 }}><Grad>Read from a photo</Grad></span>
          </div>
        </div>
      </Card>
    </AbsoluteFill>
  );
}

export function LabReport() {
  const f = useCurrentFrame();
  const rows = [
    { test: 'Haemoglobin', val: '10.2 g/dL', range: '12–15', flag: 'Low', tone: [C.amber, '#FFF3DA', '#9A5B00'] },
    { test: 'Fasting glucose', val: '92 mg/dL', range: '70–100', flag: 'In range', tone: [C.green, '#E8F7EE', C.green] },
    { test: 'Vitamin D', val: '18 ng/mL', range: '30–100', flag: 'Low', tone: [C.amber, '#FFF3DA', '#9A5B00'] },
  ];
  return (
    <AbsoluteFill>
      <Mesh strength={0.24} blobs={[C.violet, C.blue, C.teal]} />
      <Headline at={0}>Lab reports, <Em>made plain.</Em></Headline>
      <Card width={1080} height={470} top={310} glow={C.violet}>
        <div style={{ fontFamily: F.sans }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.9fr', padding: '30px 54px 16px', ...label }}>
            <span>Test</span><span>Result</span><span>Printed range</span><span />
          </div>
          {rows.map((r, i) => {
            const t = prog(f, 6 + i * 6, 10);
            const flagged = prog(f, 18 + i * 6, 8);
            return (
              <div key={r.test} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.9fr', alignItems: 'center', padding: '0 54px', height: 104, borderTop: `1px solid ${C.line}`, opacity: t, transform: `translateY(${(1 - t) * 16}px)` }}>
                <span style={{ fontSize: 32, fontWeight: 600, color: C.ink }}>{r.test}</span>
                <span style={{ fontSize: 30, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{r.val}</span>
                <span style={{ fontSize: 28, color: C.ink3, fontVariantNumeric: 'tabular-nums' }}>{r.range}</span>
                <span style={{ ...chip(r.tone[1]!, r.tone[2]!), justifySelf: 'start', opacity: flagged, transform: `scale(${0.8 + flagged * 0.2})` }}>{r.flag}</span>
              </div>
            );
          })}
          <div style={{ padding: '18px 54px', fontSize: 24, color: C.ink3, opacity: prog(f, 34, 10) }}>
            Flags are computed from the range on your report, not guessed by AI.
          </div>
        </div>
      </Card>
    </AbsoluteFill>
  );
}

export function Sahayak() {
  const f = useCurrentFrame();
  const typing = f >= 14 && f < 24;
  const answer = prog(f, 24, 10);
  const bubble = (mine: boolean) => ({
    maxWidth: 660, padding: '22px 28px', borderRadius: 28, fontSize: 32, lineHeight: 1.4,
    background: mine ? C.blue : '#F2F4F8', color: mine ? '#fff' : C.ink,
    alignSelf: mine ? 'flex-end' : 'flex-start', borderBottomRightRadius: mine ? 8 : 28, borderBottomLeftRadius: mine ? 28 : 8,
  });
  return (
    <AbsoluteFill>
      <Mesh strength={0.26} blobs={[C.blue, C.violet, C.teal]} />
      <Headline at={0}>Help, in <Em>your language.</Em></Headline>
      <Card width={940} height={520} top={290} glow={C.blue}>
        <div style={{ fontFamily: F.deva, display: 'flex', flexDirection: 'column', gap: 22, padding: '34px 40px', height: '100%', boxSizing: 'border-box' }}>
          <div style={{ fontFamily: F.sans, display: 'flex', alignItems: 'center', gap: 12, fontSize: 26, fontWeight: 600, color: C.ink }}>
            <span style={{ width: 40, height: 40, borderRadius: 99, background: GRAD }} /> NikTan Sahayak
          </div>
          <div style={{ ...bubble(true), opacity: prog(f, 2, 8), transform: `translateY(${(1 - prog(f, 2, 8)) * 16}px)` }}>मेरे कार्ड का मतलब क्या है?</div>
          {typing && (
            <div style={{ ...bubble(false), display: 'flex', gap: 8 }}>
              {[0, 1, 2].map((i) => <span key={i} style={{ width: 12, height: 12, borderRadius: 99, background: C.ink3, opacity: 0.3 + 0.7 * Math.abs(Math.sin(f / 3 + i)) }} />)}
            </div>
          )}
          {f >= 24 && (
            <div style={{ ...bubble(false), opacity: answer, transform: `translateY(${(1 - answer) * 16}px)` }}>
              5 दिन से बुखार है, इसलिए आज डॉक्टर को दिखाएँ। फ़ोन से कतार में जुड़ सकते हैं।
            </div>
          )}
          {f >= 34 && (
            <div style={{ fontFamily: F.sans, alignSelf: 'flex-start', opacity: prog(f, 34, 8), ...chip('#EEF3FF', C.blue) }}>Join OPD queue →</div>
          )}
        </div>
      </Card>
    </AbsoluteFill>
  );
}

/** The measured before/after, as the board reports it (demo data). */
export function Impact() {
  const f = useCurrentFrame();
  const n = Math.round(11 * prog(f, 10, 20));
  const fcfs = prog(f, 6, 18);
  const nik = prog(f, 14, 14);
  return (
    <AbsoluteFill>
      <Mesh strength={0.26} blobs={[C.teal, C.blue, C.violet]} />
      <Headline at={0}>Measured, <Em>not claimed.</Em></Headline>
      <Card width={1040} height={470} top={300} glow={C.teal}>
        <div style={{ padding: '46px 60px', fontFamily: F.sans, display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
          <div style={label}>Urgent patients · today</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 10 }}>
            <span style={{ fontSize: 120, fontWeight: 600, letterSpacing: '-0.05em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}><Grad>{n} min</Grad></span>
            <span style={{ fontSize: 36, fontWeight: 500, color: C.ink2 }}>sooner</span>
          </div>
          <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              { n: 'First come, first served', w: 0.82 * fcfs, c: '#C7CBD6', v: '19 min' },
              { n: 'With NikTan', w: 0.36 * nik, c: C.teal, v: '8 min' },
            ].map((r) => (
              <div key={r.n} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <span style={{ width: 330, fontSize: 26, color: C.ink }}>{r.n}</span>
                <div style={{ flex: 1, height: 22, borderRadius: 99, background: '#F0F2F6' }}>
                  <div style={{ height: '100%', width: `${Math.max(0.02, r.w) * 100}%`, borderRadius: 99, background: r.c }} />
                </div>
                <span style={{ width: 100, textAlign: 'right', fontSize: 24, color: C.ink2, fontVariantNumeric: 'tabular-nums' }}>{r.v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 'auto', fontSize: 22, color: C.ink3, opacity: interpolate(f, [24, 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
            Same doctor, same call times, handed out by arrival instead of need · demo board
          </div>
        </div>
      </Card>
    </AbsoluteFill>
  );
}

