import { AbsoluteFill, Audio, interpolate, Sequence, staticFile } from 'remotion';
import { Finish } from './kit';
import { Bars, Opening, Sickest } from './scenes/Act1';
import { BoardScene, Brand, EyeCard, PulseCard, VerdictCard, VoiceCard } from './scenes/Act2';
import { Carousel, EndCard, Statements } from './scenes/Act3';
import { Impact, LabReport, Sahayak, Saver, Thali, VisionHearing } from './scenes/Features';
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
  // Drop 2: more of the product, one bar each, then quick statements up to the seam.
  [T.seam, VisionHearing],
  [T.seam + T.bar, Thali],
  [T.seam + T.bar * 2, Saver],
  [T.seam + T.bar * 3, LabReport],
  [T.seam + T.bar * 4, Sahayak],
  [T.seam + T.bar * 5, Statements],
  // Drop 3: the tool carousel, the measured impact, and the end card to the end of the track.
  [T.seam2, Carousel],
  [T.seam2 + T.bar * 2, Impact],
  [T.seam2 + T.bar * 3, () => <EndCard dur={T.end - (T.seam2 + T.bar * 3)} />],
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
      {/* Build plus first drop, then hard cuts into the second and third drops; the track ends with the film. */}
      <Sequence from={0} durationInFrames={T.seam}>
        <Audio src={music} startFrom={Math.round(8.0 * FPS)} volume={(f) => interpolate(f, [0, 18], [0, 1], { extrapolateRight: 'clamp' })} />
      </Sequence>
      <Sequence from={T.seam} durationInFrames={T.seam2 - T.seam}>
        <Audio src={music} startFrom={Math.round(45.92 * FPS)} />
      </Sequence>
      <Sequence from={T.seam2} durationInFrames={T.end - T.seam2}>
        <Audio src={music} startFrom={Math.round(75.92 * FPS)} volume={(f) => interpolate(f, [T.end - T.seam2 - 45, T.end - T.seam2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
      </Sequence>
      <Finish />
    </AbsoluteFill>
  );
}
