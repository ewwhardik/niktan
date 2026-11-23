import { continueRender, delayRender, Easing, interpolate, staticFile } from 'remotion';

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/**
 * Timeline in frames, locked to the music (128.5 BPM: a beat is 14 frames, a bar 56).
 * The first drop lands on DROP1 (track 15.92 s); at SEAM the track jumps to its second drop (45.92 s).
 */
export const T = { beat: 14, half: 28, bar: 56, drop1: 238, seam: 657, end: 1076 } as const;

/** Light, airy launch-film palette built on NikTan's ink and triage colours. */
export const C = {
  bg: '#F3F5F9',
  bg2: '#EAF0FB',
  card: '#FFFFFF',
  ink: '#1D1D1F',
  ink2: '#55565B',
  ink3: '#8A8B90',
  line: 'rgba(17,24,39,0.08)',
  blue: '#2F6BFF',
  violet: '#7C5CFF',
  teal: '#0EA5A4',
  heart: '#FF453A',
  amber: '#F5A524',
  amberInk: '#231500',
  green: '#16A34A',
  deep: '#0A2A9C',
  deepTeal: '#08282C',
} as const;

/** NikTan's signature gradient: care teal into signal blue into violet. */
export const GRAD = 'linear-gradient(90deg, #0EA5A4 0%, #2F6BFF 48%, #7C5CFF 100%)';

export const F = {
  sans: 'Inter, system-ui, sans-serif',
  serif: '"Instrument Serif", Georgia, serif',
  deva: '"Noto Sans Devanagari", Inter, sans-serif',
} as const;

export const MARK = 'M1 27h7c4 0 6-2 9-5C27 11 36 1 51 1c20 0 36 16 36 37v19L61 81V40c0-10-6-16-15-16-6 0-10 3-15 9-4 4-5 7-5 10v37H1Z';

const fontHandle = delayRender('Loading fonts');
Promise.all(
  ([
    ['Inter', 'fonts/inter.woff2', { weight: '100 900' }],
    ['Instrument Serif', 'fonts/instrument-italic.woff2', { style: 'italic' }],
    ['Noto Sans Devanagari', 'fonts/devanagari.woff2', { weight: '100 900' }],
  ] as const).map(([family, file, desc]) =>
    new FontFace(family, `url(${staticFile(file)}) format('woff2')`, desc).load().then((f) => document.fonts.add(f)),
  ),
)
  .then(() => continueRender(fontHandle))
  .catch((e) => {
    console.error(e);
    continueRender(fontHandle);
  });

export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

/** 0 → 1 between two frames, eased and clamped. */
export function prog(frame: number, start: number, dur: number, easing = easeOut): number {
  return interpolate(frame, [start, start + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing });
}

/** A thump on every beat (1 on the beat, decaying to 0). */
export function beatPulse(frame: number, offset = 0, decay = 6): number {
  const k = (frame - offset) % T.beat;
  return k < 0 ? 0 : Math.exp(-k / (decay / 2));
}
