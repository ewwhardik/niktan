/** Infinite horizontal ticker. Pure CSS transform animation; pauses on hover and with reduced motion. */
export function Marquee({ items, className = '' }: { items: string[]; className?: string }) {
  const row = (hidden: boolean) => (
    <ul className="marquee-track flex shrink-0 items-center gap-10 pr-10" aria-hidden={hidden || undefined}>
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-10 whitespace-nowrap">
          <span>{it}</span>
          <span className="size-1.5 rounded-full bg-current opacity-30" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className={`marquee group flex overflow-hidden ${className}`}>
      {row(false)}
      {row(true)}
    </div>
  );
}
