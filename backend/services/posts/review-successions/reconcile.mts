import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import {
  listLockedReviewSuccessionCandidates,
  lockReviewSuccessionCandidates,
} from './candidates.mts'
import { listReviewSuccessionGroups, lockReviewSuccessionGroups } from './groups.mts'
import { normalizeReviewSuccessionPostIds } from './list.mts'
import { applyReviewSuccessionMutations } from './mutations.mts'
import { planReviewSuccessionMutations } from './plan.mts'
import type { ReviewSuccessionReconciliationResult } from './types.mts'

type ReviewSuccessionReconciliationOptions = QueryOptions

/**
 * Converges exact-topic review succession for supplied post IDs. The lock order is group keys,
 * publication post scopes, then candidate rows; all candidate reads and handoff mutations are
 * bounded set operations inside the same transaction.
 */
export async function reconcileReviewSuccessionsForPostIds(
  postIds: readonly string[],
  options: ReviewSuccessionReconciliationOptions = {},
): Promise<ReviewSuccessionReconciliationResult> {
  const ids = normalizeReviewSuccessionPostIds(postIds)
  if (ids.length === 0) return { changedPostIds: [] }
  const { query, client } = options
  const run = async (
    transaction: TransactionQuery,
  ): Promise<ReviewSuccessionReconciliationResult> => {
    const groups = await listReviewSuccessionGroups(transaction, ids)
    if (groups.length === 0) return { changedPostIds: [] }
    // ast-grep-ignore: no-three-sequential-awaits -- group, publication-scope, and row locks have a required global order before the locked reread
    await lockReviewSuccessionGroups(transaction, groups)
    await lockReviewSuccessionCandidates(transaction, groups)
    const candidates = await listLockedReviewSuccessionCandidates(transaction, groups)
    const changedPostIds = await applyReviewSuccessionMutations(
      transaction,
      planReviewSuccessionMutations(candidates),
    )
    return { changedPostIds }
  }
  if (query || client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
