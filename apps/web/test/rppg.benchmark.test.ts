import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { estimate, type RgbSample } from '../src/cv/rppg';
import { estimateMulti, ROI_NAMES, type MultiSample } from '../src/cv/rppg2';

/**
 * Real-video benchmark. Point RPPG_TRACES at a folder of per-video trace JSON files (per-frame
 * region RGB means extracted with the app's own landmark regions, plus ground-truth HR from a
 * contact PPG). Runs v1 and v2 on 30 s segments, the length of an in-app scan.
 *
 *   RPPG_TRACES=~/niktan-datasets/rppg/traces npx vitest run test/rppg.benchmark.test.ts
 */
const DIR = process.env.RPPG_TRACES;

interface Trace {
  subject: string;
  lighting?: string;
  motion?: boolean;
  frames: { t: number; face: boolean; roi: Record<string, { r: number; g: number; b: number; n: number }>; roiSkin: Record<string, { r: number; g: number; b: number; n: number }> }[];
  gt: { t: number[]; hr: number[] };
}

const SEGMENT = 30;
const STRIDE = 15;

interface WindowResult {
  recording: string;
  subject: string;
  lighting: string;
  motion: boolean;
  method: string;
  startSeconds: number;
  error: number | null;
  runtimeMs: number;
}

// Nearest-rank quantiles. An empty group has no measured error or runtime.
function percentile(values: number[], fraction: number) {
  return values.sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1] ?? null;
}

function stats(rows: WindowResult[]) {
  const errors = rows.flatMap(row => row.error === null ? [] : [Math.abs(row.error)]);
  const motion = rows.filter(row => row.motion);
  return {
    windows: rows.length, accepted: errors.length, coverage: errors.length / rows.length,
    mae: errors.length ? errors.reduce((sum, x) => sum + x, 0) / errors.length : null,
    rmse: errors.length ? Math.sqrt(errors.reduce((sum, x) => sum + x * x, 0) / errors.length) : null,
    within5: errors.filter(x => x <= 5).length / rows.length,
    medianAbsoluteError: percentile(errors, 0.5), p95AbsoluteError: percentile(errors, 0.95),
    motionWindows: motion.length,
    motionFalseAcceptance: motion.length ? motion.filter(row => row.error !== null && Math.abs(row.error) > 5).length / motion.length : null,
    medianRuntimeMs: percentile(rows.map(row => row.runtimeMs), 0.5),
    p95RuntimeMs: percentile(rows.map(row => row.runtimeMs), 0.95),
  };
}

function summarize(rows: WindowResult[]) {
  return Object.fromEntries([...new Set(rows.map(row => row.method))].map(method =>
    [method, stats(rows.filter(row => row.method === method))]));
}

describe.skipIf(!DIR)('rPPG benchmark on region traces', () => {
  it('compares v1 and v2', () => {
    const files = readdirSync(DIR!).filter(f => f.endsWith('.json')).sort();
    const rows: WindowResult[] = [];
    for (const f of files) {
      const tr = JSON.parse(readFileSync(join(DIR!, f), 'utf8')) as Trace;
      const frames = tr.frames.filter((fr) => fr.face && ROI_NAMES.every((k) => (fr.roi[k]?.n ?? 0) > 0));
      if (!tr.frames.length) continue;
      const tEnd = tr.frames.at(-1)!.t;
      for (let s = tr.frames[0]!.t + 2; s + SEGMENT <= tEnd; s += STRIDE) {
        const seg = frames.filter((fr) => fr.t >= s && fr.t < s + SEGMENT);
        const gtHr = tr.gt.t.map((t, i) => ({ t, hr: tr.gt.hr[i]! })).filter((x) => x.t >= s && x.t < s + SEGMENT && Number.isFinite(x.hr)).map((x) => x.hr).sort((a, b) => a - b);
        if (gtHr.length < 5) continue;
        const gt = gtHr[Math.floor(gtHr.length / 2)]!;
        const combined: RgbSample[] = seg.map((fr) => {
          const n = ROI_NAMES.reduce((a, k) => a + fr.roi[k]!.n, 0);
          const avg = (c: 'r' | 'g' | 'b') => ROI_NAMES.reduce((a, k) => a + fr.roi[k]![c] * fr.roi[k]!.n, 0) / n;
          return { t: fr.t, r: avg('r'), g: avg('g'), b: avg('b') };
        });
        const multi: MultiSample[] = seg.map((fr) => ({ t: fr.t, rois: fr.roi }));
        const multiSkin: MultiSample[] = seg.map((fr) => ({ t: fr.t, rois: fr.roiSkin ?? fr.roi }));
        const methods = {
          v1: () => estimate(combined), v2: () => estimateMulti(multi), v2skin: () => estimateMulti(multiSkin),
        };
        for (const [method, run] of Object.entries(methods)) {
          const start = performance.now();
          const { heartRate } = run();
          rows.push({ recording: f, subject: tr.subject, lighting: tr.lighting ?? 'unspecified', motion: tr.motion === true,
            method, startSeconds: s, error: heartRate === null ? null : heartRate - gt, runtimeMs: performance.now() - start });
        }
      }
    }
    if (!rows.length) throw new Error('No 30-second windows with paired reference measurements.');
    const by = (field: 'recording' | 'lighting') => Object.fromEntries(
      [...new Set(rows.map(row => row[field]))].map(value => [value, summarize(rows.filter(row => row[field] === value))]));
    const report = summarize(rows);
    console.table(report);
    if (process.env.RPPG_REPORT) writeFileSync(process.env.RPPG_REPORT, JSON.stringify({
      version: 2, report, byRecording: by('recording'), byLighting: by('lighting'), windows: rows,
    }, null, 2));
  });
});
