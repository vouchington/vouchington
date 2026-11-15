import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Reads the dispute's active resolution run id so real-PG tests can execute an admitted job. */
export async function getReviewDisputeActiveRunId(disputeId: string): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`
    /* getReviewDisputeActiveRunId */
    SELECT id FROM review_dispute_resolution_runs
    WHERE review_dispute_id = ${disputeId}
      AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
  `)
  if (!rows[0]) throw new Error('Expected active dispute resolution run')
  return rows[0].id
}

export async function getReviewDisputeRunStatus(runId: string): Promise<string | null> {
  const { rows } = await write<{ status: string }>(sql`
    /* getReviewDisputeRunStatus */
    SELECT status FROM review_dispute_resolution_runs WHERE id = ${runId}
  `)
  return rows[0]?.status ?? null
}

/** Admits a further run once the earlier one finished, as a rerun or retry would. */
export async function admitTestReviewDisputeRun(disputeId: string): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`
    /* admitTestReviewDisputeRun */
    INSERT INTO review_dispute_resolution_runs (review_dispute_id)
    VALUES (${disputeId})
    RETURNING id
  `)
  if (!rows[0]) throw new Error('Expected admitted dispute resolution run')
  return rows[0].id
}

/** Points a dispute's saved draft at a run, as a completed draft save does. */
export async function setTestReviewDisputeDraftRun(
  disputeId: string,
  runId: string,
): Promise<void> {
  await write(sql`/* setTestReviewDisputeDraftRun */
    UPDATE review_disputes SET ai_draft_run_id = ${runId}::uuid WHERE id = ${disputeId}::uuid
  `)
}
