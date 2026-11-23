/**
 * Per-ear pure-tone screen. Phone output is not calibrated, so levels are in dB relative to full
 * scale (dBFS) and nothing is reported in dB HL. What one device and one pair of earphones can show
 * honestly is the difference between the two ears and a drop at high frequencies, both of which are
 * worth a proper hearing test.
 *
 * Each threshold follows a simplified Hughson-Westlake procedure: start at -30 dBFS, go down 10 dB
 * after a response, up 5 dB after a miss, and stop at the lowest level heard on two ascending runs.
 */

export const FREQUENCIES = [1000, 2000, 4000] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export type Ear = 'right' | 'left';

export const START_DB = -30;
export const FLOOR_DB = -80;
export const CEILING_DB = -10;
const MAX_PRESENTATIONS = 14;

export interface ThresholdState {
  level: number;
  ascending: boolean;
  hits: Record<string, number>;
  heard: number[];
  presented: number;
  done: boolean;
  threshold: number | null;
}

export function startThreshold(): ThresholdState {
  return { level: START_DB, ascending: false, hits: {}, heard: [], presented: 0, done: false, threshold: null };
}

export function respondTone(s: ThresholdState, heard: boolean): ThresholdState {
  if (s.done) return s;
  const presented = s.presented + 1;
  if (heard) {
    const hits = s.ascending ? { ...s.hits, [s.level]: (s.hits[s.level] ?? 0) + 1 } : s.hits;
    const all = [...s.heard, s.level];
    if ((hits[s.level] ?? 0) >= 2) return { ...s, hits, heard: all, presented, done: true, threshold: s.level };
    const level = Math.max(FLOOR_DB, s.level - 10);
    // Heard at the floor twice in a row: the threshold is at or below what the device can play quietly.
    if (level === s.level && all.filter((v) => v === FLOOR_DB).length >= 2) return { ...s, hits, heard: all, presented, done: true, threshold: FLOOR_DB };
    if (presented >= MAX_PRESENTATIONS) return { ...s, hits, heard: all, presented, done: true, threshold: Math.min(...all) };
    return { ...s, level, ascending: false, hits, heard: all, presented };
  }
  if (s.level >= CEILING_DB || presented >= MAX_PRESENTATIONS) {
    return { ...s, presented, done: true, threshold: s.heard.length ? Math.min(...s.heard) : null };
  }
  return { ...s, level: Math.min(CEILING_DB, s.level + 5), ascending: true, presented };
}

export type EarThresholds = Record<Frequency, number | null>;

export interface ToneResult {
  right: EarThresholds;
  left: EarThresholds;
  /** Share of silent catch trials answered "heard". */
  falseAlarms: number;
  reliable: boolean;
  /** Ears differ by >= 15 dB at two frequencies or >= 20 dB at one. Null when unreliable. */
  asymmetry: boolean | null;
  /** An ear is >= 25 dB worse at 4 kHz than at 1 kHz. Null when unreliable. */
  highDrop: boolean | null;
}

/** No response at the loudest level counts as 10 dB above the ceiling for comparisons. */
const value = (v: number | null) => v ?? CEILING_DB + 10;

export function scoreTones(right: EarThresholds, left: EarThresholds, catchTrials: number, falseYes: number): ToneResult {
  const falseAlarms = catchTrials ? falseYes / catchTrials : 0;
  const reliable = falseAlarms <= 0.3;
  const diffs = FREQUENCIES.map((f) => Math.abs(value(right[f]) - value(left[f])));
  const asymmetry = diffs.filter((d) => d >= 15).length >= 2 || diffs.some((d) => d >= 20);
  const drop = (e: EarThresholds) => value(e[4000]) - value(e[1000]) >= 25;
  return { right, left, falseAlarms, reliable, asymmetry: reliable ? asymmetry : null, highDrop: reliable ? drop(right) || drop(left) : null };
}

/** The order the tones are tested in: each ear in turn, 1 kHz first (the easiest to hear). */
export const SEQUENCE: { ear: Ear; freq: Frequency }[] = (['right', 'left'] as const).flatMap((ear) => FREQUENCIES.map((freq) => ({ ear, freq })));
