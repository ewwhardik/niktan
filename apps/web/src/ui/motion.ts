import type { Transition, Variants } from 'motion/react';

/**
 * Spring presets (stiffness/damping/mass), tuned for settle time and overshoot:
 * press ~190 ms no overshoot · chip ~240 ms slight bounce · step ~285 ms · stagger ~270 ms ·
 * shared ~350 ms · sheet critically damped · verdict ~440 ms with 4 % overshoot (never for Emergency).
 */
export const springs = {
  press: { type: 'spring', stiffness: 700, damping: 40, mass: 0.6 },
  chip: { type: 'spring', stiffness: 500, damping: 28, mass: 0.7 },
  step: { type: 'spring', stiffness: 380, damping: 36, mass: 1 },
  stagger: { type: 'spring', stiffness: 300, damping: 28, mass: 0.8 },
  shared: { type: 'spring', stiffness: 260, damping: 30, mass: 1 },
  sheet: { type: 'spring', stiffness: 420, damping: 42, mass: 1 },
  verdict: { type: 'spring', stiffness: 220, damping: 21, mass: 1 },
  verdictUrgent: { type: 'spring', stiffness: 380, damping: 36, mass: 1 },
  progress: { type: 'spring', stiffness: 120, damping: 24, mass: 1 },
  toast: { type: 'spring', stiffness: 320, damping: 30, mass: 1 },
} satisfies Record<string, Transition>;

/** Short aliases used across components. */
export const spring = {
  tap: springs.press,
  screen: springs.step,
  reveal: springs.stagger,
  sheet: springs.sheet,
  layout: springs.shared,
  chip: springs.chip,
};

export const ease = [0.22, 1, 0.36, 1] as const;
export const easeIn = [0.4, 0, 1, 1] as const;
export const exitFast: Transition = { duration: 0.16, ease: easeIn };

/** Step-to-step screen transition; direction 1 = forward, -1 = back. */
export const screenVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 24 }),
  center: { opacity: 1, x: 0, transition: springs.step },
  exit: (dir: number) => ({ opacity: 0, x: dir * -16, transition: exitFast }),
};

export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

export const riseChild: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: springs.stagger },
};
