import { write } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export type ReviewDisputeResolutionRunStatus = 'active' | 'succeeded' | 'failed' | 'expired'

async function insertRun(query: QueryExecutor, disputeId: string): Promise<string | undefined> {
  const { rows } = await query<{ id: string }>(sql`
    /* admitReviewDisputeResolutionRun */
    WITH inserted AS (
      INSERT INTO review_dispute_resolution_runs (review_dispute_id)
      SELECT rd.id
      FROM review_disputes rd
      WHERE rd.id = ${disputeId}::uuid
        AND rd.approved_at IS NULL
        AND rd.sent_at IS NULL
        AND rd.resolved_at IS NULL
      ON CONFLICT (review_dispute_id)
        WHERE completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
        DO NOTHING
      RETURNING id, review_dispute_id
    ), requested AS (
      UPDATE review_disputes rd
      SET ai_draft_requested_run_id = inserted.id
      FROM inserted
      WHERE rd.id = inserted.review_dispute_id
      RETURNING rd.id
    )
    SELECT id FROM inserted
  `)
  return rows[0]?.id
}

async function readActiveRun(query: QueryExecutor, disputeId: string): Promise<string | undefined> {
  const { rows } = await query<{ id: string }>(sql`
    /* admitReviewDisputeResolutionRun:readActive */
    SELECT run.id
    FROM review_dispute_resolution_runs run
    JOIN review_disputes rd ON rd.id = run.review_dispute_id
    WHERE run.review_dispute_id = ${disputeId}::uuid
      AND rd.approved_at IS NULL AND rd.sent_at IS NULL AND rd.resolved_at IS NULL
      AND run.completed_at IS NULL AND run.failed_at IS NULL AND run.expired_at IS NULL
  `)
  return rows[0]?.id
}

/**
 * Admits one AI draft request for an eligible dispute. A concurrent or repeated admission loses
 * the partial unique index and reads the existing active run, so admission needs no lock. If that
 * run finished between the conflict and the read, the rare race is a 409 and the caller retries.
 */
export async function admitReviewDisputeResolutionRun(
  disputeId: string,
  query: QueryExecutor = write,
): Promise<{ runId: string; inserted: boolean }> {
  const inserted = await insertRun(query, disputeId)
  if (inserted) return { runId: inserted, inserted: true }
  const active = await readActiveRun(query, disputeId)
  assert(active, 409, 'Dispute resolution run changed while it was requested; try again')
  return { runId: active, inserted: false }
}

/** True while the run is still the one admitted request that may save a draft. */
export async function isActiveReviewDisputeResolutionRun(
  disputeId: string,
  runId: string,
): Promise<boolean> {
  const { rows } = await write<{ id: string }>(sql`
    /* isActiveReviewDisputeResolutionRun */
    SELECT id
    FROM review_dispute_resolution_runs
    WHERE id = ${runId}::uuid AND review_dispute_id = ${disputeId}::uuid
      AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
  `)
  return rows.length === 1
}

/** Records definitive terminal failures only, never retries. A finished run is left untouched. */
export async function markReviewDisputeResolutionRunsFailed(
  runIds: readonly string[],
): Promise<number> {
  if (runIds.length === 0) return 0
  const { rowCount } = await write(sql`/* markReviewDisputeResolutionRunsFailed */
    UPDATE review_dispute_resolution_runs
    SET failed_at = now()
    WHERE id = ANY(${[...new Set(runIds)]}::uuid[])
      AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
    RETURNING id
  `)
  return rowCount ?? 0
}

/** Marks a worker's confirmed no-result completion; a run that saved a draft is left untouched. */
export async function markReviewDisputeResolutionRunExpired(runId: string): Promise<void> {
  await write(sql`/* markReviewDisputeResolutionRunExpired */
    UPDATE review_dispute_resolution_runs
    SET expired_at = now()
    WHERE id = ${runId}::uuid
      AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
    RETURNING id
  `)
}
