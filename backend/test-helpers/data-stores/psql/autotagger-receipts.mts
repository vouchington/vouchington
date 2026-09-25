import sql from 'sql-template-strings'
import { read, write } from '@data-stores/psql'

export type AutotaggerReceiptAttemptRow = {
  attempt_number: number
  lease_token: string
  completed_at: Date | null
  failed_at: Date | null
  outcome: string | null
}

/**
 * Lists a receipt's attempt ledger rows in attempt order, for asserting which
 * attempt completed, failed, or was closed out as expired.
 */
export async function listAutotaggerReceiptAttempts(
  receiptId: string,
): Promise<AutotaggerReceiptAttemptRow[]> {
  const { rows } = await read<AutotaggerReceiptAttemptRow>(sql`
    /* listAutotaggerReceiptAttempts */
    SELECT attempt_number, lease_token, completed_at, failed_at, outcome
    FROM autotagger_receipt_attempts
    WHERE receipt_id = ${receiptId}
    ORDER BY attempt_number
  `)
  return rows
}

/**
 * Forces a receipt's active lease into the past without clearing the lease
 * token, simulating an unrenewed/crashed claimant so the next
 * `claimAutotaggerReceipt` call exercises the reclaim path deterministically
 * instead of racing a real `leaseSeconds` countdown.
 */
export async function expireAutotaggerReceiptLease(receiptId: string): Promise<void> {
  await write(sql`
    /* expireAutotaggerReceiptLease */
    UPDATE autotagger_receipts
    SET lease_expires_at = clock_timestamp() - INTERVAL '1 second'
    WHERE id = ${receiptId}
  `)
}
