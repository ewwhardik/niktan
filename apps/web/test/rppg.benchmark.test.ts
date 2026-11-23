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
  frames: { t: number; face: boolean; roi: Record<string, { r: number; g: number; b: number; n: number }>; roiSkin: Record<string, { r: number; g: number; b: number; n: number }> }[];
  gt: { t: number[]; hr: number[] };
}

const SEGMENT = 30;
const STRIDE = 15;

function stats(errors: (number | null)[]) {
  const ok = errors.filter((e): e is number => e !== null);
  const mae = ok.reduce((a, e) => a + Math.abs(e), 0) / Math.max(1, ok.length);
  const rmse = Math.sqrt(ok.reduce((a, e) => a + e * e, 0) / Math.max(1, ok.length));
  const within5 = ok.filter((e) => Math.abs(e) <= 5).length / Math.max(1, errors.length);
  return { n: errors.length, coverage: ok.length / Math.max(1, errors.length), mae, rmse, within5 };
}

describe.skipIf(!DIR)('rPPG benchmark on real video traces', () => {
  it('compares v1 and v2', () => {
    const files = readdirSync(DIR!).filter((f) => f.endsWith('.json'));
    const errs: Record<string, (number | null)[]> = { v1: [], v2: [], v2skin: [] };
    const perSubject: Record<string, Record<string, number | null>[]> = {};
    for (const f of files) {
      const tr = JSON.parse(readFileSync(join(DIR!, f), 'utf8')) as Trace;
      const frames = tr.frames.filter((fr) => fr.face && ROI_NAMES.every((k) => (fr.roi[k]?.n ?? 0) > 0));
      if (!frames.length) continue;
      const tEnd = frames.at(-1)!.t;
      for (let s = frames[0]!.t + 2; s + SEGMENT <= tEnd; s += STRIDE) {
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
        const v1 = estimate(combined).heartRate;
        const v2 = estimateMulti(multi).heartRate;
        const v2s = estimateMulti(multiSkin).heartRate;
        const row = { v1: v1 === null ? null : v1 - gt, v2: v2 === null ? null : v2 - gt, v2skin: v2s === null ? null : v2s - gt };
        errs.v1!.push(row.v1);
        errs.v2!.push(row.v2);
        errs.v2skin!.push(row.v2skin);
        (perSubject[tr.subject] ??= []).push(row);
      }
    }
    const report = Object.fromEntries(Object.entries(errs).map(([k, v]) => [k, stats(v)]));
    console.table(Object.fromEntries(Object.entries(report).map(([k, r]) => [k, { segments: r.n, coverage: r.coverage.toFixed(2), MAE: r.mae.toFixed(2), RMSE: r.rmse.toFixed(2), 'within ±5': r.within5.toFixed(2) }])));
    if (process.env.RPPG_REPORT) writeFileSync(process.env.RPPG_REPORT, JSON.stringify({ report, perSubject }, null, 2));
  });
});
