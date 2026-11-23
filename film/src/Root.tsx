import { Composition } from 'remotion';
import { Film } from './Film';
import { FPS, HEIGHT, T, WIDTH } from './theme';

export function Root() {
  return <Composition id="NikTanFilm" component={Film} durationInFrames={T.end} fps={FPS} width={WIDTH} height={HEIGHT} />;
}
