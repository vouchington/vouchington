import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Terminally completes a receipt: clears its lease and marks its matching
 * in-flight attempt completed. Fenced by `leaseToken`, so a claimant whose
 * lease already expired and was reclaimed by another owner cannot complete
 * over that new owner's work. Returns `false` when the fence rejected the
 * completion (the caller no longer owns the lease).
 */
export async function completeAutotaggerReceipt(
  receiptId: string,
  leaseToken: string,
): Promise<boolean> {
  await using query = await beginTransaction()
  const released = await query<{ id: string }>(sql`/* completeAutotaggerReceipt.receipt */
    UPDATE autotagger_receipts
    SET completed_at = clock_timestamp(), lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE id = ${receiptId} AND lease_token = ${leaseToken}
    RETURNING id`)
  if (released.rowCount !== 1) {
    await query.commit()
    return false
  }
  await query(sql`/* completeAutotaggerReceipt.attempt */
    UPDATE autotagger_receipt_attempts
    SET completed_at = clock_timestamp()
    WHERE receipt_id = ${receiptId} AND lease_token = ${leaseToken}
      AND completed_at IS NULL AND failed_at IS NULL`)
  await query.commit()
  return true
}

export type AutotaggerReceiptFailureOutcome = 'provider-error' | 'invalid-result'

/**
 * Releases a receipt's lease after a provider/result failure and records a
 * failure attempt distinguishing it from lease expiry. Fenced by
 * `leaseToken`; returns `false` when the fence rejected the release.
 */
export async function failAutotaggerReceipt(
  receiptId: string,
  leaseToken: string,
  outcome: AutotaggerReceiptFailureOutcome,
): Promise<boolean> {
  await using query = await beginTransaction()
  await query(sql`/* failAutotaggerReceipt.attempt */
    UPDATE autotagger_receipt_attempts
    SET failed_at = clock_timestamp(), outcome = ${outcome}
    WHERE receipt_id = ${receiptId} AND lease_token = ${leaseToken}
      AND completed_at IS NULL AND failed_at IS NULL`)
  const released = await query<{ id: string }>(sql`/* failAutotaggerReceipt.release */
    UPDATE autotagger_receipts
    SET lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE id = ${receiptId} AND lease_token = ${leaseToken}
    RETURNING id`)
  await query.commit()
  return released.rowCount === 1
}
