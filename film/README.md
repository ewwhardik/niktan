# NikTan launch film

The 46-second film on the home page, built with [Remotion](https://www.remotion.dev) (React to video).
It is kept out of the pnpm workspace so the app's install and deploy stay light.

- **Style:** light, airy SaaS launch film: soft mesh gradients, one white UI card per shot, kinetic one-line
  typography with italic serif accents, a deep-blue curved surface for the brand beat, and a light-ray end card.
- **Timing:** every cut sits on the music's beat grid (128.5 BPM: a beat is 14 frames at 30 fps, a bar 56).
  The brand reveal lands on the first drop; at frame 657 the track cuts to its second drop and at frame 1076
  to its third, which runs to the end of the track. See `src/theme.ts`.
- **Music:** "EDM Detection Mode" by Kevin MacLeod (incompetech.com), CC BY 4.0, credited on the end card.
  `public/music.m4a` is the full track; the film plays 8.0–29.9 s, 45.92–59.88 s, then 75.92 s to the end.

```sh
npm install
npm run studio                                   # preview and scrub in the browser
npm run render                                   # out/niktan-film.mp4 (1920×1080, H.264)
node scripts/stills.mjs 30 300 700               # review stills in out/review
```

Scenes: `src/scenes/Act1.tsx` (the problem), `Act2.tsx` (brand, pulse, eyes, voice, verdict, board),
`Features.tsx` (vision and hearing, Thali, Medicine Saver, lab report, Sahayak, measured impact),
`Act3.tsx` (statements, tool carousel, end card). Shared motion parts are in `src/kit.tsx`.

To ship a new cut, copy the render to `apps/web/public/media/niktan-launch.mp4` and render a poster:
`npx remotion still src/index.ts NikTanFilm out/poster.jpg --frame 280 --image-format jpeg --jpeg-quality 88`.
