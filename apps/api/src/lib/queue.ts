import { PRIORITY_ORDER, type Priority } from '@niktan/core';
import type { Env } from '../env';
import { istDay } from './util';

export interface TokenRow {
  id: string;
  session_id: string;
  department_id: string;
  number: number;
  day: string;
  priority: Priority;
  status: 'waiting' | 'called' | 'in_consult' | 'done' | 'left';
  created_at: number;
  called_at: number | null;
  consult_start: number | null;
  consult_end: number | null;
  simulated: number;
}

/** Waiting order: priority first, then arrival. Same order on the board and for the citizen's position. */
export function compareTokens(a: Pick<TokenRow, 'priority' | 'created_at'>, b: Pick<TokenRow, 'priority' | 'created_at'>) {
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.created_at - b.created_at;
}

/** Rolling mean of the last 20 real consults, else the department default. */
export async function avgConsultMinutes(env: Env, departmentId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT AVG(d) AS avg, COUNT(*) AS n FROM (
       SELECT (consult_end - consult_start) / 60000.0 AS d FROM tokens
       WHERE department_id = ? AND consult_end IS NOT NULL AND consult_start IS NOT NULL AND simulated = 0
       ORDER BY consult_end DESC LIMIT 20)`,
  )
    .bind(departmentId)
    .first<{ avg: number | null; n: number }>();
  if (row && row.n >= 3 && row.avg) return Math.min(30, Math.max(1, row.avg));
  const dept = await env.DB.prepare('SELECT avg_consult_min FROM departments WHERE id = ?').bind(departmentId).first<{ avg_consult_min: number }>();
  return dept?.avg_consult_min ?? 6;
}

export async function queuePosition(env: Env, token: TokenRow) {
  const { results } = await env.DB.prepare(
    `SELECT id, priority, created_at, status FROM tokens WHERE department_id = ? AND day = ? AND status IN ('waiting', 'called', 'in_consult')`,
  )
    .bind(token.department_id, token.day)
    .all<Pick<TokenRow, 'id' | 'priority' | 'created_at' | 'status'>>();
  const waiting = results.filter((t) => t.status === 'waiting').sort(compareTokens);
  const inProgress = results.filter((t) => t.status !== 'waiting').length;
  const ahead = token.status === 'waiting' ? waiting.findIndex((t) => t.id === token.id) : 0;
  const avg = await avgConsultMinutes(env, token.department_id);
  // Patients already with the doctor are assumed half done on average.
  const etaMin = token.status === 'waiting' ? Math.round((ahead + inProgress * 0.5) * avg) : 0;
  return { ahead: Math.max(0, ahead), etaMin, avgConsultMin: Math.round(avg * 10) / 10 };
}

/**
 * Moves simulated patients along so the demo board looks like a working OPD. Real patients are only
 * ever moved by staff. Runs lazily when the board is read; consult time is compressed 10x.
 */
export async function tickSimulation(env: Env, hospitalId: string) {
  const day = istDay();
  const t = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT t.*, d.avg_consult_min FROM tokens t JOIN departments d ON d.id = t.department_id
     WHERE d.hospital_id = ? AND t.day = ? AND t.status IN ('waiting', 'called', 'in_consult')`,
  )
    .bind(hospitalId, day)
    .all<TokenRow & { avg_consult_min: number }>();

  const updates: D1PreparedStatement[] = [];
  const byDept = new Map<string, (TokenRow & { avg_consult_min: number })[]>();
  for (const r of results) byDept.set(r.department_id, [...(byDept.get(r.department_id) ?? []), r]);

  for (const tokens of byDept.values()) {
    const active = tokens.find((x) => x.status === 'in_consult' || x.status === 'called');
    if (active?.simulated) {
      const started = active.consult_start ?? active.called_at ?? t;
      if (t - started > active.avg_consult_min * 6000) {
        updates.push(env.DB.prepare(`UPDATE tokens SET status = 'done', consult_end = ? WHERE id = ?`).bind(t, active.id));
      } else if (active.status === 'called') {
        updates.push(env.DB.prepare(`UPDATE tokens SET status = 'in_consult', consult_start = ? WHERE id = ?`).bind(t, active.id));
      }
      continue;
    }
    if (active) continue;
    const next = tokens.filter((x) => x.status === 'waiting').sort(compareTokens)[0];
    if (next?.simulated && t - next.created_at > 15_000) {
      updates.push(env.DB.prepare(`UPDATE tokens SET status = 'called', called_at = ? WHERE id = ?`).bind(t, next.id));
    }
  }
  if (updates.length) await env.DB.batch(updates);
}
