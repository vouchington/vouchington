import { write } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export type ReviewDisputeResolutionRunStatus = 'active' | 'succeeded' | 'failed' | 'expired'

async function insertRun(query: QueryExecutor, disputeId: string): Promise<string | undefined> {
  const { rows } = await query<{ id: string }>(sql`
    /* admitReviewDisputeResolutionRun */
    INSERT INTO review_dispute_resolution_runs (review_dispute_id)
    SELECT rd.id
    FROM review_disputes rd
    WHERE rd.id = ${disputeId}::uuid
      AND rd.approved_at IS NULL
      AND rd.sent_at IS NULL
      AND rd.resolved_at IS NULL
    ON CONFLICT DO NOTHING
    RETURNING id
  `)
  return rows[0]?.id
}

async function readActiveRun(query: QueryExecutor, disputeId: string): Promise<string | undefined> {
  const { rows } = await query<{ id: string }>(sql`
    /* admitReviewDisputeResolutionRun:readActive */
    SELECT id
    FROM review_dispute_resolution_runs
    WHERE review_dispute_id = ${disputeId}::uuid
      AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
  `)
  return rows[0]?.id
}

/**
 * Admits one AI draft request for an eligible dispute. A concurrent or repeated admission loses
 * the partial unique index and reads the existing active run, so admission needs no lock. The
 * active run can finish between the conflict and the read, so one more insert may be needed.
 */
export async function admitReviewDisputeResolutionRun(
  query: QueryExecutor,
  disputeId: string,
): Promise<{ runId: string; inserted: boolean }> {
  const first = await insertRun(query, disputeId)
  if (first) return { runId: first, inserted: true }
  const active = await readActiveRun(query, disputeId)
  if (active) return { runId: active, inserted: false }
  const second = await insertRun(query, disputeId)
  assert(second, 422, 'Dispute is no longer eligible for an AI rerun')
  return { runId: second, inserted: true }
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
