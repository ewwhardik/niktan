import type { Env } from '../env';

const DAY = 86400_000;
// Each statement removes at most CHUNK rows and a run stops after MAX_ROUNDS batches, which keeps
// one cron invocation well inside D1's per-query time and the Worker's per-invocation query budget.
// Anything left over goes on the next night's run.
const CHUNK = 500;
const MAX_ROUNDS = 8;

export function retentionDays(env: Pick<Env, 'RETENTION_DAYS'>): number {
  const days = Number(env.RETENTION_DAYS);
  return Number.isFinite(days) && days >= 1 ? Math.floor(days) : 30;
}

export interface RetentionResult {
  sessions: number;
  feedback: number;
  thaliScans: number;
  audit: number;
  aiCalls: number;
  rateLimits: number;
  rounds: number;
}

/**
 * Real screenings expire after RETENTION_DAYS, simulated ones after 2 days. Measurements, triage,
 * tokens, doctor notes and thali scans go with their session through ON DELETE CASCADE; feedback has
 * no foreign key, so it is removed first. Thali scans are also kept for only 7 days on their own.
 */
export async function runRetention(env: Env, t = Date.now()): Promise<RetentionResult> {
  const db = env.DB;
  const realCutoff = t - retentionDays(env) * DAY;
  const simCutoff = t - 2 * DAY;
  const expired = `SELECT id FROM sessions WHERE (simulated = 0 AND created_at < ?1) OR (simulated = 1 AND created_at < ?2) ORDER BY created_at LIMIT ${CHUNK}`;
  const oldest = (table: string, column: string) =>
    `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${column} < ? LIMIT ${CHUNK})`;
  const totals: RetentionResult = { sessions: 0, feedback: 0, thaliScans: 0, audit: 0, aiCalls: 0, rateLimits: 0, rounds: 0 };

  while (totals.rounds < MAX_ROUNDS) {
    totals.rounds++;
    const [linkedFeedback, oldFeedback, sessions, thali, audit, aiCalls, rateLimits] = await db.batch([
      db.prepare(`DELETE FROM feedback WHERE session_id IN (${expired})`).bind(realCutoff, simCutoff),
      db.prepare(oldest('feedback', 'created_at')).bind(realCutoff),
      db.prepare(`DELETE FROM sessions WHERE id IN (${expired})`).bind(realCutoff, simCutoff),
      db.prepare(oldest('thali_scans', 'created_at')).bind(t - 7 * DAY),
      db.prepare(oldest('audit_log', 'at')).bind(t - 180 * DAY),
      db.prepare(oldest('ai_calls', 'created_at')).bind(t - 30 * DAY),
      db.prepare(oldest('rate_limits', 'window_start')).bind(Math.floor(t / 1000) - 86400),
    ]);
    const n = (r: D1Result | undefined) => r?.meta.changes ?? 0;
    const round = {
      feedback: n(linkedFeedback) + n(oldFeedback),
      sessions: n(sessions),
      thaliScans: n(thali),
      audit: n(audit),
      aiCalls: n(aiCalls),
      rateLimits: n(rateLimits),
    };
    for (const [k, v] of Object.entries(round)) totals[k as keyof typeof round] += v;
    // A round that hit no chunk limit has emptied every table it covers.
    if (Object.values(round).every((v) => v < CHUNK)) break;
  }
  return totals;
}
