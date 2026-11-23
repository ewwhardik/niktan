import type { Priority } from '@niktan/core';
import type { TokenRow } from './queue';

const PRIORITIES: Priority[] = ['emergency', 'today', 'routine'];
const MIN = 60_000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Measured consult durations are trusted once there are three of them; before that the department default is. */
export function consultMinutes(measuredMin: number[], fallbackMin: number, minSamples = 3): number {
  return measuredMin.length >= minSamples ? mean(measuredMin)! : fallbackMin;
}

/**
 * Counterfactual wait in a first-come-first-served line with the same doctor capacity. The moments the
 * doctor actually called someone are kept, but handed out in arrival order instead of priority order,
 * so idle time, breaks and a late start cost both worlds equally. Patients who would only reach the
 * doctor after the last real call are charged one consult time per place beyond it.
 *
 * (An earlier model assumed the doctor worked non-stop from the first arrival. When the doctor started
 * later than the first arrivals, that made the first-come line look free and priority look worse.)
 */
export function fcfsWaits(arrivals: { id: string; arrivedAt: number; number: number; calledAt: number | null }[], consultMin: number): Map<string, number> {
  const order = [...arrivals].sort((a, b) => a.arrivedAt - b.arrivedAt || a.number - b.number);
  const slots = arrivals.map((a) => a.calledAt).filter((t): t is number => t !== null).sort((a, b) => a - b);
  const last = slots.length ? slots[slots.length - 1]! : null;
  const waits = new Map<string, number>();
  order.forEach((a, k) => {
    const call = k < slots.length ? slots[k]! : (last ?? a.arrivedAt) + (k - slots.length + 1) * consultMin * MIN;
    waits.set(a.id, Math.max(0, call - a.arrivedAt) / MIN);
  });
  return waits;
}

export interface WaitPair {
  priority: Priority;
  actualMin: number;
  fcfsMin: number;
}

export interface PriorityImpact {
  n: number;
  actualMin: number | null;
  fcfsMin: number | null;
  /** Positive means the priority queue called this group sooner than first-come-first-served would have. */
  savedMin: number | null;
}

export function summariseWaits(pairs: WaitPair[]): PriorityImpact {
  const actual = mean(pairs.map((p) => p.actualMin));
  const fcfs = mean(pairs.map((p) => p.fcfsMin));
  return {
    n: pairs.length,
    actualMin: actual === null ? null : round1(actual),
    fcfsMin: fcfs === null ? null : round1(fcfs),
    savedMin: actual === null || fcfs === null ? null : round1(fcfs - actual),
  };
}

/** Share of doctor answers that said the pre-filled history helped; unanswered notes are left out. */
export function usefulShare(answers: (number | null)[]): { share: number | null; n: number } {
  const given = answers.filter((a): a is number => a === 0 || a === 1);
  return { share: given.length ? Math.round((given.filter((a) => a === 1).length / given.length) * 1000) / 1000 : null, n: given.length };
}

export interface ImpactVisit {
  id: string;
  number: number;
  department: string;
  simulated: boolean;
  priority: Priority;
  status: TokenRow['status'];
  arrivedAt: number;
  /** When the patient was called, or went straight in. */
  calledAt: number | null;
  consultStart: number | null;
  consultEnd: number | null;
  historyUseful: number | null;
}

/** Without triage there is no emergency bypass: that patient would have queued in General Medicine. */
const isEmergency = (department: string) => department.endsWith(':emergency');
const fcfsLine = (department: string) => (isEmergency(department) ? department.replace(/:emergency$/, ':medicine') : department);

/**
 * Compares each called patient's real wait with the first-come-first-served counterfactual, per
 * department line and separately for real and simulated visits, since the two never share a queue.
 * Emergency-routed patients are placed in the General Medicine line they would have joined, and their
 * fast-track call is not counted as a slot of that line. Simulated consults run `simTimeScale` times
 * faster, so their default consult time is scaled too.
 */
export function measureImpact(visits: ImpactVisit[], defaultConsultMin: (department: string) => number, simTimeScale: number) {
  const groups = new Map<string, ImpactVisit[]>();
  for (const v of visits) {
    const key = `${v.simulated ? 1 : 0}|${fcfsLine(v.department)}`;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  const pairs: (WaitPair & { simulated: boolean })[] = [];
  const durations: { simulated: boolean; min: number }[] = [];
  for (const group of groups.values()) {
    const { simulated } = group[0]!;
    const line = fcfsLine(group[0]!.department);
    const measuredOf = (vs: ImpactVisit[]) => vs
      .filter((v) => v.consultStart !== null && v.consultEnd !== null && v.consultEnd >= v.consultStart)
      .map((v) => (v.consultEnd! - v.consultStart!) / MIN);
    for (const min of measuredOf(group)) durations.push({ simulated, min });
    const consult = consultMinutes(measuredOf(group.filter((v) => !isEmergency(v.department))), defaultConsultMin(line) / (simulated ? simTimeScale : 1));
    // Someone who left before being called took no doctor time in either world.
    const inLine = group.filter((v) => v.calledAt !== null || v.status !== 'left');
    const fcfs = fcfsWaits(inLine.map((v) => (isEmergency(v.department) ? { ...v, calledAt: null } : v)), consult);
    for (const v of inLine) {
      if (v.calledAt === null) continue;
      pairs.push({ priority: v.priority, simulated, actualMin: Math.max(0, (v.calledAt - v.arrivedAt) / MIN), fcfsMin: fcfs.get(v.id)! });
    }
  }

  const block = (includeSimulated: boolean) => {
    const keep = <T extends { simulated: boolean }>(xs: T[]) => (includeSimulated ? xs : xs.filter((x) => !x.simulated));
    const p = keep(pairs);
    const vs = keep(visits);
    const consult = mean(keep(durations).map((d) => d.min));
    return {
      visits: vs.length,
      called: p.length,
      simulatedVisits: vs.filter((v) => v.simulated).length,
      priorities: Object.fromEntries(PRIORITIES.map((pr) => [pr, summariseWaits(p.filter((x) => x.priority === pr))])) as Record<Priority, PriorityImpact>,
      urgent: summariseWaits(p.filter((x) => x.priority !== 'routine')),
      consultMin: consult === null ? null : round1(consult),
      consults: keep(durations).length,
      historyUseful: usefulShare(vs.map((v) => v.historyUseful)),
    };
  };
  return { real: block(false), all: { ...block(true), includesSimulated: visits.some((v) => v.simulated) } };
}
