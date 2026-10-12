import type { OwnedTransaction } from '@data-stores/psql'

export type RetainedOAuthExchangeClaim = (
  authorizationId: string,
  claimId: string,
) => Promise<boolean>

/** Resolve only the bounded locked page; fresh history joins queue ownership by exact claim. */
export async function getRetainedUnarmedOAuthExchangeIds(
  transaction: OwnedTransaction,
  ownedIds: readonly string[],
  staleSeconds: number,
  retainedClaim?: RetainedOAuthExchangeClaim,
): Promise<string[]> {
  if (!retainedClaim) return []
  const { rows } = await transaction<{ id: string; exchange_claim_id: string }>(
    `/* getRetainedUnarmedOAuthExchangeIds */ SELECT id, exchange_claim_id
     FROM view_oauth_authorization_current_records
     WHERE id = ANY($1::uuid[]) AND status = 'exchanging'
       AND exchange_started_at < clock_timestamp() - make_interval(secs => $2)
       AND expires_at > CURRENT_TIMESTAMP`,
    [ownedIds, staleSeconds],
  )
  const receipts = await Promise.allSettled(
    rows.map(async row => ({
      id: row.id,
      retained: await retainedClaim(row.id, row.exchange_claim_id),
    })),
  )
  const retainedIds: string[] = []
  const errors: unknown[] = []
  for (const receipt of receipts) {
    if (receipt.status === 'rejected') errors.push(receipt.reason)
    else if (receipt.value.retained) retainedIds.push(receipt.value.id)
  }
  if (errors.length)
    throw new AggregateError(errors, 'Retained OAuth ownership lookups failed', {
      cause: errors[0],
    })
  return retainedIds
}
