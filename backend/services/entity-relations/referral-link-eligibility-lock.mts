import { withTransactionOptions, type QueryOptions, type TransactionQuery } from '@data-stores/psql'

/**
 * Serializes a story-projection eligibility recheck with mutations to its rule,
 * program enablement, or program-validation membership state.
 */
export async function lockReferralLinkEligibility(
  query: TransactionQuery,
  mode: 'shared' | 'exclusive',
): Promise<void> {
  if (mode === 'shared') {
    await query(
      `/* lockReferralLinkEligibility:shared */
        SELECT pg_advisory_xact_lock_shared(hashtextextended('referral-link-eligibility', 0))`,
    )
    return
  }
  await query(
    `/* lockReferralLinkEligibility:exclusive */
      SELECT pg_advisory_xact_lock(hashtextextended('referral-link-eligibility', 0))`,
  )
}

export function withReferralLinkEligibilityMutationLock<T>(
  options: QueryOptions,
  operation: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  return withTransactionOptions(options, async query => {
    await lockReferralLinkEligibility(query, 'exclusive')
    return operation(query)
  })
}
