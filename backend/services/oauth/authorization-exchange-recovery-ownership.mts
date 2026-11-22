import type { OwnedTransaction } from '@data-stores/psql'

export type RetainedOAuthExchangeClaim = (
  authorizationId: string,
  claimId: string,
) => Promise<boolean>

/** Resolve only the bounded candidate page; fresh history joins queue ownership by exact claim. */
export async function getRetainedUnarmedOAuthExchangeClaims(
  transaction: OwnedTransaction,
  candidateIds: readonly string[],
  staleSeconds: number,
  retainedClaim?: RetainedOAuthExchangeClaim,
): Promise<{ id: string; claimId: string }[]> {
  if (!retainedClaim) return []
  const { rows } = await transaction<{ id: string; exchange_claim_id: string }>(
    `/* getRetainedUnarmedOAuthExchangeClaims */ SELECT id, exchange_claim_id
     FROM view_oauth_authorization_current_records
     WHERE id = ANY($1::uuid[]) AND status = 'exchanging'
       AND exchange_started_at < clock_timestamp() - make_interval(secs => $2)
       AND expires_at > CURRENT_TIMESTAMP`,
    [candidateIds, staleSeconds],
  )
  const receipts = await Promise.allSettled(
    rows.map(async row => ({
      id: row.id,
      claimId: row.exchange_claim_id,
      retained: await retainedClaim(row.id, row.exchange_claim_id),
    })),
  )
  const retained: { id: string; claimId: string }[] = []
  const errors: unknown[] = []
  for (const receipt of receipts) {
    if (receipt.status === 'rejected') errors.push(receipt.reason)
    else if (receipt.value.retained) retained.push(receipt.value)
  }
  if (errors.length)
    throw new AggregateError(errors, 'Retained OAuth ownership lookups failed', {
      cause: errors[0],
    })
  return retained
}
