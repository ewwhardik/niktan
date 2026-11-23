// Renders review stills of chosen frames with one bundle: node scripts/stills.mjs 30 90 150 ...
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';

const frames = process.argv.slice(2).map(Number);
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const composition = await selectComposition({ serveUrl, id: 'NikTanFilm' });
for (const frame of frames) {
  await renderStill({ serveUrl, composition, frame, output: `out/review/f-${String(frame).padStart(4, '0')}.jpg`, imageFormat: 'jpeg', jpegQuality: 70, scale: 0.5 });
  console.log('frame', frame);
}
