import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { spring } from './motion';

type Variant = 'primary' | 'secondary' | 'ghost' | 'emergency';

const styles: Record<Variant, string> = {
  primary: 'h-14 w-full bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-press shadow-2 text-title-3 font-semibold',
  secondary: 'h-14 w-full bg-surface text-text border border-border hover:bg-sunken text-title-3 font-semibold shadow-1',
  ghost: 'h-12 px-4 text-text-2 hover:text-text text-body-lg',
  emergency: 'h-16 w-full bg-emergency text-emergency-on text-title-2 font-semibold shadow-3',
};

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  icon?: LucideIcon;
  trailingIcon?: LucideIcon;
  loading?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', icon: Icon, trailingIcon: Trailing, loading, disabled, className = '', children, ...rest },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <motion.button
      ref={ref}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      transition={spring.tap}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`relative inline-flex select-none items-center justify-center gap-2.5 rounded-md transition-colors duration-150 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-text-3 disabled:shadow-none ${styles[variant]} ${className}`}
      {...rest}
    >
      <span className={`inline-flex items-center gap-2.5 transition-opacity duration-150 ${loading ? 'opacity-0' : 'opacity-100'}`}>
        {Icon && <Icon size={22} strokeWidth={1.75} aria-hidden />}
        {children}
        {Trailing && <Trailing size={20} strokeWidth={1.75} aria-hidden />}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="size-2 rounded-full bg-current"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1, 0.85] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </span>
      )}
    </motion.button>
  );
});

export function LinkButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`min-h-12 px-3 text-body-lg text-text-2 underline-offset-4 hover:text-text hover:underline ${className}`} {...props} />;
}
