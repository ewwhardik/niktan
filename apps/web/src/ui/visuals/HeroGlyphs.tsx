/**
 * Small original line emblems that nod to each hero's signature object (a hammer, a web, a round
 * shield). Drawn here from simple shapes; no Marvel artwork or logos are reproduced.
 */
type Glyph = (props: { className?: string }) => JSX.Element;

const svg = (body: JSX.Element, className = '') => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{body}</svg>
);

export const GLYPHS: Record<string, Glyph> = {
  /** Arc reactor: a glowing core in rings. */
  'Iron Man': ({ className }) => svg(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.5" /><path d="M12 8.5 15 14H9z" fill="currentColor" stroke="none" /></>, className),
  /** A gem on the brow. */
  Vision: ({ className }) => svg(<><path d="M12 3 19 10 12 21 5 10z" /><path d="M5 10h14M9 10l3-7 3 7-3 11z" /></>, className),
  /** Arrow in flight. */
  Hawkeye: ({ className }) => svg(<><path d="M4 20 19 5" /><path d="M14 5h5v5" /><path d="M4 20l2-5M4 20l5-2M7 17l2-5M7 17l5-2" /></>, className),
  /** Short-handled war hammer. */
  Thor: ({ className }) => svg(<><rect x="5" y="3.5" width="14" height="7" rx="1.2" /><path d="M12 10.5V20" strokeWidth="2.2" /><path d="M10.5 20.5h3" /></>, className),
  /** Hourglass. */
  'Black Widow': ({ className }) => svg(<><path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" /></>, className),
  /** Round shield with a star. */
  'Captain America': ({ className }) => svg(<><circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="12" r="6.5" /><path d="m12 8.2 1.1 2.4 2.6.3-1.9 1.8.5 2.6L12 14l-2.3 1.3.5-2.6-1.9-1.8 2.6-.3z" fill="currentColor" stroke="none" /></>, className),
  /** Spell circle. */
  'Doctor Strange': ({ className }) => svg(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" strokeWidth="1" /></>, className),
  /** Clenched fist. */
  Hulk: ({ className }) => svg(<><path d="M6 11V8.5a1.5 1.5 0 0 1 3 0V11M9 10V7.5a1.5 1.5 0 0 1 3 0V10M12 10V8a1.5 1.5 0 0 1 3 0v3M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a5 5 0 0 1-5-5v-5" /></>, className),
  /** Corner of a web. */
  'Spider-Man': ({ className }) => svg(<><path d="M3 3l18 18M3 3v18M3 3h18M3 3l9 18M3 3l18 9" strokeWidth="1" /><path d="M3 9c3 0 5.5-2.5 6-6M3 15c6 0 11-5 12-12M3 21c8.5 0 17-8.5 18-18" strokeWidth="1" /></>, className),
  /** Three claw marks. */
  'Black Panther': ({ className }) => svg(<><path d="M7 4c-1 5 0 11 3 16M12 3c-.5 5 .5 11 3 17M17 4c0 5 1 10 3 14" /></>, className),
  /** A tiny ant. */
  'Ant-Man': ({ className }) => svg(<><circle cx="7" cy="12" r="2" /><ellipse cx="12" cy="12" rx="2.2" ry="1.6" /><ellipse cx="17.5" cy="12" rx="3" ry="2.2" /><path d="M10 10.6 8.5 7M12 10.4 12 6.5M14 10.6 15.5 7M10 13.4 8.5 17M12 13.6 12 17.5M14 13.4 15.5 17M5.5 10.5 4 8" /></>, className),
  /** Eight-pointed star. */
  'Captain Marvel': ({ className }) => svg(<><path d="m12 2 2 6.5L20 6l-3 6 3 6-6-2.5L12 22l-2-6.5L4 18l3-6-3-6 6 2.5z" /></>, className),
  /** Iron mask with eye slits. */
  'Doctor Doom': ({ className }) => svg(<><path d="M5 4h14v8c0 5-3 8-7 8s-7-3-7-8z" /><path d="M8 10h3M13 10h3M10 15h4M12 4v4" /></>, className),
};

/** A web hanging from a corner, with a small spider on a thread. */
export function WebCorner({ className = '' }: { className?: string }) {
  const spokes = [0, 15, 30, 45, 60, 75, 90].map((a) => (a * Math.PI) / 180);
  const rings = [24, 46, 70, 96];
  return (
    <svg viewBox="0 0 120 150" className={className} fill="none" stroke="currentColor" aria-hidden>
      {spokes.map((a, i) => <line key={i} x1="120" y1="0" x2={120 - Math.sin(a) * 110} y2={Math.cos(a) * 110} strokeWidth="0.6" />)}
      {rings.map((r) => (
        <path key={r} strokeWidth="0.6" d={spokes.map((a, i) => `${i ? 'Q' : 'M'}${i ? `${120 - Math.sin(a - 0.13) * r * 0.86} ${Math.cos(a - 0.13) * r * 0.86} ` : ''}${120 - Math.sin(a) * r} ${Math.cos(a) * r}`).join(' ')} />
      ))}
      <line x1="64" y1="62" x2="64" y2="124" strokeWidth="0.6" className="web-thread" />
      <g className="web-spider" fill="currentColor" stroke="none">
        <ellipse cx="64" cy="130" rx="3.2" ry="4" />
        <circle cx="64" cy="124.5" r="2.2" />
        <path d="M61 128l-5-3M61 131l-5 1M61 133l-4 4M67 128l5-3M67 131l5 1M67 133l4 4" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** A spider hanging from the top edge on a thread of `drop` px; it sways and bobs on its own clock. */
export function HangingSpider({ drop, delay = 0, className = '' }: { drop: number; delay?: number; className?: string }) {
  return (
    <span aria-hidden className={`hanging-spider pointer-events-none absolute top-0 select-none ${className}`} style={{ ['--drop' as string]: `${drop}px`, animationDelay: `${delay}s` }}>
      <span className="block w-px bg-current opacity-50" style={{ height: drop }} />
      <svg viewBox="0 0 24 24" className="-mt-0.5 -ml-[9px] size-[19px]" fill="currentColor">
        <ellipse cx="12" cy="14" rx="3.4" ry="4.2" />
        <circle cx="12" cy="8.2" r="2.4" />
        <path d="M9 12 4 9M9 14l-5.5 0M9 16l-4.5 3.5M15 12l5-3M15 14h5.5M15 16l4.5 3.5M10.5 7 9 4.5M13.5 7 15 4.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      </svg>
    </span>
  );
}
