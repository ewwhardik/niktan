import { expect, test } from 'vitest';
import { consultMinutes, fcfsWaits, measureImpact, summariseWaits, usefulShare, type ImpactVisit } from '../src/lib/impact';

const MIN = 60_000;
const arrival = (id: string, minute: number, number = 0, calledMinute: number | null = null) => ({
  id, arrivedAt: minute * MIN, number, calledAt: calledMinute === null ? null : calledMinute * MIN,
});

test('first-come-first-served hands the real call times out in arrival order', () => {
  // The doctor called at minutes 10, 16 and 22; priority called d (arrived last) first.
  const waits = fcfsWaits([arrival('a', 0, 1, 16), arrival('b', 1, 2, 22), arrival('c', 2, 3), arrival('d', 3, 4, 10)], 6);
  expect(Object.fromEntries(waits)).toEqual({ a: 10, b: 15, c: 20, d: 25 });
});

test('a doctor who starts late costs both lines the same, so the first-come line is not free', () => {
  // Everyone arrived before the doctor started at minute 30; the old non-stop model said zero wait.
  const waits = fcfsWaits([arrival('a', 0, 1, 30), arrival('b', 1, 2, 31)], 1);
  expect(waits.get('a')).toBe(30);
  expect(waits.get('b')).toBe(30);
});

test('patients beyond the last real call are charged one consult per place', () => {
  const waits = fcfsWaits([arrival('a', 0, 1, 5), arrival('b', 0, 2), arrival('c', 0, 3)], 4);
  expect([waits.get('a'), waits.get('b'), waits.get('c')]).toEqual([5, 9, 13]);
});

test('measured consult time replaces the department default only from three samples', () => {
  expect(consultMinutes([4, 5], 6)).toBe(6);
  expect(consultMinutes([4, 5, 9], 6)).toBe(6);
  expect(consultMinutes([3, 4, 5], 6)).toBe(4);
});

test('wait summaries report saved minutes and stay null when nobody was called', () => {
  expect(summariseWaits([])).toEqual({ n: 0, actualMin: null, fcfsMin: null, savedMin: null });
  expect(summariseWaits([
    { priority: 'today', actualMin: 1, fcfsMin: 15 },
    { priority: 'today', actualMin: 2.5, fcfsMin: 9 },
  ])).toEqual({ n: 2, actualMin: 1.8, fcfsMin: 12, savedMin: 10.3 });
});

test('usefulness share ignores notes without an answer', () => {
  expect(usefulShare([1, 0, null, 1])).toEqual({ share: 0.667, n: 3 });
  expect(usefulShare([null])).toEqual({ share: null, n: 0 });
});

const visit = (v: Partial<ImpactVisit> & Pick<ImpactVisit, 'id' | 'arrivedAt'>): ImpactVisit => ({
  number: 0,
  department: 'h:medicine',
  simulated: false,
  priority: 'routine',
  status: 'waiting',
  calledAt: null,
  consultStart: null,
  consultEnd: null,
  historyUseful: null,
  ...v,
});

test('impact compares real and simulated queues separately and skips patients who left uncalled', () => {
  const visits = [
    visit({ id: 'r1', number: 1, arrivedAt: 0, status: 'done', calledAt: 8 * MIN, consultStart: 8 * MIN, consultEnd: 14 * MIN }),
    visit({ id: 'gone', number: 2, arrivedAt: 0.5 * MIN, status: 'left' }),
    visit({ id: 'r2', number: 3, arrivedAt: 1 * MIN }),
    visit({ id: 'r3', number: 4, arrivedAt: 2 * MIN }),
    visit({ id: 't', number: 5, arrivedAt: 3 * MIN, priority: 'today', status: 'done', calledAt: 4 * MIN, consultStart: 4 * MIN, consultEnd: 8 * MIN, historyUseful: 1 }),
    visit({ id: 's1', number: 1, arrivedAt: 0, simulated: true, priority: 'emergency', status: 'called', calledAt: 0.2 * MIN, historyUseful: 0 }),
  ];
  const { real, all } = measureImpact(visits, () => 6, 10);
  expect(real.priorities.today).toEqual({ n: 1, actualMin: 1, fcfsMin: 17, savedMin: 16 });
  expect(real.priorities.routine).toEqual({ n: 1, actualMin: 8, fcfsMin: 4, savedMin: -4 });
  expect(real.priorities.emergency.n).toBe(0);
  expect(real.urgent.savedMin).toBe(16);
  expect(real).toMatchObject({ visits: 5, called: 2, simulatedVisits: 0, consultMin: 5, consults: 2, historyUseful: { share: 1, n: 1 } });
  expect(all.includesSimulated).toBe(true);
  expect(all).toMatchObject({ visits: 6, called: 3, simulatedVisits: 1, historyUseful: { share: 0.5, n: 2 } });
  expect(all.priorities.emergency).toEqual({ n: 1, actualMin: 0.2, fcfsMin: 0.2, savedMin: 0 });
});

test('an emergency bypass is compared with the General Medicine line the patient would have joined', () => {
  const visits = [
    visit({ id: 'm1', number: 1, arrivedAt: 0, status: 'done', calledAt: 2 * MIN, consultStart: 2 * MIN, consultEnd: 8 * MIN }),
    visit({ id: 'm2', number: 2, arrivedAt: 1 * MIN, status: 'called', calledAt: 8 * MIN }),
    visit({ id: 'er', number: 1, department: 'h:emergency', arrivedAt: 3 * MIN, priority: 'emergency', status: 'in_consult', calledAt: 3 * MIN }),
  ];
  const { real } = measureImpact(visits, () => 6, 10);
  // First-come: m1 at 2, m2 at 8, then the emergency one consult (6 min) after the last real call.
  expect(real.priorities.emergency).toEqual({ n: 1, actualMin: 0, fcfsMin: 11, savedMin: 11 });
  expect(real.priorities.routine.n).toBe(2);
});
