import type { TransactionQuery } from '@data-stores/psql'

/** Advance the permanent floor while holding its row lock through the bounded ledger delete. */
export async function advanceReplayRejectionFloor(
  query: TransactionQuery,
  page: readonly { at: string }[],
): Promise<void> {
  if (page.length === 0) return
  // A verified signed date is at most one hour after inbox receipt.
  await query(
    `/* advanceActivityPubReplayRejectionFloor */
     UPDATE activitypub_replay_rejection_floors
     SET rejection_floor_at = GREATEST(
       COALESCE(rejection_floor_at, '-infinity'::timestamptz),
       (SELECT MAX(receipt_at) FROM unnest($1::timestamptz[]) AS receipts(receipt_at))
         + interval '1 hour'
     )`,
    [page.map(item => item.at)],
  )
}
