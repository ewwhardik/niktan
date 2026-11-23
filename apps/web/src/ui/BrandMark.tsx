export function BrandMark({ className = 'size-7' }: { className?: string }) {
  return (
    <img src="/brand/niktan-mark.svg" width={28} height={28} alt="" className={`shrink-0 object-contain ${className}`} />
  );
}
