import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Most recovery-sweep enqueues that may actually add a job for one receipt. Each added job carries
 * the queue's own retry budget, so this bounds a receipt that keeps failing outside the provider
 * attempt budget (database errors, local-only or effect-only receipts) at a finite number of
 * executions. A duplicate add of a job that still exists is a no-op and is never counted.
 */
export const POST_CLASSIFIER_SWEEP_ENQUEUE_BOUND = 10

export type PostClassifierSweepReceiptRef = { postId: string; applicationId: string }

/** Counts the sweep enqueues that really added a job, one increment per receipt. */
export async function recordPostClassifierSweepEnqueues(
  receipts: readonly PostClassifierSweepReceiptRef[],
): Promise<void> {
  if (receipts.length === 0) return
  await write(sql`/* recordPostClassifierSweepEnqueues */
    UPDATE post_classifier_applications AS application
    SET sweep_enqueue_count = application.sweep_enqueue_count + 1
    FROM unnest(${receipts.map(receipt => receipt.postId)}::uuid[],
      ${receipts.map(receipt => receipt.applicationId)}::uuid[]) AS added(post_id, id)
    WHERE application.post_id = added.post_id AND application.id = added.id
      AND application.sweep_enqueue_count <= ${POST_CLASSIFIER_SWEEP_ENQUEUE_BOUND}
  `)
}

/**
 * Ends recovery for a receipt whose last permitted job is gone yet still incomplete. Moves the
 * counter past the bound so the sweep stops selecting the receipt, and additionally makes the
 * remote half terminal when its constraint allows it: a terminal failure needs a reserved remote
 * batch and unpersisted outcomes, so local-only and effect-only receipts are only abandoned.
 */
export async function abandonPostClassifierSweepReceipt(
  receipt: PostClassifierSweepReceiptRef,
): Promise<'terminal' | 'abandoned' | 'skipped'> {
  const { rows } = await write<{ terminal: boolean }>(sql`/* abandonPostClassifierSweepReceipt */
    UPDATE post_classifier_applications
    SET sweep_enqueue_count = ${POST_CLASSIFIER_SWEEP_ENQUEUE_BOUND + 1},
      terminal_remote_failure_kind = CASE WHEN decision_batch_id IS NOT NULL
        AND outcomes_persisted_at IS NULL THEN 'sweep-bound-exceeded' END,
      terminal_remote_failed_at = CASE WHEN decision_batch_id IS NOT NULL
        AND outcomes_persisted_at IS NULL THEN clock_timestamp() END,
      lease_token = CASE WHEN decision_batch_id IS NOT NULL
        AND outcomes_persisted_at IS NULL THEN NULL ELSE lease_token END,
      leased_at = CASE WHEN decision_batch_id IS NOT NULL
        AND outcomes_persisted_at IS NULL THEN NULL ELSE leased_at END,
      lease_expires_at = CASE WHEN decision_batch_id IS NOT NULL
        AND outcomes_persisted_at IS NULL THEN NULL ELSE lease_expires_at END
    WHERE post_id = ${receipt.postId} AND id = ${receipt.applicationId}
      AND sweep_enqueue_count = ${POST_CLASSIFIER_SWEEP_ENQUEUE_BOUND}
      AND completed_at IS NULL AND superseded_at IS NULL AND terminal_remote_failed_at IS NULL
    RETURNING terminal_remote_failed_at IS NOT NULL AS terminal
  `)
  const row = rows[0]
  if (!row) return 'skipped'
  return row.terminal ? 'terminal' : 'abandoned'
}
