import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Card, Em, Headline, Mesh, Swap, WordWall } from '../kit';
import { C, F, prog, T } from '../theme';

/** 0–112: the problem in four kinetic phrases, one per half bar. */
export function Opening() {
  return (
    <AbsoluteFill>
      <Mesh strength={0.22} />
      <Swap
        items={[
          { at: 4, node: 'Two hours' },
          { at: 4 + T.half, node: <>in a <Em>queue.</Em></> },
          { at: 4 + T.half * 2, node: 'Five minutes' },
          { at: 4 + T.half * 3, node: <>with a <Em>doctor.</Em></> },
        ]}
      />
    </AbsoluteFill>
  );
}

/** 112–168: the same visit as two bars on a clean card. */
export function Bars() {
  const f = useCurrentFrame();
  const rows = [
    { label: 'Waiting in line', value: '110.9 min', w: 0.86, color: '#C7CBD6', at: 8 },
    { label: 'With the doctor', value: '5.3 min', w: 0.041, color: C.blue, at: 22 },
  ];
  return (
    <AbsoluteFill>
      <Mesh strength={0.2} />
      <Headline at={0}>A typical <Em>OPD visit.</Em></Headline>
      <Card width={1180} height={360} top={330}>
        <div style={{ padding: '56px 64px', display: 'flex', flexDirection: 'column', gap: 54, fontFamily: F.sans }}>
          {rows.map((r) => {
            const t = prog(f, r.at, 20);
            return (
              <div key={r.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 30, fontWeight: 500, color: C.ink2, marginBottom: 16 }}>
                  <span>{r.label}</span>
                  <span style={{ color: r.color === C.blue ? C.blue : C.ink, fontWeight: 600, fontVariantNumeric: 'tabular-nums', opacity: t }}>{r.value}</span>
                </div>
                <div style={{ height: 30, borderRadius: 99, background: '#F0F2F6' }}>
                  <div style={{ height: '100%', width: `${Math.max(0.02, r.w * t) * 100}%`, borderRadius: 99, background: r.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <div style={{ position: 'absolute', top: 740, width: '100%', textAlign: 'center', fontFamily: F.sans, fontSize: 24, color: C.ink3, opacity: prog(f, 30, 10) }}>
        Neurology OPD time-motion study, India
      </div>
    </AbsoluteFill>
  );
}

/** 168–238: first come, first served. The build into the drop. */
export function Sickest() {
  return (
    <AbsoluteFill>
      <Mesh strength={0.18} blobs={[C.heart, C.violet, C.blue]} />
      <WordWall word="first come, first served" />
      <Swap
        size={112}
        items={[
          { at: 0, node: 'First come,' },
          { at: T.beat, node: 'first served.' },
          { at: T.beat * 2, node: 'The sickest patient' },
          { at: T.beat * 3 + 4, node: <>still <Em color={C.heart}>waits.</Em></> },
        ]}
      />
    </AbsoluteFill>
  );
}
