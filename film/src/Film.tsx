import { AbsoluteFill, Audio, interpolate, Sequence, staticFile } from 'remotion';
import { Finish } from './kit';
import { Bars, Opening, Sickest } from './scenes/Act1';
import { BoardScene, Brand, EyeCard, PulseCard, VerdictCard, VoiceCard } from './scenes/Act2';
import { Carousel, EndCard, Statements } from './scenes/Act3';
import { FPS, T } from './theme';

/** [start frame, scene]. Each runs until the next starts; every cut sits on the beat grid. */
const SHOTS: [number, () => JSX.Element][] = [
  [0, Opening],
  [112, Bars],
  [168, Sickest],
  [T.drop1, Brand],
  [T.drop1 + T.bar, PulseCard],
  [T.drop1 + T.bar * 2, EyeCard],
  [T.drop1 + T.bar * 3, VoiceCard],
  [T.drop1 + T.bar * 4, VerdictCard],
  [T.drop1 + T.bar * 5, BoardScene],
  [T.seam, Statements],
  [T.seam + T.half * 6, Carousel],
  [T.seam + T.half * 6 + T.bar * 2, EndCard],
];

const music = staticFile('music.m4a');

export function Film() {
  return (
    <AbsoluteFill style={{ background: '#F3F5F9' }}>
      {SHOTS.map(([from, Scene], i) => {
        const to = SHOTS[i + 1]?.[0] ?? T.end;
        return (
          <Sequence key={from} from={from} durationInFrames={to - from} name={Scene.name}>
            <Scene />
          </Sequence>
        );
      })}
      {/* Build plus first drop, then a hard cut into the second drop, fading out at the end. */}
      <Sequence from={0} durationInFrames={T.seam}>
        <Audio src={music} startFrom={Math.round(8.0 * FPS)} volume={(f) => interpolate(f, [0, 18], [0, 1], { extrapolateRight: 'clamp' })} />
      </Sequence>
      <Sequence from={T.seam} durationInFrames={T.end - T.seam}>
        <Audio src={music} startFrom={Math.round(45.92 * FPS)} volume={(f) => interpolate(f, [T.end - T.seam - 60, T.end - T.seam], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
      </Sequence>
      <Finish />
    </AbsoluteFill>
  );
}
