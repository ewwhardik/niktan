import type { Env } from '../env';
import { newId } from './util';

export type AuditAction =
  | 'login'
  | 'login_failed'
  | `token.${'call' | 'start' | 'end' | 'left' | 'requeue'}`
  | 'note.save'
  | 'simulate'
  | 'simulate.clear';

/**
 * Appends to the staff audit trail. Detail is a small JSON object of counts and flags, never note
 * text, PINs or patient data. A failed write is logged but does not undo the action it describes.
 */
export async function audit(
  env: Env,
  entry: { hospitalId: string; staffId: string | null; action: AuditAction; tokenId?: string | null; detail?: Record<string, unknown> },
) {
  try {
    // Failed logins name an arbitrary hospital id; only known hospitals get a trail.
    await env.DB.prepare(
      `INSERT INTO audit_log (id, at, staff_id, hospital_id, action, token_id, detail)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE EXISTS (SELECT 1 FROM hospitals WHERE id = ?4)`,
    )
      .bind(newId('a'), Date.now(), entry.staffId, entry.hospitalId, entry.action, entry.tokenId ?? null, entry.detail ? JSON.stringify(entry.detail) : null)
      .run();
  } catch (err) {
    console.error(JSON.stringify({ msg: 'audit write failed', action: entry.action, error: (err as Error).name }));
  }
}
