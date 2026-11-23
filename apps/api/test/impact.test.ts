import { expect, test } from 'vitest';
import { consultMinutes, fcfsWaits, measureImpact, summariseWaits, usefulShare, type ImpactVisit } from '../src/lib/impact';

const MIN = 60_000;
const arrival = (id: string, minute: number, number = 0) => ({ id, arrivedAt: minute * MIN, number });

test('a full first-come line charges each patient for everyone who arrived before them', () => {
  const waits = fcfsWaits([arrival('a', 0, 1), arrival('b', 0, 2), arrival('c', 0, 3), arrival('d', 0, 4)], 6);
  expect([...waits.values()]).toEqual([0, 6, 12, 18]);
});

test('arrivals after the line has cleared are not charged for patients already seen', () => {
  const waits = fcfsWaits([arrival('late', 30), arrival('early', 0), arrival('next', 2)], 5);
  expect(waits.get('early')).toBe(0);
  expect(waits.get('next')).toBe(3);
  expect(waits.get('late')).toBe(0);
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
  expect(real.priorities.today).toEqual({ n: 1, actualMin: 1, fcfsMin: 15, savedMin: 14 });
  expect(real.priorities.routine).toEqual({ n: 1, actualMin: 8, fcfsMin: 0, savedMin: -8 });
  expect(real.priorities.emergency.n).toBe(0);
  expect(real.urgent.savedMin).toBe(14);
  expect(real).toMatchObject({ visits: 5, called: 2, simulatedVisits: 0, consultMin: 5, consults: 2, historyUseful: { share: 1, n: 1 } });
  expect(all.includesSimulated).toBe(true);
  expect(all).toMatchObject({ visits: 6, called: 3, simulatedVisits: 1, historyUseful: { share: 0.5, n: 2 } });
  expect(all.priorities.emergency).toEqual({ n: 1, actualMin: 0.2, fcfsMin: 0, savedMin: -0.2 });
});
